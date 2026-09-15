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

## Summary completion

**bd1acd9**, integrated at **fdb51bb**, passed **Standards 0 / Spec 0**. Parent independently passed **53 tests** and **seven actual Worker/D1/R2 Home browser cases**, including both games, archives, partial/omitted metadata, explicit seat association, original renamed/retired identities and native A→B→A cancellation. Typecheck/lint/build and whitespace checks passed. Evidence: `/tmp/opencode/TIM-29-lead-summary-tests.log`, `/tmp/opencode/TIM-29-lead-summary-browser.log` and `/tmp/opencode/TIM-29-lead-summaries/`.

One bounded participant-index query enriches each nonempty page, capped at50 matches. The optional public contract contains only `{ number, agentId, name }`; ambiguous/missing seats keep their own fallback position. Home performs one current-picture lookup for the selected table and never fetches observations or guesses identity by name.

The consumer and summary user stories are now locally verified. Independent source/evidence preservation and the final combined production-boundary check precede worktree retirement. The standalone TIM-29 source scanner's byte-for-byte pre-Dossier guide comparison is historical to that lane: integration intentionally adopts production Dossier components in the retained guide, and uses the integrated Dossier graph/direct-route checks instead.

## Recovery archive

`/home/timothykrell/Code/agent-games-archive/TIM-29-2026-09-15/` preserves **1,851 source/evidence and848 parent/reviewer entries**. Every member hash, unchanged source, bundle and independent recovered source was verified.

- Source snapshot:134,698,932 bytes; SHA-256 `c7c881a925c46c46bd3fdc7a6d199c4aa9d846f57b2c15a2cb8bf9c32f465216`.
- Parent/reviewer archive:SHA-256 `e2b97125a778c8d6aaf1c6c561d613e921a759be3d5cab27931baded2a1398ca`.
- Git bundle:SHA-256 `064a4d2463c92174c9228a28b6edc1baeb4e53471fe8c2ba3dc5ad56f5f5ecef`.

## Final acceptance

**TIM-29 is accepted and Done.** The combined Dossier production check subsequently passed its emitted-assets/component-graph and direct-guide/fixture exclusions, with all portrait/summary changes present. Its87 development/90 production route checks,13 focus regressions and212+138 guide checks also pass; the separate deferred Final move interaction remains a Dossier issue.

The exact combined boundary result is preserved in the archive metadata from `/tmp/opencode/Dossier-lead-corrections/production.json`. Source and accepted original evidence remain byte-identical to the archived head. The completed worktree and merged local branch were retired after a final clean audit and removal of only the disposable dependency symlink.
