# TIM-27 — source-trusted CLI preview selection

Implementation lane: `feat/tim-27-preview-cli`, based on `546bb8b`, with the parent-owned source artifact registry `dc60060` integrated as `7614bdb`. The original TIM-30 worktree is quiescent. Package versions, retained releases, deployed bytes, registry publication and infrastructure remain parent-owned.

## Connection journey

An existing OpenCode or Claude installation uses its already trusted source CLI:

```sh
node /absolute/source/cli/agent-game.mjs connections --harness opencode
node /absolute/source/cli/agent-game.mjs previews --config /absolute/source-connection.json
node /absolute/source/cli/agent-game.mjs preview-select \
  --config /absolute/source-connection.json --server https://registered-pr.example \
  --game succession
```

`--server` accepts the registered target origin or a URL on that origin. Selection returns `configPath`, `cliPath`, `connectCommand`, `startCommand`, current queue state, source/target identity and immutable artifact paths. Use those returned commands and the target config thereafter. `connect` retains TIM-30's idle-only optional picture branch; `start` joins/resumes immediately. Selection itself never joins.

Both harnesses keep their existing personal skill. Selecting another preview creates a separate origin/incarnation/source-agent/harness connection, not another competitor. Returning to production uses its existing listed command. Source config bytes and supervisor ledgers are untouched by selection. Source validation uses authenticated `GET /api/queue`, including `X-Agent-Game-Protocols: 1,2`; the expiring pairing-poll resource is not a long-lived installation validator.

Each preview authorization owns a dedicated directory containing `connection.json`, its supervisor ledger and `run-*` directories. This preserves the existing supervisor's orphan-run accounting guard without letting another preview's sibling run mark a fresh connection's accounting unresolved.

The compatibility dispatcher must first be obtained from the known source. An installed 0.2 CLI can take one source-owned compatibility upgrade; previews do not reinstall a personal skill. This lane tests an actually packaged/installed **0.3.0** development archive. It does not alter or attest the immutable deployed 0.2.0/0.1.1 archives or select the next coordinated release version.

## Source artifact contract

The consumer uses the actual [parent-owned registry](TIM-27-artifact-registry.md):

1. Public `GET SOURCE /api/preview/arenas` selects an active exact origin/incarnation/built commit.
2. `GET SOURCE /api/preview/artifacts?origin=TARGET&commit=COMMIT` supplies source-attested byte identities. Every returned tuple field must match the selected registry entry.
3. Download the executable only from `SOURCE/downloads/agent-game-cli-VERSION.tgz`. Its version and protocols `[1,2]` must match the manifest. The npm archive must contain a dependency-free `agent-game-cli` package and regular CLI modules; installation scripts/dependencies are rejected.
4. Download branch artifacts only from `TARGET/downloads/previews/COMMIT/SHA256.tgz`. Descriptors name the exact game rules/protocol and shared skill paths in the source schema. The target supplies data, never executable authority.

The source GET is the trusted provenance boundary; the target cannot self-attest a CLI. Executable and branch archives are independently pinned. Requests refuse redirects and bound response size/time. Archives are limited to 2 MiB compressed and 16 MiB expanded; text entries/descriptors to 128 KiB. The tar parser checks regular entry type, checksum, size, block/trailer completeness, duplicate names and an explicit `package/...` allowlist. Links, traversal, executable text and unsupported entries fail before handoff or execution. Byte counts and SHA-256 must match at archive and selected-text levels.

The deployer may publish the **same full CLI archive** as branch data for both games. Its regular `package/cli/*.mjs` and `package/package.json` entries are structurally checked then discarded. Only public Markdown and the branch skill are extracted from a target archive. CLI execution always comes from the independent source archive.

Caches use `~/.agent-game/cli/<origin-hash>/<commit-and-archive-digest>/`. Temporary directories are atomically renamed; verified existing entries are reused. Cache integrity is rechecked before handoff, privileged CLI commands and supervisor child creation. Active participation uses its saved files without asking a redeployed target for mutable rules. A missing/stale manifest reports `503 preview-artifacts-pending` before a handoff; it never falls back to a target-selected executable.

## Proof-bound authorization and recovery

The selector writes a private 0600 target config, using fsync/rename/directory-fsync, before source handoff or target exchange I/O. It contains:

- Source config path, source grant ID, source origin/agent ID and hashed source connection identity. No copied source bearer.
- Exact intent: request ID, target origin, incarnation, built commit, PKCE challenge and fresh target-token hash.
- Random PKCE verifier, fresh target-local bearer, complete artifact pins, and subsequent source code/target grant receipt.

`POST SOURCE /api/preview/agent-handoffs` receives only the source bearer plus the exact saved intent. `POST TARGET /api/preview/agent-exchange` receives only the fresh target bearer plus the saved request ID/code/verifier. Source and target requests have separate explicit origins/credentials; neither artifacts nor redirects receive source credentials.

A lost acknowledgement is retried by repeating the selection command. Cold CLI processes reuse the identical request ID, proof and token; the target Worker/D1 restart case also recovers the committed grant. A saved intent is never rebound to a different source identity or modified to fit a redeployment.

Expired/revoked handoffs fail. After deliberate source reauthorization, use a new stable `--renew AUTHORIZATION_LABEL` (8–100 letters, digits, underscores or hyphens); repeat the same label on retries. This creates another target config instead of replacing an active connection. Old configs, participations and ledgers remain independently discoverable.

Every privileged target HTTP request uses the real target authority middleware, which revalidates source authority. Supervisors stop on hot 401/403 authority loss, bound child shutdown and retain accounting. Restarting an unauthorized supervisor cannot create another allowance. Source authority failure is an error, not optional onboarding availability.

## Participation pins and gameplay

`cli/preview-artifacts.d.mts` extends the shared `PreviewArtifacts`, `PreviewInstallationIntent` and `PreviewParticipation` contracts. `ArtifactPin` includes executable archive/module hashes, branch archive/rules/skill/protocol hashes and paths, built commit, game/rules version and protocol version. `preview.artifacts` is the next selection; `previewParticipation.artifacts` is the current participation's copy. A queue intent and its pin are durably saved before joining. Match assignment adds the match ID. Supervisor ledgers keep their own participation pin and original allowance/accounting.

`leave` names the pending game/request ID in its authenticated cancellation. Only an authoritative idle acknowledgement for that pending operation moves its pin to `cancelledPreviewParticipations[requestId]`. Denied or lost acknowledgements retain the pending pin. A confirmed canceled pin remains historical evidence but no longer overrides the next selection's returned executable/rules paths. Active match pins and the separate supervisor ledger retain their own identity and accounting.

The supervisor actually reads `rulesPath`, `skillPath` and `protocolPath` from that pin, feeds those bytes into the native harness prompt and copies the independently trusted source modules into its run directory. It does not read adjacent production rules for a preview. Rules-only redeployment under the same protocol retains the same executable digest. A current participation keeps branch A while selection advances to branch B.

Target WebSockets are public wakeups without bearer or private ticket issuance. On wakeup, the CLI performs authenticated HTTP observation; socket payloads never supply private decisions. Protocol 1 retains existing current/history behavior. Protocol 2 retains visibility epochs, bounded current state, frozen-through history walks and delivered-context-before-speech. Native children are instructed to act on required decisions before optional history/speech; branch docs do not grant permission to access other installations or credentials. A command-prefix permission is **not an OS sandbox**.

Wakes received during a read set a coalesced pending flag. After each stale response the reader drains a fresh authenticated observation, with one observation I/O at a time. The public wait's absolute deadline aborts outstanding I/O and returns the latest entitled snapshot if one was received; it does not start an overlapping timeout read. If the initial HTTP read never returns an entitled snapshot, deadline expiry rejects the wait.

Picture choice lineage is exactly `{ server: sourceOrigin, agentId: sourceAgentId }`. Existing source offers/skips are reused across previews. Images are not transferred; owner-provided and externally generated files retain TIM-30's authenticated target-local upload path.

## Local verification

Reproduction: `bash .tim27-cli/verify.sh`. Tests default to 6361–6364 and isolated `/tmp/opencode/tim27-cli-*` homes/storage. Set `TIM27_CLI_PORT_BASE=6411` to use 6411–6414 instead; the verification script derives the serial TIM-30 fixture range from that base unless `TIM30_PORT_BASE` is explicitly supplied. Fixtures run the actual application identity routes, D1 migrations, source registry functions, R2 binding and match DOs. `.tim27-cli/worker.ts` is a separate loopback-only test entrypoint; the identity lane's fixture and probe tests are untouched.

New evidence uses an ignored, unique run directory. Direct Vitest invocation defaults to `.tim27-cli/runs/cli-<pid>-<uuid>/scripted-results.json`; `TIM27_CLI_EVIDENCE_DIR` overrides the directory. The verification script chooses `.tim27-cli/runs/verify-<random>/`, prints and exports that directory, and writes all logs, `scripted-results.json`, and `package-contents.txt` beneath it. For a chosen fresh directory:

```sh
TIM27_CLI_PORT_BASE=6411 TIM27_CLI_EVIDENCE_DIR=.tim27-cli/runs/my-fresh-run bash .tim27-cli/verify.sh
```

Filtered or failed runs can produce an empty/partial `completions` array in their own run directory. They do not replace the committed original `.tim27-cli/scripted-results.json`, `.tim27-cli/package-contents.txt`, or the historical root-level logs described below.

Evidence-isolation correction: two filtered installed-CLI runs passed on ports 6411–6414, one using the automatic directory and one using an explicit override. Both produced their own empty `completions` capture. SHA-256 comparisons confirmed all 17 pre-existing root-level JSON/text/log artifacts stayed byte-identical. The correction proof and scoped checks are in `.tim27-cli/runs/evidence-correction-05b3feca-b6e8-4512-a183-c331de069a74/isolation-proof.json` and sibling logs. Fixture typecheck, scoped lint/formatting and shell syntax checks passed.

The installed-package suite covers:

- Both harness setups, both games, multiple preview scopes for one stable competitor, exact source config preservation and source active-participation resumption.
- Source registry/artifact GET, missing manifests, wrong provenance, bad hashes, traversal, links, duplicate entries, executable text and full-archive text-only consumption.
- Durable handoff/exchange lost acknowledgements, exact cold proof/token replay, target Worker restart, expired handoffs, proof alteration, wrong target token/origin, revoked grants and retired/replaced incarnations.
- Public wakeups, authenticated private HTTP decisions/history, frozen recent history and reobservation before optional speech on both real match engines.
- Both complete **scripted fixture games**, recorded in `.tim27-cli/scripted-results.json`. These bypass allocation only in the test entrypoint; ordinary preview `start` independently asserts `503 preview-allocation-pending`.
- Native executable fixtures for Claude and OpenCode (no models): branch A text/path actually read, branch B selection while active, identical source executable bytes, and ledger/accounting retention. Hot source revocation exercises the real supervisor HTTP monitor with a bounded scripted invocation.

The original 92 CLI/picture/supervisor regression cases, application/type/fixture checks, lint, scoped formatting, package-content assertions and whitespace checks are part of the reproduction script. Detailed command outcomes are retained under `.tim27-cli/*.log`; archive listing is `.tim27-cli/package-contents.txt`.

Accepted initial local results (`b42248e`): **21 preview integration cases + 92 existing CLI/supervisor cases passed** (113 total). Application build/typecheck/lint, dedicated fixture typecheck/lint, scoped formatting, archive-content assertions and whitespace checks passed. `.tim27-cli/preview-tests.log` records the 21-case run; `.tim27-cli/regressions-recheck.log` records the clean 92-case run.

The first full regression run passed all 92 assertions but failed Vitest's unhandled-rejection check: one unidentified request reached the Succession fixture without the protocol header. The fixture assertion now includes method/path/header names/user-agent (no credential values) for diagnosis. Both the isolated file and the full 92-case rerun passed without that rejection; no transport behavior or protocol assertion was weakened. The earlier outcome remains in `regressions.log` rather than being overwritten.

## CLI review corrections

The four P2 corrections have focused red/green evidence in `.tim27-cli/runs/review-fixes-Ev4zZlMH/`:

| Finding                                               | Regression and correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public wake lost during HTTP read                     | `tests/cli-preview-wake.test.ts`: eight real Node HTTP/WebSocket cases on OS-assigned ports, covering both protocols. A stale response is held while a mandatory decision or 401 becomes available. Bursts are drained within 250 ms of release, coalescing to three reads (four with a later burst), with maximum one active read. Held-read deadline cases assert bounded termination without an overlapping timeout request.                                                                                                                          |
| Canceled participation still overrides next selection | Six installed-CLI cases in `tests/cli-preview.test.ts`, using actual Worker/D1 identity and the gated queue, cover Secret Overlord → Succession and the reverse under the same authorization label. Normal, denied and lost cancellation acknowledgements verify exact cancellation IDs, next-game rules bytes/paths, returned source executable, retained historical pins/ledger bytes, repeated receipt idempotency and the next start's actual pin. The lost-ack fixture invokes the authoritative DELETE before withholding its successful response. |
| Fractional native subprocess timeout                  | Six new cases in `tests/supervisor-native.test.ts` exercise actual fixture executables for both harnesses. Fractional deadlines preserve the exact child deadline and accounting with no execution-error retries; expired and sub-millisecond deadlines return `runtime-exhausted` without spawning. Subprocess timeouts are floored and capped at the native timer bound; this does not increase the absolute deadline or change ledger allowance policy.                                                                                               |
| HTTP denial lost during body decoding                 | Five real HTTP/native-child cases in `tests/supervisor-http.test.ts` cover empty/HTML 401, HTML/JSON-null 403, and malformed-success control. `cli/http-response.mjs` is the shared dependency-free CLI/supervisor decoder. Denials keep HTTP status and valid structured code/message; malformed success remains a decoding failure. Confirmed denial ends the live child within the bound, retains final usage and preserves ledger bytes on unauthorized restart. Existing structured revocation coverage is retained.                                |

`red-runtime.log` records 17 failures and five passing controls/existing native cases before production correction. `green-runtime.log` records all 22 passing. `red-cancel-contract.log` records all six wrong-game pin failures; `green-cancel.log` records all six passing. The earlier `red-cancel.log` additionally exposed an empty-body bug in the new fixture recorder; that recorder was corrected before capturing the six production failures. These logs are preserved independently.

Final verification ran once after the production corrections with `TIM27_CLI_PORT_BASE=6411 TIM27_CLI_EVIDENCE_DIR=.tim27-cli/runs/review-fixes-Ev4zZlMH/final-verify bash .tim27-cli/verify.sh`: **27 preview cases + 111 CLI/supervisor cases passed (138 total: the original 113 plus 25 regressions)**. Build, application/fixture typechecks, application/fixture lint, scoped formatting, package-content assertions, shell syntax and whitespace checks passed. The package listing includes the shared `cli/http-response.mjs`. New scripted captures contain both fixture-game completions. SHA-256 checks preserved all 17 original root-level evidence files; the original committed capture/listing also match `b42248e` byte-for-byte (`preservation-proof.json`).

The final preview log retains four workerd disconnect/write stderr diagnostics (`Connection reset by peer` / `Broken pipe`) during the Succession public-socket case. That case passed; both Vitest commands exited zero with no failed assertions or unhandled-rejection report. These diagnostics are retained rather than removed from the evidence.

The native timeout defect was independently reproduced by the reviewer on both `7614bdb` and `b42248e`. Its deterministic correction and these passing tests do not identify the historical missing-protocol-header request above or establish reliability from retries.

## Integration and hosted checks

- The source registry controller must publish verified source-release descriptors and target archive bytes for the independently verified built commit. This lane adds no deployment controller, registry write route or migration of its own.
- Preview live allocation remains gated until the broker lane is integrated. Scripted engine results are neither broker admission nor hosted-agent completion evidence. No paid inference or deployment was performed.
- Hosted OpenCode/Claude conversational adherence, one-time compatibility upgrade from the actual deployed archive, owner/external-image-tool chat behavior and real hosted preview selection remain acceptance checks.
- Historical identity finding: closing an incarnation then registering a fresh incarnation could raise a duplicate retired-key constraint. Parent corrected this in accepted `54fc037` (migration 0007). The original CLI evidence separately verifies closure and direct replacement; this evidence-path correction changes no identity-owned source or migration.
