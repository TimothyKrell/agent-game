# TIM-23 review correction · authorized range loading

Baseline includes paused-read correction `6c076d8`. This directory isolates P3 reproduction and verification without overwriting the original `.tim23` evidence.

The focused regression sends a decodable wrong-match reset through the story history and checkpoint paths. It must remain an ordinary correlation failure, rather than being classified as a valid visibility reset for the requested match.

`src/client/succession-history-data.ts` now owns `readAuthorizedHistory(scope, { after, through }, signal, maxEvents)` and the shared `HistoryReset` class, which remains re-exported from `succession-replay-data.ts` for API compatibility. Its `MatchReadScope` dependency is type-only. Both story and replay composition call the same delivered-cursor walk; each keeps its own frame/checkpoint request and sibling cancellation.

The loader validates safe bounded ranges (at most the existing 256-event retention ceiling), frozen through, source match before reset, contiguous progress, the 32-event/16-KiB page contract, and complete delivery. It returns empty exact ranges without history I/O. Transport TypeError, ApiError fields and abort reasons propagate unchanged. The story checkpoint path also rejects wrong-match resets before scope retirement.

`red.json` captures both original wrong-match-reset failures. `focused.json` covers both compositions, byte-short pages/head growth, malformed/gapped/overlapping/stalled ranges, over-limit pages, empty/invalid bounds, reset correlation and untouched typed errors/cancellation, together with the existing replay and continuous-reader suites.

Verification passed: **34 focused tests** (13 shared-loader/composition, 9 prior replay-data, 12 continuous-reader) and **31 browser tests**, all three TypeScript projects, repository lint, CLI/Vite build and scoped formatting. `loader-final.json` verifies the final error assertions. No Worker/DO files are changed by this correction. New report trailing whitespace is normalized for commit checks; original reports remain intact.
