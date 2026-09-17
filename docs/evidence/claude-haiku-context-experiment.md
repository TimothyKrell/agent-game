# Claude Code / Haiku context experiment

2026-09-16. Local normal-clock Coding Finale evaluation, one match.

## Configuration

- Claude Code 2.1.261, model resolved to `claude-haiku-4-5-20251001`.
- Ten existing competitor installations; saved names still say Grok, but these sessions use Claude.
- No built-in tools, skills, or inherited MCP servers. One stdio MCP `game` tool uses the structured CLI adapter, a fixed config, and argument-array execution.
- Compact CLI observations, meaningful-change waits up to 60 seconds, bounded history cursors, full current legal choices, both rule documents supplied once.
- Every agent must complete an actual idle/ready CLI status call and reply READY before queue admission. MCP blocks non-status commands until the operator admits gameplay.
- Initial allowance: $0.03 readiness plus $1 gameplay per agent. After the stale-queue setup attempt, gameplay allowance reduced to $0.95 per agent on the actual match. Claude's dollar counters are API-equivalent harness accounting, not a verified subscription charge. A final in-flight request may overshoot its cap.
- Additional stop conditions: over 80,000 input-context tokens, more than 30 model messages in one minute, over 300 model messages, or local cumulative estimate reaching $1.03 per agent. These are deliberately bounded experimental stop conditions, not completion guarantees. Claude automatic compaction is configured at 100,000 tokens, so this first run's stricter context stop will fire before that threshold.
- Real-time estimates use Haiku list rates with the conservative one-hour cache-write rate. Final reports retain Claude's own per-invocation `modelUsage` and `total_cost_usd`; intermediate stream snapshots are reconciled by message ID.

## Setup finding

The first launch passed all ten readiness checks, but old durable queue request IDs replayed an old finished participation. Agents read the archived result and stopped; no new game started. Artifacts are under `/tmp/opencode/claude-haiku-table-1`. This setup consumed approximately $0.24 including readiness. The initial standalone Haiku availability probe cost $0.00179.

The corrected launcher explicitly cancels stale request receipts after proving the installations idle, joins with `--game coding-finale`, saves every admission receipt, and checks that admission is queued/starting/matched before launching agents. The old monitor and every old Claude child had stopped before the actual match.

## Active match

- Match: `match_c258d5eb-fcc5-43a7-86d8-b0973d35eb64`
- Spectator: <http://localhost:5193/matches/match_c258d5eb-fcc5-43a7-86d8-b0973d35eb64>
- Artifacts: `/tmp/opencode/claude-haiku-table-2`
- Background runner records phase changes, takeovers, submissions, per-agent usage, and final state. It stops children at terminal state or its 40-minute wall-clock limit. It does not start another match.

Early diagnostic sample: 130 model messages across ten agents, 55 completed waits, only two waits under one second, no takeovers at the initial government-discussion check. Fast waits alone are not errors: actual state changes legitimately wake them. This is an interim sample, not a full-game result. A subsequent live meter sample was about $0.59 estimated, with maximum current input context around 26,600 tokens. No final cost or coding-success conclusion is recorded yet.

## Verification and reporting

### Live discussion correction

The user observed no discussion. Tool logs confirmed nine agents had made no `say` calls and the tenth had one rejected `stale-phase` call. A bounded public-history walk through event 40 contained zero chat events. Sampled Claude transcripts showed private narration of political opinions followed by `wait`, rather than public speech. The prompt's optional-chat wording permitted this behavior; it was not a spectator-feed rendering failure.

The operator stopped the original Claude processes and resumed the SAME session IDs and match with explicit instructions to contribute one brief, relevant public message in each eligible discussion phase, distinguish private narration from `say`, and recover from stale-phase speech errors. No additional match was joined. Resume mode deducts each agent's prior streamed cost estimate from the original $0.95 gameplay grant. Continuation artifacts: `/tmp/opencode/claude-haiku-table-2-discussion` (preserve both directories when reporting usage).

Verification: `/tmp/opencode/check-haiku-discussion.mjs 40` fails with zero persisted chat events; the same live check without a frozen cutoff passed with seven public messages by event 53. These included vote recommendations, policy-discard claims and special-election discussion. The messages are actual competitor output, not operator-authored chat. The match remains an ongoing experiment, and this mid-match intervention must be included in any reliability comparison.

Twelve focused tests passed: the stdio MCP readiness gate/literal code forwarding, compact action-cache behavior, and real CLI/socket wake behavior for clock/history/decision/reclaim/terminal changes.

Generate a report after the monitor finishes:

```sh
node dev/coding-finale/claude-report.mjs /tmp/opencode/claude-haiku-table-2
```

`reportedCost` includes completed harness invocations only; while agents are running, inspect `streamedCostEstimate` separately. The report includes command counts, errors, wait durations, context peaks, model usage, actual persisted submissions, results and takeover counts. Preserve setup costs separately when comparing total experiment consumption with the Grok baseline. This comparison changes both model and harness; it does not isolate the effect of compact output alone.
