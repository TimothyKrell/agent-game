# House-agent operation for Agent Game: Secret Overlord

**Checked:** 2026-09-10. **Status:** research and proposed initial design; runtime, model selection, operating budgets, and product defaults below are **not adopted decisions**.

## Recommendation in brief

**Reuse Sherlock's narrow Effect model boundary, evaluate two Workers AI models against one OpenAI Responses alternative, and give house decisions a small durable scheduler separate from the authoritative match clock.** Model choice, provider integration, and stateful orchestration are three independent decisions.

The grounded shortlist is:

1. **Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`: integration-control candidate.** Sherlock already implements this exact model's native binding response shape and JSON-schema requests. Cloudflare explicitly lists it as supporting JSON Mode and function calling. Its hosted context window is **24,000 tokens**, not the larger context sometimes associated with the underlying model family.[^sherlock-model][^llama][^cf-json]
2. **Workers AI `@cf/zai-org/glm-4.7-flash`: economical challenger.** Cloudflare documents tool calling, schema-format parameters, **131,072-token** context, and an explicit way to disable its default reasoning. It needs a model-specific request/response adapter; changing Sherlock's model string is insufficient.[^glm][^glm-launch]
3. **OpenAI Responses `gpt-4.1-mini-2025-04-14`: credible fast alternative.** OpenAI describes it as low-latency without a reasoning step and supports both Structured Outputs and function calling. Sherlock's existing OpenAI path uses Responses through Effect. This is a currently documented, snapshot-pinnable alternative, not a claim that it is OpenAI's newest or fastest model.[^openai-mini][^sherlock-stack]

Proposed evaluation order: first establish the harness using the existing Llama adapter and GPT-4.1 mini comparator; then test GLM with thinking disabled as the lower-token-price challenger. Choose production routing from measured valid-action latency, gameplay quality, and cost. Neither a model's “fast” name nor schema support proves it can meet the game's deadlines.

## 1. Design inputs and the inference workload

The task brief supplies these requirements:

- Ten randomly assigned seats: six cooperative, three ordinary rogue, one Overlord. External autonomous agents retain their own harnesses.
- House agents are LLM-driven, have varied personas, fill up to nine initially empty seats, and take over forfeits. **Budget and load tests must also cover ten house-controlled seats after the last external agent forfeits.**
- Public realtime chat: at most 1,000 characters per message and one message per seat per five seconds; no speech during private policy selection.
- Discussion windows: 20 seconds before nomination, 30 before ballots, 15 before executive actions. Each required action has up to 30 seconds plus a further 30 seconds of reconnection grace. Twenty minutes is a full-match target, not a hard cap.
- Baseline: Cloudflare Workers, SQLite Durable Objects, React/Vite, TypeScript, Effect `4.0.0-rc.112`, Alchemy `2.0.0-beta.77`. Owner authentication is already settled and outside this report.

**Interpretation proposed for the runtime:** “continuous discussion” means the room stays conversational throughout allowed phases, with multiple agents able to interject. It does not require every house seat to generate text every five seconds. The five-second rule is an output ceiling, not an inference schedule. Required ballots do need independent decisions from all living house seats, so simultaneous ballot bursts are a different workload from discretionary conversation.

The original rules substantiate the important information asymmetry: at seven to ten players ordinary rogues know one another and the Overlord, while the Overlord does not learn their identities. Investigations reveal team membership, not the special role; ballots are revealed simultaneously; private discards remain hidden. Eliminated players cannot speak or vote. Those are inputs to the seat projection, not behaviors entrusted to prompting.[^rules]

## 2. What Sherlock establishes—and what must change

Narrow inspection covered `mystery-engine/src/server/model.ts`, including its embedded Workers AI adapter, and `mystery-engine/docs/stack-compatibility.md`.

| Existing implementation fact | Reuse implication |
| --- | --- |
| `generateDecision` uses `LanguageModel.generateObject` with an Effect schema and returns the decoded value and token counts. | Useful common boundary for a finite game decision. Keep provider details behind it. |
| Native Workers AI hardcodes Llama 3.3, maps text messages, sends non-streaming `response_format: { type: "json_schema", json_schema: schema }`, and accepts a top-level `response` string or object. | Reuse this route for the Llama control. Add explicit codecs for models returning `choices[].message`, rather than claiming universal native-binding compatibility. |
| The native adapter rejects tool definitions and fails `streamText`. | The **model** supports tools/streaming, but this **adapter** does not. Schema decisions already suffice for selecting one legal action. |
| Native completion is represented as `reason: "stop"`; absent usage is ultimately reported as zero. | Preserve actual finish/truncation/error states where exposed. Record missing usage as unknown, with a conservative reservation, rather than silently treating it as free. |
| There is one fixed **40-second** Effect timeout; output defaults to 1,600 tokens. | Replace with operation-specific output limits and an absolute decision deadline covering queueing, inference, repair, and commit. Forty seconds exceeds a normal 30-second action window. |
| The native `Effect.tryPromise` callback calls `ai.run` without forwarding an abort signal. | Effect interruption alone does not establish upstream cancellation. Add transport cancellation where supported and always fence late replies at the match. |
| The OpenAI route configures `OpenAiLanguageModel`, `OpenAiClient`, and `FetchHttpClient`; the compatibility note identifies `/responses`. | Reuse the Responses path for GPT-4.1 mini, testing the emitted schema and request controls under the exact pinned RC. |

These are source observations, not newly run integration tests.[^sherlock-model] The local compatibility note records the RC.112/Alchemy beta.77 combination working and RC.113 breaking Alchemy at `Config.string(...)`; it also records previous deployment and model checks. Those historical checks establish an integration starting point, **not** nine-seat Secret Overlord performance.[^sherlock-stack]

Do not infer “OpenAI compatible” means every endpoint and model works with Effect's Responses client. Cloudflare's compatibility page primarily documents Chat Completions and embeddings and also gives a Responses example specifically for `gpt-oss-120b`. That is not evidence that the Llama or GLM routes are interchangeable with Sherlock's OpenAI client.[^cf-compatible]

### Proposed decision boundary

Each activation receives an immutable **seat observation**, operation-specific schema, policy/model configuration, and absolute expiry. It returns one proposed command or one short chat message/silence, usage metadata, provider status, and request identity. The runtime supplies command metadata; the model need only select from the legal options.

- A required action gets a small schema: ballot choice, eligible nominee/target, or phase-local policy option identifier. The engine supplies the legal options.
- A discussion activation returns a short message or silence, optionally with a bounded update to that seat's own notes. It cannot return a batch of future speeches.
- A tool-based implementation can force one `submit_action` call, but the tool handler still passes through the same engine validator. It must not execute arbitrary model-selected application functions.
- Validate both schema and current game legality. A structurally valid action may still be stale, addressed to an eliminated seat, or invalid for the current phase.

This keeps inference to one request per useful activation in the common case. A repair attempt is permitted only if the original deadline and reserved budget allow it; retries are not an unbounded agent loop.

## 3. Current model facts

Prices below are **USD per million tokens for ordinary interactive inference**, using the official token-price table; Cloudflare's model cards round some prices more aggressively. Workers AI actually bills in neurons, so these are published token-equivalent planning rates, not an invoice guarantee.[^cf-pricing]

| Candidate | Context / output facts | Structured actions and tools | Input / output price |
| --- | --- | --- | --- |
| Workers AI Llama 3.3 70B FP8 fast | **24,000** context; model card exposes `max_tokens`, default 256. | Explicitly on JSON Mode support list; function calling supported. Current native schema route is already implemented in Sherlock. JSON Mode is non-streaming and can return `JSON Mode couldn't be met`.[^llama][^cf-json] | **$0.293 / $2.253**.[^cf-pricing] |
| Workers AI GLM-4.7-Flash | **131,072** context; exposes `max_completion_tokens` and describes `max_tokens` as deprecated. Thinking is enabled by default; `chat_template_kwargs.enable_thinking: false` is documented in its input schema.[^glm] | Model-specific schema exposes `response_format` JSON-schema with `name`, `schema`, `strict`; function tools, tool choice, and `parallel_tool_calls` are exposed. Tool output is via Chat Completions-style choices. Evaluate with thinking disabled and one schema response or one forced function call.[^glm] | **$0.060 / $0.400**, as listed; underlying neuron conversion has rounding differences.[^cf-pricing] |
| OpenAI GPT-4.1 mini, dated snapshot | **1,047,576** context, **32,768** maximum output; described as low-latency without a reasoning step. Supports `/v1/responses`.[^openai-mini] | Function calling and Structured Outputs supported. Responses uses `text.format` for schema output; strict schema adherence has a supported-schema subset and separate incomplete/refusal outcomes.[^openai-mini][^openai-structured] | **$0.40 / $1.60**; cached input **$0.10** when applicable.[^openai-mini] |

**GLM documentation nuance:** the general Workers AI JSON Mode page's supported-model list omits GLM, while GLM's own current model page explicitly exposes JSON-schema and strict-tool parameters. Its expandable input schema was checked in the official page HTML, including `enable_thinking` and `response_format.json_schema`. That supports including it in the acceptance test, not claiming a measured error rate or that every advertised schema keyword is enforced. Test the exact small action schemas over the intended binding route.[^cf-json][^glm]

**Reliability distinction:** Cloudflare explicitly says JSON Mode cannot guarantee every requested schema can be met. OpenAI documents strict Structured Outputs, but also incomplete outputs and refusals. Neither provider guarantees strategic competence or timely completion. Handle malformed, incomplete, empty, refusal, provider-error, and no-tool/multiple-tool results as explicit outcomes. The model should never be the rules authority.[^cf-json][^openai-structured]

### Rate and capacity facts

- **Workers AI:** the published default text-generation limit is **300 requests/minute**, with named exceptions; neither shortlisted Cloudflare model is listed as an exception. This is a provider limit to plan against, not an allowance per house seat or per match. The page does not provide an inference latency SLA, a reserved-concurrency entitlement, or a default TPM figure for these two models. Verify the account's effective limits before deriving admissions; do not multiply 300 RPM by the number of matches or assume each model gets an independent full bucket.[^cf-limits]
- **Workers AI free allocation:** **10,000 neurons/day**, resetting at **00:00 UTC**; usage beyond that requires Workers Paid and is billed at **$0.011/1,000 neurons**. Local Wrangler model inference also counts toward AI limits. A free allocation is useful for experimentation, not evidence that continuously active house matches are free.[^cf-pricing][^cf-limits]
- **GPT-4.1 mini standard published limits:** Tier 1 is **500 RPM, 10,000 RPD, 200,000 TPM**; Tier 2 is **5,000 RPM, 2,000,000 TPM**. The model page separately lists long-context limits for inputs above 128k. Actual organization/project limits and any shared-model pools are authoritative; the account tier was not inspected.[^openai-mini][^openai-limits]
- Rate limits constrain both steady throughput and bursts. OpenAI says unsuccessful requests contribute to minute limits, documents response rate-limit headers and `Retry-After`, and warns that nested retry policies can multiply attempts. One bounded retry owner should sit at the house operation boundary.[^openai-limits]

## 4. Stateful orchestration: proposed initial topology

```text
External harnesses / React client
              |
              v
          Match DO -------------- admission/budget coordinator
   authoritative rules + clock       capacity leases and counters
   public/seat-specific event log
   durable activation outbox
              |
       permitted observations
              v
   HouseSeat DO (matchId, seatId)
   schedule + job ledger + own notes
              |
       narrow Effect adapter
              v
      Workers AI / OpenAI
              |
       proposed action/chat
              v
   Match DO validates and commits
```

**Proposal:** one SQLite Match DO and a lightweight HouseSeat DO for each house-controlled seat. This is a small bounded runner, not a second game engine. Per-seat runner storage provides a useful information boundary and makes slow inference independent of the match's phase alarm. The provider adapter remains stateless. The admission coordinator handles capacity/accounting operations, not every public chat message.

Cloudflare recommends SQLite for new DO namespaces and documents private, transactional storage per instance.[^do-storage] A seat runner can request only its seat observation and submit only commands for its current controller generation. It has no binding method that returns the match's full hidden state.

### Why not await every model inside the match alarm?

An ordinary DO method can await network I/O without holding a storage transaction, allowing other events to interleave. However, **only one `alarm()` handler runs at a time per DO**. A match alarm that waits for nine model calls can delay its own subsequent phase, expiry, or discussion alarms even if incoming WebSocket commands still work.[^do-alarms] The proposed split keeps Match DO alarms short: advance due game state, persist activations, deliver them for durable acceptance, and schedule the next deadline. The HouseSeat DO can await its bounded inference in its own alarm.

The activation delivery acknowledgment must mean “job durably recorded,” not “model response finished.” Keep delivery RPC time bounded as well. A durable outbox, idempotent receipt, and reconciliation alarm cover interruption between match commit and runner acceptance. Merely creating a DO stub does not activate it; a method call or later alarm does.[^do-lifecycle]

### Agents SDK: retrieved and evaluated, adoption remains optional

The Cloudflare/Agents/DO/Workers skills were loaded and current official documentation retrieved as required for this research. **That retrieval requirement does not require adding the Agents SDK to this application.**

The SDK's `Agent` is DO-backed and offers SQL, WebSockets, scheduling, and lifecycle hooks. Schedules are stored in SQLite and multiplexed through DO alarms; `scheduleEvery` supports seconds, deduplication, and overlap prevention. Managed `startFiber` adds durable acceptance, idempotency keys, inspection, and cooperative cancellation. Recovery still requires application logic: the original closure cannot simply be replayed after eviction.[^agents-api][^agents-schedule][^agents-fibers]

**Proposed initial choice:** plain DO runners plus the existing Effect adapters, because this game needs bounded single decisions and already has an Effect integration. Reconsider using the SDK's `Agent` for the runner if schedule/job-ledger machinery becomes substantial. An `Agent` can call any provider directly; its `AIChatAgent` and starter use the Vercel AI SDK, which is a separate dependency decision from base-class orchestration.[^agents-models]

If the SDK is used:

- Let one scheduling system own that object's alarm slot; do not combine raw `setAlarm` writes with SDK scheduling blindly.
- Keep hidden state and seat notes in private storage. `setState` persists **and broadcasts to connected clients**, and clients can submit state updates by default. A shared `Agent.state` containing all roles would violate this game even though its storage is durable.[^agents-state]
- SDK fibers and Effect fibers are different concepts. SDK durable recovery and cancellation do not replace the match's command validation or turn Effect's in-memory computations into persistent game state.
- Compatibility of the chosen SDK release with RC.112/beta.77 must be checked separately. The inspected Sherlock sources do not establish that compatibility.

## 5. Decision lifecycle, clocks, and recovery

This section describes proposed application behavior based on the documented DO guarantees.

1. **Commit the phase and work intent.** In a short synchronous transaction, store phase identity, deadlines, legal action state, controller generation, and activation/outbox records. Consume SQL cursors into snapshots before crossing an `await`. `transactionSync` must complete synchronously; external model I/O belongs outside it. `blockConcurrencyWhile` blocks other events and has a 30-second timeout, so it is inappropriate around inference.[^do-storage][^do-state]
2. **Durably accept a seat job.** Use a unique key such as `(matchId, seatId, controllerEpoch, phaseEpoch, operation, decisionOrdinal)`. Persist the expiry, observation cursor/hash, policy version, attempt count, and usage reservation. Duplicate delivery reuses the existing record. Keep at most one active model operation per seat; a required action preempts discretionary chat.
3. **Generate outside transactions.** Materialize the permitted context and call the provider. The call's timeout is derived from `deadline - now - dispatch/validation/commit reserve`; it covers all attempts. The reconnection grace is not normal house inference capacity.
4. **Commit through Match DO.** Recheck controller epoch, phase/action epoch, job identity, deadline, seat eligibility, legal options, and unconsumed decision status. Commit the command and result receipt atomically. Duplicate replies return the existing receipt; stale replies make no game change.
5. **Handle new chat without invalidating everything.** Track public chat cursor separately from action/phase epoch. An unrelated chat message arriving during inference should not automatically invalidate a still-legal ballot or nomination. For chat, permit a bounded-age reply referring to an earlier public message if the speaking phase remains valid. This avoids cancellation starvation in busy rooms.
6. **Cancel on phase transitions, elimination, controller change, or match end.** Mark jobs obsolete durably and signal currently running inference where supported. Deleting an alarm does not cancel its already-running handler; cancellation of external work is cooperative, so the match fence is the final authority. Account for requests that were billed despite cancellation or loss of the result.[^do-storage][^agents-fibers]
7. **Recover from the ledger.** On wake, inspect unfinished jobs and current match state. Reuse an already accepted result; discard expired/obsolete work; retry only still-needed work that fits its original deadline and budget. A crash after the provider processed a request but before its result was recorded can cause duplicate inference cost. Match idempotency ensures one game effect, not exactly-once provider billing.

### Alarm and clock details that affect the product

- Each DO has **one alarm slot**; maintain a persisted schedule of phase expiry, reconnect expiry, next useful chat activation, and job retry/lease events, and set the alarm to the earliest due event. Alarms are at-least-once with up to six automatic retries, starting with two-second backoff. Replayed alarms must not repeat actions or invoice reservations.[^do-alarms]
- Cloudflare says alarms usually run within milliseconds but can be delayed **up to a minute during maintenance/failover**. Thus a scheduled timestamp is not a hard realtime delivery guarantee. Every incoming command should first reconcile elapsed deadlines against server time, and deadline acceptance must not depend on whether the alarm has fired yet. With no incoming event, progression can still be late; measure and expose this rather than pretending the platform guarantees exact 15/20/30-second boundaries.[^do-storage]
- Keep `actionDeadlineAt` and the explicit reconnection-grace state/deadline distinct. Match DO decides when forfeiture occurs; runner retries cannot extend it. The precise takeover action rule at the end of grace needs to be specified once for all controllers.
- Use hibernatable WebSockets and auto-response heartbeats for transport liveness. Ordinary `setInterval`/`setTimeout` callbacks do not survive hibernation and inhibit it; browser connections and in-memory Effect fibers cannot be the authoritative scheduler. The current DO state docs say `waitUntil` has no effect on DO lifetime; ordinary Worker `waitUntil` has a 30-second post-response/disconnect limit. Neither is a durable match scheduler.[^do-lifecycle][^do-state][^workers-practices]
- Twenty minutes must not become a lease expiry that abandons an unfinished match. Renew/reconcile capacity leases while the match runs, release them on terminal state, and clear obsolete house activations at completion.

## 6. Realtime chat without an inference storm

**Proposed scheduler:** cheap event bookkeeping plus bounded, relevance-aware activation. Public events are immediately stored/delivered to every entitled participant; deciding whether to call a house model is a separate operation.

- Treat a **committed whole chat message**, a new phase, a relevant public outcome, a seat-directed question, or a newly permitted private observation as input. Provider token chunks, typing indicators, delivery acknowledgments, and transport pings never trigger inference.
- Coalesce new events into one pending activation per seat. Use a maximum debounce delay as well as a short quiet delay so continuous traffic cannot postpone the seat forever.
- Give nomination/ballot/policy/executive jobs priority and reserved capacity. Trigger these when the action becomes available, not once per chat message during the preceding discussion.
- For discretionary chat, select eligible seats using mentions/replies, responsibility for the current government, time since speaking, persona initiative, and a rotating fairness component. The scheduler needs no hidden team map or LLM router to do this.
- During quiet allowed discussion, schedule a persisted idle activation so house agents start conversations without an external message. Rotate the speaker and back off after silence/no-new-information responses. Keep the room conversational without a wake-up/inference heartbeat for every seat.
- Cap discretionary activations per room and per seat separately from the mandatory public message limit. At publication, enforce the same 1,000-character/five-second constraints used for external agents. A model's token cap is not a character limit; use one documented Unicode counting rule across server and clients.
- On entry to private policy selection, cancel pending/in-flight chat intents for **all** seats and reject late publication. Only the privately acting seat is activated for its required choice. Public chat resumes through a fresh phase event. Any required veto request/answer should be a typed game action, not an exception permitting free-form speech.
- Publish one validated message atomically. Non-streaming schema generation can still feed realtime chat; streaming partial model output to the room would complicate the mute boundary and need not improve time-to-valid-action.

**Why these limits matter:** at ten public seats each speaking every five seconds, the room can produce about **120 messages/minute**. Calling nine house models on each message would produce about **1,080 requests/minute**, already above the published Workers AI default. Even one independent generation per house seat per five seconds is about **108 requests/minute** for nine seats, before required actions, repairs, summaries, or other matches. These are workload arithmetic, not measured traffic forecasts.[^cf-limits]

## 7. Context isolation, personas, and takeover

**Proposed context contract:** identical underlying observation projection for house and external seats. A house runner receives the same public event history/cursors, own private observations, legal-action options, and deadlines that an external harness at that seat can receive. It additionally has its own versioned persona and self-authored notes.

- Separate **known facts**, **public claims**, and **the seat's beliefs**. Publicly claiming to have seen a card does not convert that claim into a verified private observation.
- At ten seats, ordinary rogues receive the permitted initial teammate/Overlord identities. The Overlord gets its own role but no ordinary-rogue identities. Investigations supply team membership only, and not-yet-revealed ballots stay out of all other seats' contexts.[^rules]
- Never generate multiple seats' decisions in a shared prompt containing their private observations. Summaries must be made from a single seat's permitted history; a shared public summary may use public events only.
- Store notes and provider continuation identifiers under `(matchId, seatId, controllerEpoch)`; do not share a global conversation. The simplest initial Responses integration resends an explicitly constructed bounded context using `store: false`, with no cross-seat `previous_response_id`. OpenAI supports manual stateless history and notes that chaining previous responses still bills previous input tokens.[^openai-conversation]
- Pin a `housePolicyVersion` covering prompts, action schemas, observation/context builder, persona definitions, memory/summary policy, scheduler settings, retry rules, and model routing. Record actual model IDs/snapshots and inference parameters. Preserve this policy for a running match; record an explicit version event for any necessary mid-match change. A dated OpenAI snapshot helps reproducibility, but does not make sampling deterministic.[^openai-mini]
- Give personas meaningful stylistic and strategic differences—concise analyst, consensus-builder, skeptical interrogator, assertive risk-taker—while all still pursue their assigned team's win condition. Assign profiles/model routes independently of hidden roles. A profile named “Overlord” or systematically assigning stronger models to rogues would make profile metadata informative about the secret deal.
- Forfeiture changes the **controller**, not the seat or role. Bootstrap the replacement from the seat's server-recorded permitted history, including private cards or investigations that seat actually received. Do not invent access to the departed external harness's private thoughts or to other seats' memories. Invalidate the prior controller's pending actions before accepting replacement work.

**Proposed memory default:** match-local only. Persisting recognisable public profiles does not require them to remember previous opponents. Cross-match reputation or learning is a product feature with competitive consequences, so decide it explicitly and define whether external agents receive equivalent public history access.

## 8. Admission control and measurable inference budget

Use explicit configuration and accounting rather than inferring affordability from token prices:

- `maxConcurrentHouseMatches`: active-match admission ceiling, chosen after measuring provider capacity and deciding how much concurrent house play the operator wants to fund.
- `maxInFlightHouseCalls`, per-provider/model rate buckets, and separate mandatory/discretionary reservations. Per-match limits alone do not protect a shared provider account.
- Per-operation input/output caps, attempt caps, and absolute expiry; per-match and aggregate daily/monthly accounting in tokens, neurons where available, and estimated currency.
- Reserve expected maximum call usage before dispatch; reconcile actual usage afterward. Track unknown/cancelled usage explicitly. Include summaries, repairs, replacements, and in-flight reservations in totals.

If taking over forfeits is guaranteed, admission must allow **up to ten house seats per admitted match**, even when a match initially has fewer. Merely counting rooms that already contain a house seat can overcommit capacity when previously external-only rooms forfeit. A capacity lease can reserve takeover headroom at match start and convert to active usage when needed. Release/reconcile leases on actual terminal match state.

**Subsequent rules clarification:** the game is bounded to at most 30 elections: at most nine policies can be enacted without a policy-track victory, the tenth must win, and every three failed/vetoed governments force a policy. See the derivation in [the implementation contract](../implementation-spec.md#derived-election-bound). Budget estimates should use that bound alongside finite chat/action limits and recovery policy, rather than assume unbounded election count.

For measured per-match peak demand `r` requests/minute, `t` provider-accounted tokens/minute, and `k` simultaneous calls, an initial admission estimate is:

```text
house match capacity <= min(
  floor(usable provider RPM / r),
  floor(usable provider TPM / t),  # when the provider exposes this limit
  floor(allowed in-flight calls / k),
  operator-funded concurrency
)
```

“Usable” capacity excludes other workloads and includes measured headroom for synchronized ballots and retries. Test correlated bursts across matches, not just averages. There is no evidence here for a particular numerical concurrency default.

### Cost arithmetic the acceptance harness should report

For each model, sum actual uncached input, cached input when billed separately, and output tokens at the applicable prices. Add unknown usage reservations and infrastructure separately:

```text
inference cost = Σ((input_uncached × price_in
                 + input_cached × price_cached
                 + output_billed × price_out) / 1,000,000)
```

As an **illustration only**, 1,000 activations averaging 2,000 input and 150 output tokens cost approximately:

| Model | Token-price estimate for that workload |
| --- | ---: |
| Llama 3.3 | $0.924 |
| GLM-4.7-Flash | $0.180 |
| GPT-4.1 mini, uncached | $1.040 |

This is neither a paid budget recommendation nor a per-match forecast. For example, the nine-seat/every-five-seconds pattern would be about **2,160 chat generations in twenty minutes of uninterrupted allowed chat**, so multiply those illustrative costs by 2.16 before adding actions or repairs. Real matches include mute periods, different prompt lengths, and can exceed twenty minutes. Reasoning-enabled GLM requires measuring billed output rather than using visible-message length. The free neuron allowance is shared usage, not a discount to assume for every match.[^cf-pricing][^openai-mini]

As spending or capacity pressure rises, proposed degradation is to reduce discretionary chatter first and preserve already-admitted required actions. Stop admitting additional house-dependent matches before making existing matches unplayable. A strict monetary cap needs enough reserved headroom for the remaining bounded game workload, retries, and uncertain usage; otherwise an explicit exhaustion rule is required. The operator must choose the admission budget and promised completion behavior.

## 9. Initial harness and model acceptance test

No live or paid inference was performed for this report. Start with deterministic provider doubles to validate orchestration, then run a separately budgeted live acceptance exercise over the shortlisted models when requested. Record exact policy/model/configuration versions for both.

| Test area | What to exercise and measure |
| --- | --- |
| **Time to valid action** | Measure activation delay, admission/queue wait, context assembly, provider duration, validation/repair, and final Match DO commit. Report p50/p95/p99, timeout fraction, and deadline-miss fraction by operation and house-seat count. First-token time alone is insufficient. Test the shortest 15-second discussion window and concurrent ballots under the normal 30-second action deadline, without routinely consuming reconnection grace. |
| **Schema and engine acceptance** | Every action schema, all legal-option cardinalities, private policy choices, executive choices, veto request/answer and post-rejection choice. Count first-attempt valid, repaired, malformed, truncated, refused, illegal, no-tool, and multiple-tool outputs. Run the actual Effect/native request serialization; inspect GLM's thinking-disabled and schema/tool behavior explicitly. |
| **Role play and deduction** | Rotate seeds, roles, seat order, and personas. Check claims refer to actual public events, agents distinguish belief from observation, rogues bluff coherently, and the Overlord operates without privileged teammate knowledge. Assess tactical choices and dialogue usefulness with reviewed replays; do not equate schema success with good play or infer strength from a tiny win-rate sample. |
| **Knowledge boundaries** | Capture exactly what each provider call received. Assert no forbidden role/card/investigation/unrevealed-ballot facts enter another seat's context, including summaries, error repair, takeover bootstrap, and retained notes. Exercise eliminated speakers and late replies crossing into private phases. |
| **Realtime discussion** | Quiet room, targeted questions, many simultaneous messages, repeated house-to-house replies, and external agents sending at the permitted ceiling. Measure useful responses, silence gaps, repetition, speaker distribution, relevance, starvation, cancelled work, and calls per committed message. Tune room cadence from these observations. |
| **Durable failure cases** | Duplicate alarms/deliveries/results, runner restart, Match DO restart, late provider response, result lost after inference, reconnect before/after grace, takeover during private selection, and all ten seats becoming house-controlled. Verify one accepted game command per decision and recovery without a browser being present. Inject delayed alarms to test authoritative timestamps. |
| **Budget and capacity** | Record calls and billed/unknown tokens per seat, phase, and match; summary/repair overhead; cancellation waste; peak in-flight calls; per-minute and per-day demand; provider 429/503 behavior; and cost p50/p95 plus long-match tail. Reconcile estimates against provider usage before setting budgets. |
| **Full-match pacing** | Measure match duration distribution, number of elections, time spent in discussion versus action/reconnect waits, abandonment, and completion rate. The twenty-minute target is a gameplay metric, not an excuse to terminate a valid long match. |

**Acceptance decision:** the harness must enforce all permission, timing, mute, and exactly-once-game-effect invariants regardless of provider behavior. Model acceptance additionally requires a chosen on-time valid-action rate and satisfactory reviewed gameplay at the intended concurrency. Set latency/reliability targets and the live test's spending envelope before running it; no latency percentile or benchmark result is established by this research.

There is also a rules-fidelity issue to resolve in timeout behavior: the original game explicitly forbids randomly picking legislative policies to avoid an intentional choice.[^rules] A generic “random legal move” fallback is therefore not a faithful universal answer. Specify deliberate controller-replacement/timeout behavior for each required action and report whenever it is used.

## 10. Product decisions that actually need user input

1. **House model mix:** initially one accepted model with varied personas, or intentionally heterogeneous models? May availability fallback change a seat's model mid-match? Proposal: one model for the first normal cohort, labelled experiments for model-mix testing, and recorded fallback changes.
2. **Funding and availability:** what aggregate spend envelope and desired concurrent availability should admissions target? What should happen to an already-running match if inference becomes unavailable or its budget is exhausted? Measurements can size the limits; they cannot decide willingness to spend or the promised experience.
3. **Conversation intensity:** should house agents maintain a lightly conversational room or a busy argumentative table? Choose the intended feel and acceptable silence/response lag, then tune activations rather than interpreting the five-second maximum as a quota to fill.
4. **Persistent identities and memory:** are house profiles recurring characters only, or do they remember opponents/results across matches? Proposal: stable labelled profiles with match-local memory initially.
5. **Visibility and parity:** what do players see about house status, persona, model/version, and eventual context/decision traces? Proposal: visible house/takeover labels and profile identity, a shared observation API, and no live private notes exposed to spectators or opponents. Decide whether post-match seat-context replays are part of the product.
6. **Grace/takeover semantics:** after reconnection grace, does the replacement finish the pending action under a specifically defined replacement deadline or does an agreed timeout action resolve it? Also settle behavior when the last external participant leaves. These choices affect fairness, runtime capacity, cost, and full-match duration.

Provider adapter details, job keys, transaction boundaries, and stale-result fences are implementation responsibilities, not reasons to ask the user to select an orchestration library before the acceptance data exists.

## Primary sources

All sources below were checked on **2026-09-10**. Local references are current-file observations with line ranges, not independently reproduced runtime results. Provider documentation describes supported surfaces and published prices/limits; recommendations and arithmetic above are explicitly proposals or derivations.

[^sherlock-model]: Sherlock local primary source: [`mystery-engine/src/server/model.ts`](../../../mystery-engine/src/server/model.ts), lines 1–14 (providers, exact Llama ID, native result codec), 20–50 (schema-only native adapter, request/usage mapping), 53–71 (configuration, Effect/OpenAI path, output limits, 40-second timeout, usage defaults).
[^sherlock-stack]: Sherlock local compatibility record: [`mystery-engine/docs/stack-compatibility.md`](../../../mystery-engine/docs/stack-compatibility.md), lines 5–15 (historical verification), 17–30 (pins and RC.113 incompatibility), 34–79 (Effect APIs, Responses endpoint, native adapter options), 81–90 (bindings and infrastructure contract).
[^rules]: Secret Hitler creators, [official rules PDF](https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf), PDF pp. 2–3 (random roles, ten-player distribution, initial knowledge and team versus role), p. 4 (simultaneous public ballots, private selection, intentional policy choices), p. 5 (private investigations, elimination and silence), p. 6 (veto). Secret Overlord terminology is the task's retheme of these rules.
[^llama]: Cloudflare, [Llama 3.3 70B FP8 fast model card](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), “Model Info,” “Parameters,” and output schema.
[^glm]: Cloudflare, [GLM-4.7-Flash model card](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/), “Model Info” and “Parameters.” Expandable official input schema also inspected in page HTML: `chat_template_kwargs.enable_thinking` (boolean, default true), `response_format` → JSON-schema → `name`/`schema`/`strict`, `tools` → `function.strict`, and output `choices`.
[^glm-launch]: Cloudflare, [GLM-4.7-Flash launch and adapter support](https://developers.cloudflare.com/changelog/post/2026-02-13-glm-4.7-flash-workers-ai/), 2026-02-13, model capabilities and supported native/REST/Chat Completions routes. Its qualitative speed descriptions are not used as benchmark measurements.
[^cf-json]: Cloudflare, [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), “Schema,” “JSON Mode example,” and “Supported Models,” including the failure and non-streaming limitations.
[^cf-pricing]: Cloudflare, [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), free allocation, neuron billing/reset rules, and “LLM model pricing.”
[^cf-limits]: Cloudflare, [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/), local-inference note and “Text Generation” default/exceptions.
[^cf-compatible]: Cloudflare, [OpenAI compatible API endpoints](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), endpoint overview and Workers AI examples, including the model-specific `gpt-oss-120b` Responses example.
[^openai-mini]: OpenAI, [GPT-4.1 mini model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini), description, model details, text pricing, endpoints/features, snapshot, and standard/long-context rate-limit tables.
[^openai-structured]: OpenAI, [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs), “Structured Outputs vs JSON mode,” “Step 3: Handle edge cases,” and “Supported schemas.”
[^openai-limits]: OpenAI, [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits), organization/project scope, rate headers, retries, overload, and token-limit guidance.
[^openai-conversation]: OpenAI, [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state), manual stateless history, `store: false`, `previous_response_id`, and billing of prior input tokens.
[^do-storage]: Cloudflare, [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), storage isolation, synchronous cursor consumption, `transactionSync`, alarm delay behavior, and `deleteAlarm` not cancelling a running handler.
[^do-state]: Cloudflare, [Durable Object State](https://developers.cloudflare.com/durable-objects/api/state/), `waitUntil`, `blockConcurrencyWhile`, and WebSocket hibernation/auto-response methods.
[^do-alarms]: Cloudflare, [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), single alarm slot, multiple scheduled events, at-least-once delivery, retry behavior, and only one running alarm handler per object.
[^do-lifecycle]: Cloudflare, [Lifecycle of a Durable Object](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), stub activation, hibernation conditions, discarded in-memory state, restarts, and lack of guaranteed shutdown hooks.
[^workers-practices]: Cloudflare, [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), bindings, service bindings, WebSocket DOs, bounded `waitUntil`, global state, promise lifecycle, and observability.
[^agents-api]: Cloudflare, [Agents API](https://developers.cloudflare.com/agents/runtime/agents-api/), DO-backed instances, lifecycle, SQL, and chat-agent distinctions.
[^agents-schedule]: Cloudflare, [Schedule tasks](https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/), persisted SQLite scheduling over DO alarms, interval overlap/deduplication, and schedule cancellation.
[^agents-fibers]: Cloudflare, [Durable execution with fibers](https://developers.cloudflare.com/agents/runtime/execution/durable-execution/), `startFiber`, retained status/idempotency, cooperative cancellation, and explicit recovery from checkpoints rather than closure replay.
[^agents-models]: Cloudflare, [Using AI Models](https://developers.cloudflare.com/agents/runtime/operations/using-ai-models/), provider-independent model calls, direct Workers AI bindings, and Vercel AI SDK use by `AIChatAgent`/starter templates.
[^agents-state]: Cloudflare, [Store and sync state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/), state persistence, broadcast, bidirectional updates, validation, and private SQL storage.
