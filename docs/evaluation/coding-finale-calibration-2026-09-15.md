# Coding finale calibration — 2026-09-15

## Scope and method

**SCRIPTED ACT1 + REAL CODING FINALE.** Act 1 uses the lab's scripted decisions through the actual Secret Overlord engine. Only winning-faction survivors qualify. This is not a whole-game real-agent benchmark.

The calibration driver is `scripts/coding-experiments.mjs`; its local inference Worker is `scripts/coding-evaluation-worker.ts`, configured by `scripts/coding-evaluation.wrangler.jsonc`. Inference runs remotely through the approved personal account's Workers AI binding; the Worker itself binds to `127.0.0.1:8798`. Judging/practice use the existing local lab on port 8788. No cloud deployment is performed.

All surviving finalists are launched concurrently and assigned alternating models:

- `@cf/zai-org/glm-4.7-flash`
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

The Worker imports production `generateCodingHouse`, `codingHousePrompt`, `CODING_HOUSE_SYSTEM`, and `inferenceCost`. Configuration: JavaScript, 8192 maximum output tokens, 60-second call timeout, temperature 0.5 from the production adapter; GLM thinking disabled by that adapter. Each attempt generates a candidate, executes practice on the public example plus up to seven model-authored inputs, asks the model to revise using actual practice output, and formally submits that revision. It polls authoritative receipts before proceeding. Tier 2 is fetched only after the contestant's Tier 1 pass. Models see their authorized challenge, own prior source and own formal feedback; no hidden tests, expected-answer implementation, preview solver or other contestants' source enter model prompts.

The dedicated durable ledger `coding-finale-budget.json` enforces a $5 inference allowance and two-race creation maximum. Every inference request is preceded by a synchronous persisted reservation based on UTF-8 prompt bytes plus a 16,384-token schema allowance and maximum output tokens, priced through production `inferenceCost`. Actual reported token usage replaces the reservation; failures/unknown usage retain the full reservation. This accounting is an estimate rather than an invoice. An exclusive local lock prevents simultaneous drivers from spending the same allocation.

JSONL artifacts capture prompts, model-generated programs, provider/generation errors, token usage, latency, practice outputs, formal receipt timestamps, tier progress and terminal outcomes. Credentials are saved only under ignored `.agent-game/finale-lab/` paths with mode 0600. Source-bearing report artifacts are intended for post-experiment review.

## Race 1: infrastructure interruption before reveal

- Match: `e5c1f11f-2201-40bd-906d-ef7640250f5a`.
- Five finalists: seats 2, 3, 4, 6, 9.
- Terminal status: `interrupted`; reason: “The shared coding environments could not be prepared.”
- `startedAt` and `deadline` remained null. Zero model requests, practices or formal submissions; $0 inference spend.
- Lab runtime log reported `No such image available named cloudflare-dev/finalesandbox:cb3dc349`. The expected Docker tag was absent from `docker image ls`.
- Evidence: [`coding-finale-race-1.jsonl`](coding-finale-race-1.jsonl).

This race provides no difficulty or model-quality evidence. It is an infrastructure interruption, not a wrong answer or timeout by a contestant.

## Race 2: real model completion in 4m13s

After the runtime agent restored the missing lab Docker tag, the second and final authorized race completed:

- Match: `2e518124-7c50-44e0-a624-7fa1d5cab21c`.
- Scripted Act 1: rogues won by electing the Overlord after three overrides, in six rounds. Seat 1 was executed; surviving finalists were 0, 2, 3, 7.
- Shared start: epoch milliseconds `1789523469191`; deadline exactly 300 seconds later.
- Champion: **seat 0, GLM**, passing Tier 2 receipt sequence 12 at **253.332 seconds**. Finished status was observed at 253.650 seconds.
- All four real contestants ran concurrently against the same challenge ID. No operator-authored solution was supplied.

| Seat | Model | Tier 1 first passing receipt | Tier 2 first passing receipt | Unique submissions | Practice runs | Completed / requested calls | Median completed call |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | GLM 4.7 Flash | 192.200 s | **253.332 s** | 4 | 10 | 19 / 20 | 12.386 s |
| 2 | Llama 3.3 70B | **53.344 s** | None before race ended | 2 | 4 | 9 / 10 | 26.163 s |
| 3 | GLM 4.7 Flash | None | Locked throughout | 3 | 10 | 19 / 20 | 11.465 s |
| 7 | Llama 3.3 70B | None | Locked throughout | 3 | 4 | 9 / 10 | 24.989 s |

Tier 1 leader Llama lost the lead to GLM on Tier 2. At termination, 2/4 contestants had passed Tier 1 and 1/4 had passed Tier 2. These are observations from one shared race, not independent estimates of per-model success probabilities. The losing contestants did not receive the remainder of the five-minute window after a champion was found.

### Formal verdict chronology

Times are authoritative server receipt times relative to the shared start, not inference completion or judge completion timestamps.

| Sequence | Seat | Tier | Receipt elapsed | Verdict |
| --- | --- | --- | --- | --- |
| 1 | 3 | 1 | 31.222 s | wrong-answer |
| 2 | 0 | 1 | 37.848 s | wrong-answer |
| 3 | 2 | 1 | 53.344 s | passed |
| 4 | 7 | 1 | 65.258 s | runtime-error |
| 5 | 7 | 1 | 112.973 s | wrong-answer |
| 6 | 2 | 2 | 131.359 s | wrong-answer |
| 7 | 3 | 1 | 132.982 s | wrong-answer |
| 8 | 3 | 1 | 164.643 s | wrong-answer |
| 9 | 0 | 1 | 192.200 s | passed |
| 10 | 7 | 1 | 200.656 s | wrong-answer |
| 11 | 0 | 2 | 217.371 s | wrong-answer |
| 12 | 0 | 2 | 253.332 s | passed |

There were 26 successful submit HTTP calls but only 12 distinct admitted receipts: **14 identical-source retries returned existing receipts**, correctly consuming no extra formal attempt. The driver bounded each contestant to ten generation/practice/revision cycles, so repeated identical source consumed driver cycles without consuming server submission allowance. This is a harness limitation and a useful house-policy finding: explicitly discourage repeating an already-failed program and distinguish inference cycles from formal attempt quotas.

The 28 successful practice runs took a median 56 ms end-to-end (range 40–1697 ms). Model generation dominated elapsed time. Practice feedback was real stdout/stderr, not a fabricated success indicator. For example, the first GLM candidate returned 5 for the public example whose documented expected answer was 7; the available feedback did not guarantee effective correction. Negative formal verdicts were retained.

### Infrastructure disturbance and censoring

At about 142.8 seconds, the local inference Worker **hot-reloaded**, returning HTTP 503 for four concurrent generation requests (one per contestant). The original driver attempted JSON decoding on the plain-text error response and recorded `Unexpected token 'Y', "Your worke"... is not valid JSON`. The Worker log independently identifies the reload immediately followed by four `POST /generate 503` entries. These are local inference-transport interruptions, not four model wrong answers or evidence of a Workers AI provider outage. Unknown usage retains the full pre-request reservation. All four contestants resumed automatically.

The start/end SHA-256 hashes for production `coding-house.ts`, `house-model.ts`, and both evaluation entry points match in the summary artifact. The exact watched dependency that triggered reload was not established. This shared development-tree disturbance means the race is usable end-to-end evidence but **not a clean latency benchmark**. Freeze a bundled Worker and disable watch for future calibration.

Two Llama generations were still underway when GLM won. Their returned programs could no longer run practice: the lab returned `race-closed`. These are end-of-race censored candidates, not wrong answers. The final driver printout came about eleven seconds after the actual finish because it awaited those in-flight calls.

### Cost and evidence

| Accounting item | USD |
| --- | --- |
| 56 completed calls with reported usage | 0.063269687 |
| Four interrupted calls, full reservations retained | 0.058606868 |
| **Total accounted against $5 authorization** | **0.121876555** |
| Remaining allowance, with two-race cap already exhausted | 4.878123445 |

Known usage totals: **82,534 input tokens and 50,874 output tokens**. Actual billing for interrupted requests is unknown; no zero-cost assumption was made. No third race or post-race paid inference was run.

- [Raw race 2 events, prompts and model outputs](coding-finale-race-2.jsonl)
- [Machine-readable race 2 summary](coding-finale-race-2-summary.json)
- [Reservation and usage ledger](coding-finale-budget.json)
- Summary regeneration: `node scripts/coding-experiments-summary.mjs`.

## Verification notes

The installed Wrangler is 4.129.1. Its workerd binary supports compatibility dates through 2026-09-14, so the isolated evaluation config uses that date after a 2026-09-15 startup was rejected. Wrangler-generated binding/runtime types were checked in a temporary file. JavaScript syntax and targeted Oxlint checks passed. A whole-repository `tsc --noEmit` attempt encountered concurrent, unrelated Coding Finale UI integration errors in `src/client/main.tsx`, `src/client/owner-dashboard.tsx`, and `e2e/succession-scope.spec.ts`; no evaluation-worker errors were reported.

## Calibration conclusion

**For these two Workers AI models and this generate/practice/revise policy, the puzzle was neither trivially easy nor universally too hard: one contestant finished at 4m13s, with an earlier Tier 1 leader and a later Tier 2 lead change. Keep five minutes as a provisional setting.** The observed finish falls inside the intended 3–5 minute experience.

Confidence is limited: only one race reached actual coding, with two samples per model, a shared hot-reload interruption, repeated-source inefficiency, and early-race-end censoring. This result does not establish pacing for stronger external coding agents, different reasoning budgets or different challenge families. Before changing difficulty, improve duplicate-failure handling and freeze the runtime; then obtain additional independently authorized races across seeds. Preserve the first race as infrastructure failure rather than combining it with model solve rates.

Reproduction command (requires fresh authorization after this ledger's two-race cap): start `npx wrangler dev --config scripts/coding-evaluation.wrangler.jsonc --ip 127.0.0.1 --port 8798 --inspector-port 9298`, then `node scripts/coding-experiments.mjs`. Preserve this completed ledger rather than resetting it to bypass the cap.
