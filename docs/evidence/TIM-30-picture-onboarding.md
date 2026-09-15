# TIM-30 — optional picture onboarding for connected competitors

Implemented in the exclusive `feat/tim-30-picture-onboarding` worktree from `7233eb6`, against the integrated [TIM-28 picture contract](TIM-28-agent-pictures.md). Verification is local: installed dependency-free npm archives, HTTP contract fixtures, real local Worker/D1/R2 picture requests, both game engines, and existing supervisor/native-harness fixtures. No hosted agent, image-generation service, paid inference, deployment or source-arena image import was used.

## Connection and offer contract

`setup` and `connections` add an exact, shell-quoted `connectCommand` alongside the existing `startCommand`. `connect` performs the existing pairing exchange and authority/queue checks but leaves an idle competitor ready before joining. Its ready JSON adds:

```json
{
  "status": "ready",
  "agentId": "agent_tim30",
  "picture": {
    "state": "missing",
    "revision": 0,
    "optional": true,
    "askOwner": true,
    "choice": "offered"
  }
}
```

`picture` is either validated TIM-28 `missing`/`present` metadata or an explicit `unavailable` state with a nonblocking explanation. An existing image produces `askOwner:false`. Unavailable routes (including old-server 404 and picture-specific 401), malformed/big/inconsistent responses, and failed choice storage leave connection readiness intact. The normal queue authority request remains authoritative: this does not turn a revoked connection into an approved connection.

The installed skill reads `picture-help` only for the `ready`/`askOwner:true` branch or an explicit later picture request. It offers:

- an owner-provided local PNG/JPEG;
- a local file created using image tools the agent already has, with owner agreement;
- skip (the default), remembered for later sessions.

The offer does not wait for a human response, tool availability or upload before `start`. A later picture reply is handled after the match. Missing tools, decline or failure lead to skip and continued play. The app provides no generator, URL-fetch upload or house-provider call. The connect UI explains the choices and links to `/dashboard#competitors`, where TIM-28's owner control already lives.

`start` still pairs/joins/resumes immediately, preserving existing automation. Pairing/queue/observation/action/history stdout envelopes retain their previous fields. The additional ready lifecycle belongs to the new `connect` command. `connect` returns the existing queue status when already queued/starting/matched; it performs no picture lookup there. It rechecks idle status after its optional metadata read, suppressing the offer if admission raced the read. Supervised children bypass connection setup via the skill's existing explicit-config branch, and the child-deadline environment suppresses any accidental offer. Gameplay, mandatory action priority, recent-context delivery, wait loops, receipts, takeover, protocol identities and supervisor allowances remain covered by serial regressions.

## Exact commands and binary boundary

Use the installed absolute CLI path and the same `--config` for every command. [`help`](../../../.tim30/help.txt) and [`picture-help`](../../../.tim30/picture-help.json) are captured directly from this CLI. Examples abbreviate that executable:

```sh
agent-game connect --config '/absolute/connection.json'
agent-game picture-status --config '/absolute/connection.json'
agent-game picture-skip --config '/absolute/connection.json'
agent-game picture-upload --file '/local/owner-or-tool-output.png' --config '/absolute/connection.json'
agent-game picture-upload --file '/local/owner-or-tool-output.jpg' --request-id 'deliberate-change-0001' --config '/absolute/connection.json'
agent-game picture-remove --config '/absolute/connection.json'
agent-game picture-retry --config '/absolute/connection.json'
agent-game picture-retry --request-id 'deliberate-change-0001' --config '/absolute/connection.json'
```

- `picture-status` reads current metadata. It never claims availability or generates an offer merely because a profile omitted its optional field.
- `picture-upload` reads a regular local file, bounds both fstat and the actual read to **2 MiB**, and identifies PNG/JPEG by magic bytes, not extension. FIFO/non-file paths cannot create an unbounded read. Full raster/dimension validation remains TIM-28's server responsibility.
- Upload sends raw bytes to the configured arena's `/api/agents/<stable-agentId>/picture`, with the saved bearer, exact PNG/JPEG Content-Type, quoted `If-Match: "<revision>"`, and an 8–128 character alphanumeric/underscore/hyphen `Idempotency-Key`. Removal sends DELETE without a body or content type. Both sources use the same command and authenticated endpoint. No game/protocol header or pairing exchange is added to picture writes.
- The dependency-free `cli/picture.mjs` parser mirrors the shared `AgentPicture` type (`cli/picture.d.mts` references it for source type checking). It bounds response bytes to 8 KiB, checks state, safe nonnegative revision, same-agent relative version URL, content type, 1–2048 pixel dimensions, byte count from 1 byte through 2 MiB and matching quoted ETag. A write receipt must be exactly the saved revision plus one and have the operation's expected state. Extra response fields are omitted, redirects are rejected, and server error text is not echoed.
- GET uses a 1.5-second deadline and no automatic retries. Optional command failures return JSON `optional:true` with `status:unavailable` or `uncertain`; they do not require installation repair or stop gameplay. Origin/config violations retain the existing hard error. Ordinary queue, current, action and history transports are unchanged.

## Durable retry journal

The journal is version **1** and installation-scoped at `<absolute-config-path>.pictures/`. An exclusive recoverable PID lock serializes picture mutations. Each `<request-id>.json` stores this complete request proof before the first write is sent:

| Field                              | Meaning                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `version`                          | `1`, local journal schema                                                                                       |
| `connection`                       | SHA-256 of the existing connection identity tuple (server, token, stable agent, grant); no plaintext credential |
| `server`, `agentId`, `path`        | Frozen destination identity, checked against the current config on retry                                        |
| `method`, `requestId`, `revision`  | Exact PUT/DELETE, idempotency key and original optimistic precondition                                          |
| `contentType`, `payload`, `sha256` | PUT only: validated MIME, complete base64 file bytes and SHA-256 byte digest                                    |
| `status`                           | `pending`, `received`, or `rejected`                                                                            |

Files are mode 0600, the journal directory is 0700, and temp-file content plus containing-directory renames are fsynced. `pending.json` points to an unresolved request. A new operation is refused while that pointer is unresolved; `picture-retry` without an ID selects it. Received/rejected completion clears only its own pointer. The existing game action/current/supervisor ledgers are separate and retain their semantics.

A fresh CLI process can reconcile a lost response after the original source file changes or disappears: `picture-retry` uses the stored original bytes, type, revision, endpoint and ID. Repeating `picture-upload --request-id <same-id> --file <path>` additionally checks that the supplied file still matches; changed bytes are refused. Corrupt byte proofs and mismatched arena/agent/connection identities are refused before a retry request. No caller-supplied filename is interpolated into a shell or used as the journal destination.

A successful retry may return an old immutable receipt. Every successful write/retry follows it with a current GET and returns both `receipt` and `picture`; use `picture` for the current image. If that read is unavailable, the CLI says so instead of promoting the receipt to current state. `409` key reuse and `412` stale precondition are rejected operations: read status, then make a new deliberate change with a new ID. There is no automatic refresh-and-overwrite retry. An invalid successful response remains uncertain so its original request proof can be reconciled.

Completed journals retain their byte proofs for explicit later receipt retries. This implementation has no automatic pruning; deleting one deliberately relinquishes its local retry proof. Journal versions other than 1 are refused rather than migrated speculatively. Picture journals and choice files contain no bearer token, model/harness identity, match knowledge or controller facts.

## Stable choice lineage and TIM-27 seam

Choice records are mode-0600 version-1 JSON at `~/.agent-game/picture-choices/<sha256(source-identity)>.json`. By default source identity is the canonical configured arena origin plus stable `agentId` (globally unique within that arena and already owner-bound). It excludes match, model, harness, controller and grant IDs. Re-pairing the same stable competitor on this machine reuses its choice. The offer is claimed durably before output; an output-losing crash can suppress a second offer, while explicit commands remain discoverable.

TIM-27 can persist an explicit source lineage through setup:

```sh
agent-game setup --server 'https://preview.example' --harness opencode \
  --picture-source-server 'https://source.example' \
  --picture-source-agent 'agent_stable_source'
```

Both flags are required together. The resulting config field is `pictureSource: { server: <canonical-source-origin>, agentId: <stable-source-agent-id> }`; repeated setup preserves it. Only the choice lookup uses this field. All metadata reads and uploads continue using this config's arena, agent and bearer. The local preview image intentionally starts missing; source URLs, image revisions, image bytes, receipts and credentials are never imported. A persisted `offered`/`skipped`/`present`/`uploaded`/`removed` choice suppresses offers across preview configs that share this explicit lineage. A future selector should reuse the trusted source identity (or carry the existing lineage onward), not derive it from a preview slug, display name or model. This also allows return to the source connection without changing its config or re-pairing it.

**Remaining integration/acceptance:** TIM-27 owns trusted preview selection, bridge/ticket issuance, rules-version acceptance and automatic propagation of this lineage when registering preview connections. This slice does not implement those flows, image transfer, remote-installation choice synchronization, or credential reuse across origins. The parent owns CLI archive version/release selection; package version, lockfile, dependencies and packaging code were not changed here. The newly built local archive retains source version `0.2.0` for verification. A published version and served instructions must be coordinated by the parent before hosted acceptance. Existing installations retain their pairing; this feature adds no per-preview reinstall or manual re-pair requirement.

## Verification and retained evidence

Reproduce sequentially with `bash .tim30/verify.sh`. It builds first (the real Worker fixture uses built assets), installs archives outside the checkout, runs tests serially to avoid the prior packaging/fixture interference, and captures static checks. Local logs are ignored `*.log`; retained fixtures and help/package captures contain no credentials.

| Check                                                                                             | Result                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/cli-picture.test.ts tests/cli-picture-worker.test.ts --no-file-parallelism` | 18 cases: installed OpenCode/Claude × protocol 1/2 connection paths, one-time missing/existing/skipped offers, missing-tool guidance, API/local failures, changed-file and corrupted-proof guards, stale/conflicting receipts, admission race, isolated preview/source return, required observe/wait, and real Worker PNG/JPEG/removal |
| Existing CLI/supervisor files, command in `.tim30/verify.sh`, serial                              | 68 cases passed, including complete real Worker play for both games, installed immutable 0.1.1 compatibility, installed two-act engine, delivered-context-before-speech, takeover/current/receipt fences, and synthetic native OpenCode/Claude invocation accounting/deadlines                                                         |
| `npm run typecheck`, `npm run lint`, `npm run build`, scoped Prettier, `git diff --check`         | Passed                                                                                                                                                                                                                                                                                                                                 |
| `node .tim30/package-evidence.mjs`                                                                | Dependency-free archive includes picture transport and installed skill; no TIM-30/TIM-28 fixtures or test files are packaged                                                                                                                                                                                                           |

The original Worker regression prints missing-ASSETS root-probe and Miniflare broken-pipe diagnostics; its game assertions pass. TIM-30's real picture Worker run uses TIM-28's existing fixture/config with a fresh storage directory and port **6303**. The HTTP contract/preview fixtures use **6301/6302** and are closed after every case. Existing regression fixtures retain their ephemeral ports. The PNG is TIM-28's validated one-pixel fixture; the JPEG is its retained 8×8 fixture, copied to a local path to represent external-tool output. Neither fixture claims an actual image-generation tool was invoked.

Hosted OpenCode/Claude conversational adherence to the offer, actual owner-supplied file UX in those chats, availability/failure behavior of real external image tools, and end-to-end hosted preview lineage remain acceptance gaps for the parent/TIM-27. No actual-agent claim is made from scripted fixtures. The retained 20-scenario/36-term guide and its production exclusion remain unchanged.
