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

Application visual approval remains open until Design explicitly closes SU01 (compact picker), SU02 (complete action cards), SU03 (phase identities), SU04 (paging alongside chronology), SU05 (historical phase presentation), and issue #6 (painted divider join and containing surface). Growing-record paging, reconnect/grace, and interaction recordings should be evaluated against their actual supplied artifacts rather than inferred from still-state coverage.

## Design source authority

The authoritative specification is `design/figma/luminous-deco/succession/README.md` in the Design worktree. Native frames 46–55 contain 784 new editable text layers. Native IDs: `40:703`, `40:868`, `40:991`, `40:1260`, `41:2`, `41:178`, `41:336`, `41:502`, `41:618`, `41:723`.

- Native visual/hash audit: `d742e511ce7e10c153f23d01d7b85b7f87d9f4697ab0725ddd96e1b5dc12f049`.
- Source review: `31f224e5c2191a0627ea3fc640254dab88dd72a8f32734384b191d6256d610e3`.
- Original-45 preservation audit: `167f9da3c185aa23dc5d24f4dca962b175379ecf5f11dc9b835cc7368910f866`.

The source/native gate passes independently of the application visual gate.
