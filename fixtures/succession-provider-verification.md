# Succession production-provider verification

Run from the repository root after installing dependencies:

```sh
npx vite build
npx tsc --noEmit -p tsconfig.succession-provider.json
npx vitest run --config vitest.succession-provider.config.ts
```

The suite takes several minutes. Each case starts an isolated local Worker, migrates
local D1, uses ephemeral HTTP/inspector ports, and removes its temporary storage.
Temporary directories live under `/tmp/opencode`.

## Exercised path

`MatchmakingObject.exhibition('succession')` creates the real allocation and model
snapshot. Production match alarms enqueue production house jobs. Inherited
`HouseSeatObject` execution reserves inference through the real coordinator,
calls `generateHouse` through the installed OpenAI structured-response SDK over
HTTP, records usage, persists its response, and submits the action.

The provider is a local Node server at `127.0.0.1:<ephemeral>/v1/responses`.
It returns synthetic usage of 100 input and 20 output tokens. Dollar figures in
the evidence are accounting calculations on these synthetic tokens. There are
zero paid provider calls. The fixture config has no remote AI binding and uses
a dummy key; its default provider URL points to closed loopback port 1.

The deterministic selection function sees only the current production house
prompt and selects an index from that prompt's supplied legal options. Captured
requests from other seats are used for verification, never for selecting moves.
The real engine still supplies random policy and influence decks.

## Cases

1. Full two-act evaluation match, all six Act 2 actions, challenge/loss/exchange
   continuations, bounded entitled prompts and terminal history, system-message
   and structured-schema checks, actual per-attempt usage and saved response
   correlations. A one-shot HTTP 503 exercises provider retry. A separate
   fixture-only transport exception on vote submission exercises saved-response
   redelivery without regeneration. Wrong-generation and late Act 1 jobs must
   finish without inference or note mutation. Re-enqueueing a delivered job
   must not regenerate it.
2. HTTP-success responses with an illegal choice exercise structured-output
   rejection, bounded retries, unknown usage, and honest interruption.
3. Held HTTP action responses exercise the production deadline abort and honest
   interruption with no fabricated action or player forfeit.

Inspection routes and the one-shot submission exception exist only in
`succession-provider-worker.ts`. The business methods, alarms, provider calls,
reservation logic, and accounting remain inherited production implementations.
Inspection pages contain at most 64 rows.

The `SUCCESSION_PROVIDER_EVIDENCE` output records each completed match's ID,
winner, action coverage, provider calls, archive page/event counts, synthetic
usage, and peak rolling RPM. Match duration and token estimates are fixture
evidence, not frozen production pacing or budget defaults.

This suite reads terminal history through HTTP. Exact replay-checkpoint decoding
is separately covered by `tests/succession-replay.test.ts`; this suite does not
claim HTTP replay-cursor verification.
