# TIM-29 — parent portrait integration

## Accepted lookup slice

The independent lookup `ee945f5` is integrated at `4eb8498`; correction `dfb44e6` at **1647b5b**. Final independent review: **Standards 0 / Spec 0 outstanding** for the lookup slice.

Parent independently passed the original **32 transport/lookup tests and five React/provider browser cases**, then the correction's **four lifecycle tests and five native-HTTP/browser lifecycle cases**. The first parent correction command repeated only the original suites; the newly added suites were subsequently run explicitly. Thus the complete independent coverage is **36 tests and ten browser cases**, rather than inferring new coverage from an unchanged test filename.

- Initial/transport logs: `/tmp/opencode/TIM-29-lead-lookup-tests.log`, `/tmp/opencode/TIM-29-lead-browser.log`.
- Correction original-suite rerun: `/tmp/opencode/TIM-29-lead-correction-tests.log`, `/tmp/opencode/TIM-29-lead-correction-browser.log`.
- New four lifecycle cases ran with the Dossier/model checks in `/tmp/opencode/Dossier-lead-model-tests.log`.
- New five browser cases: `/tmp/opencode/TIM-29-lead-new-lifecycle-browser.log` and matching JSON/captures.

Known current revisions reconcile across active overlapping rosters by stable entrant ID, within one QueryClient. Last-reader release retires metadata; another active roster preserves newer removal knowledge. HTTP requests remain Query-owned. Explicit `refresh(): Promise<AgentPictureMap>` captures its originating request/lifetime and rejects retirement with `AbortError`; another reader can keep a shared request alive.

The Spec reviewer independently repeated both original failures against the correction with zero page errors; exact evidence is retained at `/tmp/opencode/TIM29-correction-review/`. Typecheck, lint, build and whitespace checks pass.

## Consumer adoption

The Dossier component's focused commits `49935cc` and `e2d98ca` provide lookup-free `AgentPortrait`, documented in `TIM-29-portrait-interface.md`. The production Dossier route consumes the picture map and shared image-error callback. The TIM-29 implementation owner is adopting the same component across remaining identity-backed profiles, rosters, seats, chat and results, retaining compact sizes and original entrant identity under controller takeover.

Overall TIM-29 remains In Progress until those actual consumers, accessible enlargement, broken-image fallbacks and responsive behavior are verified. No picture identity is inferred from a display name in summary data that lacks stable competitor IDs.

## Accepted non-Dossier consumer slice

Source **c3bc4ef** passed independent **Standards 0 / Spec 0**. Parent merged both component-layer CSS imports, retaining the production Dossier and adding the local portrait-consumer styles. Parent independently passed **37 browser cases**: seven production consumers, seven real Worker/D1/R2 owner flows, thirteen feed/sitewide regressions and ten lookup/lifecycle cases. Typecheck, lint and build passed.

The first consumer run passed six cases but waited for an off-screen `loading="lazy"` image to decode without bringing it into view. `toBeVisible` verifies rendered layout, not viewport intersection. The helper now scrolls each image into view before asserting real pixel decoding; all seven consumer cases then pass. The owner, legacy and lookup suites did not need repeating. This test-only correction preserves the original identity, exact image URL, one-roster-request, enlargement and layout assertions.

Parent evidence: `/tmp/opencode/TIM-29-lead-adoption-v2/`, with separate first/final logs and captures. The test's original hard-coded screenshot directory overwrote18 tracked captures during the first run. Those fresh captures were preserved separately with hashes, then the exact original c3bc4ef images restored from the staged index. Consumer tests now accept `TIM29_CAPTURE_DIR` and otherwise choose a unique temporary evidence directory. A prior runner setup error (missing parent directory) is retained separately and occurred before any test ran.

The optional summary-entrant follow-up **bd1acd9** is in independent review. Its bounded original-participant query and selected-roster lookup complete Home summary portraits without identity guessing or per-match observation requests.
