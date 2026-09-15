# TIM-27 — source broker and recoverable live preview admission

Implementation is based on parent integration **546bb8b** in the exclusive
`feat/tim-27-preview-broker` worktree. It implements the funding architecture in
[`TIM-27-playable-previews.md`](../design/TIM-27-playable-previews.md#aggregate-budget-selected-architecture-and-precise-authorization-boundary).
The accepted identity correction and its evidence remain intact.

## Delivered interfaces

### Trusted controller configuration

Apply additive **`migrations/0005_preview_broker.sql`** to the source and targets.
It creates one disabled-by-default settings table; an absent settings row means
live admission returns HTTP 503.

```ts
import { configurePreviewBroker } from './src/server/preview-broker-config';

await configurePreviewBroker(sourceEnv, {
  enabled: true,
  revision: sourceDeployedCommit,
});
await configurePreviewBroker(targetEnv, {
  enabled: true,
  revision: targetDeployedCommit,
});
```

The revision is a full 40- or 64-character lowercase hexadecimal commit. The
target settings revision must equal `preview_runtime.commit_id`. Source settings
record the source revision independently. This function neither creates an
allowance nor changes any budget, capacity, provider, pricing or credential
environment setting. It has **no public HTTP mutation route** and introduces no
new Env fields or infrastructure resources.

The source must have its actual supported provider configured using its existing
`HOUSE_PROVIDER`, `HOUSE_MODEL` and provider bindings/credentials. The existing
`houseConfigured` check is reused. Source `HOUSE_PROVIDER=preview` cannot issue
live allocations. Targets need no AI binding or provider credentials.

**Lifecycle handoff:** `registerPreviewTarget` and `closePreviewTarget` remain
D1-only, compatible with the lifecycle lane's narrow Env / trusted D1 REST
adapter. The broker requires **no new target binding names**. The existing source
coordinator, exactly `getByName('secret-overlord')`, reconciles active allocation
incarnations against the durable D1 registry on its alarm and before returning
signed operating status. While an allocation is open it arms a 30-second wakeup.
Retirement closes only the retired incarnation's allocations and persists a
source coordinator fence. Alarm housekeeping is dispatched with `ctx.waitUntil`;
the signed status read waits for fresh reconciliation. Until then reservations remain held; new
requests already fail live registry authorization. D1 outage also holds funds.
This supersedes the earlier in-session proposal to call coordinator RPC from the
registry helpers. No new coordinator namespace, ledger reset, PR budget or source
HTTP registration route is introduced. Parent owns later migrations 0006/0007;
this slice adds only 0005.

### Source REST and typed RPC

`src/server/preview-inference.ts` handles only POST requests under
`/api/preview/broker/`. All use the existing incarnation-specific ECDSA signed
request envelope. Signatures bind method, exact source origin/path, exact target
origin/incarnation, timestamp, nonce and exact payload bytes. Nonces are durably
single-use; timestamp age/skew remain 60 seconds/5 seconds.

| Endpoint    | Payload                                    | Result                                                                                   |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `status`    | `{ commit }`                               | Current source revision/provider/model and separate game reservation/admission summaries |
| `allocate`  | `PreviewBrokerIntent`                      | Stable `PreviewBrokerReceipt`, or capacity/authority denial                              |
| `validate`  | `{ allocationId, commit }`                 | Same receipt after current source authority and registry checks                          |
| `inference` | `PreviewInference`                         | HTTP 202 pending, saved completion, unknown/failed attempt, or typed admission denial    |
| `retire`    | `{ allocationId, commit, jobId, attempt }` | Retires only that exact allocation/attempt's priority waiter                             |
| `complete`  | `{ allocationId, commit }`                 | Closes only that target's allocation; retains all charges                                |

Schemas and result types are in `src/shared/preview-broker.ts`. Source RPCs on
`MatchmakingObject` delegate to `PreviewBrokerLedger` in the existing object.
Application faults cross RPC as `RpcResult`, preserving intended HTTP status;
custom thrown errors do not preserve their application fields across workerd RPC.

The status response includes accounted current-day USD, full active reserved USD,
active allocation count, live-preview allocation count, the configured maximum
concurrency/daily target, the game's requested reservation, remaining admission
USD, and current capacity. These are fresh reads of the **same source ledger used
for admission**. They include no competitors, private game observations, provider
keys, bearer tokens or prompts. Status is available only to a correctly signed,
currently registered target revision. It is suitable for the parent's later
operating-ledger reconciliation; local fixture balances do not describe the live
operating account.

Broker signed requests are bounded at **64 KiB**, allowing the bounded prompt plus
its exact legal-choice fingerprint. Identity requests retain **32 KiB**. The
existing eight-second transport timeout, manual redirect rejection, and 64 KiB
response ceiling remain. Provider work is dispatched with Worker `ctx.waitUntil`
after durable admission, so provider latency does not own the HTTP acknowledgement
or a coordinator transaction.

### CLI-facing behavior and profiles

The existing derived-agent HTTP `POST /api/queue` is the live entry point. Target
configuration, live source authority and fresh shared source capacity are required.
Disabled target configuration returns `503 preview-allocation-pending` before
creating any ticket. Source outage/disablement also fails closed with HTTP 503.
Queue responses retain existing protocol, request-ID and ownership checks.

Source `/api/preview/arenas` now advertises a boolean `livePlay` reflecting source
broker/provider configuration. `PreviewArenaSchema` accepts that boolean. The
flag is discovery information: it does not promise target configuration or reserve
capacity. The signed status endpoint reports the `smoke` and `live` profiles.

- **Smoke:** target `/api/dev/exhibition` uses a server-chosen scripted provider,
  zero reservation, `mode=preview`, and scale **0.1**, including when target identity
  and the broker are enabled. It never requests a source allocation or inference.
- **Live:** derived-agent queue fills after **30 seconds**, uses the source's
  real provider/model and normal descriptor clocks (**scale 1**), and captures
  rules/policy versions in a `mode=preview` snapshot. Ratings are disabled. There
  is no silent scripted/provider fallback on exhaustion or outage.

Private WebSocket tickets remain denied to derived installations. Their private
observations and submissions use the separately owned CLI HTTP transport lane.
This slice does not modify CLI artifacts, trusted executable selection, or skill
pins.

## Funding and provider execution

`PreviewBrokerLedger` adds records inside the existing source SQLite DO. Preview
allocations also occupy the ordinary `allocations` table, and provider calls use
the ordinary `usage` and `inference_waiters` tables. Admission therefore includes
production and previews in the existing formula:

```text
current-day accounted usage
  + full active production and preview reservations
  + requested reservation
  <= existing source daily operating target
```

There is at most **one active live-preview allocation**, within the source's
existing **three total slots** and **$5 daily admission target**. The ordinary
**$1.50** reservation and existing source Succession override are reused. Full
active reservations remain held across UTC midnight. Settled actual, unknown and
expired charges are never deleted or refunded by preview cleanup.

Every preview allocation, **including mixed human/house matches**, is hard-bounded
by its allocation. Optional work can use at most 50%; follow-ups at most 25% of
that optional envelope; required work can use the entire remaining allocation.
Production mixed-match required work keeps its existing exemption. Required
priority, same-allocation initial priority, 250/180 required/optional rolling RPM
limits, useful-deadline checks, and exact-ID waiter cleanup use the existing
TIM-26 implementation.

The source chooses pricing at admission and stores input/output USD-per-million,
output ceiling **512**, maximum attempts **2**, source revision, and immutable
`preview-broker-1` funding-policy version in the receipt. Those rates remain pinned
across source redeploy. Target prompts may implement branch policy; model choice,
pricing, output limits, provider addresses and charge assertions are not accepted
from the target.

A logical request binds allocation, job, phase, seat, generation, kind, useful
deadline, prompt/system, legal choices and policy version. Attempts 1 and 2 have
distinct usage IDs. The same logical request cannot change its fingerprint, and
a completed request cannot fund another attempt. Source `generateHouse` validates
the choice index against the supplied bounded choice count. No arbitrary fetch or
provider/model override is exposed.

Admission and the `dispatched` receipt commit in one synchronous coordinator
transaction **before** the source Worker starts provider I/O. Concurrent identical
requests return pending or the saved result; they cannot execute again. A lost
dispatch acknowledgement returns `unknown` after its dispatch deadline rather than
reusing that billed attempt. A separately funded second attempt is the only retry.
Actual reported usage can exceed the estimate and remains honestly charged.
Missing usage, provider failure and abort/timeout retain the reserved estimate.
HouseSeat terminates permanent authority/allocation denials and retries transient
transport failures with the same persisted input; a closed allocation does not
cause repeated unbillable activation loops.

Completion closes new work and retires waiters. A closed allocation with an
outstanding unknown dispatch retains its **slot and full reservation** until source
settlement. No target-facing reconciliation/refund endpoint exists. The native test
uses a fixture-only privileged settlement to prove terminal unknown costs remain
accounted; it does not claim a provider did zero work.

## Target write-ahead and recovery

`PreviewTargetAllocations` stores a stable source allocation request ID, target
match ID, exact local tickets (agent/owner/grant/request/join/expiry), source handoff
lineage, game, incarnation, deployed commit, and rules/policy versions **before
source allocation I/O**. It stores the source receipt and snapshot before Match
initialization. Target `usage` rows are not used as a second live cost ledger.

Before first initialization, recovery verifies:

1. Current target incarnation, deployed commit and enabled configuration.
2. Exact unchanged starting tickets, live local grants, owner identity and local
   retirement state.
3. Current source registry, consumed handoff, owner-session/agent-grant lineage,
   exact agent scope, source expiry and source retirement.
4. Exact local tickets and local authority again after source I/O.

Lost source acknowledgements and target cold restarts reuse the same intent and
receipt. `MatchObject.initializationReceipt(input)` is a read-only query that checks
the existing immutable game/entrant/grant/snapshot/reservation identity. The game
and those initialization fields already commit together. A matching committed game
recovers its original participation even if source authority has since expired or
been revoked; no duplicate initialization or new match is manufactured. Actual
workerd tests interrupt **after real Match initialization commits** to verify this.
This is the only Match DO addition; history/checkpoint ownership stays with TIM-23.

Cancellation is permitted while a broker allocation is `starting` and its first
initialization has not been dispatched. Exact request/grant checks still apply.
The dispatch fence prevents cancellation from racing an uncertain initialization
acknowledgement. Pre-initialization cancellation, retirement, revocation, ticket
replacement/expiry, commit change and incarnation replacement abandon only the
uninitialized intent. Existing participation uses the durable Match receipt.

Target completion/abandonment is durable, retryable cleanup dispatched via
`ctx.waitUntil`, not awaited in the match/house alarm's remote housekeeping path.
The source records an **owned closure tombstone even if allocation admission has
not arrived yet**. Delayed requests cannot reopen it. A different target cannot
close another allocation or tombstone its request. Incarnation retirement is also
fenced in the source coordinator when it reconciles the durable registry. Delayed
in-flight admission remains conservatively reserved until that reconciliation;
subsequent inference still requires current source registry authority.

This is not a distributed transaction. Source authority linearizes at its current
read; already-in-flight work may finish concurrently with revocation. Subsequent
requests revalidate authority, and all such work remains within source accounting.

## Verification and artifacts

Final verification reports are under `.tim27-broker/`; the provenance command
below checks their source/dependency snapshot and the unchanged accepted `.tim27`
archive. The native fixture runs three separately persisted Workers/D1/DO arenas
on OS-assigned loopback ports, with an actual local OpenAI-compatible HTTP usage
server. It calls the real `generateHouse` path, not paid inference.

The manifest pins this **546bb8b-based broker snapshot**. The parent's newer
CLI, artifact, lifecycle and history integration needs its own captures; snapshot
verification runs from this broker commit's worktree. Primary runtime references
were the current [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
and [SQLite DO storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
alongside the repository's locked provider/Effect implementations and existing
TIM-26 tests. Installed dependency versions and generated runtime types were retained.

- **16 native source/target cases**: source disabled gate and authenticated target gate;
  two-PR/production capacity races; actual production mixed required exemption and
  shared waiter priority; RPM denial/recovery; previous-day held reservations;
  owned closure-before-admission; immutable fingerprints and concurrent dispatch;
  missing/aborted usage; lost allocation and dispatch acknowledgements; cold
  restarts; exact creating-ticket cancellation/revocation/retirement/replacement;
  changed commit/incarnation; already-initialized receipt recovery; enabled-identity
  scripted smoke; live protocol-2 Succession initialization/inference; real live
  HouseSeat work and normal funding-exhaustion interruption. Private HTTP observations
  are bounded below 24 KiB in both live runtime cases.
- **56 SQLite ledger/regression cases**: five new focused ledger tests plus existing
  queue, repository, native/model, useful-deadline and waiter-cleanup tests.
- **18 identity/Worker boundary cases**: all 16 accepted identity cases and two production
  Worker error-boundary tests; captures go to a new broker-owned directory.
- Full production TIM-26 synthetic gate: **178 phases, 392 required calls, 412 initial
  chats, 154 follow-ups, $1.2804700 accounted, peak 110 RPM / 10 concurrent**. No
  unserved required jobs. The earlier production baseline is unchanged.
- **Two ordinary deterministic preview games** exercise full completion and replay.
- Three TypeScript configurations, repository Oxlint with warnings denied,
  changed-file formatting, Vite client build, and diff checks.

The full TIM-26 trace is retained locally and archived as gzip; its uncompressed
digest is in the provenance manifest. Original identity and feasibility captures
are not overwritten. Test scripts and fixtures are loopback-only and must never
be deployed. The fixture coordinator exposes SQL/clock/acknowledgement controls
solely to test the real storage/runtime boundaries.

Safe reruns (unique ignored directories; the baseline command writes a large trace):

```sh
run=".tim27-broker/runs/$(node -p 'crypto.randomUUID()')"
mkdir -p "$run"
TIM27_BROKER_EVIDENCE_DIR="$run" node node_modules/vitest/vitest.mjs run --no-cache tests/preview-broker.test.ts --reporter=default --reporter=json --outputFile.json="$run/native-vitest.json"
TIM27_IDENTITY_EVIDENCE_DIR="$run/identity" node node_modules/vitest/vitest.mjs run --no-cache tests/preview-identity.test.ts tests/worker-errors.test.ts --reporter=json --outputFile.json="$run/identity-vitest.json"
TIM7_NAME="../$run/tim26" TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_BUDGET_GATE=1 node node_modules/vitest/vitest.mjs run --no-cache --config vitest.dialogue-baseline.config.ts
node .tim27-broker/provenance.mjs --check
```

## Remaining hosted integration

Parent review/integration, trusted lifecycle deployment, the separately implemented
CLI selector/artifact transport, production HTTPS/social callbacks and both installed
harnesses remain outside this local verification. No push, deployment, provider
credential mutation, package/lockfile change, or paid call was performed here.

Before a hosted real-model trial, reconcile the **actual shared operating ledger**
using the authorized source status and the parent's operating-account records.
The historical evaluation balance **$0.791523** is not a current operating-budget
blocker and is not used by this code. Existing reservations/targets authorize no
extra or per-PR spending. Full hosted model quality, end-to-end installed harness
completion/replay and live billed usage remain unverified.
