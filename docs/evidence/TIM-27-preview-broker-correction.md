# TIM-27 — broker review corrections

Implementation **6ec2fc8** is authored on **a953a3c**, following the two P2 and one P3 findings
in the parent's fixed-range Spec review. The parent integrated the initial broker
at **1c43b1b**; apply the correction commits on top of that integration.

## Corrected contracts

### Completion ownership is atomic (P2)

`PreviewBrokerLedger.close(id, target)` now requires the signed origin and
incarnation. Inside its synchronous SQLite transaction it:

1. Rejects identifiers outside the broker's `preview_<requestId>` namespace.
2. Reads the broker receipt and rejects a different origin or incarnation.
3. Records the origin/incarnation-scoped closure tombstone.
4. Mutates shared allocation/waiter state **only if the owned broker row exists**.

An absent preview-namespaced allocation can still be closed before admission.
Its tombstone affects only that origin/incarnation's delayed request. It cannot
delete waiters or modify an unrelated allocation, even if a non-broker allocation
happens to have a preview-prefixed ID. Repeated owned closes remain idempotent.
Registry retirement supplies the exact retired target identity to the same ledger
method. Usage charges and unknown-dispatch reservation retention are preserved.

`completePreview` returns `RpcResult` so an ownership denial becomes HTTP 401
through real workerd RPC. The signed completion route delegates the ownership
decision directly to that atomic method, without a separate receipt-check RPC.

### One earliest-deadline coordinator alarm (P2)

Successful preview allocation, including identical receipt recovery, now awaits
`PlatformQueue.schedule()`. The broker's 30-second reconciliation wake participates
in the existing candidate-fill, creating-recovery, expiry and capacity scheduler.

Every production coordinator alarm write uses one `wakeAt` operation. It reads and
conditionally writes the minimum alarm **inside a Durable Object storage
transaction**. An idempotent retry cannot move a pending earlier alarm later;
concurrent callers do not use an unprotected asynchronous get-then-set sequence.
No alarm is needed for an empty coordinator; first live allocation arms one.

`recordInference` may be called within a synchronous SQL transaction. `wakeAt`
defers starting its asynchronous storage transaction by a microtask so it begins
after that SQL transaction commits. Inference completion and cancellation retain
their `ctx.waitUntil` scheduling. Registry reconciliation itself remains
nonblocking alarm housekeeping. The allocation response awaits only local
scheduler persistence; lost acknowledgements still recover the original receipt.

Reference: Cloudflare's [SQLite Durable Object storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

### Profile-aware fill time (P3)

Queue status, readiness and alarm scheduling now use the same `fillAt(joinedAt)`
calculation. An authenticated live target reports and waits **30 seconds**, even
with `TIME_SCALE=0.1` configured for smoke. Ordinary production queue scaling and
the separate scale-0.1 scripted exhibition snapshot retain their existing behavior.

## Verification

New captures are under `.tim27-broker/correction-*`. The original broker evidence
and all 24 accepted `.tim27` artifacts are byte-for-byte preserved.

### Red evidence

The first local probes reproduced all findings on the reviewed implementation:

- Signed completion of a public production Match ID returned **200** and removed
  its required-priority waiter, while its $1.49 usage reservation remained.
- Retrying an identical source allocation postponed the real production fill
  alarm by **25,047 ms**.
- Authenticated live queue status reported **3,000 ms** instead of 30,000 ms.
- A direct ledger call confirmed the missing ownership boundary independently
  of HTTP routing.

`correction-red-20260915-01/` retains those initial captures.
`correction-red-20260915-02/` independently reproduces all **four expected failures**
using an immutable `git archive` of a953a3c and the correction probes. Before
copying probes, the original provenance checker passed **223 hashes / 24 accepted
artifacts unchanged**. The reproducible runner is
`.tim27-broker/correction-red.mjs <new-evidence-directory>`.

### Green evidence

- **19 native cases**, including all 16 retained broker/runtime cases and the three
  new HTTP/runtime probes: `correction-green-20260915-05/native-vitest.json`.
- **58 ledger/regression cases**: six actual-SQLite broker cases plus production
  queue, repository, model, useful-deadline and exact-waiter regressions:
  `correction-green-20260915-01/regressions.json`.
- **One full TIM-26 synthetic production gate**:
  `correction-tim26-20260915-01/vitest.json`. The shared scheduler change justified
  this rerun. Its summary is **byte-identical** to the accepted source baseline:
  **178 phases, 392 required calls, 412 initial chats, 154 follow-ups,
  $1.2804700 accounted, peak 110 RPM / 10 concurrent, no unserved required jobs**.
  The full new trace is retained locally and archived as gzip with its own digest.

The completion probes cover unauthorized production IDs, another preview's
allocation, wrong incarnation, legitimate repeated close and close-before-admission
idempotence. Production usage rows and the required waiter remain identical after
the denied call, and optional preview work still receives `required-priority`.

The scheduler case explicitly enables **real automatic source alarms**, forwarding
to `MatchmakingObject.alarm()` rather than the fixture's normal suppression. It
observes the actual scheduler's five-second production fill, one-second creating
recovery, ticket expiry and 30-second registry retirement. Parallel signed receipt
retries preserve each scheduled deadline. After D1-only registry closure, SQL-only
observation confirms automatic retirement and settlement at the scheduled wake;
neither signed status nor a manual alarm drives that reconciliation. Fixture
manual wakes are used only to start earlier clock-adjusted queue scenarios and
to finish cleanup. The live fill case also checks no admission before 30 seconds,
admission after 30 seconds, and normal descriptor clocks in the committed receipt.

The initial focused green run and first complete 19-case run are retained in
`correction-green-20260915-01/` and `-02/`. When the automatic-retirement assertion
was added, `-03/` hit a fixture-only `ECONNREFUSED`: the selected second target had
already been deliberately stopped by the earlier Succession case. The final
scheduler case uses the running target and runs last. `-04/` then exposed a
test-start assumption: the preceding fill test left a harmless pending wake for
its completed allocation, so the scheduler test's eight-second wait for an empty
alarm timed out. The final case consumes that wake through the actual automatic
handler before testing first allocation from an empty coordinator. `-05/` is the
complete final native capture. These fixture corrections needed no production
source changes.

In the final capture, the production fill deadline moved **0 ms** under receipt
retries. Automatic registry retirement was observed **32 ms** after its scheduled
wake. Nine local provider requests passed every source model/output/credential
check, including one observed abort; paid calls were zero.

Static validation: all three TypeScript configurations, repository Oxlint with
warnings denied, changed-file formatting and diff checks. The exact commands are
recorded in `.tim27-broker/correction-checks.json`.

## Integration and provenance

The correction changes four broker/coordinator production files and their focused
tests. The D1-only lifecycle configuration/registry interfaces, migration **0005**,
target bindings and source artifact/discovery merge remain compatible with the
parent's later 0006/0007 and installed-CLI integration.

```sh
node .tim27-broker/correction-provenance.mjs --check
```

The new manifest independently pins the corrected source and evidence. It checks
the original **223-file a953a3c snapshot** against its original Git objects, all
original broker artifacts against their current bytes, and all **24 accepted
identity artifacts**. The old `.tim27-broker/provenance.json` is not rewritten to
bless corrected source. Its original checker passed before probes were copied
into `/tmp/opencode/tim27-broker-reviewed-9OoxW2`; the red capture's
`original-provenance.json` retains that result.

Safe new runtime captures use a unique ignored directory and `--no-cache`:

```sh
run=".tim27-broker/runs/$(node -p 'crypto.randomUUID()')"
mkdir -p "$run"
TIM27_BROKER_EVIDENCE_DIR="$run" node node_modules/vitest/vitest.mjs run --no-cache tests/preview-broker.test.ts --reporter=json --outputFile.json="$run/native-vitest.json"
node node_modules/vitest/vitest.mjs run --no-cache tests/preview-broker-ledger.test.ts tests/platform-queue.test.ts tests/platform-repository.test.ts tests/house-model.test.ts tests/inference-cleanup-deadline.test.ts tests/inference-waiter-lifecycle.test.ts --reporter=json --outputFile.json="$run/regressions.json"
```

All provider work used the existing loopback-only source fixture; paid calls are
**zero**. Hosted operating-ledger reconciliation and installed-harness validation
remain with the parent. This correction makes no hosted journey acceptance claim.
