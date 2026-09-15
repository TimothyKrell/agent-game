# TIM-23 — parent history integration review

Sources `4cba978` (TIM-18 causal-tail correction) and `bba70f8` (continuous history) are integrated at **16b83cb**, with accepted TIM-11 primitives, image/onboarding changes and the preview identity bridge.

## Independent checks

Parent passed **45 focused/model/Worker checks**: 41 story/reader/stream/Worker cases plus four indexed-history cases in a separate invocation. The first command mistakenly named the nonexistent `tests/match-history.test.ts`; the actual `tests/history.test.ts` was then run explicitly, so no indexed-history coverage is inferred from the first command.

All **30 browser checks passed** using the production hooks and generic container: seven continuous-reading cases and 23 existing Query/current/command lifecycle regressions. The isolated config is `/tmp/opencode/tim23-lead-playwright.config.mjs`, with results in `/tmp/opencode/TIM-23-lead-browser.json` and `/tmp/opencode/TIM-23-lead-browser/`. Source evidence was preserved. Typecheck, lint and build passed on the combined source.

The presentation owner received the actual `useSuccessionStory` / `SuccessionTimeline` contract for production Dossier route composition. Each chapter keeps its reader mounted while disabling it on collapse; generic loading/anchoring remains separate from cards and visual chapters.

## Open review corrections

Standards review identified:

- **P2:** expose Query's network-paused state rather than announcing an indefinitely busy load while offline.
- **P3:** consolidate the duplicated authorized-range loader, preserving cross-match validation before reset classification and the existing bounded delivery/cancellation contract.

Spec review identified:

- **P1:** an off-screen document timeline can restore its stale anchor on a follow/status-only update and snap scrolling away from the next chapter. Multiple open document readers must not compete over the scroll position.
- **P2:** a delayed Act I round index can be accepted as Act II after a same-epoch transition, permanently excluding the true Act II beginning. Revalidate the dispatched act before committing index bounds.
- **P2, TIM-18:** the finished phase still clears completed-action context before a final-turn trailing private reaction. Preserve its causal link through terminal phase/result emissions and clear it on actual new activity/gaps.

The implementation owner is correcting these cases with the original review probes in `/tmp/opencode/TIM23-spec-review/`. Existing passing tests and initial traversal bounds do not close these newly reproduced cases. TIM-18 and TIM-23 remain In Progress until the corrections and production composition are verified.

## Correction checkpoint

Sources `6c076d8`, `c1285c4`, `da987fd`, `fdc98b0` and `74592b8` are integrated through **7a938c8**. Parent independently passed **67 focused tests** and **32 browser cases**, plus typecheck/lint/build. The original 30-case parent report is preserved at `/tmp/opencode/TIM-23-lead-browser-initial.json`; the correction report is `/tmp/opencode/TIM-23-lead-correction-browser.json` with separate captures/logs.

Final Standards review closes both paused-state and range-loader findings. Spec review closes the act-index race and the terminal Tax association. **TIM-18 is accepted and Done**; the pure model's ordinary and final-turn causal tails are verified using actual engine emissions.

One TIM-23 **P1 remains**: after a replacement removes tall rows, the formerly visible reader can move above the viewport before its ownership check runs. The retained anchor then fails to restore. Independent reproduction at `74592b8` uses two document timelines and 300px first-window rows, measuring **15,299px drift**. The implementer is preserving pre-replacement ownership while fencing genuine user navigation into another chapter. Exact probe: `/tmp/opencode/TIM23-spec-rereview-74592b8/`. The original off-screen status/follow-only snap is closed; the new variable-height case remains an explicit acceptance gate.
