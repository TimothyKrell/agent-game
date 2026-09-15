# TIM-23 evidence

Baseline `7233eb6`; worktree `/tmp/opencode/agent-game-TIM-23`, branch `feat/tim-23-continuous-history`.

## Delivered interfaces

- `src/client/use-succession-story.ts`: `useSuccessionStory`, `SuccessionStoryReader`, `StoryReadingAnchor`.
- `src/client/succession-timeline.tsx`: generic `SuccessionTimeline` / `SuccessionTimelineProps`, caller-owned `renderRow`.
- `src/client/succession-story-data.ts`: bounded selected Query read with exact-start checkpoint, `STORY_WINDOW_EVENTS=128`, `STORY_WINDOW_SHIFT=64`.
- `src/client/continuous-succession-history.ts`: independent reader state machine and ownership contracts.
- `src/shared/history-checkpoint.ts`: additive authorized checkpoint envelope / Effect decoder.
- `useSuccessionMatch(initial, { history: false })`: current and commands with the prior feed reader disabled. Default behavior stays compatible.

Full caller/source contract: [`docs/evidence/TIM-23-continuous-history.md`](../docs/evidence/TIM-23-continuous-history.md).

## Final verification

| Evidence                                       | Result                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `worker-checkpoints.json`                      | 2 complete actual Worker scenarios; source entitlement, historical checkpoints, takeover, grant revocation and archive checks |
| `final-tests.json`                             | 42 checks: 26 story, 8 initial reader, 4 stream, 4 indexed-history                                                            |
| `reader-final.json`                            | 9 final reader checks, including the added in-flight opposite-edge anchor regression                                          |
| `browser-results.json`, `browser-complete.txt` | 30 passed: 7 actual continuous hook/container scenarios plus 23 existing Query/current/command lifecycle regressions          |
| `typecheck.txt`                                | All three TS projects pass                                                                                                    |
| `lint.txt`                                     | Whole repository: zero errors/warnings                                                                                        |
| `build.txt`                                    | CLI packaging / Vite pass                                                                                                     |
| `format.txt`                                   | Scoped source/test/docs formatting pass                                                                                       |

Measured traversal: 2,054 unique source records, max 128 mounted rows, 63 selected windows, 252 bounded history requests plus 63 checkpoints, max history page 10,774 bytes, zero cached Query entries after delivery. Prepend anchor drift: 0.375 CSS pixel with the identical event key. Browser report contains the JSON bounds/geometry attachments.

Fixture page URLs are intercepted at `http://127.0.0.1:6283`; no server on a shared preview port is needed. Worker tests use isolated local storage and their existing ephemeral Wrangler ports. Dependency versions and package files were not changed. No push, deployment, paid inference or external game participation was performed.

## Earlier observations preserved

`TIM-18-correction.md` accompanies separate cherry-pickable correction **`4cba978`**. Original `.tim18` evidence is untouched.

Earlier `browser-run*`, `browser-final*`, `browser-verified*`, `model-reader-tests*`, `reader-tests-3*` and `lint-*.json` record intermediate checks. Failures caught an invalid test ARIA role, a malformed reset fixture, a native key-scroll animation crossing prepend, subpixel rounding, an internal Retry button inadvertently detaching live follow, and directional paging oscillation across omitted row renderings. Final checks above include their corrections. The older `.tim23/browser-results.json` nested under this folder came from the first reporter-path configuration; the top-level `browser-results.json` is authoritative.

The production route and Dossier card/chapter styling are integrated by the coordinator after independent review. These tests exercise the production data bridge and generic reading surface; they do not claim hosted-route visual acceptance.

Report trailing spaces and trailing empty EOF lines are normalized for commit whitespace checks; result records and diagnostic content are preserved.
