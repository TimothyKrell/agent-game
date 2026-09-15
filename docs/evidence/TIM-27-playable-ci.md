# TIM-27: playable CI investigation

## Parent integration and open correctness finding

Source00b3ad2 is integrated at48d692d. The parent independently passed10/10 on two CPUs using the actual maintained npm package/install bootstrap, a fresh home, offline npm and ports6521–6524. Static checks also pass. Evidence: `/tmp/opencode/TIM-27-lead-playable-ci/`. Parent16a8201 includes the three positive-control files in normal CI.

**Acceptance remains open: independent correctness review reports one P2.** A historical `admission_reason` survives a later admitted/pending response. The fixture can therefore report future deferral and completion after the HouseSeat alarm returns even while source inference is dispatched and its HTTP request remains held. The reviewer reproduced nine such requests and observed `discussion()` advance the phase. The current-attempt admission/dispatch barrier needs correction and a denied → admitted → held-HTTP regression. Budgets, deadlines and original assertions remain required.

The exact red capture and559 checksum-verified review files are preserved under `/tmp/opencode/TIM27-playable-ci-correction-review/`. Historical CI attribution remains limited by the original missing native journals. Standards0 and the source/parent green runs do not close this independently reproduced finding.

Source base: `debd8a4a071bc43483b6af8be463e1904d169efc`, branch `fix/tim-27-playable-ci`.

## Final local result

**10/10 passed in 464.56 seconds:** all five original journeys plus held-native-chat, held-native-required, held-house-HTTP, cascade and fresh-storage controls. The complete process tree was observed pinned to CPUs **0 and 1** (`cpu-affinity.json`). This is local two-CPU evidence; parent-owned hosted CI/review remains the integration gate.

| Original journey                                | Test time |                  Actual queue |                       Provider calls = source rows |           Synthetic source-priced cost |
| ----------------------------------------------- | --------: | ----------------------------: | -------------------------------------------------: | -------------------------------------: |
| OpenCode / Secret Overlord                      |   76.91 s |                     30,033 ms |                                          226 = 226 |                              $0.016272 |
| Claude / Succession                             |  210.32 s |                     30,037 ms |                                          580 = 580 |                              $0.041760 |
| Lost acknowledgements / restart / revocation    |   42.25 s |         Real queued admission |                                              9 = 9 |                              $0.000648 |
| Deliberate timeout takeover / unknown retention |   71.15 s |                     30,039 ms |                   29 unknown preview rows retained | $0.0812524 reserved estimates retained |
| Revoked/canceled ticket before initialization   |   10.75 s | Explicit fault-only queue age | Zero provider dispatches for both canceled intents |                                     $0 |

Both normal games finished with one native invocation, zero restarts and no original-entrant forfeit. Succession completed both acts and the round-cap result: 1,107 unique history events per audience, 29 pages and 19 round-index entries. All completion, no-forfeit, snapshot timing, receipts, pins, replay and source-accounting assertions remain active. The full ten-case run made **922 loopback provider requests**, with zero paid calls.

The final barrier observed **447 future optional admission deferrals**, preserving the source rate limiter rather than waiting out optional retry windows. Cleanup readback across 20 source/target case snapshots verified every pre-cleanup allocation ID/reservation remained, all **32 already-completed unknown rows** retained their estimates, and all synthetic controls were cleared. All ten cleanup error lists are empty.

Evidence: `.tim27-playable/runs/ci-green-two-cpu-3/`; selected byte-identical reviewer copies and their hashes are under `.tim27-playable/ci-evidence/`. Every final tested source hash was rechecked after the run. Root and fixture TypeScript checks, scoped Oxlint/Prettier, Node syntax, production-Worker fixture exclusion and whitespace checks passed. Production/package/configuration diffs and accepted-evidence diffs are empty; all four original CI artifact hashes still match.

## Original CI observations

PR10 run **34957418324**, unit shard 3, failed all five playable cases while the other 21 files in that shard passed. Parent retained the entire available artifact download at `/tmp/opencode/TIM-27-pr10-ci/`. The original native journals and local Durable Object storage were not uploaded by that workflow. Their absence limits historical attribution.

| Case                                       |  Duration | Actual retained failure                                                                                                         |
| ------------------------------------------ | --------: | ------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode / Secret Overlord                 | 159.742 s | Runtime finished, original entrant `forfeited === true`; failure at test line 115                                               |
| Claude / Succession                        | 334.398 s | 300-second inner gameplay cutoff; Act 2, round 7 still active; original entrant forfeited, now a generation-1 house replacement |
| Lost source/Match acknowledgement recovery |   1.485 s | `pending.pendingJoin.requestId` dereference fails at line 230                                                                   |
| Claude / deliberate timeout takeover       |   1.295 s | Installed CLI `start` exits nonzero                                                                                             |
| Pre-initialization revocation/cancellation |   1.542 s | `UNIQUE constraint failed: playable_faults.key` while inserting `allocation-ack`                                                |

Hashes of the original `failed.log`, `run.json`, unit log and full JSON are retained in `runs/ci-original-34957418324/provenance.json`. The complete five failure objects are in `failures.json`. Original files are read-only inputs, not edited evidence.

## Feedback loops and findings

1. The uncorrected normal OpenCode journey was run with the entire Vitest/Worker/native process tree pinned to CPUs 0 and 1. It passed in **83.264 seconds**, with **225 loopback provider requests = 225 source usage rows**, one native invocation, zero restarts and no original-agent forfeit. The actual queue duration was **30,035 ms**. Evidence: `runs/ci-red-two-cpu-1/`. CPU affinity alone does not establish or reproduce the CI cause; local CPU throughput is not identical to the hosted runner.
2. A minimized probe holds a complete installed-native `say` POST before the real application handler. The original fixture clock advances the same discussion before releasing it. The unchanged production handler rejects the request with **409 / `stale-phase` / “The phase has changed; observe again.”** The native fixture treats the CLI exit as fatal. The test fails on the clock advancing while the request is pending. Evidence: `runs/ci-held-red-2/`, **1 failed test**, with the exact request phase, transition and native structured error. The preceding `ci-held-red-1` attempt used a cross-request in-memory promise and was rejected by workerd's hung-request detector; it is retained as a setup failure, not the demonstrated stale-phase reproduction. The corrected diagnostic hold polls on request-local timers and is bounded to five seconds.

The demonstrated fixture ordering defect can stop the native participant, making a subsequent normal deadline takeover legitimate. It is not evidence that the production engine prematurely forfeits a delivered legal action. Without the missing CI native journal, it cannot conclusively identify the historical first rejected command.

The mandatory-action reduction, `runs/ci-required-red-1/`, independently holds an actual native **vote POST** after the remaining house decisions complete. With the original unguarded grace control, seat 4 changes from generation 0 / not forfeited to generation 1 / forfeited, and the same submitted action receives **409 / `controller-replaced`**. Its assertion expects the clock to refuse advancement. This establishes why a request-completion barrier is necessary; the two original full-game tests did not invoke this explicit grace control, so this is not attributed as their historical trigger.

The cascade control in `ci-green-two-cpu-2/evidence/case-Ma405y/cascade-control.json` reproduces the three later failures from one still-active predecessor. A second same-agent Succession connection resumes the identical Match, so `pendingJoin` is absent. A new Secret Overlord selection then fails with **“Arena identity differs from this participation’s pinned protocol/rules.”** An unconsumed `allocation-ack` control reproduces the duplicate primary-key error. These are independently asserted observations of the shared-state mechanism, rather than a claim that the missing CI native journal has been recovered.

The first combined correction run (`ci-green-two-cpu-2`) passed **8/9**, including both held-native controls, the cascade/fresh-storage controls and four original journeys. Succession remained active in Act II round 12 with **all seats generation 0 / not forfeited** at the five-minute child limit. Its native `wait` command then exited. The new all-jobs-done barrier had waited out deferred optional admission attempts: persisted HouseSeat rows show `admission_reason=rate-limit`, including a **28,158 ms** initial-chat deferral, plus multiple approximately eight-second deferrals. The raw phase and house-job timing reductions are retained beside that case. The final barrier accepts a returned optional admission deferral with a future retry time only while its HouseSeat alarm is not running; otherwise it requires actual completion. This expires optional future retries through the ordinary next-phase checks, preserving source rate limits and required-work priority.

An intermediate correction run (`ci-green-two-cpu-1`, stopped after the failed reduced probe) exposed a new diagnostic setup issue: moving retained runtime homes under the repository made extensionless CommonJS native fixtures inherit the repository's ESM package scope. The reduced executable capture in `ci-held-green-3/esm-native-reduction.json` records `ReferenceError: require is not defined in ES module scope`. Native fixture executables now link to an explicitly named `native.cjs`. The failed setup runs are retained separately from the original CI failures.

## Correction boundaries

- Native fixtures acknowledge a phase only after required work and initial optional work have completed. The outer discussion driver waits for that exact phase acknowledgement rather than an elapsed 1.2-second assumption.
- Discussion advancement checks persisted initial HouseSeat job completions or returned future admission deferrals through a test-only read seam. A wrapper records whether `await super.alarm()` is in progress; it never changes the production alarm's scheduling, decisions or error handling. An in-flight native action prevents a synthetic clock advance. A separate held-house HTTP control checks that actual inference must finish before expiry. The existing 300-second journey bound and five-minute child bound still apply.
- The independent test observer uses authenticated production HTTP. It no longer runs a second CLI writer against the native participant's persisted delivered observation on every poll.
- Every full journey receives separate local source/target storage and a fresh native home. Teardown captures allocations, usage, fault controls and HTTP traffic **before** cleanup, stops native children, clears only synthetic fault controls, captures readback and retains the runtime directories. It never clears usage or active allocations to manufacture capacity. Provider hold release permits actual source-owned completion; unknown charges retain the production accounting semantics.

All original game completion, no-forfeit, normal snapshot timing, 30-second queue, exact receipt/envelope, immutable pin, replay and accounting assertions remain. Inner gameplay cutoff, outer test deadlines, inference budgets and production rules are not increased.

## Reproduction environment

The diagnostic configuration `.tim27-playable/ci.config.mjs` substitutes only the packaging/install bootstrap: it extracts the retained 0.3.0 archive and byte-compares every CLI module with the current source. This avoids package installation. The retained archive hash is `a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635`; it is local test provenance, not an attested hosted release. Parent owns normalized packaging and CI workflow changes.

Worktree-local dependency links reference the existing root packages, with caches and synthetic homes isolated. Use the existing absolute Node 24.21.0 executable in `PATH`: the first run's `node` shim initialized an isolated runtime cache under its fresh HOME; subsequent commands avoid that shim. All networking is loopback on 6501–6504. Source uses the explicit fake OpenAI Responses server; target has no AI binding or provider credentials. No real inference is invoked.

```sh
RUN=$(mktemp -d .tim27-playable/runs/ci-check-XXXXXXXX)
NODE=/home/timothykrell/.vite-plus/js_runtime/node/24.21.0/bin/node
env -i PATH="$(dirname "$NODE"):/usr/bin:/bin" HOME="$PWD/$RUN/home" \
  XDG_CONFIG_HOME="$PWD/$RUN/home/config" CI=1 WRANGLER_SEND_METRICS=false \
  TIM27_PLAYABLE_PORT_BASE=6501 TIM27_PLAYABLE_EVIDENCE_DIR="$PWD/$RUN/evidence" \
  taskset -c 0,1 "$NODE" node_modules/vitest/vitest.mjs run \
  --config .tim27-playable/ci.config.mjs \
  --reporter=default --reporter=json --outputFile.json="$RUN/vitest.json"
```

These remain synthetic integration tests. Completion demonstrates transport/runtime/accounting composition, not hosted model quality or billed model performance. Prior local 5/5 acceptance is retained as historical evidence; this CI investigation is a reopened validation gate.

## Source references

- `tests/preview-playable.test.ts`: normal source snapshot/30-second alarm admission; full-game completion/no-forfeit assertions; recovery, deliberate takeover and cancellation cases.
- `.tim27-playable/native.cjs`: required choices precede history/chat, phase acknowledgement follows actual CLI completion, structured CLI errors retained.
- `.tim27-playable/worker.ts`: read-only HouseSeat completion inspection, real HTTP hold controls, unchanged source coordinator alarm and clock-only Match superclass.
- `.tim27-playable/harness.ts`: isolated per-case storage, authenticated read-only observer, native completion barrier and evidence-first teardown.
- `tests/fixtures/succession-worker.ts:85–126`: existing synthetic deadline changes and inherited Match alarm invocation.
- `src/game/engine.ts:586–665`: production due-phase transition, grace and takeover rules.
- `cli/agent-game.mjs:853–879,1000–1049`: the saved delivered observation and actual action envelope construction.
- `src/server/house-seat.ts:279–323,339–405`: source admission responses, deferred alarm retry and expired/obsolete optional jobs.
- [Cloudflare alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/): only one alarm handler per DO runs at a time; inspection is local fixture state around the actual handler, not a replacement scheduler.
