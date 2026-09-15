# TIM-18 spec-review correction

The canonical engine emits the final Tax reaction and some hand updates after `turn-ended` and next-turn phase publication. Preserve the completed action/resolution/turn owner in a separate causal tail for those private emissions. Next-turn phase rows continue to use the new board context. The tail expires on a new declaration or other non-tail activity and on missing/unsupported source records; it cannot fill a clipped baseline.

Two canonical regressions cover seed-5 Tax all-pass, seed-6 Exchange return/hand update, new Exchange declaration after Tax, and removed intervening phase records. All 26 story tests and all three TypeScript projects passed. This correction touches only the story model/tests plus this note; TIM-23 backend/reading work is separate. Original `.tim18` evidence remains intact.
