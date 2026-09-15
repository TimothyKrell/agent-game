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
