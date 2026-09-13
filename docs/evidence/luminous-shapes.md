# Luminous speech and navigation contour corrections

## Released baseline

- Repository baseline: `68099a0f0886327a3cd57c0bd635785cf102f400`, independently matched against `origin/main` before creating the isolated `fix/luminous-bubble-nav` branch.
- Actual production-render reproduction: `/tmp/opencode/luminous-shapes-baseline-68099a0` (immutable).
- Command: `npx playwright test --config /tmp/opencode/luminous-shapes-playwright.config.mjs luminous-shapes.spec.ts --output /tmp/opencode/luminous-shapes-baseline-68099a0`.
- Runtime: 1.4 seconds. The command captures the reported defect; its successful exit means the capture succeeded, not that the shapes are correct.
- Fixture: real public Secret Overlord observation rendered through the application, with Echo speaking. No Worker, hosted mutation, model call, or new hosted match is involved.
- Additional initial responsive captures: `/tmp/opencode/luminous-shapes-baseline-widths-68099a0` (1600, 768, 390, 320 pixels).

Served assets were fetched from isolated preview port 8831 and compared byte-for-byte with build output:

| Asset                | Bytes  | SHA-256                                                            |
| -------------------- | ------ | ------------------------------------------------------------------ |
| `index-DBOoobtC.js`  | 442154 | `1e273e1e5a529d123740536fe8c5274c1c30b54866e8f896922de85f5670b817` |
| `index-DDog0Idy.css` | 103981 | `7613fcd0243ce9c26207c619c2076869edc57cb9850f72bc4f374b84e66d2cae` |

The actual baseline captures show a rectangular active Arena tab and a horizontal tail/body seam on Echo's speech bubble. These were reproduced before selecting a correction.

## Speech seam isolation

The minimal raster probe, `/tmp/opencode/luminous-tail-red.py`, examines the blank interior immediately beside the tail join in the fixed Echo reproduction. On the immutable released crop it fails with six unexpected border-colored pixels (`#46636f`) at x=73–78/y=41, where the surface is `#1d3039`.

A single-variable render-only probe makes the tail pseudo-element's bottom border transparent. The same raster assertion then passes with zero unexpected pixels. This identifies the skewed pseudo-element's bottom stroke extending into the bubble body as the horizontal seam's source; it is not a fractional antialiasing artifact. The probe is diagnostic only, not the intended final contour. Probe output is separate at `/tmp/opencode/luminous-shapes-probe-tail-bottom`; the released baseline is unchanged.

## Original authority and correction

Design's frozen original-reference pack is `/tmp/opencode/luminous-shape-fix-design.md`, SHA-256 `7bdd996a83064b1291e0db7fc7c7356bc468ffb35bdc1a21fab6513e6a8b1c3c`. Its reference inventory at `/tmp/opencode/luminous-shape-reference-68099a0/` has manifest SHA-256 `4b3acb2449619c1557e64abe6cf978a6edd1f4934cf757682f3b32235dad3c05`.

- Speech: original native `21:7009`, `build-history.mjs` chat contour. One closed SVG retains radius 9, leftward 10px tail, attachment y28–38, fill `#1d3039` and stroke `#49636e`. Nine-slice top 40 retains the entire tail; left 20 contains the 10px outset and body corner. Transparent 1px layout border preserves content widths. The avatar center moves 1px to the original y28 alignment.
- Desktop navigation: original native `35:423`, `build.mjs` notchPath with four orthogonal 5px corner steps. A decorative pseudo-element preserves link layout and independent external focus outline. The finite underline uses the original 1.5px core and two glow layers, inset 18px.
- Compact navigation remains intentionally rectangular at the existing 760px boundary, fill `#15363a`, with 1px rule inset 8px. Tablet 768 uses desktop steps.

The desktop red probe tests the original excluded corner against the adjacent background. Released pixels fail; corrected pixels pass. The committed localized painted regressions also fail on the preserved released build served at 8832: 10 differing nav pixels and 16 tail pixels. Actual, expected, and diff images plus failure trace are retained at `/tmp/opencode/luminous-shapes-regression-red`. Candidate green captures are at `/tmp/opencode/luminous-shapes-regression-candidate`; these are diagnostic candidates, pending final Design review.

## Focus and compact cascade findings

Actual keyboard-focused inactive navigation at 320 showed clipped top/bottom focus strokes. Design froze the pre-correction PNG at `/tmp/opencode/luminous-shapes-design-review/focus-clipped-320-reduced.png`, SHA-256 `9705b6b980909c5c012d91c247283b38e7820b31dd05bdd439adc4c783b22e76`. Removing the compact navigation scroll clip allows its existing external focus outline to paint.

The production CSS minifier emitted an empty `border-image:` declaration for the compact `border-image: none` reset. A rebuilt 320px browser with the compact media query matching still reported the desktop SVG. Explicit `border-image-source: none` fixes that cascade failure. The matrix asserts the compact computed reset and fill, while full painted captures remain the contour authority.

## Focused matrix scope

Eight native contexts cover 1600/768/390/320 and normal/reduced motion. Each captures all four selected links, signed in/out, native and supplemental 1.25 zoom, and actual keyboard-focused active/inactive links with expanded header crops. Speech captures use public live/archive fixtures in both shared games with three different text lengths and speaker labels. Full Secret Overlord fixture snapshots explicitly set `reset: true`, preventing a racing HTTP/WS full snapshot from being treated as incremental events. An earlier duplicate-feed diagnosis was superseded by this fixture protocol finding. Representative wrapped identities are covered; unbroken maximum-length identity containment is not claimed.

Final committed-source identity, served JS/CSS/SVG hashes, checks, inventory, and Design disposition accompany the immutable delivery directory. Screenshot capture success alone is not Design approval.
