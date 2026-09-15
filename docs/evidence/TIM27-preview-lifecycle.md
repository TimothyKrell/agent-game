# TIM-27 — trusted preview lifecycle and resource adapter

## Scope and provenance

This lane starts at parent `635894b` in
`/tmp/opencode/agent-game-preview-lifecycle`, branch
`feat/tim-27-preview-lifecycle`. Initial lifecycle checkpoint: `55d92a7`.
Broker handoff `a953a3c` was consumed afterward as `1701258`; its only cherry-pick
conflict was the source route's imports, resolved by retaining both artifact
readback and broker discovery imports. Parent owns integration of that broker
commit. Original delivery worktree and `.tim27-deploy` evidence remain intact.

No hosted deployment, workflow trigger, paid inference, credential inspection or
configuration, push, package/lockfile edit, or release replacement was performed.
The locally packaged 0.3.0 archive used by tests is **not** evidence of a hosted
release. The exact retained deployed 0.2.0 archive remains separate.

## Authority and ordering

**Generation/finalizer follow-up:** the parent approved additive migration
`0008_preview_generation.sql` and the source-owned `preview-generation.ts` helper.
All trusted lifecycle writes now use durable operation fences. Completed-delivery
failures are classified explicitly before retirement. See
[generation evidence](../../.tim27-lifecycle/generation.md); the frozen original
tuple-only red probes and earlier reports remain historical evidence.
Hosted activation stays default-off pending independent integration review,
deployed source capability/generation probes and the protected release cutover.

The existing default-off deployment activation, immutable GitHub-tested merge
identity, seven required checks, three unit shards, 15-minute job deadlines,
quarantine and validated `bundle:false` upload remain the prerequisite.

`runAlchemy` now launches only the fixed default-branch process:

```text
bun <trusted checkout>/scripts/preview-alchemy.ts deploy|destroy|retire --stage pr-N --profile agent-game --yes
```

It maps the distinct protected-environment `PREVIEW_DEPLOY_TOKEN` to Alchemy's
`CLOUDFLARE_API_TOKEN` internally. The runner validates its exact arguments and
independently repeats the controller's event/default-branch/GitHub/proof checks.
It compiles the fixed trusted stack and calls the locked Alchemy Plan/Apply APIs
in process through `scripts/preview-apply.ts`. The runner and local provider
transports use the same `arenaResources` graph and Plan/Apply/lifecycle sequence.
Cleanup validates the live closed PR again. No PR script, config,
import path, account, database, stage alias, release version, or secret selects
control-plane authority.

The bridge-enabled sequence is:

1. Verify immutable CI identity, current PR, exact manifest and retained proof.
2. Load `agent-game/prod` outputs and protected source release configuration.
3. Persist independent `PreviewAuth` and `PreviewIdentity` resources; verify the
   source release bytes, dispatcher and required retirement/generation schema.
4. Apply the prebuilt Worker/assets/migrations with the retained auth binding and
   exact `PREVIEW_SOURCE_URL`. Both production and targets route `/preview` and
   `/preview/*` Worker-first, alongside existing API/rules routes.
5. Check target `agent-game/pr-N` database output against retained identity, decrypt
   the signing key only in the trusted process, and persist the complete operation
   plan in encrypted Alchemy state before any lifecycle D1 write.
6. Recheck GitHub/generation; configure target key and broker revision (disabled by
   default) in one fenced batch; recheck again; register the source in its next batch.
7. Read back the exact source tuple, verify the independently released executable
   bytes, and call `parsePreviewArtifactManifest` / `registerPreviewArtifacts`.
   Publication has its own reserved source generation and atomic manifest guard.
8. Write only the public registration manifest to
   `.agent-game/preview-registration.json`. Complete the existing scripted smoke.
9. In a credential-free step, verify actual source GET artifact and arena tuple
   readbacks, `Cache-Control:no-store`, and fresh GitHub eligibility. Only then
   assign `sourceRegistration.status=ready` and publish the comment.

The ready proof includes the source origin, incarnation, built commit and
`readback:verified`. Its `livePlay` fields distinguish source discovery
configuration from target configuration; `capacityReserved:false` is explicit.
Readiness never claims an allocation or an additional budget.

## Narrow D1 transport

The original adapter narrowed type signatures in the accepted identity/artifact modules. Worker
`Env` remains assignable to `PreviewEnvironment`/`PreviewSourceEnvironment` and
the minimal `prepare`/`bind`/`first`/`run`/`batch` contract. Broker configuration's
DB type is narrowed in the same way; its behavior remains the accepted handoff.
Infrastructure type checking includes existing Worker and secret declarations
because these accepted modules share production types; no implementation copy
or fabricated full Worker environment is used.
The generation extension adds only `previewArtifactGuard` and the opt-in
`{atomicGuard:true}` publication option to those accepted modules. It changes no
accepted AES-GCM/P-256 validation and has **zero additional diff** in
`preview-config.ts` or `preview-broker-config.ts`.

`scripts/preview-d1.ts` uses the documented fixed endpoint:

```text
POST https://api.cloudflare.com/client/v4/accounts/<protected account>/d1/database/<trusted output UUID>/query
{"batch":[{"sql":"fixed parameterized statement","params":[...]}]}
```

One adapter `batch` is **one HTTP request and one transaction**, never a sequence
of independent REST writes. Statements belong to their creating database and
cannot cross source/target adapters. UUID/account validation precedes I/O.
Limits: 16 statements, 64 binds/statement, 32 KiB SQL/statement, 128 KiB request,
1 MiB response, 30-second deadline, no redirects or automatic retry. HTTP errors,
top-level/member failures, missing metadata, malformed/oversize payloads, or a
result count different from the statement count reject without quoting SQL
parameters or provider response bodies. Native metadata is preserved, not
fabricated.

The parent separately verified actual hosted D1 REST ingress in one disposable
database on 2026-09-15: numeric/null/Unicode bindings, ordered real metadata,
rollback of both data and DDL on a later guard failure, and stale-generation
rejection. Its `assessment.json` and `final-hashes.json` are under
`/tmp/opencode/TIM-27-hosted-d1-contract/`. Whole JSON numbers bind as SQLite REAL
before column affinity, with numeric values preserved. The original probe's two
incorrect assertions and raw packets remain preserved. Database deletion was
confirmed by REST 404/code 7404. This lane made no hosted call; that ingress
experiment is not hosted playable/source-activation acceptance.

Sources consulted and locked implementation checked:

- [D1 REST query/batch](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
- [D1 database transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- Locked Alchemy `2.0.0-beta.76`: `Resource.ts`, `Provider.ts`, `Random.ts`,
  `Stack.ts`, `Plan.ts`, `Apply.ts`, `State/{State,ResourceState,StateEncoding}.ts`,
  `Cloudflare/StateStore/{State,Store}.ts`, and `Cli/commands/deploy.ts`.
  The public custom-resource guide describes a different API generation; the
  implementation follows this repository's installed Effect-based API.

## Retained identity and generation fences

`PreviewIdentity` is a custom Alchemy resource, not a runner-local key cache.
Alchemy persists its P-256 SPKI public key, AES-GCM-encrypted PKCS8 private key,
incarnation UUID, source account/database/origin, exact target origin, CI run and
attempt, built commit and PR head. `PreviewAuth` remains the original independent
Alchemy random resource and the Worker's actual auth binding. Alchemy's protected
remote Cloudflare state encrypts persisted state at rest; `Redacted` prevents
normal rendering, but is not itself an encryption primitive.

Updates and successful retries retain the same incarnation/key. A source
tombstone or acknowledged closure permits a fresh incarnation/key on recreation.
The provider explicitly treats a retired output as an update even if every
input prop is unchanged. A real-engine red/green test caught Alchemy otherwise
treating a same-proof refresh as a no-op and retaining the retired incarnation.
The corrected test also holds an old close request across recreation and proves
that its eventual D1 transaction cannot retire the new incarnation.
No source mutation can start until the identity output is durably persisted.
An incomplete create with no output therefore has nothing to revoke and is
removable; a persisted pending identity remains available after runner loss or
artifact deletion. Source environment objects never receive target auth or
private key material. Stack outputs, CLI arguments, proofs and GitHub artifacts
contain none of these secrets.

The shared GitHub noncancelling per-PR queue serializes controllers and trusted
Alchemy state updates. `0008` adds a schema marker, per-origin current generation
and immutable operation receipts, without a registry foreign-key cascade.
No-delete triggers retain counters/receipts; updates advance exactly once, bounded
by JavaScript's maximum safe integer. The target counter survives while its DB
identity is unchanged. Source counters survive closure, registry deletion and
target recreation. A changed trusted target DB requires retirement and a fresh key.

`preparePreviewGeneration` performs no I/O. `preview-operations.ts` reserves a
stable UUID, expected and assigned generation, and SHA-256 semantic payload
identity for target configure, source register and source publish. The entire
plan is persisted in encrypted trusted state before its first D1 write. Object
key order is immaterial; randomized ciphertext never defines identity. Public
key, source/broker settings and immutable manifest all participate in the hash.
No predecessor is accepted from the PR artifact.

`executePreviewGeneration` prepends three statements to one native batch: strict
expected-generation/no-existing-ID guard, immutable receipt INSERT, and current
counter advance. Business writes and artifact conflict/retirement guards follow
in that same transaction. All lifecycle batches remain within 16 statements and
the adapter's validated 128 KiB bound. `previewTransaction` composes ordered helper
slots without recursively queueing a helper onto its own unresolved result.

A lost acknowledgement propagates as failure. Exact retries read the receipt and
succeed without writes only if that exact operation is still current. Same ID
with different semantics conflicts; older applied receipts never grant current
readiness or reapply, even after A→B→A. Stale unapplied operations never rebase on
normal/cold retries. Missing schema or malformed generation readback fails closed
with 503, with no runtime table creation or tuple-only fallback. Legacy tuple
guards remain additional preimage checks, but are not the generation fence.
The two original unfenced red probes remain unchanged; new source/target green
tests exercise the mandatory generation wrapper.

`previewTransaction` gives each accepted helper an ordered slot. A helper's
`run`/`batch` promise resolves only after the complete native transaction returns
its real result. Async cryptography completion order cannot reorder writes.
Source retirement uses accepted register+close helpers atomically under a guard,
including when the registration never arrived: no observer can see the
intermediate open row, but the exact incarnation obtains the existing durable
tombstone. A different live incarnation fails closed. Existing tombstones make
close retries idempotent and prevent a late old cleanup from retiring a new one.

This lane authors only reserved additive `0008`; migrations 0003–0007 are unchanged.
Activation checks deployed generation schema plus actual retirement triggers/table
availability. Final privileged readiness verifies current source/target operation
IDs, exact source manifest/tuple/public key, target tuple, the SPKI derived from
its decrypted key, and target broker settings.

## Failure and cleanup boundaries

- Failed/lost D1 acknowledgements never count as readiness. Reconciliation reads
  actual state, retaining the key through transient failure and a new runner.
- Observed eligibility loss after registration retires that exact incarnation.
  `PreviewEligibilityChanged` distinguishes independently observed closed/head/
  run changes from transport, malformed-response and failed-verification errors.
  A transient recheck failure preserves the registered incarnation/key for retry.
  Workflow `failure()` schedules a finalizer but grants no retirement authority;
  `PREVIEW_DELIVERY_COMPLETED` is ignored and removed from workflow wiring.
  Explicitly classified smoke checks on schema-decoded observations or a valid conflicting source
  tuple produce `preview-failure.json`, bound to repository/PR, CI run/attempt,
  commit/head/incarnation and this controller run/attempt. Malformed/absent
  markers grant nothing. Otherwise the finalizer rechecks GitHub and retires
  only an observed closed PR, changed head or newer tested run/attempt. GitHub
  503, source 503/timeout/malformed data and comment transport failure preserve
  even a completed healthy deployment. Missing readback remains not ready.
  The [smoke schema correction](../../.tim27-lifecycle/smoke-schema.md) replaces
  the prior global `AssertionError` rule with `PreviewSmokeInvalid`, produced only
  after typed observation decoding. Health, socket, assignment, match and archive
  shapes are checked before semantic assertions; setup/transport/JSON/schema and
  fatal UTF-8 failures cannot create a marker.
  The fixed Node publication path uses Node-safe settings/target modules to avoid
  importing server code or a top-level-await controller cycle.
- Cleanup uses retained state, not a PR artifact or release configuration. It
  acknowledges source retirement **before planning any target destruction** and
  keeps retry identity on source failure. Its Alchemy identity delete handler
  refuses an unretired persisted output.
- Automatic close and canonical manual closed-PR recovery share the same lock.
  Cleanup works with both deployment and identity flags disabled. R2 deletion
  still uses persisted `forceDestroy:true`; the historical legacy-bucket caveat
  remains as recorded in the trusted-delivery evidence.
- Cleanup verifies full retained owner and delivery-owned source/target generations;
  it cannot adopt an unrelated newer generation just because the tuple matches.
  Source retirement commits first, target retirement disables its broker second,
  and exact generations/owner are checked again after destroy planning, before apply.
  If an owned delayed delivery wins after retirement reservation, normal/cold retry
  preserves the stale fence and fails closed. The existing manual **closed-PR**
  recovery path may reserve a distinct operation only for a stale **unapplied**
  fence whose winner is an operation of that retained delivery. Applied receipts
  and unrelated winners cannot be superseded. Original fences remain in encrypted
  retirement history (bounded at 16); valid/applied-current fences are reused.
  Every manual invocation repeats canonical closed-PR authority checks.
- Public source readback is after the privileged process exits. A mismatch,
  pending tuple, closure, changed head, missing cache policy, or missing source
  dispatcher prevents the ready comment. Broker capacity remains checked at
  actual allocation time, not inferred from an arena discovery boolean.
- The remote Alchemy state service has no compare-and-swap API. Controller
  exclusivity therefore depends on the shared GitHub per-PR queue; unrelated
  manual concurrent writers to that stage are outside the controller contract.
  D1 generation guards additionally reject requests delayed beyond runner lifetime,
  including revision cycles. Alchemy state still requires that shared queue.

## Broker handoff and activation

No new target binding or AI credential is required. Targets keep
`HOUSE_PROVIDER=preview`, `HOUSE_MODEL=scripted`, zero local reservations and
`TIME_SCALE=0.1` for smoke. Live per-allocation provider/model/clocks and all
funding remain source-owned as described in
[`TIM-27-preview-broker.md`](TIM-27-preview-broker.md).

`configureTargetPreviewBroker` calls the accepted helper using the same adapter,
guards the exact `preview_runtime` incarnation/commit inside the outer fenced
target configure batch. It enables only when the independently deployed
source revision is already enabled in source D1. Per-PR delivery never toggles
the shared source switch.

Parent's explicit source-operator integration seam is:

```ts
await configureSourcePreviewBroker(
  trustedAlchemyState,
  protectedEnvironment,
  independentlyDeployedSourceCommit,
  enabled,
);
```

This verifies the `agent-game/prod` `sourceCommit`/database/origin output,
protected activation and released executable/dispatcher, then uses the accepted
`configurePreviewBroker` helper in a guarded atomic transaction with readback.
Its exact operation is persisted in the separate fixed encrypted control-state
output `{stack:'agent-game-preview-control',stage:'source-broker'}`; production
resource graph/output is not overwritten. The parent must serialize source
operator invocations as it serializes updates to that control state. Same current
semantic request reuses its operation; a changed mode/revision reserves the next
source-origin generation. Per-PR origin counters are independent of this switch.
It changes no budget, allowance, reservation, pricing, ledger, provider or
credential. Parent invokes it only after hosted operating-ledger reconciliation.
Disabling retains all broker reservations/charges until accepted settlement;
source coordinator reconciliation follows the broker's existing 30-second
alarm/status contract, with no RPC added to register/close.

External configuration remains deliberately default-off:

1. Complete the previously documented default-branch environment restrictions and
   removal of PR-reachable broad credentials. Enable
   `TRUSTED_PREVIEW_DEPLOY_ENABLED` only after trusted code lands.
2. Deploy the source protocol/dispatcher/identity/artifact/broker/generation migrations and
   release the actual source CLI. Production outputs must now include
   `databaseId`, `sourceOrigin`, `sourceCommit`, `previewBridgeVersion:1`.
3. In the protected `preview` environment, set
   `TRUSTED_PREVIEW_SOURCE_RELEASE` to an independently verified released pin:
   `{sourceOrigin,executable:{url,version,sha256,bytes,protocols:[1,2]}}`.
   Its URL must be exactly the source-origin versioned CLI download. Neither the
   current checkout's package version nor the PR artifact establishes this pin.
4. Set protected `TRUSTED_PREVIEW_IDENTITY_ENABLED=true`. Missing source
   capabilities/pin/schema fail closed. Leaving it absent keeps scripted previews
   available without source registration.
5. Keep `TRUSTED_PREVIEW_BROKER_ENABLED` absent/false until the parent configures
   the source's real supported provider and reconciles the actual operating
   ledger, then invokes the source configuration seam. Only after that deliberate
   configuration may the protected target broker flag be enabled. No live paid
   run was used to test this implementation.

Hosted create/update/full-rerun/base-advance/synchronize/close, interrupted-run
recovery, nonempty-R2 cleanup and unchanged-production-state acceptance remain
external follow-up. Local evidence and exact verification results are retained
under `.tim27-lifecycle/`.
