# TIM-18 local evidence

- `source-probe.mjs` reads the preserved TIM-6 archive and canonical implementation files. Run from the worktree root with `node .tim18/source-probe.mjs`.
- `source-probe.json` records source hashes, source event counts, the actual Act II allocation and all nine historical elimination rosters. Entrant names come from immutable seat identity, not final life/card state.
- `focused-tests.json`, `typecheck.txt`, `lint.txt`, `build.txt` and `format.txt` retain the final local verification output.
- `build-exclusion.json` records production-asset checks for the captured match, dev route and guide markers.
- The original capture, all 20 dev-guide scenarios and accepted design evidence remain at their original paths. This directory is supplemental evidence, not a production data source.

## Final result

| Check                        | Result                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| Focused Vitest               | **24 passed, 0 failed** (includes two complete real-engine trajectories) |
| `npm run typecheck`          | All three TypeScript projects pass                                       |
| `npm run lint`               | 0 warnings, 0 errors                                                     |
| `npm run build`              | CLI packaging and Vite production build pass                             |
| Scoped Prettier              | Pass                                                                     |
| Production fixture exclusion | All four checked source/guide markers absent                             |

## Earlier observations retained

The first identity assertions incorrectly assumed entrant IDs tracked seat numbers and that Quill was captured seat 2. The engine shuffles entrants; assertions now use actual canonical entrant records. A paid-disproof fixture initially picked an actor holding Assassin; it now advances real turns to an actor without Assassin. No production identities or secret hands were rewritten to fit those assumptions.

`focused-tests-23.json` preserves the passing check before the proof-checkpoint regression was added. Read-through found that a clipped proof checkpoint lacked the selected challenger but could cause the target to be inferred as the losing actor. The implementation now requires evidenced progression into an action-effect loss, and the added test checks both complete and clipped windows.

`lint-before-spacing-fix.txt` preserves the first full lint output: Prettier expanded expressions and exposed the repo's multiline spacing rule. Scoped Oxlint fixes plus a fresh formatting check resolved it; the final full lint output is `lint.txt`.
