# TIM-18 P2 · terminal Tax tail correction

This model/test correction is independently applicable on top of `4cba978`. The production change and new regression do not depend on the other TIM-23 review corrections. Original `.tim18`, `.tim23` and read-only `/tmp/opencode/TIM23-spec-review/` evidence are preserved.

`terminal-tax-red.json` reproduces the actual engine sequence: 119 legal Exchange declarations, all eligible passes, legal returns and advances; the 120th declaration is Tax. It resolves into `turn-ended → phase:finished → finished → reaction → audit`, where the old projection lost the Tax action on the final private reaction.

The terminal phase now preserves the separate completed-action tail, just like the next-turn phase. Terminal phase/result rows themselves retain their active-board context; the trailing reaction receives the originating Tax action, applied resolution and turn owner. The regression also removes the intervening terminal phase record to verify that a gap still invalidates the tail. Existing new-declaration and post-resolution Exchange regressions continue to cover expiration and active-board separation.

## Combined review verification

`final-focused.json`: **67 passed** — 27 model, 14 continuous-reader, 13 shared-loader/composition, 9 original replay-data and 4 original current/history-stream tests. `final-typecheck.txt`, `final-lint.txt`, `final-build.txt` and `final-format.txt` record passing all three TypeScript projects, repository lint, CLI/Vite build and scoped formatting. Initial diagnostic failures remain alongside the final results; new generated report whitespace is normalized for commit checks.

`final-browser/`: **32 passed** — 9 continuous-reader browser scenarios and all 23 prior replay/Query/current/command lifecycle scenarios. Fixture bundles use intercepted URLs without a port listener; `TIM23_EVIDENCE_DIR` isolates the output. Actual composed Dossier-route verification remains with the parent/composition integration.
