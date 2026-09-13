# Luminous Deco interaction motion

Phase 2 builds on the approved sitewide UI merged at `93592fb5b9d0d7a7439dc7cbc325949d30a7bf77`. Its motion contract is **M01–M06**, authored by the existing Design session in `design/figma/luminous-deco/motion/README.md` in the `agent-games-art-deco` worktree.

## Motion rules

| Rule                              | Implementation                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 — precise shared actions      | Fine-pointer button hover −1 px / 140 ms; actual press +1 px / 80 ms; directional arrows move 2 px. Immediate 2 px outline / 4 px offset; focus alone stays still. Disabled controls receive no motion.                                                                                             |
| M02 — local selection             | New navigation/tab/filter underlines settle from .72 scale / .4 opacity over 180 ms. Active semantics update immediately. Explicit arena choices settle only the selected introduction's opacity; its DOM persists. Re-selection, polling and fallback do not cue the introduction.                 |
| M03 — a single ceremonial arrival | Title 240 ms; structural rings 520 + 40 ms; center emblem 420 + 120 ms; rule terminals 240 + 120 ms. Ten seats, numbers and center lettering stay stationary. Fine-pointer presence after settling gives rings .6° and center −2 px over 420 ms. **No ambient loop.**                               |
| M04 — public title entry          | Only opted-in public/account headings translate 4 px (2 px compact) and settle opacity over 240 ms. Rows, bodies, forms, `main` and scroll containers stay fully present. Restored history, hash targets, query-only changes and focused entries are static.                                        |
| M05 — terminal record arrival     | Actual winner heading 240 ms; its emblem .97 scale / .7 opacity settles over 420 + 40 ms. Interrupted/winner-absent headings use only .9 → 1 opacity / 180 ms. Final totals are correct from the first frame and entrances do not restart during replay.                                            |
| M06 — truthful chronology         | Existing discussion indicators rotate over 140 ms. Disclosure contents, feed rows and heights update immediately under existing anchor logic. The optional live-policy cue is omitted: existing transport freshness does not reliably distinguish every new enactment from reconnect/catch-up data. |

Responsive easing: `cubic-bezier(.2,.8,.2,1)`. Ceremonial easing: `cubic-bezier(.16,1,.3,1)`. Every new entrance is finite and ends within **560 ms**. Only transform/opacity are animated; contrast feedback is immediate. Static section-heading entrances are intentionally not opted in.

## Scope and lifecycle

- `src/client/motion.tsx` owns presentation capability and one-shot/explicit cues. One shared media/visibility subscription synchronously cancels owned Web Animations and removes CSS motion capability. Completed animations leave the registry; one-shot observers disconnect after use and on cleanup.
- Reduced motion, hidden state, restored history and hash/focus skips **consume entrances**. Returning or changing the preference back does not replay them. Hover requires fresh pointer movement after a hidden/reduced interruption.
- `src/client/motion.css` contains property-specific control feedback and settled underline geometry. No-JS/default styling is the settled state. Reduced motion also disables existing busy-icon rotation and smooth scrolling; explanatory status text remains.
- `src/client/deco.tsx` exposes separate SVG framing/center/terminal groups while retaining authored geometry. Transform wrappers preserve native SVG transforms.
- MV01 correction: artwork entry observes the stable center wrapper at 50% visibility. Static top seats entering the compact viewport cannot consume the center's entrance while it is below the fold. Title entry remains independent; revisiting the artwork stays static.
- Query-only recovery is also static when it changes the mounted composition: the actual “Start with your agent” link from `/connect?code=…` to `/connect` cannot replay onboarding's title entrance. The navigation gate compares pathnames, independently of whether React mounts a different component.
- EV01 evidence correction: capture/regression fixtures mark their initial full WebSocket observation as a reset, avoiding duplicate HTTP events. Unique retained event IDs and one initial Match begins / Phase change are asserted. This corrects the fixture, not the production transport.
- `src/client/main.tsx` opts in titles/results and explicit arena choices. `app:navigate` distinguishes intentional in-app navigation from browser restoration; modifier links retain native behavior. `src/client/match-feed.tsx` opts in only the existing filter underline.
- Game handlers, engine execution, transport, privacy, authority, timers, replay reconstruction and rating rules retain their Phase 1 contracts.

## Design sources and native status

Source companions are `motion/screens/44-motion-response.svg` and `45-motion-records.svg`, with visually inspected PNGs. Their source validation records **200 editable text layers**, no text overlaps and no content/page bounds violations.

**Native Figma placement of frames 44–45 is pending editor authentication**, independently of implementation review. No native IDs/exports for these new companions are claimed. Design's `motion/native-status.md` records the exact recovery step and preserves the existing 43 native frames. The written M01–M06 contract and source companions are authoritative for this phase.

## Verification and review evidence

Implementation and final local verification passed on clean application source **`a8dd5d6d1d969fbf8ed75a5551b4a754873d56a5`**. The [published evidence index](images/luminous-motion/README.md) contains all six real-time walkthroughs, settled screenshots, timing contact sheets and served-asset provenance. Exact-head Design and independent review verdicts, CI and hosted preview verification are recorded in the motion PR.

| Check                                                    | Final result                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Lint with `--deny-warnings`                              | 0 warnings / 0 errors                                            |
| Prettier                                                 | Passed                                                           |
| Client/server, infrastructure and lint-plugin typechecks | All three passed                                                 |
| Unit suite                                               | 42/42, 10 files                                                  |
| Browser suite                                            | 29/29, including all 23 Phase 1 regressions and six motion tests |
| Production build                                         | Passed                                                           |
| Wrangler deployment dry-run                              | Passed                                                           |
| Native-size motion recordings                            | 6/6, normal/reduced at all three widths                          |

The final sequential run exited **0**; its [transcript](images/luminous-motion/verification.log) is retained. The local API suite was not repeated for this frontend-only delta; CI runs the complete API suite. Earlier captures are superseded: the first recording tail was intentionally interrupted to extend coverage, and a later intermediate capture was rejected by its clean-source guard while a review correction was being edited. Neither intermediate set is the final evidence.

- `e2e/motion.spec.ts`: enabled/reduced keyboard control and selection behavior; back/query restoration; one-shot cancellation; pending loading text; live reading anchors; hidden observation updates; replay stability; retained automatic arena fallback.
- `e2e/motion-observer.ts`: records actual animation calls/timings without changing animation playback. The visibility boundary is explicitly simulated because headless Chromium keeps background tabs visible; application subscriptions/cancellation and observation updates are exercised normally.
- Existing feed, result, lifecycle, responsive and runtime regressions remain required.
- `playwright.motion.config.ts` runs separate real-time, native-size WebM recordings at **1600×1120, 390×844, 320×844**, each with normal/reduced motion. Compact recording contexts use a coarse touch pointer. Scene clocks, actual animation traces, settled screenshots and retained traces accompany each video.

```sh
PORT=8799 npm run test:browser
PORT=8799 npx playwright test --config playwright.motion.config.ts
```

Interactive review server: **8800**, serving the current built client. Recording output defaults to `/tmp/opencode/luminous-motion-recordings/`. The full immutable final evidence is `/tmp/opencode/luminous-motion-review-a8dd5d6/`; its inventory SHA-256 is `f51317f263e5ab3ae0aa0b03e1e578cca851f48aa39073c85fd3d3f512fe2327`. Published files are byte-identical copies with a separate [inventory](images/luminous-motion/inventory.json). Trace archives and individual native frame samples remain in the full frozen set; the repo includes their timing metadata and contact sheets.
