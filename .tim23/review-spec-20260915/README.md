# TIM-23 spec-review corrections

Read-only reference probes: `/tmp/opencode/TIM23-spec-review/`. Original `.tim23` reports remain preserved. Each browser run uses its own `TIM23_EVIDENCE_DIR` subdirectory here.

Findings: competing document readers restoring stale anchors, act-index responses crossing an in-flight Act I→II transition, and completed Tax context lost at the terminal phase before the final private response. Each correction has a direct regression and its own commit.

## P1 · shared document scrolling

`document-red/` reproduces the 10,646.609375-pixel yank with two simultaneously open document readers. The layout effect now restores only a replaced window or enabled/root geometry transition. A document reader must own the visible reading position to remember/restore anchors, follow, detach or request boundary replacements. Ownership is resolved from visible timeline elements, preferring a visible focused row and otherwise the first visible reader; offscreen anchors cannot reclaim scrolling. Resize restoration also rechecks that ownership. Offscreen readers track raw scroll direction without publishing follow changes.

`document-green-2/` passes all **9 continuous browser scenarios**, including the expanded two-open-chapter regression: scrollbar-style jump to chapter two, PageDown, three forward and three backward window replacements, visible row focus and head-only updates, then return to chapter one and further automatic loading. Both readers stay mounted with 128 rows. Existing document focused prepend, narrow self-scroll geometry, long eviction/revisit, paused Query and lifecycle scenarios remain passing.
