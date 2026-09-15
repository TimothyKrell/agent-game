# TIM-27 — identity review corrections

Follow-up on `7f7e447`, before parent-assigned broker work. Parent integration
`57411e2` has its own R2/type generation changes; this correction is based directly
on `7f7e447` as requested and touches no infrastructure, dependencies, CLI or history.

## Corrected behavior

### Names: preserve identity while resolving real uniqueness conflicts

The source/target creation-API regression reproduced `500` from
`UNIQUE(agents.owner_id, agents.name_key)`: the owner imported first, created a local
name, then created the same source name and attempted a fresh import. ID-collision
checks did not address this independent unique constraint.

`src/server/preview-import.ts` now selects the first available name in this order:

1. The normalized source name.
2. That name, truncated as needed, with ` (source 1)`, ` (source 2)`, and so on.

The recursive candidate selection is **inside the insert statement**, within the
existing atomic D1 page batch. It stops at the first unused owner/name key, including
retired rows as occupied. Concurrent page/grant imports therefore observe serialized
committed name occupancy. They never adopt another row by name or rename it. Existing
source IDs, provenance bindings, local names and retirement tombstones remain intact;
repeated import keeps the initially selected suffix. Independent first imports can
receive different suffix numbers according to committed occupancy; suffixes are not
identity keys.

The actual baseline name limit is **40 Unicode code points** (`http.ts:nameValue`),
which can be 80 JavaScript UTF-16 code units for emoji. Normalization uses the same
trim/NFKC validation as ordinary creation. A bounded 41-prefix table allows SQL to
choose the correct remaining length as the suffix grows. Each key is lowercased in
JavaScript **after** code-point truncation: SQLite `lower()` is ASCII-only and Unicode
lowercasing can expand characters such as `İ`.

The real two-origin test uses source and target `POST /api/owner/agents`, actual
target retirement, three simultaneous owner completions and an overlapping agent
exchange. It checks:

- `Shared name` plus an occupied **retired** `Shared name (source 1)` produces the
  new source ID named `Shared name (source 2)`.
- Source whitespace/fullwidth normalization still collides with the local key.
- Two distinct 40-code-point/80-code-unit names sharing the same truncated prefix
  coexist after collision. Occupied suffixes 1–9 force the 9→10 width change and two
  independent source IDs receive suffixes 10 and 11.
- Unicode case expansion produces the same key as normal creation.
- Every preexisting local row is unchanged, all new IDs have exact source provenance,
  and fresh owner/agent imports repeat with identical names/IDs and no duplicates.

### Introspection: agent scope stays exact

`src/server/preview-source.ts` now rejects any supplied `agentId` different from the
agent-scoped handoff's `row.agent_id`, with `401 preview-scope`. An empty supplied ID
also fails; omission still introspects the handoff's bound authority. Owner scope
continues to validate active roster membership, including rejection after retirement.

The regression makes a **correctly signed request from the registered target**, with
agent A's consumed receipt and active same-owner agent B. Before the fix it returned
200; now it returns 401. Bound A, omitted agent, owner-authorized A/B, missing agent
and owner-roster retirement are checked through actual signed Worker transport.

### Queue admission and capture isolation

The existing bridge gate remains in place. The authenticated target agent test now
posts a valid `/api/queue` request and checks `503 preview-allocation-pending`, zero
queue count before/after, and an idle agent with no request, match or joined-at ticket.

`tests/preview-identity.test.ts` now writes its result and browser image to
`TIM27_IDENTITY_EVIDENCE_DIR`, or by default a UUID-bearing, per-process directory
under ignored `.tim27/runs/`. It creates the directory in `beforeAll`, before the
screenshot. The JSON reporter is an independent Vitest option; point it at the same
new directory rather than any accepted root capture.

## Verification and reproduction

Before changing production code, the focused command reproduced both reported
symptoms (2 failed / 14 skipped):

```sh
node node_modules/vitest/vitest.mjs run tests/preview-identity.test.ts -t 'suffixes real|restricts signed'
```

The retained [red report](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction-red.json) records expected
500→200 and 200→401 assertion failures. This deliberately failing pre-fix evidence
is separate from the final [16-test passing report](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction/identity-vitest.json).

Final capture command used:

```sh
TIM27_IDENTITY_EVIDENCE_DIR=.tim27/identity-correction node node_modules/vitest/vitest.mjs run tests/preview-identity.test.ts --reporter=default --reporter=json --outputFile.json=.tim27/identity-correction/identity-vitest.json
```

For reproduction, use a new unique directory to preserve those accepted captures:

```sh
evidence=".tim27/runs/identity-$(node -p 'crypto.randomUUID()')"
TIM27_IDENTITY_EVIDENCE_DIR="$evidence" node node_modules/vitest/vitest.mjs run tests/preview-identity.test.ts --reporter=default --reporter=json --outputFile.json="$evidence/identity-vitest.json"
```

Also passed:

- **13 regressions** in `tests/platform-repository.test.ts` (11) and
  `tests/worker-errors.test.ts` (2): [report](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction/regressions.json).
- `npm run typecheck`: all three configurations.
- `node_modules/.bin/oxlint --deny-warnings .`: zero errors/warnings.
- Prettier checks of changed TypeScript, docs and new capture/manifest files.
- `git diff --check` and the provenance check below.

All 16 identity tests use real persisted workerd/D1 and locked Better Auth. The
suite still covers browser host-separated cookies, revocation, committed-write
interruptions, concurrent completion, cold restarts and same-incarnation redeploy.
The [result](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction/identity-result.json) and
[Chromium image](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction/identity-browser.png) are new captures.
No paid calls were made. Previously accepted deterministic-game evidence remains
in its original files; those long smoke tests were not rerun for this focused fix.

```sh
node .tim27/identity-correction-provenance.mjs --check
```

This verifies all 17 `.tim27` artifacts tracked by `7f7e447` byte-for-byte, including
the 10 original feasibility artifacts and seven first-identity artifacts. It verifies
the first manifest's 33 hashes against that commit's source or the unchanged locked
installed dependency files. The new [manifest](https://github.com/TimothyKrell/agent-game/blob/1f1177a323c1619766e356543038711524d578e7/.tim27/identity-correction-provenance.json)
pins the corrected implementation and new evidence separately. Neither prior
provenance generator was run.

## Next extension contracts (for parent assignment)

### Trusted lifecycle/controller

The exports and wire format remain the ones documented in
[the identity bridge handoff](TIM-27-identity-bridge.md#trusted-lifecycle-controller-parent-owned-next-integration):

```ts
registerPreviewTarget(sourceEnv, { origin, incarnation, commit, publicKey });
configurePreviewTarget(targetEnv, incarnation, commit, privateKey);
closePreviewTarget(sourceEnv, origin, incarnation);
```

The controller owns its trusted invocation channel, exact HTTPS origin, validated
artifact/revision and source registration. Public key is base64 SPKI DER / private
key base64 PKCS8 DER, ECDSA P-256; preserve incarnation/key on redeploy and tombstone
at source before destruction. Targets use their own auth secret and configured
`PREVIEW_SOURCE_URL`. No public registration route exists. Discovery advertises
identity version 1, `/preview` owner entry and `livePlay: false`.

### Serialized CLI selector/artifacts

`src/shared/preview.ts` defines `PreviewInstallationIntent`: persist the complete
request tuple, verifier, fresh target token, source connection/config identity and
artifact pins before I/O. Agent-scoped handoff and exchange stay exact to that source
competitor. `PreviewArtifacts` keeps trusted executable path/digest separate from
branch archive/rules/skill digests and paths, commit, game and rules version.
`PreviewParticipation` retains these pins and cumulative supervisor-ledger path
through active play. The CLI uses public wakeups plus authenticated HTTP; target
private socket tickets remain denied. Parent serializes this after TIM-30's CLI
delivery/version work.

### Source broker and allocation recovery

`PreviewAllocationIntent` requires stable allocation request ID, target match ID,
exact origin/incarnation/commit, game and exact ticket/request/grant/handoff identity
before source allocation I/O. The broker must recover the same source allocation
receipt after an acknowledgement loss, and revalidate live source authority and
unchanged tickets before the **first** Match initialization after recovery. Distinguish
already initialized matches and resume their existing participation. An agent-scope
receipt can only validate that agent; roster authority requires owner scope.

Keep `preview-allocation-pending` until that allocator/recovery path and shared
source-executed inference accounting are implemented. Preserve TIM-26 priority,
headroom and unknown-cost handling, the existing three slots/$5 daily operating
target and $1.50 reservation, with at most one live-preview allocation globally.
Targets receive no production provider credential or direct inference binding.
Reconcile the actual current shared operating ledger before hosted paid trials;
the old evaluation balance does not create a new approval requirement. Broker work
begins only after parent reviews this correction and assigns the next slice.
