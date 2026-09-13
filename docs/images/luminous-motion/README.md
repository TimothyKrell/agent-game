# Motion review evidence

Application source: **`a8dd5d6d1d969fbf8ed75a5551b4a754873d56a5`**, based on Phase 1 merge `93592fb5b9d0d7a7439dc7cbc325949d30a7bf77`. This evidence publication changes no application source. The [motion contract and verification summary](../../luminous-motion.md) explain M01–M06 and the MV01/MR01/EV01 corrections.

## Native-size walkthroughs

Each main WebM is unmodified real-time playback at **25 fps**, with its exact viewport dimensions. Compact contexts use a coarse touch pointer. `video-1.webm` and `video-2.webm` record the actual Full record popups opened during the walkthrough.

| Viewport    | Normal motion                                                               | Reduced motion                                                                |
| ----------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1600 × 1120 | [Video](1600-normal/video.webm) · [Scene manifest](1600-normal/scenes.json) | [Video](1600-reduced/video.webm) · [Scene manifest](1600-reduced/scenes.json) |
| 390 × 844   | [Video](390-normal/video.webm) · [Scene manifest](390-normal/scenes.json)   | [Video](390-reduced/video.webm) · [Scene manifest](390-reduced/scenes.json)   |
| 320 × 844   | [Video](320-normal/video.webm) · [Scene manifest](320-normal/scenes.json)   | [Video](320-reduced/video.webm) · [Scene manifest](320-reduced/scenes.json)   |

The scenes cover splash first arrival/leave/revisit, pointer and keyboard controls, explicit and rapid selection, public route entry, the actual query-only pairing recovery link, live updates away from the bottom, folds/filters, hidden observation updates, complete/interrupted results, replay play/pause/scrub/round seeking, Recorded data and Full record, and preference/visibility interruption.

Each directory also contains native settled/focus/disclosure PNGs and four timing contact sheets: title entry, artwork entry, control press and tab selection. Requested sample offsets are **0/80/140/240/420/560/1000 ms**. These are nearest available trace screencast frames, with requested and actual captured offsets printed on the sheets and in `frame-times.json`; they are not claimed to be exact event-aligned frames. Navigation-call wall time plus browser performance time approximates the entry clock. Individual native frame PNGs named by `frame-times.json` and `trace.zip` are retained in the full frozen set below.

## Provenance and lifecycle checks

- [Published inventory](inventory.json): hashes, byte sizes, dimensions, frame rate and duration for all 126 published scene artifacts.
- [Final verification transcript](verification.log): lint, formatting, three typechecks, 42 unit tests, 29 browser tests, build, dry-run and six recordings; sequential command exited 0.
- Each scene asserts a clean `src`/`public` tree and hashes the actually served assets against local build bytes.
- All three reduced-motion scenes record zero owned Web Animations calls. Active visibility interruption cancels four owned animations on desktop and one on compact, where the artwork center has not yet entered the viewport. Return remains settled.
- Visibility is **explicitly simulated at `document.visibilityState` and `visibilitychange`**. Application subscriptions, owned-animation cancellation and observation updates run normally. Dynamic reduced motion uses browser media emulation.
- MV01: compact first scroll triggers the three artwork groups once, after the stable center wrapper reaches 50% visibility. Leave/revisit does not replay the cue.
- MR01: the actual `/connect?code=MOTION-PAIRING` → “Start with your agent” → `/connect` recovery mounts settled onboarding with no new title animation.
- EV01: initial full WebSocket fixture snapshots explicitly reset the HTTP chronology. Unique rendered event IDs and one initial Match begins / Phase change are asserted before and after fold/filter capture.

Served bytes, identical in all six scenes:

| Asset                        | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `/assets/index-xlFhdM34.js`  | `ed415d40c3b47e70cc884abcdfee2b1f57cf169b8850cc386c45b96e980e8338` |
| `/assets/index-AR6fswqn.css` | `843e49e2ca3f6d97a071092ba21a425a9a2f38efec9cf98a7033a522801fdd08` |

Full frozen evidence: `/tmp/opencode/luminous-motion-review-a8dd5d6/`, containing 300 artifacts plus `inventory.json`. Full-inventory SHA-256: `f51317f263e5ab3ae0aa0b03e1e578cca851f48aa39073c85fd3d3f512fe2327`. The published subset is copied byte-for-byte from that set; large trace archives and individual frame samples remain in the full set.

Native Figma frames 44–45 remain pending editor authentication; Design's M01–M06 written contract and source companions are authoritative. The final exact-head Design and independent review decisions are attached to the motion PR.
