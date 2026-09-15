# TIM-11 follow-up: preserve external focus on hover dismissal

Baseline: **`d1b2a9b`**, original TIM-11 worktree. This appends the focused P2 correction found by the parent's independent specification review. Previous correction and guide evidence remain intact.

## Cause and fix

`RuleHelpProvider` passed `finalFocus={returnFocus}` for both hover previews and pinned references. Base UI 1.8.0 treats a ref as an explicit focus destination, bypassing its ordinary external-focus preservation guard. An imperative hover close could therefore move focus from an independent surviving input to the trigger, or to the chapter fallback on trigger unmount.

The production change is **`finalFocus={pinned ? returnFocus : false}`** in `src/client/ui/rule-help.tsx`. Hover previews never acquire focus and now request no focus restoration on dismissal. Pinned references retain explicit restoration to their trigger or supplied surviving fallback.

The existing lifecycle is important: `pinned` changes only when opening, and remains intact throughout closure so the close button, modal semantics and final-focus choice survive Base UI's queued close work. A subsequent hover opening sets it false. A dedicated pin → close → focus input → hover → scroll test verifies that transition.

### Remaining consumer focus contract

- **Hover only:** opening does not take focus; outside scrolling and active-trigger unmount dismiss the preview while preserving an independent surviving input's focus. The tests also type into that input after dismissal.
- **Pinned:** mouse/Enter/Space activation, including activation after an 800ms hover, focuses the close control and contains focus. Dismissal returns to the mounted initiating trigger.
- **Pinned trigger removed:** cleanup closes the popup; supply `fallbackFocus={chapterControlRef}` for deliberate return to a surviving chapter control. Removing an unrelated trigger preserves the active reference. Without a surviving trigger or supplied fallback, there is no promised return destination.

## Red/green evidence

The fixture now has a labeled **Reading note** input outside the provider/chapter and an independent scroll container. The new tests focus that input, hover Treasurer rules without clicking, assert the input remains focused, then either change the real scroll container's `scrollTop` or dispatch the existing owner-driven chapter-collapse fixture event. They require the tooltip to disappear and the independent input to remain focused after queued focus-manager work (two animation frames), then confirm keyboard input still reaches it.

The old “without stealing focus” test remains, but it starts with the fallback already focused; it could not detect this bug. The new independent-input cases close that gap.

| Run                      | Result                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hover-focus-red-1`      | Original six cases pass; both independent-input cases fail.                                                                                                               |
| `hover-focus-red-2`      | Both new cases fail again when run alone. Scroll ends on Treasurer rules; unmount ends on Rules chapter.                                                                  |
| `hover-focus-green-1`    | **9/9 pass** after the pinned-only setting: all six original cases, both new cases and the prior-pinned-session transition.                                               |
| `hover-focus-full-green` | **5/5 original primitive journeys pass** on a fresh Vite cache: 1440/390/320, nested modal focus, hover/pin, layout-zoom emulation, motion and hidden-document dismissal. |

Decoded observations: [`focus-summary.json`](focus-summary.json). Full reports and transcripts: [`hover-focus-red-1.json`](hover-focus-red-1.json), [`hover-focus-red-2.json`](hover-focus-red-2.json), [`hover-focus-green-1.json`](hover-focus-green-1.json), and their `.txt` companions. Red screenshots/context are in [`red-interactions/`](red-interactions/). The two red cases reproduce twice and the actual post-close elements are captured before the focus assertion. Committed text copies trim reporter trailing spaces; originals remain under `.tim11/cold-start/runs/`.

Before the fix, the ranked hypotheses were: (1) an unconditional explicit final-focus override; (2) unmount cleanup itself moving focus; (3) native scrolling independently moving focus. Mounted-trigger scroll reproduced the bug without unmount, and changing only the final-focus policy made both paths green. This confirms the first hypothesis.

## Checks

- `npm run typecheck`, `npm run lint`, `npm run build`, scoped Prettier and `git diff --check`: pass.
- [Original controls transcript](original-controls-green.txt) and [Vite log](vite-log.json): all five pass; no late dependency reload. Pageerror assertions remain enforced.
- [Production exclusion](production.json) and [direct-route capture](production-direct-route.png): pass in a new evidence destination. Production JS remains 487.14 kB / 151.86 kB gzip; CSS 113.85 kB / 23.29 kB gzip.
- Chromium on Linux, real Vite-served production wrappers with locked Base UI 1.8.0 and React 19.2.8. Parent's independently passing 138 guide checks and previous guide captures are preserved; this focus-only follow-up uses the focused browser suites.

## Commands

All server-owning commands use **6191** and stop their server in `finally`. Use new output names to preserve recorded runs.

```sh
# These cases were red against d1b2a9b and green with the final-focus correction.
TIM_RULE_OUT=.tim11/cold-start/runs/new-hover-focus node .tim11/cold-start/check-controls.mjs
TIM_RULE_OUT=.tim11/cold-start/runs/new-hover-focus-only node .tim11/cold-start/check-controls.mjs --grep 'hover (outside scroll|active trigger unmount)'
TIM_LEAD_OUT=.tim11/cold-start/runs/new-hover-focus-full node .tim11/cold-start/reproduce.mjs
npm run typecheck
npm run lint
npm run build
TIM_PRODUCTION_OUT=.tim11/cold-start/runs/new-hover-focus-production TIM_PRODUCTION_EVIDENCE=docs/evidence/TIM-11-corrections/hover-focus/new-production node .tim11/cold-start/check-production.mjs
git diff --check
```
