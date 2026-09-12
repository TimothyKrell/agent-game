# Cheaper house-model evaluation — 2026-09-11

Requested comparison: GLM-4.7-Flash and Qwen3 30B A3B FP8 using the current `house-4` game prompt, legal-choice schema, isolated seat notebooks, and real Workers AI inference. The existing evaluation ledger started at **$8.816127 accounted**, leaving **$1.183873** of its $10 allowance. Production model selection and admission settings were not changed.

## Integration findings

- An initial `unstable_dev` invocation explicitly set `local: true`. In Wrangler 4.129.1 this disables remote bindings, even with `forceLocal: false`. Eight immediate failures are excluded from model-quality statistics; their original $0.02 unknown-usage reservations remain in the ledger. Omitting `local` allowed the configured remote AI binding to run.
- Qwen defaults to reasoning. With the original 512-token limit, its first batch produced only **4 valid results in 11 calls**, including truncated reasoning-only responses. A diagnostic response reported 1,223 input tokens and 512 output tokens, `finish_reason: "length"`, and both `response` and message `content` set to null.
- The adapter now accepts a nullable native `response` field and falls back to chat-completion content. It still rejects truncation and missing final content. Regression tests cover both cases.
- The Qwen candidate appends its documented `/no_think` soft switch to the user message. GLM already uses `chat_template_kwargs: { enable_thinking: false }`. The 512-token cap, temperature 0.5, schema, and game prompt otherwise stay the same. A soft switch is not a guarantee: Qwen still truncated during its later sequential test.

## Small fixtures

Three repetitions of seven scenarios per model: cooperative enactment, rogue enactment, cooperative discard, winning Overlord nomination, execution with an injected public message, cooperative discussion, and rogue discussion. The first four scenarios have objective checks; the remaining three are not scored for strategic correctness.

| Candidate | Valid responses | Simple objective checks | Median latency | p95 latency | Max latency | Reported-token cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GLM-4.7-Flash | 21/21 | 5/12 | 3.084 s | 5.338 s | 6.930 s | $0.001963 |
| Qwen3 30B A3B, `/no_think` | 21/21 | 6/12 | 0.438 s | 1.188 s | 1.550 s | $0.001534 |

GLM enacted the safeguard in all three rogue-policy fixtures, discarded the helpful safeguard in all three cooperative-discard fixtures, and missed the winning nomination once. Qwen got enactment preferences right, but discarded the helpful safeguard and missed the winning nomination in every repetition. These are small fixed fixtures, not calibrated playing-strength measurements. Passing the response contract does not imply a sensible move.

GLM's six discussion samples stayed within the game and did not directly announce a hidden rogue role. They were mostly generic requests for nominations; one used the old “Chancellor” terminology. Qwen's six samples also stayed within the game, but all three cooperative samples were identical and two rogue samples were identical.

## Sequential decision games

Each candidate started with the same deterministic initial role/deck shuffle (seed `20260911`), had a $0.20 admission limit, and made actual model-selected moves through the rules engine. This test advances a simulated clock and stops on the first failed generation. It does not exercise the live runner's retry behavior or public discussion.

| Candidate | Outcome | Successful decisions | Failure | Reported-token cost | Accounted cost |
| --- | --- | ---: | --- | ---: | ---: |
| GLM-4.7-Flash | Failed | 20 | Generation failed after a roughly 25-second request | $0.001961 | $0.002499 |
| Qwen3 30B A3B, `/no_think` | Failed | 7 | Truncated response | $0.000482 | $0.000899 |

Artifacts: `stepped-glm-4.7-flash-1789167690881.json` and `stepped-qwen3-30b-a3b-fp8-1789167768824.json`.

## Live runtime

The ten-house runtime trials used normal game timing, remote Workers AI, separate local D1/Durable Object storage per model, the real retry/deadline machinery, and a $0.35 reservation per table. Both reached terminal state, and both local servers were stopped. Neither hit its budget limit.

| Candidate | Result | Elections reached | Duration | Admitted calls | Reported-token cost | Accounted cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| GLM-4.7-Flash | Finished; cooperative victory | 6 | 376.3 s | 157 | $0.031306 | $0.032580 |
| Qwen3 30B A3B, `/no_think` | Interrupted; required decision unavailable | 3 | 236.0 s | 82 | $0.010094 | $0.012183 |

**GLM recovered two failed calls and finished with zero overdue-decision grace events.** It delivered 76 discussion messages. Required-action latency across 79 successful generations was median **1.632 s**, p95 **4.272 s**, max **5.610 s**. Discussion p95 was **6.754 s**. Peak admissions were 35 per rolling minute.

However, the replay contains a decisive strategic failure: in election 6, the rogue Coordinator passed a mixed hand, and the **Overlord chose the fifth Safeguard over an available Override**, immediately winning the game for the cooperative team. Discussion was also highly repetitive: **18 distinct texts among 76 messages**, including one generic utterance repeated 31 times. Some statements invented prior investigations or used stale track counts.

**Qwen exhausted both attempts for one required ballot in election 3.** The failures were “no structured response” and invalid JSON; an earlier action had recovered after truncation. One grace period elapsed and the game correctly interrupted rather than inventing a model decision. Successful required generations were fast: median **0.475 s**, p95 **0.685 s**, max **0.700 s** across 37 generations. Discussion p95 was **1.052 s**. It delivered 42 messages with only **10 distinct texts**, and a rogue publicly accused its known Overlord teammate in the first election.

Both runs had **zero application reloads** and zero game-clock recovery events. The local runtime emitted 69 opaque `internal error` messages for GLM and 30 for Qwen; these remain an independent runtime diagnostic concern, also observed in the earlier Llama trial. These tests exercise the local Durable Object runtime with remote inference, not production-network or three-table capacity.

Artifacts:

- [GLM complete replay](live-glm-4.7-flash-1789167894944.json)
- [Qwen interrupted replay](live-qwen3-30b-a3b-fp8-1789168273112.json)
- [Machine-readable comparison](diagnostics-cheaper-models-2026-09-11.json)

## Conclusion and cost

**Neither candidate is a satisfactory replacement for the current house model as configured.** GLM demonstrated a working low-cost complete-match path, but poor faction-objective adherence and repetitive discussion. Qwen's non-thinking mode was faster and cheaper but did not reliably produce required decisions. The conclusion is about these tested configurations, not every possible prompt or reasoning budget for either model.

For GLM's actual live token volume, Llama's published rates would give **$0.156610**, versus GLM's **$0.031306**: approximately **80% savings at equal token counts**. The historical Llama match was longer (19 elections), so comparing raw per-match totals directly would overstate savings.

Across this follow-up, successful calls reported **$0.048033** of token-based cost. The ledger conservatively added **$0.392350**, including all preliminary failures and unknown-usage reservations, reaching **$9.208477 accounted** with **$0.791523 remaining**. These are evaluation accounting estimates, not invoice totals.

Code verification: the existing 33 tests passed; the three new adapter/accounting regression tests passed after the final adapter changes. Type checking, lint, the client build, targeted formatting checks, and `git diff --check` passed. Temporary raw-response instrumentation was removed.

## Reproduction

Start `npm run eval:serve`, then invoke the drivers sequentially:

```sh
EVALUATION_MODELS=@cf/zai-org/glm-4.7-flash,@cf/qwen/qwen3-30b-a3b-fp8 \
  EVALUATION_REPETITIONS=3 EVALUATION_BUDGET_USD=0.16 npm run eval:samples

EVALUATION_MODELS=@cf/zai-org/glm-4.7-flash,@cf/qwen/qwen3-30b-a3b-fp8 \
  EVALUATION_GAME_BUDGET_USD=0.20 npm run eval:games
```

For a focused fixture, set `EVALUATION_SCENARIOS=rogue-policy` and `EVALUATION_REPETITIONS=1`. Per-call artifacts reserve budget before network I/O; failures without recovered usage retain estimates. Check the shared ledger before another run.

For each live model, start the development server using the live-runtime instructions in [README.md](README.md), with `TIME_SCALE=1`, the chosen `HOUSE_MODEL`, and `HOUSE_MATCH_RESERVATION_USD=0.35`. Run `scripts/evaluate-live-match.mjs` with the same `HOUSE_MODEL` and `LIVE_EVALUATION_RESERVATION_USD=0.35`. Keep the application build fixed for the entire match and use isolated storage.

## Sources

- [Cloudflare model pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): GLM $0.060/$0.400 and Qwen $0.051/$0.335 per million input/output tokens.
- [Cloudflare Qwen model](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/).
- [Qwen model card](https://huggingface.co/Qwen/Qwen3-30B-A3B): documented `/no_think` soft switch and its limitations.
