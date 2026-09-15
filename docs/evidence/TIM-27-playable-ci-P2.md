# TIM-27: current-attempt readiness correction

Follow-up to correctness review of `00b3ad2429326f8a73c8be10915eff7beae6f61d`. The review found one P2 in the fixture's optional-admission readiness calculation. This correction stays on `fix/tim-27-playable-ci` in the existing worktree.

## Corrected two-CPU result

**11/11 passed**, including all five original journeys, all five earlier controls and the new admission regression. The JSON result span is489.77 seconds; the full Vitest log reports491.82 seconds elapsed. Runtime projections must distinguish these measurements. All observed descendants, including workerd and native CLI processes, were pinned to CPUs 0 and 1. Complete run: `.tim27-playable/runs/p2-green-two-cpu-1/`.

Independent Standards review of00b3ad2…aa38826 reports **0 findings**. It verified4 code entries,39 committed artifacts,136 retained files and3 original review inputs, with no missing files or hash mismatches. Correctness closure and parent packaged-CLI verification remain separate gates.

### Independent correctness closure

The final correctness review reports **0 outstanding findings**, closing the stale-admission P2 ataa38826. The byte-identical original counterprobe passes in16.80s; the completion regression passes in16.50s. Nine held dispatched attempts block advancement; the same nine attempt IDs subsequently complete with nine usage rows totaling$0.000648 before the phase advances. Eight component-check groups cover identity isolation, response changes, attempt switching, billed-row precedence and missing/failed/malformed observations.

The reviewer verified all559 earlier review files unchanged,36 copied artifacts,136 retained raw run files,22 cleanup comparisons preserving31 completed unknown rows, and all90 original assertion blocks. Six full-run/final-source behavioral files transpile to identical JavaScript. The full11-case suite was audited rather than repeated.

Final review evidence comprises1,113 checksum-verified files at `/tmp/opencode/TIM27-playable-ci-P2-review/`, a symlink to `/home/timothykrell/.cache/opencode-review-evidence/TIM27-playable-ci-P2-review/`. Disk-full and path-identity setup failures are preserved. Original-counterprobe green report SHA-256: `93ffc405eda3b020256c35e1c5458c63bc843ace1debe72340f7ef92f35dd57b`; checksum manifest: `c9c4ca9fda143cb62ea493b1e0769b8f93c1c74a420bc3314ba88e6500107c03`.

Parent integration9b9cac1 passes static checks. Its actual package/install two-CPU run at `/tmp/opencode/TIM-27-lead-playable-p2/` stopped during Succession after the Secret Overlord case passed, without a final JSON report. That interruption remains under diagnosis; it is not a completed verification run. Parent package/install completion and hosted CI remain open gates.

The interruption diagnosis subsequently established tmpfs exhaustion: native `observe` recorded `ENOSPC` at12:38:33.572 UTC, followed by Wrangler `SQLITE_FULL` at12:38:33.665–.666. The log ended at8,192 bytes mid-header. The47GiB `/tmp` filesystem was full; inode exhaustion and inspected OOM counters do not explain it. The exact final launcher exit mechanism remains unrecorded. Both npm package/install steps completed successfully. Fifteen diagnostic copies and nine original artifacts were verified; runtime databases and WALs remain preserved.

A fresh retry uses disk-backed runtime/evidence, HOME/config and temporary directories at `/home/timothykrell/.cache/opencode-review-evidence/TIM-27-lead-playable-p2-disk/`. It retains the actual package/install bootstrap, two CPUs, ports6521–6524 and unchanged limits/assertions. Capacity was checked before launch. Diagnosis records remain at `/tmp/opencode/TIM-27-parent-p2-interruption/`.

| Original journey                              | Test time |                          Actual queue | Source accounting                                              |
| --------------------------------------------- | --------: | ------------------------------------: | -------------------------------------------------------------- |
| OpenCode / Secret Overlord                    |   82.61 s |                             30,086 ms | **239 calls = 239 rows**, synthetic **$0.017208**              |
| Claude / Succession                           |  215.88 s |                             30,034 ms | **588 = 588**, synthetic **$0.042336**                         |
| Lost acknowledgements / restarts / revocation |   42.37 s |                        Real admission | **9 = 9**, synthetic **$0.000648**                             |
| Deliberate timeout takeover                   |   71.27 s |                      Normal admission | **28 unknown rows**, **$0.0785236** estimated charges retained |
| Revocation/cancellation before initialization |   10.97 s | Existing fault-only queue-age control | Both canceled intents dispatch zero provider calls             |

Both normal games finished with one native invocation, zero restarts and no original-entrant forfeit; Succession completed both acts. The whole eleven-case run made **960 loopback provider requests**. It recorded **482 current source-denial deferrals**, proving that genuine unadmitted optional retries still permit progress. Cleanup comparisons across 22 source/target snapshots preserved every existing allocation ID/reservation and all **31 already-completed unknown rows**, with empty synthetic controls and zero cleanup errors.

The full-run admission regression again observed **9 held/dispatched requests → blocked clock and unchanged phase → 9 completed calls/usage rows ($0.000648) → permitted phase transition**.

Root and fixture TypeScript, scoped lint, final formatting, production-Worker fixture exclusion, original-assertion preservation and whitespace checks pass. The first format check requested a signature line-wrap correction. That final formatting-only change produces byte-identical transpiled JavaScript for all six recorded behavioral files; the focused regression was also rerun successfully against the exact final source (`p2-green-final-source`). No runtime/budget limits changed.

## Diagnosis

`HouseSeatObject` stores `admission_reason` on denial, but a later admitted/pending response updates `due_at` without clearing that historical reason. Source `/api/preview/broker/inference` starts actual HTTP through `ctx.waitUntil` and immediately returns pending/202. A returned target alarm plus a future retry time therefore cannot establish that inference was deferred rather than dispatched.

The review counterprobe is retained unchanged at `/tmp/opencode/TIM27-playable-ci-correction-review/`. The local reproduction (`.tim27-playable/runs/p2-red-1/`) also failed: **nine source calls were dispatched with null results, all nine provider requests were held, yet every job reported complete and the discussion phase changed**. The test body took **5.46 seconds**. Its Worker is the unchanged `00b3ad2` source; the exact red-test bytes were recovered and verified against the hash recorded before execution.

The only seeded control is the review's four-second required-priority waiter. Source admission genuinely denies optional work, naturally expires the waiter, retries the same jobs and dispatches the held requests. No HouseSeat job fields, usage/allocation rows, game deadlines or budgets are edited by this regression.

## Fixture correction

`.tim27-playable/worker.ts` now observes the actual source `beginPreviewInference()` RPC return after calling the production implementation. It records the result in a separate **fixture-only** table, keyed by the exact allocation/job/attempt identity. The observer never replaces an admission result or dispatches inference.

The discussion gate batches a read of those current outcomes and the authoritative `preview_broker_calls` rows in the source coordinator:

- A dispatched call with no result blocks completion, independently of the historical target reason or whether its alarm has returned.
- Future deferral is permitted only for the latest actual **retryable denial**, with a future source retry time and **no billed row for that attempt**. The target must also be pending, due in the future and outside its running alarm.
- Otherwise the target job must be done and have no outstanding source dispatch. Failed/missing observer responses do not authorize a deferred job.

The target derives the exact attempt identity from its persisted `broker_input`. Historical `admission_reason` remains visible solely as diagnostic context. Source observations are batched once per discussion inspection; the production signed inference HTTP, pending/202 response, `waitUntil` work, HouseSeat alarm, action routing and ledger settlement remain the actual implementation under test.

## Regression and focused result

`.tim27-playable/admission-ordering.test.ts` carries the denied → admitted → held-HTTP counterprobe and extends it through actual completion:

1. Observe a genuine source `required-priority` denial before the sentinel expires.
2. Observe nine dispatched/null-result source rows and nine unfinished provider requests after admission, with the exact native phase acknowledgement.
3. Assert **no clock advance**, unchanged phase, and all nine jobs classified as dispatched/incomplete despite their historical denial fields.
4. Release the HTTP hold. Assert those same nine attempts complete, their nine usage rows each record `actual = 0.000072`, and only then permit discussion expiry. The original entrant is not forfeited.

Focused green: **1/1**, **6.24-second body**, **9 completed attempts = 9 accounted rows = synthetic $0.000648**. Evidence: `.tim27-playable/runs/p2-green-focused-1/`, including separate pre-release and post-completion captures. The preceding red and the original reviewer capture remain intact.

All **90 original assertion text blocks** are verified against `debd8a4`, whitespace-normalized and in order. `tests/preview-playable.test.ts` is byte-identical to `00b3ad2`; its 300-second gameplay bound, five-minute child slice, outer deadlines, normal 30-second queue, both acts, pins, receipts, privacy, replay and accounting assertions are preserved.

The parent's `16a8201` CI include glob already covers `.tim27-playable/*.test.ts`, so this new regression enters that inventory without another configuration change. Parent-owned `48d692d` integration and CI/packaging/configuration files are outside this patch.

## Evidence status

The source ten-pass run under `ci-green-two-cpu-3` and the parent's actual-pack/install ten-pass run at `/tmp/opencode/TIM-27-lead-playable-ci` are **pre-fix evidence, not acceptance of this correction**. Original review files, original PR10 artifacts and archived lanes remain untouched. Tests use fresh storage/evidence directories, CPUs 0 and 1, ports 6501–6504 and the explicitly loopback provider. No paid inference is involved. Hosted CI and renewed correctness review remain parent-owned gates.

Reviewer captures, source hashes, accounting projection and preserved raw-run paths are indexed in `.tim27-playable/p2-evidence/manifest.json`. The existing no-install `ci.config.mjs` remains unchanged: it extracts the retained 0.3.0 archive, verifies SHA-256 `a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635`, and byte-compares its CLI modules against source. Packaging remains the parent's validation boundary.
