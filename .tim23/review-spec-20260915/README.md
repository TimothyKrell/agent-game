# TIM-23 spec-review corrections

Read-only reference probes: `/tmp/opencode/TIM23-spec-review/`. Original `.tim23` reports remain preserved. Each browser run uses its own `TIM23_EVIDENCE_DIR` subdirectory here.

Findings: competing document readers restoring stale anchors, act-index responses crossing an in-flight Act I→II transition, and completed Tax context lost at the terminal phase before the final private response. Each correction has a direct regression and its own commit.

## P1 · shared document scrolling

`document-red/` reproduces the 10,646.609375-pixel yank with two simultaneously open document readers. The layout effect now restores only a replaced window or enabled/root geometry transition. A document reader must own the visible reading position to remember/restore anchors, follow, detach or request boundary replacements. Ownership is resolved from visible timeline elements, preferring a visible focused row and otherwise the first visible reader; offscreen anchors cannot reclaim scrolling. Resize restoration also rechecks that ownership. Offscreen readers track raw scroll direction without publishing follow changes.

`document-green-2/` passes all **9 continuous browser scenarios**, including the expanded two-open-chapter regression: scrollbar-style jump to chapter two, PageDown, three forward and three backward window replacements, visible row focus and head-only updates, then return to chapter one and further automatic loading. Both readers stay mounted with 128 rows. Existing document focused prepend, narrow self-scroll geometry, long eviction/revisit, paused Query and lifecycle scenarios remain passing.

## P2 · in-flight act landmarks

`act-race-red.json` captures the old Act I index completing after an accepted same-epoch Act II observation. The reader now captures the act at index dispatch, releases the completed Query entry, and re-fetches for a changed act before committing either boundary. An act transition arriving later in a selected operation also schedules the missing landmark refresh when that operation finishes, even for detached readers. Head-only changes do not invalidate landmarks.

`act-race-final.json` passes **14 continuous-reader tests**. Canonical creation plus the return evolution establish the exact Act II start at cursor **6**: Act I ends at **5**, and Act II begins at exclusive cursor **5** with the return row. Two held old-index readers each refresh once (four total index requests); the same-act held head-growth case stays at two total index requests. Completed Act I stays frozen on later head growth. All TypeScript projects and repository lint pass for this correction.
