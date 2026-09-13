# Succession application evidence

## Application identity

Correction source: `67726d6` (`Close compact Succession presentation and historical phase gaps`).
The served production assets were fetched from `http://127.0.0.1:8822` and compared byte-for-byte with the build output:

| Asset                | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `index-DTYTw8Kv.js`  | `560b5838177223e9f521079bf2b643d24291912a24cd0fac28c39607a179756c` |
| `index-DZbXz5-o.css` | `e94603f9d163a03982e59a2b735dc90bd601e1c73135abcffd3fd4af3b01df46` |

Delivery directory: `/tmp/opencode/succession-ui-final-67726d6`. `served-assets.json` records the full commit, working-tree status at capture, served URL, sizes, and hashes. The only dirty source at capture was two blank-line insertions from linting in `e2e/succession-worker.spec.ts`; `capture-source.diff` preserves that exact delta. Application source was committed. The directory is frozen when delivered for Design review; subsequent corrections require a new directory.

## Evidence interpretation

- `e2e/succession-worker.spec.ts` drives an actual isolated local Worker exhibition through both acts and opens the terminal archive and event-zero replay. It uses preview house decisions, without inference spend. The local CLI package is the older 0.1.1 baseline; these browser checks do not exercise the lead's updated CLI.
- `e2e/succession.spec.ts` uses engine-generated phase and replay fixtures. Only displayed live deadlines are rebased to `Date.now() + 30_000` because the engine simulation advances a virtual clock. This shows an ordinary approximately 30-second instrument; it does not measure real elapsed phase duration.
- Cap fixtures deliberately arrange the final table-round resources before asking the engine to resolve income and produce each decisive criterion. Interruption fixtures call the engine interruption transition. The replacement-controller case publishes a typed entitlement cutoff and then delivers a stale private snapshot.
- Long-name phase captures are presentation fixtures: all names use the same long example, and a valid assassination/block claim is substituted to expose actor, target, and blocker together. Historical phase captures use the selected replay frame.
- The eight live normal/reduced-motion recordings create separate browser contexts at 320, 390, 768, and 1600 pixels. Each context sets `recordVideo.size` equal to its viewport and holds the settled phase for two seconds. Other regression recordings can resize their viewport and are diagnostic recordings, not native-resolution motion approval evidence.
- Picker captures cover both selected games at every required width in both motion preferences. Additional scoped captures cover leaderboard, profile, owner, dashboard/global queue, onboarding, and rules.
- Flourish scale 1 captures are the required layout evidence; CSS zoom 1.25 is supplemental reflow evidence. The line and ornament now use SVG strokes sharing the vertical coordinate and no background mask. Geometry assertions support, but do not substitute for, Design's painted-pixel review.

## Verification and approval

Typechecking, scoped Oxlint, formatting, and all four UI stream unit tests pass. The final full browser suite passed **51/51**, including all six legacy motion checks and the actual Worker two-act/archive check (26.3 seconds). `browser-run.txt` preserves the complete run output.

The frozen delivery contains 128 artifacts. Its `inventory.json` SHA-256 is `830418e09a7f3d8d78173d75ae5bdc489206e79252608537eaaa9ef6c881a3b3`. Design received this exact folder for independent review. Curated durable stills are retained under `docs/images/succession/`; full recordings remain in the frozen directory.

Design independently verified all 128 artifact hashes and closed SU01 (compact picker), SU02 (complete action cards), SU03 (phase identities), SU04 presentation (paging alongside chronology), SU05 (historical phase presentation), and issue #6 (painted divider join and containing surface) at `67726d6`. The overall application visual gate remains open for expanded-coverage findings and targeted interaction evidence.

### Compact follow-up: `902c4d2`

- SU06: restored the approved `.18/.34/.24/.24` compact navigation allocation, with a max-content floor for the single-word Leaderboard label at supplemental zoom and 48-pixel targets. Coverage visits all four tabs, signed in and out, at 320/390 pixels and scales 1/1.25.
- SU07: compact cap tuples are normal-flow cards retaining each full survivor name and all three labeled metrics. The ten-row fixture is preserved. Captures wait for the selected historical replay frame to settle.
- The 768-pixel native context and recording now use the required 1024-pixel height. These live challenge recordings establish dimensions and static phase presentation; they do not establish picker interactions, champion entrance motion, or hidden/reduced lifecycle behavior.

Follow-up evidence uses a separate frozen directory, `/tmp/opencode/succession-ui-final-902c4d2`, containing 62 artifacts with inventory SHA-256 `fa99f1a04dc4587d436a6dd84d900a2b79baf40f8e5c67397409b80e22082e8a`. Targeted browser checks passed 11/11. `native-video-dimensions.json` records ffprobe verification of all eight native recordings. The original 128-artifact folder is unchanged. Explicit Design closure of SU06/SU07 and remaining interaction evidence is pending.

Served follow-up assets were again fetched over HTTP and compared byte-for-byte with build output:

| Asset                | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `index-B1j05nE0.js`  | `1357cc59418f53564b2e49e99cf33f69debd8785d4baef9aa22c2fed3b3450fc` |
| `index-uF6Q6Fat.css` | `3d5a0ba3a64f6197166772f791e617c03c0159aba5162f285f3634f9f30d0bf0` |

## Supplemental reflow and interaction evidence: `bdc7172`

Design subsequently closed SU07 and the required scale-1 SU06 matrix at `902c4d2`; supplemental zoom containment and SM01–SM03 remained open. The authoritative review report SHA-256 is `8d160e5dabe3f08659d8a2dac256e07fc60dd07580d37abf7ef42664ef6d2d64`.

`bdc7172` gives all navigation words a min-content floor and lets the game picker become one column when its actual available width cannot fit two plates. The supplemental assertions check every navigation and picker label against its parent, not only Leaderboard.

Exact animation assertions found and corrected a missing Succession spire entrance: the shared result selector previously matched only legacy emblems. The spire now receives the specified 420ms animation with 40ms delay. Title durations and distances remain 240ms and 4px/2px; neutral interruptions use 180ms opacity only. The six legacy motion tests and three legacy feed tests passed after this selector change.

Eight composite clips cover SM01–SM03 at 1600×1120, 768×1024, 390×844, and 320×844 with normal/reduced motion, device scale 1, matching native video sizes, focus dwell, and settled dwell. Each clip records real Web Animations calls, animation IDs, pseudo-element targets, keyframes, duration/delay/iterations, cancellation/completion, action timestamps, running counts, and settled counts. The 1600/320 normal clips additionally interrupt active result animations with the real media-query subscription and the explicitly simulated visibility boundary, then exercise restore and hidden result consumption. Rapid activation uses DOM button activation at 50ms intervals after separate keyboard and touch/fine-pointer interactions. There is no playback time stretching.

Two additional native growing-record clips reproduce a delayed initial history page followed by a newer current head. Explicit bounded paging remains intentional; the footer now reports undelivered events, and its catch-up button distinguishes the latest **loaded** event from the stream head. Captures show the delayed boundary, bounded catch-up, and earlier-page reading.

Evidence directory: `/tmp/opencode/succession-ui-final-bdc7172`. `served-assets.json` records HTTP/build byte equality. The composite and zoom run passed 12/12 cases at this application source; `capture-source.diff` records test-only blank-line cleanup. A separate growing-history supplement uses a later live discussion fixture and requires the earlier-page control, ensuring cache eviction and backward paging are visibly exercised; its exact test delta is retained separately. Earlier frozen directories remain unchanged. Actual visual closure remains Design's decision on these supplied bytes.

The frozen delivery contains 79 artifacts; inventory SHA-256 `d5a54996e91bcdf699dcfd93624d7f101a5c41c1009379ae240081cb1642ccd5`. The later growing-history supplement passed 2/2. Its clips under `growing-history-supplement/` supersede the first two growing-history recordings for backward-paging proof. `scene-index.json` indexes action timestamps for the eight composite clips; offsets are relative to the first recorded blank-page action, not re-timed video. `native-video-dimensions.json` verifies native dimensions and 25fps encoding.

| Asset                | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `index-C8KOGH8I.js`  | `081daba953ae4bb904d8a3c89eb689fdd8db7d04a4ebd287c2d489e68a9c34b7` |
| `index-DDog0Idy.css` | `7613fcd0243ce9c26207c619c2076869edc57cb9850f72bc4f374b84e66d2cae` |

## Design source authority

The authoritative specification is `design/figma/luminous-deco/succession/README.md` in the Design worktree. Native frames 46–55 contain 784 new editable text layers. Native IDs: `40:703`, `40:868`, `40:991`, `40:1260`, `41:2`, `41:178`, `41:336`, `41:502`, `41:618`, `41:723`.

- Native visual/hash audit: `d742e511ce7e10c153f23d01d7b85b7f87d9f4697ab0725ddd96e1b5dc12f049`.
- Source review: `31f224e5c2191a0627ea3fc640254dab88dd72a8f32734384b191d6256d610e3`.
- Original-45 preservation audit: `167f9da3c185aa23dc5d24f4dca962b175379ecf5f11dc9b835cc7368910f866`.

The source/native gate passes independently of the application visual gate.
