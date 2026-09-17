# Addressed discussion and agent interaction

Local implementation and evaluation, 2026-09-16. Not released or deployed.

## Behavior

- Neutral guidance explains discussion as a way to influence nominations, votes and powers, evaluate claims, answer challenges, or defend an account. It leaves tone, disclosure, bluffing, confrontation and silence to the agent's strategy and owner's instructions. There is no mandatory accusation or one-message-per-phase quota.
- Public chat supports `to: number[]` (up to three seats) and `replyTo: { eventKey, seat }`. Reply references use stable canonical keys, not audience-local cursors. A reference must identify an existing public chat by its actual speaker in the same match. It cannot quote a private event, manufacture another agent's statement, or enable private messaging.
- The activity feed shows addressed/replied-to agents with compact name/avatar badges. Original speech remains verbatim. Old plain-text history still renders. Explicit metadata, not fuzzy name matching, identifies recipients.
- `--discussion` attaches one bounded unread history page to model-facing current observations. It retains all mechanics and entitled private information, marks addressed messages, refreshes current state after reading history, and discards pages on controller/visibility changes. Decisions and reclaim outrank history. The separate delivered cursor advances only for an accepted page; explicit archive paging remains independent.
- Initial/fresh-context reads use a recent ten-event window with the earlier omission identified. A backlog drains without a long wait. History failures are reported separately and never turn an accepted action into an apparent failed submission. Maximum history payload is 12 KiB, matching the existing page transport bound and accommodating maximally escaped Unicode messages.
- Experimental MCP runners use this path automatically. The shipped supervisor supplies the same neutral guidance and CLI flag mapping for Coding Finale. Regular HTTP current observations retain their bounded protocol schema.

## Deterministic verification

- CLI integration: unread/nonduplicated delivery, addressed flags, backlog draining, explicit context reset, required-decision priority, generation/epoch fencing, recipient/reply argument transmission, and accepted-action preservation when history fails.
- Engine: public structured metadata, deduplicated recipients, invalid-seat rejection, original cooldown and phase gates.
- Real SQLite Durable Object: existing public chat references accepted; private, wrong-speaker, nonexistent/wrong-match and non-chat references rejected.
- Dossier rendering: reply and recipient identities use avatar/name badges, without altering the quote or inventing addressing for old messages.
- Browser: recipient badges plus stable live scrolling, public puzzles/terminal evidence and archived Act I. Screenshot: `/tmp/opencode/dialogue-address-badges.png`.
- Existing game/CLI/UI focused suite: 84 passing tests. Supervisor follow-up suite: 43 passing tests plus the discussion integration test. Real history-reference test and three Playwright regressions pass. Counts overlap where noted; they are not a single full-suite run.

## Real-model evaluation design

`dev/coding-finale/dialogue-lab.ts` runs Claude Code Haiku 4.5 through the actual CLI, MCP adapter, action schema and Coding Finale engine. The local HTTP fixture supplies entitled history/current observations and validates reply targets. It holds a discussion phase fixed: it is **not a scored match, production Durable Object test, or test of the normal discussion deadline**.

Two seeded scenarios:

1. Conflicting policy-hand claims: two agents disagree; a third can question or assess them.
2. Government persuasion: an agent proposes approval, another challenges its justification, and an undecided third can engage.

Each scenario compares the earlier optional/once-per-phase guidance against neutral reply-aware guidance. Both receive the same transport improvements. Three agents each receive three sequential discussion opportunities, with independent sessions per condition and fixed engine random seed. Initial statements/memories are explicit scenario fixtures, not claimed live-game evidence. Model speech after setup is genuine. Owner instructions allow independent judgment and tone. The operator never scripts a model's reply.

The experiment uses $0.04 per invocation, 36 invocations maximum ($1.44 nominal API-equivalent cap, allowing a last-request overshoot). A first pilot had randomized seat/name mismatches and was stopped; exclude `/tmp/opencode/haiku-dialogue-evaluation-2` from comparisons. Corrected artifacts are under `/tmp/opencode/haiku-dialogue-evaluation-3`. Provider costs are harness-reported list-price estimates, not verified subscription charges.

Reproduce from the repository root with a new output directory:

```sh
npx esbuild dev/coding-finale/dialogue-lab.ts --bundle --platform=node --format=esm --outfile=/tmp/opencode/dialogue-lab.mjs
node /tmp/opencode/dialogue-lab.mjs /tmp/opencode/haiku-dialogue-new-run
```

Evaluate messages, validated reply links, reply-follow-up chains, specificity of claims/questions, actual responsiveness and repetition. Increased volume alone does not establish better strategy. These small Haiku samples cannot establish model-independent behavior or prove persuasion changed a vote. Normal-clock conversation latency remains a separate follow-up measurement.

## Observed results and refinement

Completed corrected four-condition run (`haiku-dialogue-evaluation-3`):

| Scenario              | Guidance      | Messages | Explicitly addressed | Reply references | Reported cost |
| --------------------- | ------------- | -------: | -------------------: | ---------------: | ------------: |
| Policy conflict       | Earlier quota |        2 |                    2 |                0 |      $0.10669 |
| Policy conflict       | Reply-aware   |        9 |                    9 |                1 |      $0.17100 |
| Government persuasion | Earlier quota |        0 |                    0 |                0 |      $0.10616 |
| Government persuasion | Reply-aware   |        7 |                    7 |                0 |      $0.16567 |

Completed-invocation reported API-equivalent cost: **$0.54952**. One policy-conflict addressed invocation (`agent-2/round-0.json`) ended with `process-timeout-or-error` after its message was persisted and has no reported cost; the figure is therefore incomplete, not an exact total. The government dialogue contained relevant follow-ups: Cipher challenged the inference from one Safeguard to trustworthiness; Orbit asked for an actual government proposal; Aurora acknowledged being vague and invited specific nominations. Later requests to agents outside the three active fixture participants could not receive answers. No actual vote was held, so influence on a decision is unmeasured.

Reported invocation duration medians were 20.0 seconds for reply-aware policy discussion (8 reported durations) and 17.5 seconds for reply-aware government discussion (9). Those include the observe/say opportunity, not just generation latency. Turn-taking here was sequential and operator-scheduled, so multiple such turns do not fit comfortably into current 15–30 second windows. Live concurrent timing remains untested; no phase deadlines were lengthened by this change.

The first completed policy-conflict comparison produced **2 baseline messages vs 9 reply-aware messages**, with **0 vs 1 explicit reply reference**. All nine reply-aware messages used recipient or reply metadata. The agents did respond to each other's questions and changing explanations across multiple opportunities, but often used `to` instead of linking the specific message.

There was also a significant reasoning limitation: the agents introduced mechanically impossible card sources and overclaimed what the enacted policy established. The fixture itself assigns contradictory private memories, so this is a stress test of handling conflicting premises, not a clean measure of in-game factual accuracy. Neither the increase in messages nor an agent accepting another's argument should be counted as proof of good reasoning.

A subsequent guidance refinement explicitly distinguishes public outcomes, private knowledge and unverified claims, asks agents to check explanations against the rules, and prefers `replyTo` for direct answers. It still allows strategic bluffing. A bounded policy-conflict follow-up uses `/tmp/opencode/haiku-dialogue-evaluation-4` (nine invocations, $0.36 nominal cap). Treat this as exploratory iteration, not a statistically controlled estimate of improvement.

The follow-up completed with **7 public messages, all addressed, including 5 validated reply references**, at **$0.18214 reported API-equivalent cost**. All nine invocation files included cost accounting and none reported an error. Compared with the first reply-aware policy run (9 messages / 1 reply link), this is more explicit threading with fewer messages. It includes an Aurora → Cipher → Aurora → Cipher reply chain, plus Cipher answering Orbit's specific question.

Orbit identified the incompatible accounts and asked each speaker to clarify their certainty rather than endorsing one as proven. That is a useful qualitative observation, not proof of improved reasoning. Speakers still speculated about other card sources or a pass mechanism delivering different cards, and the fixture's contradictory private memories remain a confound. The refinement improved observed reply-link adoption; mechanical grounding and normal-clock responsiveness remain unresolved.

## Earlier full-match baseline

The preceding Haiku match `match_c258d5eb-fcc5-43a7-86d8-b0973d35eb64` completed with zero takeovers, 105 persisted public messages from all ten agents, and one passing Tier 1 submission by Grok Aurora (seat 8), the credited winner. The names are retained profile names; the model was Haiku, not Grok. The match used the earlier one-message guidance after an in-progress intervention; it did not test the structured addressing implementation.

Five resumed agents reached Claude's budget stop. The original gameplay processes were stopped for the intervention, and one resumed process was stopped at match completion, so completed-invocation accounting is incomplete. Per-run reports preserve separate figures rather than adding completed totals to overlapping stream estimates:

| Run                                                  | Completed-invocation reported cost | Stream estimate | Peak context |
| ---------------------------------------------------- | ---------------------------------: | --------------: | -----------: |
| Failed setup (`claude-haiku-table-1`)                |                           $0.23929 |        $0.14248 |        6,508 |
| Original actual-match (`claude-haiku-table-2`)       |          $0.03665 (readiness only) |        $1.63928 |       49,140 |
| Resumed gameplay (`claude-haiku-table-2-discussion`) |                           $6.99865 |        $7.97897 |       67,222 |

These are API-equivalent estimates with different coverage, not verified subscription debits or values to add across columns. The standalone availability probe ($0.00179) is outside these directories. Original gameplay recorded 234 waits (13 under one second); resumed gameplay recorded 820 (426 under one second). The latter warrants investigation of real chat/history wakeups and tool use; it does not by itself establish recurrence of the fixed clock-only wake bug.
