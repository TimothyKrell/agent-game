# Dossier · Pending ending navigation owns a cancellable intent

Follow-up: [reader-owned cancellation, shared viewport ownership and gutter-input correction](../TIM-23-dossier-owned-navigation/README.md) addresses review findings against `2df3c5a`. The evidence below records that earlier delivery.

Baseline: **`ab8706c`**. This addresses the new terminal-review P2 after the original completed-entry/Final move finding was closed. The accepted RuleHelp correction `54a3abd`, canonical-facts correction `a59fbbc`, and TIM-23 reader through `0fb03f8` remain intact.

## Exact red reproduction

```sh
node .dossier/serve.mjs
node node_modules/@playwright/test/cli.js test --config .dossier/ending.config.ts
```

The first run failed both actual-route cases in **2.4 / 2.9 seconds** each. A held stable-key response was released after the user opened the champion portrait or navigated to Act I:

| Destination     | Before                           | Incorrect completion                                                 |
| --------------- | -------------------------------- | -------------------------------------------------------------------- |
| Portrait Dialog | Close button focused, scrollY 0  | Declaration 1301 focused outside the still-open modal, scrollY 12638 |
| Act I record    | Act I article focused, scrollY 0 | Declaration 1301 focused in Act II, scrollY 13817                    |

See `red/results.json`, decoded `red/ownership.json`, and the retained screenshots. This matches the independent review probe. The expanded suite also minimizes the lifetime defect to a keyboard Tab from an already-loaded terminal window: no older-window eviction or modal is required to establish a later user intent.

## Diagnosis

The route held only a requested source key, not a navigation lifetime. Once its row appeared, the effect could scroll/focus it regardless of intervening actions. Three hypotheses were checked: stale route intent, reader window restoration, and modal lifecycle competition.

The first input fence fixed both focus steals, but a portrait case still moved **7038px**. The targeted scroll trace in `diagnostic/results.json` identifies the existing reader's precommit window restoration: an obsolete seek could still replace the record behind the modal and schedule another boundary read. Retiring only the focus effect was insufficient.

Superseding that seek with the retained window then exposed an obsolete saved anchor during genuine wheel input. Its replacement must remember the viewer's **current DOM reading position**, not the position captured before they clicked Final move. The intermediate failures and targeted traces are preserved separately from the final green evidence.

## Correction

`src/client/dossier-navigation-intent.ts` defines a one-shot request lifetime:

- It installs input cancellation synchronously from the activating click, after that click's capture phase. New pointer, click, key, wheel or touch-move input retires the request. A portrait opened and closed before the HTTP response therefore still supersedes it.
- Completion requires the original connected focus owner, a live request, and no active Dialog/RuleHelp dialog. The lifetime is consumed **before** the explicit source scroll/focus, so completion cannot cancel a successor.
- It adds no global focus or scroll listener. Native scroll events also arise from layout replacement, browser clamping and `scrollIntoView`; those events do not establish user intent.

`src/client/succession-match.tsx` owns the cancellation's reader composition:

- New input clears the requested ending and supersedes its pending `seek` using the existing stable-key API at the retained window's center (`STORY_WINDOW_SHIFT`). This selects the same bounded range rather than committing the obsolete ending window. The center is internal retrieval bookkeeping; it is never labelled or focused as a move.
- The superseding read refreshes anchor memory from the actual visible/focused row. It keeps no anchor behind an active modal. A request-identity check prevents that asynchronous cleanup from modifying a successor's reader memory.
- Passive route-lifetime input tracking determines the current chapter/other-control owner from the actual DOM. Document navigation keys use the visible reader even when a closed chapter heading or other control retains focus. Programmatic layout scrolling does not change this ownership.
- Reader boundary calls respect that input owner and modal ownership. This prevents an observer from starting a follow-up read behind the user's reference dialog after the canceled seek settles. Ordinary document-keyboard and continuous reading are covered by the original full traversal suite.
- Match/epoch/status retirement and route unmount abort the pending lifetime. Both chapter hooks stay mounted outside their independently enabled panels.

The accepted bounded history implementation, shared interaction primitives, portrait source/CSS, engine, current-state authority, package files and main entry are not modified. Source-backed Final move selection and the honest Terminal record fallback are unchanged.

## Verification

- **27 development browser tests pass**: `development-final/results.json` contains 26 passing cases; `development-unmount/results.json` passes the remaining case after correcting its destination-ready selector. The earlier complete `green-final/results.json` and decoded `green-final/ownership.json` are also retained.
- **27 production navigation tests and 90 production route assertions pass** in `production/intent/results.json` and `production/route/checks.json`. The complete traversal retains **128 rows maximum per reader** and **0.421875px maximum retained-row drift**.
- At **1440 / 390 / 320**, held navigation respects portrait-open, portrait-closed-before-release, pinned RuleHelp, Act I reading, keyboard and wheel ownership. Modal and Act I cases retain **zero scroll delta** and their exact focus owner. Tab remains contained by the modal after release.
- Uninterrupted held requests still focus declaration **1301**. Fresh keyboard/tap requests reopen a closed chapter and succeed through the retained-window fast path.
- Additional cases cover a new visibility scope at all three widths, route unmount/re-entry, a held history page after anchor resolution, and a fresh request superseding an older held one.
- Tests wait for the held backend handler to finish replying as well as reader/DOM settling. They do not obtain green merely by inspecting the page before the old response is delivered.
- **87 development route assertions** retain the complete reverse-to-start, forward-through-eviction, terminal arrival and reverse-again checks. **73 unit tests**, typecheck and lint pass.

Production results are retained under `production/`; final counts are consolidated in `verification.json`. The first production traversal reported a 22.8125px metric failure and is preserved in `production-first/`. Its pre-replacement geometry used a separate browser round trip after scrolling. The runner now captures scroll and starting geometry atomically in one browser task; the **1px threshold, 128-row bound, >512 distinct records and full traversal requirements remain unchanged**.

`production-second/` retains two scope-settling assertions and an unmount destination-render assertion caught by the faster production build. The final tests establish the new Act I reading destination or wait for the new route before releasing the obsolete response. `production-third/` retains a selector correction: the unavailable arena fixture displays “The arena” as text, not its heading. The final production suite uses the actual DOM text and all 27 cases pass. These verification corrections required no further application-source changes.

All twenty scenario groups, 36 rule terms, 974 captured public entries, 416 exact quotes, nine historical elimination counts and original evidence remain preserved. The pure-component and original-guide evidence from the accepted delivery remains available; this follow-up changes actual-route navigation ownership.

## Reproduction and production check

```sh
node .dossier/serve.mjs
DOSSIER_ENDING_EVIDENCE=../docs/evidence/TIM-19-22-ending-intent/recheck node node_modules/@playwright/test/cli.js test --config .dossier/ending.config.ts
DOSSIER_ORIGIN=http://127.0.0.1:6291 DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-19-22-ending-intent/route node .dossier/route.mjs
npm run typecheck
npm run lint
npm test -- tests/dossier-components.test.ts tests/succession-story.test.ts tests/continuous-succession-history.test.ts tests/succession-history-loading.test.ts tests/agent-picture-data.test.ts
npm run build
DOSSIER_PRODUCTION_EVIDENCE_DIR=docs/evidence/TIM-19-22-ending-intent/production DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-19-22-ending-intent/production/route DOSSIER_ENDING_EVIDENCE=../docs/evidence/TIM-19-22-ending-intent/production/intent node .dossier/production.mjs
```

Development uses owned **6291**; the production runner owns/stops **6292**. API and WebSocket responses are intercepted canonical-engine fixtures, not deployed authorization tests. Final independent parent acceptance follows this correction handoff.
