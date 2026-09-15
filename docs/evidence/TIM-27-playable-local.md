# TIM-27 — installed CLI, live source broker and native local play

This test-only lane composes the actual trusted CLI selector, source artifact registry, identity bridge, source broker, target queue/Match/HouseSeat runtime, native harness adapters and source usage ledger. It starts at parent integration `1c43b1b`. Broker corrections `6ec2fc8` and `7987815` are consumed as local `8e4947d` and `f7f99c4`. No production implementation is changed by this lane.

## Final result

**5/5 integration cases passed**, with all build/type/lint/scoped-format and asset-exclusion checks passing. The final combined run is `runs/verify-TAE6GOOf/` (467.63 seconds). Its raw outputs are copied byte-for-byte into `.tim27-playable/accepted/`, including the installed source CLI archive. `accepted/verification.json` records all raw evidence SHA-256s, the exact tested fixture/test code hashes and source provenance. The original run and local D1/R2/DO storage at `/tmp/opencode/tim27-playable-AZZiRK` are retained.

| Native journey             | Outcome                                                                         | Reported / actual queue | Provider HTTP calls = source usage rows | Synthetic source-priced cost |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- | ---------------------------- |
| OpenCode / Secret Overlord | Finished, one invocation, zero restarts, original entrant not forfeited         | 30,000 / 30,068 ms      | 229 = 229                               | $0.016488                    |
| Claude / Succession        | Overall finished, one invocation, zero restarts, original entrant not forfeited | 30,000 / 30,038 ms      | 764 = 764                               | $0.055008                    |

- The two full games used 23 and 125 explicit logical discussion-window advances. Both retained normal `TIME_SCALE=1` snapshot timings.
- Recovery retained the original request, source allocation receipt, Match initialization, pins and supervisor allowance across both lost acknowledgements and target restarts. Its **9 provider calls = 9 source usage rows**, exactly `$0.000648`, remained source-only after closure. Source revocation stopped the child; registered fresh-incarnation selection retained the old ledger bytes.
- The takeover probe retained seat 3 at generation 1. It proved two shared production/preview slots and `$3` reservations, required-over-optional priority, and a held `$1.50` allocation across close. All **15 unknown preview usage rows** retained their estimates (total `$0.042422`) after actual provider settlement. The separately labeled production reservation control retained its `$0.001` unknown estimate without claiming a provider dispatch for that control.
- Completed Succession public and seat archives each paged **1,131 unique events in 29 bounded pages**, covering **19 round-index entries**. Live public/private checkpoints, old live-epoch resets, completed checkpoints, replay and final runtime result agreed. The terminal result was the actual Act 2 round-cap winner, seat 5.
- The whole run observed **1,018 loopback provider HTTP requests** and **zero paid calls**. Target usage tables stayed empty. No new production integration defect was found.

Installed source archive SHA-256: `a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635`.

## Runtime and fixture boundaries

- `.tim27-playable/worker.ts` inherits the **production coordinator alarm unchanged**. There is no `BrokerTestCoordinator.alarm()` override. Normal native admissions wait for the real scheduled 30-second fill, even though target `TIME_SCALE=0.1` is configured for smoke. Live snapshots must equal each game's normal descriptor timings and carry the actual source `openai/gpt-4.1-mini` provider policy.
- Source and target are separate local Workers with persisted D1/SQLite DOs and R2. Source configuration uses the actual D1-only `configurePreviewBroker`; registration/configuration/artifact publication use their real trusted functions. The fixture has no remote binding or AI binding. Its source asserts an explicit `http://127.0.0.1:<port>/v1` provider before dispatch. Target provider is `preview/scripted` with empty provider URL/key.
- The fake OpenAI Responses HTTP service supplies legal choice indices and explicit synthetic usage (100 input / 20 output tokens, `$0.000072` at the pinned source rates), or deliberately omits usage for the conservative unknown-cost case. The real `generateHouse`/Effect HTTP decoder and source admission/settlement paths run. These are **zero paid inference calls**; native adapters also execute local fixture processes rather than models.
- An actual packaged **0.3.0** CLI is installed outside the checkout. Both personal harness setups use it to pair, discover, select and join. Source publication pins its actual archive/module digests. Branch archives include deliberately unusable executable text: only their verified Markdown is consumed. Native processes load the returned branch rules and source CLI wrapper and execute real CLI commands. OpenCode's fixture implements the actual subprocess `api post /api/session`, `run`, interrupt and `api get` protocol.
- After real admission, full-game tests explicitly advance discussion windows through the accepted clock-only `tests/fixtures/succession-worker.ts` control. Match snapshots, source budget/RPM rules, legal actions, receipts and HouseSeat inference are production code. The takeover case deliberately models a late external decision and advances its grace window. Fault-only pre-initialization cancellation cases explicitly age queued tickets; those are not normal wall-clock fill evidence.
- Public target sockets contain wakeups only. Private decisions and bounded recent history use authenticated HTTP. Source connection bytes and picture-source lineage are compared across preview use; no picture response or image tool gates joining.

## Combined cases

1. Installed OpenCode / Secret Overlord: real automatic fill, normal source-funded snapshot, mandatory-first native CLI actions and bounded optional speech, full runtime completion, public/seat final observation and source-only exact HTTP usage.
2. Installed Claude / Succession: the same boundary through both Acts, live authenticated/private and public bounded checkpoints, overall completion, old live-epoch resets, final public/seat history pages, round index, checkpoint and replay comparisons.
3. Installed OpenCode / Succession recovery: a durable supervisor queue allowance precedes admission; source acknowledgement is withheld after its real commit; target acknowledgement is withheld after real Match initialization. Target restarts recover the same request/allocation/immutable Match receipt. Branch A remains pinned after B selection; hot source-grant revocation stops the native child and retains the original ledger. Closing and registering a fresh incarnation creates a separate correctly attested connection.
4. Installed Claude / Secret Overlord timeout: actual normal fill, real native process/CLI observations, explicit late-decision takeover preserving original entrant identity and picture lineage. The grace clock advances only after real house HTTP decisions leave the external entrant as the sole pending seat. A simultaneous production allocation demonstrates shared slots/default budget. Actual pending provider work supplies transient pressure for required-over-optional waiter checks. Source close holds the slot/reservation until settlement and retains all unknown charges; target usage is not a mirrored ledger. Small separately labeled reservation controls exercise real coordinator RPC but are not attributed to provider HTTP work.
5. Before-first-initialization fences: installed pending requests are canceled or source grants revoked after lost allocation acknowledgement. Actual recovery abandons the exact intent without creating a game or dispatching provider work.

## Reproduction and evidence

```sh
bash .tim27-playable/verify.sh
```

Default ports are **6431–6434** (source, target, reserved, local provider). Override `TIM27_PLAYABLE_PORT_BASE` with an available four-port range. Each direct test run defaults to `.tim27-playable/runs/run-<uuid>/`; the script chooses `.tim27-playable/runs/verify-<random>/`. `TIM27_PLAYABLE_EVIDENCE_DIR` accepts an explicitly fresh directory. All captures/logs go there, including partial/failed runs. Temporary homes/storage use `/tmp/opencode/tim27-playable-*` and are retained for diagnosis; original CLI/broker captures are never rewritten.

The verification script runs build, the five serial integration cases, root and fixture type checks, root and fixture lint, scoped formatting, CLI archive allowlisting and production asset/Worker import exclusion. `.tim27-playable/report.mjs` produces `verification.json` with exact source/archive hashes, raw evidence membership and hashes, final runtime/accounting summaries, and retained storage locations. Reusing a populated evidence directory is rejected.

Exploratory captures before the broker correction are preserved:

- `runs/initial-native/`: complete Secret Overlord, one OpenCode invocation, 240 provider requests / 240 source usage rows, original entrant not forfeited. The final assertion failed only the known 3,000 vs 30,000 ms fill report. Initial `/` warmup errors were a missing fixture asset response, subsequently fixed in the fixture.
- `runs/succession-native/`: complete Succession, one Claude invocation, 805 provider requests / 805 source usage rows, original entrant not forfeited. The final assertion failed only the same known fill report.
- `runs/recovery-native/`: both real acknowledgement boundaries, target restarts, A/B pin retention, hot revocation and fresh incarnation succeeded before the known fill assertion.
- `runs/corrected-boundaries/` and `runs/takeover-recheck/`: recovery passed the corrected broker. The new priority probe initially tested a permanent funding denial, which correctly creates no retry waiter. Its fixture was revised to hold actual HTTP work and test transient pressure. Follow-on matched/queued failures came from the earlier test's incomplete cleanup, not independent broker findings.
- `runs/pending-pressure/` and `runs/closure-order/`: the pending-reservation probe passed after closing/releasing held provider work before awaiting native termination. The latter passed the focused takeover case.
- `runs/verify-tAs8LcQe/`: both full runtimes completed; 3/5 combined cases passed. Succession's new archive reader incorrectly requested 100 events (API maximum 64). The takeover clock advanced before outstanding house ballots settled and correctly interrupted the game. Both fixture controls were corrected; no production change was made.
- `runs/verify-XqsxKfsa/`: full runtime completion and live checkpoints succeeded. The traffic assertion then incorrectly classified its newly added public checkpoint reads as private requests, and the takeover inspector omitted Secret Overlord's separately persisted events. The fixture assertions were corrected. `runs/pending-seat-check/` then passed all three focused recovery/takeover/pre-init cases before the final combined green run.

Full logical clocks are simulated after normal admission. Local completion proves the runtime/protocol/accounting composition, not hosted-model quality, conversational willingness, deployed publication, or live billed performance. The historical missing-protocol-header failure remains separately preserved in the accepted CLI evidence and is not explained by these runs.
