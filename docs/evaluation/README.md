# Evaluation evidence

These artifacts accompany [the build status](../build-status.md). They are measurements of specific versions and execution paths, not production guarantees or a calibrated ranking of models.

## Artifact formats

- `model-samples.jsonl`: original 32 small fixtures across `house-1` and `house-2`. `valid` means the response fits the requested legal-choice/discussion contract. `intentional` checks simple faction objectives only; null indicates an unscored scenario.
- `full-*.json`: failed older single-request full-game drivers. Usage was not retained reliably; reserve $2 each. The unsafe long-request driver has been removed in favor of checkpointed calls.
- `stepped-*.json`: sequential required-decision games with local clock advancement and per-seat notebooks. Public discussion and live Durable Object scheduling are absent. Llama completed 220 decisions; GLM stopped after 28.
- `live-*.json`: ten separate house runners, actual required-action/discussion clocks and remote inference, hosted on local Durable Objects. Terminal records include the full reveal/partial replay. `running` or `reserved` records retain the full allotted amount until terminal evidence is saved.
- `sample-*.json`: new small fixtures use a separate reserved artifact before each call, then save the response and accounted cost.
- `*-liveness.json` / `*-supervised*.json`: actual local harness evidence. Read the exclusions and counter-version notes in the build status before interpreting a successful terminal status. A finished match can still contain an agent forfeit.
- `deployment-smoke.json`: actual public HTTPS/API/browser checks and pending pairing through the downloaded CLI. The repeatable driver is `scripts/verify-deployment.mjs`. It does not complete OAuth callbacks or start a match, and incurs no model-inference usage.
- [Cheaper-model evaluation](cheaper-models-2026-09-11.md): GLM and Qwen `house-4` fixtures, sequential games, runtime checks, and integration findings. Individual `sample-*.json` files include failed preliminary configurations as well as the final candidates; use the report's cohorts when comparing models.

## Budget

Approved house-evaluation allowance: $10. For conservative bookkeeping we also include the two Claude harness runs' reported token accounting, despite those using an existing subscription.

Read the common ledger without making any inference calls:

```sh
node --input-type=module -e "import('./scripts/evaluation-budget.mjs').then(async ({evaluationLedger}) => console.log(await evaluationLedger()))"
```

The ledger sums reported usage where available and preserves estimates for missing usage. It contains a $0.02 reservation for the original sample lost on a Worker restart and $2 for each old long-request failure. A measured-token estimate is based on published input/output rates, not an invoice export. OpenCode provider costs are unavailable in these records.

`lockEvaluation()` prevents the house-evaluation scripts from running concurrently. A crash can leave `.agent-game/evaluation.lock`; check its PID and ensure that the process and any live table have stopped before removing a stale lock. A live table continues independently of its driver. Keep its artifact reservation until its terminal usage is recovered.

## Reproduction

Small and sequential fixtures:

```sh
npm run eval:serve
npm run eval:samples
npm run eval:games
```

These are paid operations. They refuse new admissions when the common ledger lacks headroom. Run them from the project root. The sequential driver requires Bun; ordinary tests and the distributed CLI use Node.

Live runtime example (use the account you intend to charge):

```sh
CLOUDFLARE_ACCOUNT_ID=<account-id> PORT=8799 TIME_SCALE=1 \
  HOUSE_PROVIDER=workers-ai \
  HOUSE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast \
  HOUSE_MATCH_RESERVATION_USD=1.5 MAX_CONCURRENT_MATCHES=1 \
  node scripts/dev.mjs --test

# In another terminal after the server is ready:
LIVE_EVALUATION_URL=http://127.0.0.1:8799 \
  LIVE_EVALUATION_RESERVATION_USD=1.5 node scripts/evaluate-live-match.mjs
```

The server-side and driver reservation values must match. The all-house development endpoint creates an unranked `evaluation` table and enforces its per-table admission allowance. Ordinary external ranked tables finish beyond the daily admission target; the evaluation hard limit is deliberately different.

Keep the runtime build fixed during live measurements: source edits, dependency installs and asset rebuilds can restart Wrangler and invalidate latency/cancellation conclusions. Record the runtime log as well as the terminal artifact. A locally hosted Durable Object with remote inference does not establish deployed-network behavior, distributed cold-start behavior or multi-table provider capacity.
