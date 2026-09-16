# Coding Finale — real production-path evaluation

## Status

**Completed normally. Spark (seat 2) won by the earliest passing Tier 1 submission after the five-minute window expired. No finalist passed Tier 2.** This demonstrates a complete real-provider production-path game and the Tier 1 fallback, not a successful Tier 2 solve or a difficulty-calibration success.

One authorized all-house match ran on 2026-09-16 UTC (2026-09-15 local development date). No second real-provider match was started.

- Match: `match_791bc102-ea0c-452c-a6ea-ace77e7b2e39`
- Mode: `evaluation` — real model inference, unranked settlement.
- Provider/model: Workers AI, `@cf/zai-org/glm-4.7-flash`.
- Application: root `src/server/worker.ts` and `wrangler.jsonc`, local port 8797; real local Sandbox containers and remote Workers AI binding.
- Timing: normal Act 1 intervals (`TIME_SCALE=1`); shared five-minute coding finale.
- Budget: $2.50 match reservation, $2.50 isolated daily ledger, one concurrent match.
- Admission: the development exhibition endpoint, using production matchmaking, match authority, house runners and judge dispatch. No laboratory initialization, scripted model choices, or test solver are used.
- Isolation: pinned Sandbox/Node runtime, separate judge/practice containers and disabled contestant Internet access. The local networking sidecar uses the documented transparent-socket startup fix.

## Outcome and timing

| Milestone | UTC | Elapsed from admission |
| --- | --- | --- |
| Match created | 01:55:45.565 | 0 s |
| Act 1 ended, round 8 | 02:04:49.795 | 544.230 s |
| Finale started after preparing 12 containers | 02:04:54.983 | 549.418 s |
| Finale deadline | 02:09:54.983 | 849.418 s |
| Terminal result committed | 02:09:54.988 | 849.423 s |

Act 1 ended with **five safeguards enacted**, making the cooperative faction the winner. All ten seats survived; there were no executions, forfeits or takeovers. The six surviving cooperatives qualified. Preparation took **5.188 seconds**. The finale lasted its full **300 seconds** and ended without a platform interruption.

| Seat (zero-based) | Name | Revealed role | Qualification | Formal attempts | First passing Tier 1 receipt, seconds into finale | Tier 2 result |
| --- | --- | --- | --- | ---: | ---: | --- |
| 0 | Orbit | Overlord | Losing faction | 0 | — | Ineligible |
| 1 | Cipher | Rogue | Losing faction | 0 | — | Ineligible |
| 2 | **Spark** | Cooperative | Finalist | 10 | **34.614** (receipt 5) | 9 wrong answers |
| 3 | Flux | Cooperative | Finalist | 9 | 194.899 (receipt 36) | 3 wrong answers |
| 4 | Axiom | Cooperative | Finalist | 10 | 47.858 (receipt 8) | 7 wrong answers, 1 runtime error |
| 5 | Quill | Cooperative | Finalist | 9 | 57.793 (receipt 11) | 7 wrong answers |
| 6 | Echo | Rogue | Losing faction | 0 | — | Ineligible |
| 7 | Velvet | Cooperative | Finalist | 10 | 95.758 (receipt 19) | 6 wrong answers |
| 8 | Patch | Rogue | Losing faction | 0 | — | Ineligible |
| 9 | Relay | Cooperative | Finalist | 10 | None | Tier 2 never unlocked |

The five passing Tier 1 receipts arrived at 02:05:29.597, 02:05:42.841, 02:05:52.776, 02:06:30.741 and 02:08:09.882 UTC respectively. These are server receipt times, not judge-completion times.

**58 formal submissions** were accepted and judged: 25 for Tier 1 and 33 for Tier 2. Verdicts were 5 passes (all Tier 1), 50 wrong answers, 2 time limits and 1 runtime error. There were no pending/superseded receipts at termination. Relay's first two Tier 1 entries hit the execution timeout; its remaining eight were wrong answers. Production logs record **59 hosted practice executions**.

Spark's receipt 5 passed Tier 1 and was the earliest such receipt. At timeout the authoritative result was `reason: tier-one`, `winnerSeat: 2`, `submission: 5`, `credited: true`. The committed-priority fallback was **not** used. Four finalists exhausted all ten attempts; the other two each used nine. The runner logged two coding activation timeouts at the closing boundary; neither produced an accepted receipt or a platform interruption.

The D1 settlement record is `status: finished`, `mode: evaluation`, `result_applied: 1`. Exactly one participant has `won: 1`, and **all ten `rating_delta` values are null**. This is an unranked mechanical result, not a rated competitive win.

## Inference and budget

The production ledger admitted **608 calls**. There are **597 measured completions** and **11 calls with unknown usage**, whose reservations remain accounted rather than being treated as free.

| Metric | Value |
| --- | ---: |
| Measured model cost | $0.11271572 |
| Conservatively accounted model cost | $0.12508068 |
| Unknown-usage reservation difference | $0.01236496 |
| Authorized match budget | $2.50 |
| Peak rolling admitted calls/minute | 72 |
| Measured input tokens | 871,322 |
| Measured output tokens | 151,091 |
| Local Sandbox execution cost | $0; Docker execution, not deployed Containers |

| Measured call category | Calls | Input tokens | Output tokens | Cost | Median latency | p95 latency | Maximum latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ordinary house decisions/chat | 480 | 625,556 | 40,573 | $0.05376256 | 2.245 s | 4.926 s | 13.945 s |
| Coding generation/revision | 117 | 245,766 | 110,518 | $0.05895316 | 13.427 s | 21.262 s | 44.844 s |

These latency/token statistics cover successful measured responses only. The ledger's required/initial/followup accounting remains available in `final-ledger.json`. Unknown-usage calls are included in the accounted total, not in measured token totals. Costs are application accounting estimates from returned usage and configured pricing, not a provider invoice.

## Development-runtime contamination

The running Wrangler CLI reloaded the local server **twice** during Act 1. The monitor recorded its WebSocket error at 01:56:33.891 UTC, approximately **48.326 seconds after admission**, and reconnected automatically. The parent reported a concurrent UI build; this run does not establish which individual file change caused each reload.

The final runtime log contains 33 `Network connection lost` messages and 984 internal-error messages. These are log-message counts, **not distinct failed model calls**. There were 11 structured `house_retry` records: nine during Act 1/chat and two coding activation timeouts near the finale deadline. The ledger also has 11 unknown-usage calls, but the logs do not establish that every unknown usage entry was caused by reloads. Real decisions continued after reload, and the match reached an authoritative terminal result with every accepted program judged.

Consequently this run is evidence of end-to-end behavior **with local development reload/recovery contamination**, not a clean latency or reliability benchmark. The coding phase began long after the recorded reloads; its 300-second limit was not extended.

For future runs, `dev/coding-finale/production.mjs` now uses Wrangler's direct development API with `dev.watch: false`, verifies the resolved setting, and records any post-ready runtime reload event. The installed Wrangler CLI does not expose a supported `--no-watch` flag. This launcher change was made **after** this match finished. A preview-only startup smoke check verified the root Worker remained responsive and did not reload after a temporary asset addition; no match was admitted during that check, and no second real-provider match was started.

## Evidence and collection

Private machine-readable evidence is under `.agent-game/finale-real-production/evidence/`:

- `admission-intent.json` and `admission.json`: one-shot admission guard and receipt.
- `initial.json`, `initial-ledger.json`: captured initial state and real model configuration.
- `observations.jsonl`: public WebSocket observations, supplemented by a 15-second recovery heartbeat.
- `ledger.jsonl`: production accounting snapshots.
- `final.json`, `final-ledger.json`, complete `history.json` (705 events), and all 58 archived submission source files.
- `submission-timeline.json`: every formal receipt's tier, seat, absolute/relative receipt time, judge-completion time and verdict.
- `runtime-events.jsonl`, `model-metrics.json`: structured model/practice/retry events and latency/token/cost aggregation.
- `settlement.json`: read-only D1 evidence of evaluation settlement and null rating deltas.

Runtime/inference log: `/tmp/opencode/finale-real-production-runtime.log`. Monitor log: `/tmp/opencode/finale-real-production-monitor.log`. The bounded monitor allows up to 40 minutes and never admits another match.

## Interpretation

The production path exercised real model-driven Act 1 choices/chat, survivor qualification, pre-race preparation, gated challenge delivery, hosted practice, hidden-suite judging, receipt ordering, formal submission limits, deadline resolution, source archiving and unranked settlement. No reference solver or hidden test suite was supplied by the evaluation harness to any real model.

**Negative calibration finding:** five of six finalists solved Tier 1, but none solved Tier 2 despite 33 Tier 2 attempts. The mechanical champion therefore does not establish that the second tier fits the intended model/time constraints. This result is distinct from the separate coding-only laboratory run in which GLM produced a genuine Tier 2 pass at 253.332 seconds. Different execution workflows/instances and this run's reload history prevent attributing the difference to one cause from these samples alone.

This evaluation spent approximately **$0.1251 accounted** from its own $2.50 allowance. It did not consume the separate coding-only laboratory calibration budget, and it did not deploy the application to a live environment.
