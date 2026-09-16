# Coding Finale house runner

## Execution and recovery

`src/server/house-seat.ts` owns the Cloudflare lifecycle. `house-runner.ts` operates the same object's SQLite job store and alarm schedule. Act 1 uses the existing Secret Overlord legal-choice workflow with the Coding Finale survival/qualification objective. Act 2 uses `coding-house.ts` for actual model-authored source.

Each formal attempt has a durable job keyed by its current decision ID. Under the stable race phase, the authority must issue a new decision ID after every verdict/tier transition and stop issuing actions while a formal receipt is pending. Each alarm performs one step:

1. Load the authenticated current challenge, own previous source, and own formal verdicts.
2. Admit a model invocation against the original match's coordinator allocation; generate a complete program and optional practice inputs.
3. Persist the candidate and usage receipt before calling practice. Practice runs the public example plus up to seven caller-owned inputs through authenticated `houseCodingPractice`.
4. Persist the actual practice result; admit another model invocation to revise the source with that feedback.
5. Persist the complete formal request, then submit it through the existing receipt retry path.

Cold alarms resume from SQLite. A lost formal acknowledgement resends the same request without regenerating source or consuming a second formal attempt. Coding action IDs are SHA-256 hex digests of the host job ID; host receipt identities remain unchanged. A stale decision ID prevents inference. No source, private feedback, or hidden suite material is written to telemetry.

There are at most **four model invocations per formal attempt**, including failed or interrupted invocations, and two practice dispatches to recover uncertain RPC results. Normal success takes two model invocations and one practice run. All invocations use `reserveInference`/`recordInference` with `${job.id}:attempt:${n}` identities. Unknown provider usage remains conservatively charged by the existing coordinator. Budget denial during revision can submit the already-generated candidate. The authority's ten-formal-attempt quota and original five-minute deadline remain authoritative.

## Calibration configuration

The house model metadata supports:

```ts
{
  provider: 'workers-ai', // or 'openai'
  model: '@cf/qwen/qwen3-30b-a3b-fp8',
  policyVersion: 'coding-house-1',
  coding: {
    language: 'typescript', // default: javascript
    maxOutputTokens: 8192,  // default 8192; clamped to 1024–8192
    timeoutMs: 45000,      // default 45000; clamped to 1000–60000
  },
}
```

The language is an explicit generation preference; submitted language is recorded separately. Every call timeout is also capped by the remaining shared deadline. Both OpenAI and Workers AI receive the larger output budget; ordinary social decisions retain 512 tokens. Prompt and code remain complete structured responses rather than streamed partial submissions.

For a real evaluation, configure `HOUSE_PROVIDER`, `HOUSE_MODEL`, and the appropriate provider binding/key (`AI` or `OPENAI_API_KEY`, with `OPENAI_BASE_URL` for the existing OpenAI endpoint). Parent integration owns snapshot/environment wiring and the Coding Finale match reservation/concurrency controls. Preserve the `coding` metadata in the admitted match snapshot when comparing language or output-budget variants; changing an environment variable after admission must not silently relabel an existing run.

`HOUSE_PROVIDER=preview` selects a deterministic fixture only in development/preview. It still executes through practice and formal judging, but it invokes no model and must never be included in model-performance results. The trusted preview inference broker's current short-choice protocol cannot authorize code generation, so real coding calls on that broker path are denied rather than redirected to unbudgeted inference.

## Telemetry and experiment interpretation

- `house_coding_inference`: job, provider model, tier, next durable stage, invocation attempt, emitted language, latency in milliseconds, input/output token counts, estimated cost USD, and `modelExperiment:true`.
- `house_coding_practice`: job, practice dispatch number, latency, and whether a real provider authored the source.
- Existing coordinator usage records remain the budget ledger and include failed/unknown invocations. Existing `house_retry` and job outcomes identify provider errors, deadline expiration, obsolete work, and admission denials.

Use actual formal judge receipts and server-received timestamps for pass rates and placements. Separate per-invocation latency from total tier completion time. Successful-inference log totals alone omit failed/unknown invocations; use the coordinator ledger for total call counts and costs. Prices are the existing `inferenceCost` estimates, not provider invoices. The runner gives models only their authorized challenge, own source and verdicts, and practice output from caller-supplied inputs.

## Focused verification

```sh
npx vitest run tests/coding-house.test.ts tests/house-model.test.ts
```

These tests use actual SQLite and mocked provider/RPC boundaries without module mocking. They exercise cold-resume steps, feedback-driven revision, same-phase sequential-tier activations, receipt retry identity, original budget identities, bounded provider/practice recovery, stale decisions, UTF-8 source limits, and preview isolation. They make no paid provider calls and do not measure puzzle difficulty or live provider latency.
