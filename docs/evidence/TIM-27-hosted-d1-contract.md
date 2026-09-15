# TIM-27 — hosted D1 REST contract verification

On 2026-09-15, the parent verified the trusted adapter's remaining REST-ingress assumptions against a newly created, disposable Cloudflare D1 database. The account came from this repository's `CLOUDFLARE_ACCOUNT_ID` variable and was matched to the existing authenticated Wrangler account inventory. The existing OAuth credential remained in memory.

Only a parent-authored Python probe and the installed Wrangler CLI received that credential. The experiment did not execute PR source, configuration, build scripts or the lifecycle controller. It did not deploy a Worker, activate preview authority, invoke inference or mutate an existing database.

## Observed contracts

| Contract | Actual REST result |
| --- | --- |
| `{ batch: [{ sql, params }, …] }` | Accepted at the documented database `/query` endpoint. |
| Numeric, null and quoted Unicode parameters | Values `7`, `2.5`, `null` and the original text round-trip correctly. Untyped JSON numbers bind with SQLite REAL storage. |
| Failed data batch | An UPDATE and INSERT preceding a deliberately failing SQL guard both roll back. |
| Failed schema batch | CREATE TABLE and INSERT preceding the same failure both roll back. |
| Successful guarded batch | Results retain statement order; writes commit together. |
| Adapter metadata | All fields required by `preview-d1.ts` are present in the actual response. |
| Stale precondition | A failed generation guard prevents the subsequent mutation. |
| Cleanup | Wrangler acknowledges deletion; REST readback returns HTTP 404 with error code 7404. |

This closes the ingress evidence gap left by the local REST-shaped fixture, which explicitly maps requests to the native D1 binding. The lifecycle generation helper and retirement classification still require their own application-level review.

## Preserved initial probe errors

The first probe exited nonzero on two overly specific assertions:

1. It expected `typeof(?)` to be `integer` for JSON numeric `7`. D1 returned `real` while preserving the exact numeric value. The adapter accepts finite numbers and does not require an INTEGER storage class for untyped parameters.
2. The deletion matcher accepted “not found” but omitted the actual message “could not be found.” The retained HTTP 404 and error code 7404 confirm removal.

The raw packets, failed checks and original script remain unchanged. `assessment.json` corrects those assumptions using the existing observations; no repeat remote experiment was needed. The first manifest was produced before `run.log` closed, so `final-hashes.json` records final closed-file hashes. An independent reviewer verified all 20 entries in that final manifest.

Evidence is retained under `/tmp/opencode/TIM-27-hosted-d1-contract/` and in the verified recovery archive `/home/timothykrell/Code/agent-games-archive/TIM-27-D1-REST-2026-09-15/`. The snapshot contains the final manifest and its 20 listed files, including the probe, requests/responses, creation/deletion receipts and assessments. The account-selection scratch file is outside that evidence manifest; it contains no token.

## Primary references

- [D1 REST query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) — query and batch request shapes.
- [D1 binding batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) — ordered transactional binding semantics, distinguished from the directly tested REST ingress.
- [Wrangler D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/) — disposable database creation/deletion.

The local and hosted API observations support the adapter contract. They do not attest a hosted playable preview, a released CLI archive or real-model dialogue quality.
