# Match UI delivery plan

## Latest scope decision

The owner has reopened all Succession UI work. Apply the improvements to both
live play and replay now. Whether to pause Succession or introduce a coding
finale is an open product decision, not a prerequisite for UI delivery.
This supersedes the original deferral notes below. Do not disable Succession or
change matchmaking defaults based on the earlier pause assumption. Remove the
match-facing selector only while preserving access to both games elsewhere.

Two additional GPT-5.6 Sol medium lanes implement:

- **Succession panels — TIM-33, TIM-39, TIM-40:** prototype-aligned Act I result
  and beneficiary bonuses, Act II opening, integrated elimination/proof boxes.
- **Succession reader — TIM-32:** sticky act headers, collapse anchoring,
  per-act start/end controls, live following and manual reading preservation.

Shared visual work applies to both games. Panel/row wiring is integrated after
the visual lane to avoid competing edits; reader work owns the chapter shell.

## Original scope (superseded where noted above)

Ship the reusable UI improvements against Secret Overlord, now the main game.
Succession-specific Act I rewards, Act II opening, influence/card-loss and proof
panels remain deferred (TIM-33, TIM-39, TIM-40). Preserve existing historical
Succession routes and the approved prototype/guide for reference.

## Implementation groups

1. **Entry and navigation — TIM-41.** Remove the Secret Overlord/Succession
   selector from the launch experience and make Secret Overlord the default.
   Preserve explicit historical match routing. Audit entry/onboarding links for
   consistency; report any backend availability work separately.
2. **Visual rhythm and identity — TIM-34, TIM-35, TIM-36.** Match the prototype's
   compact text, spacing, avatar proportions and vertically centered inline
   mechanic chips. Use stable identity-colored robot fallbacks, preserving
   uploaded portraits and accessible names. Remove redundant record-position
   wording/card snapshots (TIM-38), including existing historical views without
   otherwise redesigning their deferred panels.
3. **Reading and status graphics — TIM-32, TIM-37.** Improve the Secret Overlord
   record's live-follow and manual reading behavior, with start/latest controls
   and clear sticky navigation where useful. Prefer unified page scrolling;
   avoid introducing competing nested scroll areas. Preserve the visible anchor
   when earlier history loads and suspend following while reading upward.
   Render compact ballot/election/policy tracks from the appropriate historical
   state. Defer two-act-specific navigation until Succession is resumed.

Groups 1 and 2 can run independently of group 3 using separate worktrees.
Integrate entry/navigation first, visual changes second, then reading/graphics.
Keep individual Linear tickets for traceability; grouping is an implementation
boundary rather than deletion or replacement of the requests.

## Validation and delivery

- Each lane checks its changed behavior with targeted tests and static checks.
- Integrated build, types, lint, formatting and lean CI; no default full-match
  stress reruns or evidence-archive cycle.
- Browser review of live and completed Secret Overlord at desktop and narrow
  widths, including custom/fallback portraits, live-follow suspension/resumption,
  history position, graphics and keyboard focus.
- Preserve exact dialogue, private-information rules, historical values and
  bounded history loading. Do not change game deadlines or accounting here.
- Katniss diagnostics (TIM-42), context evaluation (TIM-43), and the coding
  finale experiment (TIM-44) are separate work, outside these UI lanes.

Implementation agents: GPT-5.6 Sol with medium reasoning.
