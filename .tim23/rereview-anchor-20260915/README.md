# TIM-23 variable-height window anchor correction

Base: `74592b8`. Immutable reference: `/tmp/opencode/TIM23-spec-rereview-74592b8/`. All previous reports and the reference snapshot are preserved.

The focused browser regression uses two mounted document timelines, a held replacement and the reference's first-64-row 300px minimum height. It measures the same retained opaque row before/after the real production hook/container replaces the selected range. Additional cases cover omitted incoming rows and backward loading. Fixture URLs are intercepted without opening a port listener, and each run has a unique `TIM23_EVIDENCE_DIR`.

## Cause and correction

The post-replacement visibility guard confused a reader displaced by its own DOM eviction with a reader abandoned through navigation. Removing that guard wholesale would revive the previous offscreen-reader snap.

`WindowCommit` uses React's `getSnapshotBeforeUpdate` to capture the actually visible owner, opaque row key, row offset and live-follow intent immediately before a changed row window mutates the DOM. `componentDidUpdate` consumes that snapshot synchronously after mutation, without asking the displaced reader to qualify as visible again. Status/head/follow-only changes do not produce a commit snapshot. Enabled state, reader lifetime and scroll-root identity fence replacements.

The snapshot is captured at commit, not request dispatch: navigation during a held request selects the newly visible chapter. A sibling replacement preserves that chapter's anchor through height changes above it. A simultaneously replaced visible reader owns its own snapshot; a sibling's version fence prevents overriding its live-follow restoration. No snapshot survives the commit, and no global UI state or hook API change is introduced. Existing visibility-guarded resize/disclosure restoration remains in place.

## Exact measurements

Final browser report: `green-4/browser-results.json`, with JSON geometry attachments. All values are CSS pixels.

| Scenario                                                                   | Before → after        | Drift        |
| -------------------------------------------------------------------------- | --------------------- | ------------ |
| Immutable-probe sequence, retained row 121, window 1–128 → 65–192          | −35.3125 → −35.3125   | **0**        |
| Forward, tall outgoing rows and omitted incoming rows, focused row 121     | −7.3125 → −7.3125     | **0**        |
| Backward, tall outgoing rows, retained row 65                              | −79.4375 → −79.5      | **−0.0625**  |
| Backward, omitted incoming rows, retained row 65                           | −79.4375 → −79.4375   | **0**        |
| Held first-chapter request; user focuses chapter two and presses ArrowDown | 305.65625 → 305.59375 | **−0.0625**  |
| Live-follow final-row edge relative to viewport bottom                     | −0.109375 → 0.21875   | **0.328125** |

In the navigation case focus remains on the same chapter-two button and chapter one's bottom remains at **−520.78125 px**. The late response does not drag the reader back into chapter one. The original 2,054-record traversal still mounts at most 128 rows and uses 252 history requests; narrow prepend drift stays at 0.375 px.

## Verification and diagnostic record

- `red/`: the original source fails forward tall-to-short (15,270 px) and tall-to-omitted (10,177 px) retention. Backward controls pass.
- `green-1.txt`, `omitted-diagnostic/`: the initial all-64-incoming-rows-omitted probe correctly traversed onward before a locator for the first replacement could be measured. The final geometry probe omits 48 incoming rows, retaining enough visible tail to measure that selected replacement. The existing long omitted-run traversal remains enabled separately.
- `green-3/`: the added exact-probe preflight initially asserted absolute `scrollY` across a head-only update. The new-activity button above chapter two adds 28 px; the corrected assertion measures the retained row offset, matching the reference probe's own 28 px compensation.
- `green-4/`: **all 15 continuous-reader browser scenarios pass**, including six new window/navigation/follow scenarios and all nine existing scenarios.
- `reader.json`: **all 14 continuous-reader state-machine tests pass**.
- `typecheck.txt`, `lint.txt`, `build.txt`, `format.txt`: all three TypeScript projects, whole-repository Oxlint, CLI/Vite build and scoped formatting pass.

Original reports and the immutable source probe are untouched. New generated diagnostic text has trailing whitespace normalized for commit checks.
