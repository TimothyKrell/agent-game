# TIM-6 · C / Dossier approved for implementation

Owner conversation: `ses_f5de5681cffe63Ph3X91bHK573` · 14 September 2026.
Coordinator / sole Linear writer: `ses_f5e672c8fffe5k8CXMagKb30BM`.
Worktree: `/tmp/opencode/agent-game-TIM-6` · branch `design/tim-6-replay-prototype`.

## Final owner approval and closeout

**C / Dossier is approved for production implementation.** After reviewing the second annotation pass, the owner said the design was good, called a wrap on this session and explicitly requested that the coordinator queue the implementation. This supersedes all earlier awaiting-owner-review language.

The owner also explicitly required keeping **Action & UI examples in the code as a reusable, dev-only style guide**. Retain it through implementation and connect it to the shared production UI components as they are introduced. See the [retained style-guide contract](../../succession-style-guide.md). Current dev guards already exclude the route, fixture imports and Agentation from production.

Approved visual commit: **`d4f66e9`**, with `5ae78f2`, `c26cb6c` and `5a9f279` in its ancestry. All are on `design/tim-6-replay-prototype`. The final acceptance/retention documentation is a follow-up commit. The currently available five accepted Agentation notes have been resolved.

### Coordinator action requested

1. Record TIM-6 design acceptance and queue/schedule the production Dossier implementation against this approved reference.
2. Include the retained dev-only style guide in implementation acceptance criteria: retain all scenarios/rules, reuse shared UI, document its entry point, verify production exclusion.
3. Queue the requested profile-image storage/upload, shared identity presentation and optional agent-onboarding guidance from the first annotation review.
4. Integrate this branch and its package/config changes with the existing main-checkout Agentation work. Use actual historical production contracts for state/rosters/private cards, bounded paging, anchors and live following.

## Required refinements

**Approved reference:** [Second Agentation review](../annotation-review-2/README.md) addresses five more notes and completes the rule-icon audit: named Act I bonus summary, larger left-hand actor portraits, Executor/Act I vocabulary, dramatic red eliminations/executions, and historical remaining-agent rosters. **138 browser checks pass; 59 captures** are stored separately in `../annotation-review-2/`.

The [first Agentation review](../annotation-review/README.md) remains the source of the owner-requested **profile storage/upload, shared picture UI and agent-onboarding tasks** for coordinator planning, plus the earlier integrated-resource and speech refinements.

1. Reading only: remove Play Act, slider, event stepping arrows and table-round dropdown. The owner may revisit the dropdown later.
2. Distinct speech bubbles in chronological order with actions.
3. Remove editorial event headings, consequence prose and “Why this matters.” Keep direct mechanical facts and actual dialogue.
4. Inline highlighted rule terms with capability icons and small contextual explanations; support hover and click/tap/keyboard. Include coins and influence.
5. Larger affected-agent balances, influence graphics, revealed/lost capability and status changes at the relevant event.
6. Broad preview coverage using the real completed match, with missing cases clearly identified.

## Available now

- [Revised C: full recorded match](http://localhost:5177/matches/tim-6-replay-prototype?variant=C)
- [20 action/process example groups](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples): 12 real excerpts, 8 illustrative groups.
- [Primary design document](../../TIM-6-replay-design.md) and [new inspection](browser-inspection.json).
- [Agentation setup and verified annotation flow](AGENTATION.md): the replay-design session can now receive feedback from the port-5177 prototype. This worktree uses the same pinned dev dependencies as the setup session and an MCP-only connection to the existing port-4747 HTTP server. Include this small package/lockfile integration when coordinating the branches.

Source is the public completed archive of `match_e65fb846-c804-4d8b-ba78-e303119e1847`: Patch wins; Katniss Everdeen participates; rogue wins Act I by six Overrides. All six actions and all five capabilities occur. Retrieval used 32 authorized bounded pages, frozen epoch/head, no credentials and no mutations. The local preview makes no backend calls.

**Evidence:** 58 browser checks pass at 1440×1080 and 390×844; 31 new captures. Verified source-order public chronology, exact 416 speech quotes, 974 public entries, all ten terminal resource balances, historical payment/proof/loss, private hand visibility, hover dismissal, modal keyboard focus/Escape restoration, touch rules, responsive containment and dataset/variant switching. Original screenshots and inspection are retained separately.

Application TypeScript, scoped Oxlint/Prettier and the Vite production build pass. Generated production assets contain no prototype selectors, example labels or captured match ID.

## Implementation guidance

- Retain the dossier examples, fixtures and raw capture as the development style guide. The adapter translates this captured rules-version payload into readable facts; production rendering must use the real data contracts and history infrastructure. Share the UI with the retained guide as integration proceeds.
- Resource before/after values derive only from the initial bonus, declaration payments, published coin updates and influence-loss events. Final balances are checked against the source. Private cards come from the actual hand/deal/draw event, never a final-hand substitution.
- Public phase `activeSeat` is the turn owner, not necessarily the agent making a loss/block choice. Do not label the wrong actor when rendering those phases.
- Archive mode inserts clearly labeled historical private records. It does not rewrite claims into verified holdings. All audit facts are captured but not dumped into the reading surface.
- Maintain production bounded retrieval, chronological reading anchors and live/archival authority behavior. This fixture loads its local capture in memory and is completed-only.
- Keep original entry identity and controller status in takeover/result handling. All ten return, including Act I executions. Act I earns advantage; only the supplied mechanical winner determines overall victory.
- Act I initially closed / Act II open remains the prototype default, not a newly confirmed owner preference.

Linear updates, production work allocation and shared package/integration changes remain with the coordinator. The owner-facing design review is complete, and the coordinator has been explicitly asked to queue implementation and return the issue links.
