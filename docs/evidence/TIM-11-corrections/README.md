# TIM-11 correction: cold entry and rule-help lifecycle

Baseline: `f61b0c3`, original TIM-11 worktree. Locked Vite **8.2.2**, React/React DOM **19.2.8**, Base UI **1.8.0**. This corrects the cold-entry failure found during parent integration and both subsequent P2 rule-help findings. The original [foundation evidence](../TIM-11-foundations.md) is retained.

## Findings and fixes

### Cold entry: development fixture configuration

Vite's default HTML discovery does not scan the hidden `.tim11/foundations.html` entry. The application scan includes Dialog and Popover but omits the fixture-only Collapsible dependency. Opening the fixture after that initial optimization introduces Collapsible, changes shared dependency chunks, and initiates a full reload. During the first render, React DOM and Collapsible can reference different browser module identities of the same installed React.

The [negative-control capture](cold/red-control-9/modules.json) records the actual transformed responses:

- React DOM imports **`react.js?v=f52f89c2`**.
- Collapsible's shared `useOpenChangeComplete` module imports **`react.js?v=9ed2a51d`**.
- `CollapsibleRoot` throws `Cannot read properties of null (reading 'useRef')`; the full stack is retained.
- There are two document navigations. The [Vite log](cold/red-control-9/vite-log.json) records late Collapsible optimization and the automatic reload.

Different dependency files legitimately have different query hashes. The diagnostic signal is **two URLs for `react.js` itself**, confirmed by imports in module response bodies, rather than merely comparing the Collapsible and React DOM hashes.

`vite.config.ts` now declares `optimizeDeps.entries: ['index.html', '.tim11/foundations.html']`. Both development entry graphs are optimized together. This is an optimizer scan setting, not a production build input. It preserves dependency optimization and HMR and uses the existing single installed React. Production exclusion is verified below.

Primary references: [Vite dependency discovery](https://vite.dev/guide/dep-pre-bundling#automatic-dependency-discovery) and [`optimizeDeps.entries`](https://vite.dev/config/dep-optimization-options#optimizedeps-entries), checked alongside the installed Vite scanner (`computeEntries` / `globEntries`). Initial optimizer metadata confirms Collapsible absent before the correction and present after it.

#### Diagnosis sequence

The initial full cold suite was green once, then its original first test reproduced the exact error. Removing dialog/chapter operations alone remained timing-dependent. Waiting for the fresh server's **initial optimizer metadata before opening any browser page** produced a red-capable minimal loop: direct fixture entry and click its first button. This barrier exposes the missed dependency; it neither waits for browser errors to disappear nor reloads the page.

Before testing the fix, three falsifiable hypotheses were ranked:

| Hypothesis                                          | Prediction and outcome                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hidden fixture missing from initial scan            | Scanning both entries prevents late Collapsible discovery. Confirmed by initial metadata, repeated green entries and the index-only negative control.                                |
| Worktree symlink resolves two physical React copies | Scan entries alone would not fix it. The same symlink/dependencies pass after the scan correction; captured conflicting identities are query variants of one optimized React path.   |
| Faulty fixture Fast Refresh boundary                | Failure would persist with a stable optimized graph. Same fixture/components pass with explicit scan entries; source changes also produced normal HMR updates during rule-help work. |

Recorded runs under `.tim11/cold-start/runs/`:

| Runs                             | Result                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `red-full-1`                     | Initial timing-dependent full suite: 5/5 passed.                                                                                                                                                                   |
| `red-first-2`                    | Original first test: exact `useRef` pageerror.                                                                                                                                                                     |
| `red-minimal-3`, `red-chapter-4` | Reduction attempts: passed; interaction removal alone did not stabilize reproduction.                                                                                                                              |
| `red-scanned-5`, `red-scanned-6` | Initial-scan barrier + minimal entry: **2/2 exact red** before fix.                                                                                                                                                |
| `green-scanned-7`                | Same minimal scenario with explicit scan: green.                                                                                                                                                                   |
| `red-control-8`                  | Diagnostic response-capture syntax error; no browser test ran. Excluded from outcome counts; corrected in runner.                                                                                                  |
| `red-control-9`                  | Fixed components, index-only optimizer negative control: exact red, two React URLs, automatic reload.                                                                                                              |
| `green-scanned-10`–`12`          | Three independent fresh-cache entries: **3/3 green**, no pageerrors or reload, exactly one React URL.                                                                                                              |
| `green-full-13`                  | Fresh-cache original suite without scan barrier: **5/5 passed**, including 1440/390/320 controls, nested dialogs, focus containment/return, rule preview/pin, 200% layout emulation and hidden-document dismissal. |

Selected raw stacks, module responses, optimizer metadata and logs are committed in [`cold/`](cold/). [`cold/summary.json`](cold/summary.json) checks one navigation and one React URL for each captured green run. Full optimizer caches and exploratory artifacts remain locally under the ignored `runs/` directory. Committed reporter-text copies remove trailing spaces; original run artifacts are untouched. No pageerrors were suppressed; the original `expect(errors).toEqual([])` remains enforced. The sole non-React console error in green cold captures is a missing resource 404.

### P2: delayed activation dismissed the hover preview

Base UI's patient-click logic clears `stickIfOpen` after 500ms; a subsequent trigger press can propose `open=false`. The wrapper previously pinned only on `open=true`. In `src/client/ui/rule-help.tsx`, activation of an open, unpinned preview now cancels that close proposal and promotes it through the public `handle.open(triggerId)` API. Base UI retains ownership of popup state and focus behavior.

Actual-wrapper browser regressions hover **Executor rules**, verify the tooltip, wait **800ms specifically to exercise that threshold**, then activate using mouse, Enter, or Space. All require a visible pinned dialog, focused close control, persistence after mouse exit, and Escape returning focus to the trigger.

### P2: removed active trigger left an orphan modal

Base UI Popover does not close on active trigger unmount by default. The provider now gives triggers a stable controller; each trigger notifies it with its own ID on cleanup. If that trigger owns the open popup, the provider closes it and changes the final-focus ref to the owner's surviving control. Removing an unrelated trigger does not dismiss the current reference.

New exported `RuleHelpTriggerProps` adds optional **`fallbackFocus?: RefObject<HTMLElement | null>`**. Owners whose triggers can be removed should pass a ref to a surviving control, normally the chapter heading button. Existing mounted-trigger dismissal still returns to the original trigger. Example composition is in `.tim11/foundations.tsx`: provider outside controlled Collapsible, heading ref passed as the help trigger's `fallbackFocus`.

The regression drives a real controlled chapter update via a fixture event while focus is inside the pinned help. This avoids an outside mouse press inadvertently closing the dialog before unmount. It requires zero dialogs after removal, focus on the chapter control, successful chapter reopening, and subsequent help open/Escape focus return. Companion tests cover hover-preview removal without focus stealing and unrelated trigger removal.

Original red browser artifacts: [`rules-red/`](rules-red/) (delayed mouse/Enter and initial external-click exploration), [`rules-red-controlled/`](rules-red-controlled/) (exact orphan-dialog failure: expected 0, received 1). The external-click exploration closed via outside press but failed focus return; the controlled event reproduced the precise orphan defect. The final six regression cases pass: [`rules-green.json`](rules-green.json), [`rules-green.txt`](rules-green.txt).

## Verification

- **Six correction browser regressions:** all pass against actual Vite-served production wrappers, with pageerror assertions.
- **Five original primitive browser journeys:** all pass on a fresh server/cache.
- **138/138 retained guide checks:** 58 dossier, 27 annotations, 53 moments; [inspection JSON and 59 captures](guide/). Includes guide rule-help and portrait focus behavior. Only evidence destinations differ from the existing acceptance adapter.
- **Production build and exclusion:** [`production.json`](production.json), [`production-direct-route.png`](production-direct-route.png). The dev fixture and guide remain excluded from assets and direct-route execution, including the new fixture-only event/text markers. No devtool requests. Five CSS layers, one hoisted font import, prefixed utility and no Preflight remain verified.
- `npm run typecheck`, `npm run lint`, scoped Prettier and `git diff --check` pass.
- `npm run build` passes: JS **487.14 kB / 151.86 kB gzip**, CSS **113.85 kB / 23.29 kB gzip**.

Browser evidence is Chromium on Linux. The existing layout-zoom emulation and screenshot limits from the original report still apply. No cross-browser certification is claimed.

## Reproduction commands

Run from the TIM-11 worktree with the locked dependencies available. Each cold run needs a new output directory; the runner rejects cache reuse. All server-owning scripts use **6191** and close their server in `finally`.

```sh
# Expected red: reproduce the original missed-fixture dependency graph.
TIM_LEAD_OUT=.tim11/cold-start/runs/new-red TIM_COLD_LEGACY=1 TIM_COLD_SCANNED=1 TIM_COLD_MINIMAL=1 TIM_COLD_GREP='native controls, chapter and modal at 1440' node .tim11/cold-start/reproduce.mjs

# Expected green: exact minimized loop, then original complete suite, fresh cache each.
TIM_LEAD_OUT=.tim11/cold-start/runs/new-green TIM_COLD_SCANNED=1 TIM_COLD_MINIMAL=1 TIM_COLD_GREP='native controls, chapter and modal at 1440' node .tim11/cold-start/reproduce.mjs
TIM_LEAD_OUT=.tim11/cold-start/runs/new-full node .tim11/cold-start/reproduce.mjs
TIM_RULE_OUT=.tim11/cold-start/runs/new-rules node .tim11/cold-start/check-controls.mjs

# Guide helper expects the worktree dev server already running on 6191.
node .tim11/cold-start/check-guide.mjs

# Stop the dev server before starting the production preview check.
npm run build
node .tim11/cold-start/check-production.mjs
npm run typecheck
npm run lint
git diff --check
```
