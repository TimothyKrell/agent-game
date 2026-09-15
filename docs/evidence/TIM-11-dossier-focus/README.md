# TIM-11 / Dossier · Closing-trigger focus correction

Baseline: Dossier `4f7901b`, including accepted RuleHelp `ee2220f`. This is a focused correction to `src/client/ui/rule-help.tsx`; no history/container or picture-data behavior changes.

## Reproduction and minimization

The real route reproduced all three reported failures at **1440 / 390 / 320**: programmatically activate the Act II chapter heading while row help is pinned; the chapter rows and popup disappear, but focus ends on body. The supplied fallback is still the connected heading. The red run retains 54 independent passing route checks and three focus failures in `route-red/`.

The smallest reproducer needs only a shared RuleHelpProvider, one trigger with a surviving fallback, and a button whose click removes that trigger. A native button also fails, eliminating Collapsible, nested portrait Dialogs, the timeline, history retrieval and game data as prerequisites. The meaningful minimal red run fails the final-focus assertion in about six seconds; it does not merely assert popup dismissal. See `minimal-red/` and `native-red/`.

## Cause: close starts before trigger cleanup

The instrumented lifecycle was:

```text
change: open=true, reason=trigger-press
change: open=false, reason=outside-press, return trigger connected=true
detach: handle.isOpen=false, return trigger connected=false, fallback="Rules chapter"
resolve finalFocus: return trigger connected=false
```

The chapter click is also an outside press for the Popover. Base UI closes its handle first; React then commits the chapter update and removes the rule trigger. The old `handle.isOpen && activeTriggerMatches` guard skipped fallback retargeting because the close had already begun. Base UI subsequently read the detached button from the final-focus ref.

Installed Base UI's `FloatingFocusManager` resolves the explicit return target during its close/unmount cleanup and queues the actual focus operation. The trace showed trigger cleanup before that resolution, so neither moving consumer focus nor adding timers was necessary. The fallback was skipped, not late or inert. Instrumentation is removed from production/test source; the diagnostic output is retained under `instrumented/`.

## Correction

Retarget the return-focus ref whenever the detaching trigger matches the active reference, including while the popup is closing. Guard only the additional `handle.close()` call with `handle.isOpen`.

Base UI retains ownership of focus restoration and popup lifecycle. Hover still supplies `finalFocus=false`. Unrelated trigger cleanup cannot replace the active reference. There is no sentinel, observer, delayed consumer focus call, or focus-on-render behavior.

## Verification

| Check | Result |
| --- | --- |
| Actual route, development | **57 assertions passed**, zero failures; all three prior chapter-collapse failures now pass |
| Actual route, production build | **60 assertions passed**, zero failures; all three prior chapter-collapse failures now pass |
| Original accepted RuleHelp suite | **9 tests passed**: 800ms mouse/Enter/Space pinning, mounted-trigger Escape, owner-driven trigger removal/fallback, unrelated removal, and hover external-input/scroll focus |
| Focused regressions | **4 tests passed**: native and Collapsible chapter clicks, reopen/Escape exact trigger, whole-provider removal in pinned/hover mode respecting the route owner's chosen visible input |
| App production graph/exclusion | Passed, including the new dev-only focus fixture exclusion |
| Typecheck / lint / build | Passed |

Focused whole-provider tests supply a genuinely surviving external fallback control, remove the entire provider, and transfer focus once to a visible input as a route owner would. They then wait through queued focus work and continue typing into that input, ensuring the retiring provider does not steal it back.

New evidence is separate from all original guide, source and failure captures. The actual route suite also retains its existing traversal/authority/image checks; the history agent's separately owned variable-height scroll correction remains outside this fix.

## Commands

```sh
DOSSIER_PORT=6191 node .dossier/serve.mjs
FOCUS_OUTPUT=../docs/evidence/TIM-11-dossier-focus/focused-green node node_modules/@playwright/test/cli.js test --config .dossier/focus.config.ts
TIM_RULE_OUT=/tmp/opencode/agent-game-dossier/docs/evidence/TIM-11-dossier-focus/original-nine node node_modules/@playwright/test/cli.js test --config .tim11/cold-start/interaction.config.ts
DOSSIER_ORIGIN=http://127.0.0.1:6191 DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-11-dossier-focus/route-green node .dossier/route.mjs
npm run typecheck
npm run lint
npm run build
DOSSIER_PRODUCTION_EVIDENCE_DIR=docs/evidence/TIM-11-dossier-focus/production-green DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-11-dossier-focus/production-green/route node .dossier/production.mjs
```

Development uses the assigned **6191**; production preview uses owned **6292** and stops itself. The standalone backend-fixture compiler disables HMR so it opens no additional WebSocket listener. The first concurrent green run reported a compiler HMR-port collision without application errors; that unnecessary fixture listener is now disabled.
