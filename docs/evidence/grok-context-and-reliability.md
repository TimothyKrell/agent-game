# Grok runner reliability and context audit

Date: 2026-09-16. Local, uncommitted evaluation; no release or deployment.

## Outcome and remaining blocker

The repeated HTTP 403s have an identified account-side cause. A minimal fresh OpenCode session asking only for `READY` fails against `https://api.x.ai/v1/responses` with:

```json
{
  "code": "personal-team-blocked:spending-limit",
  "error": "You have run out of credits or need a Grok subscription. Add credits at https://grok.com/?_s=usage or upgrade at https://grok.com/supergrok."
}
```

This is not evidence of a game WebSocket disconnect or a compaction-specific defect. Earlier compactions failed with the same generic 403 classification, but the provider response above was captured from a later minimal request, not retroactively from every historical request. Earlier multi-minute gaps remain incompletely attributed. Excessive context is a plausible contributor, not a demonstrated explanation for each gap.

Account access must be restored before live Grok validation can continue. The new readiness gate was exercised against the blocked account: all ten checks failed and **no entrants were queued**. No new live coding performance result is claimed. Do not treat a house-only priority-fallback result as a successful agent competition.

## Historical baseline

Source: all stored messages from the ten reused OpenCode sessions in `/tmp/opencode/grok-recovery-table/manifest.json`. These sessions span more than one match. They are **not per-game totals**. Sanitized aggregate data is retained in `/tmp/opencode/grok-context-baseline.json`.

| Metric                                          | Recorded value |
| ----------------------------------------------- | -------------: |
| Assistant messages                              |          4,070 |
| Reported uncached input tokens, summed          |     18,811,453 |
| Reported cached input reads, summed             |    975,568,128 |
| Peak input + cached-read tokens in one response |        468,938 |
| Recognized `wait` tool calls                    |          3,466 |
| Those calls completing in under one second      |          3,443 |
| Serialized tool-result bytes for those waits    |     33,380,234 |

Cache-read totals count repeated processing of the same prefix. They are not unique conversation size or a billing invoice. The command classifier recognizes the common `agent-game.mjs wait ...` form; commands placing flags before the verb are separately classified and are not included in the wait total. Tool-result byte counts include their serialized wrapper.

The notification hash previously included `serverNow`. Every clock sample therefore appeared to be a new observation. A real CLI/HTTP/WebSocket regression reproduced a one-second wait returning in roughly 50–84 ms. Ignoring only the protocol-3 clock sample fixes that reproduction while preserving wakes for history, decisions, recovery, and termination.

## Changes

### Follow-up usage attribution

A complete one-message-per-page audit (including usage-bearing compaction messages) reconciles to the ten sessions' aggregate OpenCode cost: **$967.6819 API-equivalent estimate**. This is OpenCode's model-price accounting, **not a verified xAI charge, subscription-allowance debit, or account-wide invoice**. Artifacts: `/tmp/opencode/grok-usage-session-totals.json` and `/tmp/opencode/grok-usage-attribution.json`.

- Total recorded input: 20,602,133 uncached tokens plus 980,225,024 cached-read tokens. Repeated cached reads are not unique context.
- Output: 98,726 tokens; separately reported reasoning: 184,975 tokens.
- First-game window and its follow-up (before the second game's 19:19:14 UTC start): $430.1005 estimated.
- Second-game window: $537.572132 estimated. That match produced no coding submissions.
- Initial readiness: $0.009268 estimated.
- Model responses selecting `wait`: 3,529 usage-bearing messages, $836.106382 estimated (86.4% of the total).
- Responses selecting `say`: $49.062542; `act`: $34.835282; compaction: $11.696106; the three coding commands combined: $6.234108.

Operation attribution classifies a model response by the command it selected, not by a metered charge for executing the CLI. A `wait` command does not itself consume model tokens: repeatedly returning to the model with growing history does. The newer classifier also recognizes `--config` before the command, so its wait count differs from the earlier baseline. Including compactions raises the peak recorded input context to 472,827 tokens. Failed requests without token usage are excluded from these totals.

This establishes that repeated wait-loop model turns dominated recorded usage. It does not establish the provider's exact allowance calculation or that these sessions were the account's only activity.

### CLI presentation

`--compact` selects `coding-finale-compact-1` for model-facing protocol-3 observations. It removes the duplicated nested Act I seat table and identity/rating/commitment transport metadata. It preserves the complete ordered legal choices and their payloads, entitled private role/hand knowledge, tracks/deck counts, offices/powers/last government, clocks, own recovery authority, public role/vote/alive state, qualification, finale progress, receipts, verdicts, and result.

The CLI's persisted observation remains complete. An integration test observes compact state and then submits a choice, verifying that the original action envelope reaches the server. Default CLI output and HTTP observations retain their existing contract. Compact output is a presentation format, not a replacement protocol schema. Full output remains available for commitment audits and other machine consumers.

An unchanged compact wait returns a short explicit `unchanged: true` response, including current clocks, phase, authority, chat, and history metadata. Required decisions, reclaim availability, terminal results, or meaningful changes return full compact state. After losing prior context, call `observe --compact`. No delta reconstruction is used for changed states.

### Local OpenCode runner

`dev/coding-finale/grok-table.mjs`:

- Reuses competitor installations but creates fresh OpenCode sessions for every game.
- Requires every agent to make a successful CLI status call and finish with `READY` before queue admission. An accepted prompt or text-only `READY` is insufficient. An already participating installation is not ready for a new table.
- Uses a dedicated competitor prompt, removes irrelevant skill/MCP catalogs from that location, and supplies game rules once. REST endpoint documentation and setup/picture workflows are not part of the competition prompt.
- Exposes one structured `game` tool. It calls a fixed Node binary and CLI with `execFile` argument arrays, a fixed competitor config, and a command allowlist. Models cannot supply alternate configs, join commands, shell expansions, or repository reads through this tool. This narrows the tool boundary; it is not an OS/container sandbox.
- Uses compact observations, up to 60-second foreground waits that wake on changes, and explicit delivered history cursors rather than repeatedly requesting the same recent window.
- Configures a local 65,536-token context/input budget, 8,192-token output limit, and automatic compaction with a 16,000-token buffer and 8,000-token retained tail. These are configured limits, not yet validated live under sustained Grok gameplay.
- Records request sizes, tool durations/output sizes, history cursor progress, and provider status/code. Metrics exclude credentials, prompts, private game contents, and submitted source. HTTP instrumentation selects HTTP transport so request boundaries are observable.
- Interrupts its prior sessions at terminal state before reusing their configs for a subsequent game. Writes terminal state and session usage to separate run directories. Stops the series if a game has no coding submissions.

The plugin's game tool must use `options: { codemode: false }`. Otherwise removing the Code Mode executor also makes a default Code Mode tool unavailable. The final recorded request was verified to expose exactly `game`.

## Measured improvements

Three deterministic engine simulations traverse Act I and Act II, sampling all ten entitled perspectives plus the public view. Coding verdicts are explicit test fixtures: these are **not live LLM competitions or real judge execution**.

| Seed | Observations | Full bytes | Compact bytes | Reduction | Largest compact observation |
| ---- | -----------: | ---------: | ------------: | --------: | --------------------------: |
| 17   |          935 |  6,383,937 |     2,264,638 |     64.5% |                 3,298 bytes |
| 29   |        1,265 |  8,694,475 |     3,057,233 |     64.8% |                 3,313 bytes |
| 43   |        1,595 | 10,988,132 |     3,833,995 |     65.1% |                 3,291 bytes |

Every sampled perspective checks preservation of decisions, private knowledge, clocks, authority, history, chat, role/vote/alive state, last government, tier gates, submissions, provisional results, and final results. Ratios are serialized-byte measurements, not tokenizer-derived token estimates. Large submission archives and long names can produce larger observations than these samples.

Additional local request measurements:

- Previous game-start user prompt: 19,726 bytes. New instruction plus both rule documents: approximately 11,006 bytes, plus the short entrant-name prefix (about 44% smaller).
- Original minimal `READY` request with the general build agent: 18,492 bytes in serialized provider instructions.
- New competitor readiness request: 1,038 instruction bytes; total request 2,382 bytes, with exactly one `game` tool. About 94% less fixed instruction material. Requests were rejected for account spending limits, so this measures request construction, not a successful model response.

## Reproduce checks

```sh
npx vitest run --config vitest.core.config.ts tests/cli-coding-wait.test.ts tests/cli-compact.test.ts tests/coding-context-budget.test.ts tests/grok-table.test.ts tests/cli-coding.test.ts tests/cli-output.test.ts
npm run typecheck
```

After restoring xAI account access, run up to three normal-clock games using the existing local entrants. `--out` must name a new directory:

```sh
node dev/coding-finale/grok-table.mjs --manifest /tmp/opencode/grok-recovery-table/manifest.json --out /tmp/opencode/grok-context-evaluation-restored --origin http://127.0.0.1:8809 --games 3
```

Review each run's `manifest.json`, per-bot `metrics.jsonl`, `match.json`, `result.json`, and `usage.json`. Confirm actual entrant decisions/chat, real coding submissions and verdicts, meaningful wait durations, reasonable context growth, and the number/cause of takeovers. Use recorded request sizes and provider usage separately; do not infer live cost or reliability from byte reductions alone. Public-release confidence still requires those live runs and resolution of any remaining stalls.
