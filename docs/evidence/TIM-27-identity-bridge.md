# TIM-27 — local source/target identity bridge

**Scope:** first implementation after `2066abd`, contract correction `a104f60`.
Implementation baseline remains `73ca5627bfcd1a699650cd77d9c4e887a475ab06`; parent-owned
TIM-28/TIM-11/TIM-18 integration at `7233eb6` has not been rebased into this worktree.
This is local implementation evidence, not hosted acceptance or paid-game evidence.

**Post-review correction:** [name collisions, exact-agent scope and immutable test
captures](TIM-27-identity-correction.md) documents the follow-up on `7f7e447`. The
current suite has 16 tests; the original 14-test results and screenshot below remain
immutable evidence of that first implementation.

## Delivered boundary

- Source registry, signed target transport, narrow owner/agent handoffs, durable
  proof-bound receipts, paginated metadata and live authority introspection.
- Target insert-only identity import, independent Better Auth users/sessions, fresh
  agent grants, encrypted write-ahead correlation and atomic authority lineage.
- Target-only Better Auth middleware gates **all enabled library routes**, including
  session listing/revocation. Unneeded sign-in/account/user endpoints are disabled on
  targets. Source-mode authentication keeps its existing providers and route behavior.
- Minimal `/preview`, source `/preview/continue` and target `/preview/return` HTTP
  pages exercise browser cookies without touching `main.tsx`, global CSS or the owner
  image/upload UI.
- Preview owner-approved pairing stores its source-session lineage with the grant;
  polling and subsequent agent HTTP authorization recheck that authority.
- New preview queue admission returns `503 preview-allocation-pending`. This prevents
  the current asynchronous allocator/recovery path from bypassing source authority
  before the shared broker slice lands. Target private socket tickets and ticket-bearing
  event connections return 403; public event transport and authenticated HTTP remain
  the intended next-CLI transport. Normal non-bridge queues/sockets keep their paths.

There are no CLI/setup/supervisor changes. TIM-30 owns those files until parent
serialization. There are no Match DO/history edits; TIM-23 owns that separate slice.

## Files and interfaces

| Boundary                                | Files                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Wire/CLI/allocation contracts           | `src/shared/preview.ts`                                                      |
| Trusted registration/configuration      | `src/server/preview-config.ts`                                               |
| Bounded signed transport                | `src/server/preview-transport.ts`                                            |
| Source authority and metadata           | `src/server/preview-source.ts`                                               |
| Local identity import                   | `src/server/preview-import.ts`                                               |
| Target start and agent completion       | `src/server/preview-target.ts`                                               |
| Better Auth completion/middleware       | `src/server/preview-auth.ts`                                                 |
| Application/derived grant introspection | `src/server/preview-authority.ts`, small `auth.ts`/`pairing.ts` integrations |
| Continuation pages and dispatch         | `src/server/preview-pages.ts`, small `worker.ts` integrations                |
| Additive migration                      | `migrations/0004_preview_identity.sql`                                       |

`0003_*` remains reserved for TIM-28. `0004` adds independent bridge tables and one
supported Better Auth session additional field, `preview_request_id`, with a unique
index and insertion guard. It does not modify owner/profile/media schema or ratings.

### Trusted lifecycle controller (parent-owned next integration)

The narrow interfaces are exported functions, **not public registration routes**:

```ts
registerPreviewTarget(sourceEnv, { origin, incarnation, commit, publicKey });
configurePreviewTarget(targetEnv, incarnation, commit, privateKey);
closePreviewTarget(sourceEnv, origin, incarnation);
```

- Keys are ECDSA P-256: public key base64 SPKI DER; private key base64 PKCS8 DER.
- `origin` is an exact HTTPS origin with no trailing path/slash/userinfo. HTTP is
  accepted only for loopback in `ENVIRONMENT=development`.
- Incarnation: 8–100 URL-safe identifier characters. Commit: 40- or 64-character
  lowercase hexadecimal full revision. Registry replacement/closure creates an
  irreversible incarnation tombstone; reusing that retired incarnation is rejected.
- Parent's trusted default-branch controller must provide the privileged invocation
  channel, verify the PR artifact and actual revision before registration, retain its
  PR/artifact provenance, publish the returned owner-entry link and close source
  registration before resource destruction. None of those functions is reachable
  through application HTTP. The fixture's `/fixture/*` controls exist only in the test
  entrypoint and must never be deployed.
- Target runtime has `PREVIEW_SOURCE_URL` set to the trusted source origin and its own
  `BETTER_AUTH_SECRET`; source leaves `PREVIEW_SOURCE_URL` empty. Target private key
  and completion secrets are encrypted in target D1 using that target auth secret.
  Source authorization codes are encrypted using the source auth secret for lost-ack
  retries. No source bearer, OAuth tokens/accounts, provider credential or production
  resource binding is transferred.
- The small existing `wrangler.jsonc` delta adds that empty variable and Worker-first
  `/preview` paths. `worker-configuration.d.ts` was generated with locked Wrangler.
  Parent must serialize these hunks with its current R2/infra changes and perform the
  equivalent Alchemy configuration; this work makes no Alchemy/CI/resource changes.

The target's actual configured commit is attached server-side to redemption and must
match the source registry. A stale target runtime cannot redeem a code just because
the registry was advanced first. Existing authorities survive same-incarnation
redeploy. Consumed-code recovery can use the current deployed commit; an **unconsumed**
code must also match its originally authorized commit.

### HTTP contract, identity version 1

All bodies are JSON. Request/response schemas are in `src/shared/preview.ts`.

| Endpoint                                  | Caller and contract                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source `GET /api/preview/arenas`          | Public bounded discovery array (max 100): origin, incarnation, commit, `identityVersion: 1`, `ownerEntryUrl`, `livePlay: false`. Owner entry is `/preview`.                                                                                                                             |
| Target `POST /api/preview/owner-start`    | Exact Origin; `{requestId, browserProof}`. Browser writes both to session storage before I/O. Target persists encrypted verifier/token before contacting source; returns `{requestId, continueUrl}` and host-only HttpOnly/Lax browser-proof cookie.                                    |
| Source `POST /api/preview/requests`       | Target-signed `PreviewIntent`, owner scope, no token hash. Creates a ten-minute authorization request.                                                                                                                                                                                  |
| Source `POST /api/preview/owner-handoffs` | Source owner cookie + exact source Origin; `{requestId}`. Binds the exact current source session and returns `{requestId, code, returnUrl}`. GET navigation alone grants nothing.                                                                                                       |
| Source `POST /api/preview/agent-handoffs` | Existing source bearer; `PreviewIntent` with independent verifier challenge and target token hash. Binds the exact source grant/owner/competitor.                                                                                                                                       |
| Source `POST /api/preview/redeem`         | Target-signed `{requestId, code, verifier, commit}`. Returns version-1 receipt: owner public metadata, scope (`owner` or `agent`), optional bound agent ID, authority expiry and bound target token hash.                                                                               |
| Source `POST /api/preview/metadata`       | Target-signed `{requestId, after?}` for a redeemed, currently active authority. Version-1 pages of at most 25 competitors plus next cursor; agent scope exposes only its bound competitor.                                                                                              |
| Source `POST /api/preview/introspect`     | Target-signed `{requestId, agentId?}`. Requires consumed receipt and active registry/source session or grant. An agent-scoped handoff only authorizes its exact bound agent; owner scope permits active members of that owner's roster. Returns `{active: true, expiresAt}` or rejects. |
| Target `POST /api/auth/preview/complete`  | Exact Origin, initiating-browser cookie, `{requestId, code}`. Worker bounds body to 4 KiB; Better Auth plugin redeems, imports and commits lineage before setting the session cookie. Response contains no bearer token.                                                                |
| Target `POST /api/preview/agent-exchange` | New target bearer in Authorization, `{requestId, code, verifier}`. Raw target credential is checked against the source-bound hash; source sees only that hash. Returns local `{connectionId, agentId, expiresAt}`.                                                                      |

Signed envelope: `{origin, incarnation, at, nonce, payload, signature}`. `payload` is
the exact serialized JSON request. Signature is base64 IEEE-P1363 ECDSA/SHA-256 over
UTF-8 JSON of this fixed-order array:

```text
[1, "POST", exactSourceOrigin, path, targetOrigin, incarnation, at, nonce, payload]
```

`at` is integer milliseconds; maximum age is 60 seconds and future skew five seconds.
The source atomically inserts a unique nonce receipt before executing the request.
Verifier and code each have 256 random bits, base64url without padding. Verifier
challenge uses RFC 7636 S256 (`BASE64URL(SHA256(verifier))`); credential/code storage
hashes use lowercase hexadecimal SHA-256. These are independent secrets.

Workers use `redirect: 'manual'` and reject every non-success response, including all
redirects. Source calls have an eight-second deadline, a 32 KiB signed-request limit
and 64 KiB response limit. Browser calls use `redirect: 'error'`. Direct D1 reads use
the primary binding (no Sessions API/read-replica cache); privileged use has no
positive cross-request authority cache.

### Durability and revocation

1. Browser request identity and proof are stable before the first request; the next
   CLI's typed contract requires the equivalent complete write-ahead tuple. Source
   issuance persists its encrypted code; retrying identical issuance cannot change
   owner, grant, scope, target, revision, token hash or verifier challenge.
2. Unused codes expire after 60 seconds. Source consumption is conditional on expiry
   and registered incarnation/commit. A consumed receipt can be recovered for ten
   minutes, only with the same code/verifier and authenticated target, while source
   authority remains active. Recovery never extends authority.
3. Owner start persists an encrypted **preallocated target session token**. Better
   Auth 1.7.3 `createSession(..., override, true)` supports overriding `token` but
   strips an overridden ID. Retry therefore finds the actual library session by
   token. `previewRequestId` is a supported, client-non-input additional field.
4. D1 uniqueness prevents two sessions for one intent. A database trigger rejects
   inserting a session for an already committed intent, closing the stale concurrent
   completion / intervening sign-out resurrection race. Session lineage and
   `session_committed=1` commit together **before** any cookie. An interrupted
   pre-lineage session remains unusable through target middleware and is recoverable
   by the saved token; it is not treated as an authorized local session.
5. Grant and lineage insertion are a single D1 batch with a stable local grant ID.
   Retrying a locally revoked grant/session cannot recreate authority. Owner-approved
   target pairing includes source owner-session lineage in that same issuance batch.
6. Source revocation is checked on every privileged target auth/application request.
   The plugin covers `get-session`, `list-sessions`, the three session-revocation
   routes and `sign-out`; other target auth endpoints are disabled. Thus an old
   revoked-source cookie cannot list or revoke a newer source-authorized target
   session. Local source outage fails closed; restart restores still-live authority.

No distributed transaction is claimed. Source authorization linearizes at its current
authority read; an already in-flight authorized operation may finish concurrently
with revocation. Subsequent requests revalidate. Lifecycle cleanup must retain
committed-intent/lineage tombstones for the receipt lifetime, and can remove expired
unbound sessions by `session.preview_request_id`/pending intent; source authority
records must remain while their delegations can be introspected.

### Metadata and next CLI/broker slices

Owners/competitors retain source IDs and provenance `(sourceOrigin, kind, sourceId)`.
Fresh target Better Auth user IDs/pseudonymous emails are created in an atomic owner
batch; source account records are never copied. Roster import commits bounded pages,
checks identity collisions before advancing its cursor, and resumes after interruption.
Only initial mutable values are inserted. Subsequent imports preserve local names,
descriptions, retirement and target statistics, while source retirement independently
blocks derived authority. New imports initialize target ratings/statistics normally;
source match/rating history is not imported. Conflicting local IDs fail repeatedly
instead of being adopted. Versioned metadata provides a later TIM-28 optional-media
extension seam; this slice does not define or implement the image API.

`PreviewInstallationIntent` requires the **whole** request tuple, verifier, new token,
source connection/config identity and artifact pins before any I/O. `PreviewArtifacts`
separates trusted executable path/digest from branch rules/skill paths, archive and
individual content digests, commit and game/rules version. `PreviewParticipation`
retains that artifact pin and the cumulative supervisor ledger path during active
play. Dispatcher/supervisor adoption and the rules-only-PR test are deferred to the
serialized CLI slice; these interfaces do not claim current CLI support.

`PreviewAllocationIntent` names stable allocation request ID, target match ID,
target/incarnation/commit, game and **exact** ticket/request/grant/source-handoff
identities. The next broker slice must persist it before source allocation I/O,
recover the same source receipt after lost acknowledgement, and recheck live source
authority/exact unchanged tickets before **first** Match initialization after recovery.
It must distinguish already initialized matches and recover existing participation.
The current `creating → finishAllocation` bypass is not fixed by merely validating
queued tickets; the target admission gate stays until this is implemented.

## Actual verification

### Identity suite: 14 passing tests

Command (locked dependencies, no install):

```sh
node node_modules/vitest/vitest.mjs run tests/preview-identity.test.ts
```

The test starts **two actual local workerd Workers**, applies real migrations into
independent persisted D1 stores, and uses production application routes and locked
Better Auth's actual D1 adapter. It generates fixture-only signing keys and credentials.
Source `localhost` and target `127.0.0.1` deliberately use different cookie hosts,
not merely different ports. It stops/restarts both runtimes against the same stores.

The test-only DB wrapper throws on the operation after a selected committed write,
or after a real atomic batch. It neither mocks Better Auth nor substitutes an
in-memory SQL model. The response has no cookie at interrupted owner boundaries.

Covered:

- Agent-first/owner-second and owner-first/agent-second stable identity convergence;
  28-competitor pagination; independent users, credentials, accounts and history.
- Missing/foreign browser origin/proof, wrong verifier/token, tampered signature,
  expired/replayed signed request, wrong incarnation and a separately registered
  wrong target; bounded completion body.
- Write-ahead owner start, consumed source receipt, actual Better Auth session insert,
  lineage commit, grant-batch lost acknowledgement and source/target cold restart.
- Three concurrent owner completions produce one session/cookie; repeated agent
  exchange produces one grant; sign-out and local grant revocation cannot be undone
  by replay. Expired unused codes fail; proof-bound consumed receipts have a bounded
  recovery window without invalidating the independently issued session.
- Source session revocation blocks application and **library session-management**
  routes, including attempts with the newer target session's actual token. Newly
  authorized target session remains usable. Source-derived target pairing revokes
  with its owner session; source grant revocation/retirement block privileged HTTP.
- Local metadata edits, retirement and rating values survive reimport/redeploy;
  local-ID conflicts fail on every retry; stale registry/runtime/unused-code commits
  fail while existing same-incarnation authority survives.
- Source outage fails closed; source restart recovers live authority. Closed arena
  incarnation cannot reopen. Public HTTP stays available; private target socket
  tickets/ticket-bearing event requests are denied.
- Chromium traverses target start → source local Better Auth login → source authorize
  → fragment-stripped target completion → authenticated target owner HTTP. Cookies
  are checked to stay on their respective source/target hosts.

Artifacts: [`identity-result.json`](../../.tim27/identity-result.json),
[`identity-vitest.json`](../../.tim27/identity-vitest.json),
[`identity-browser.png`](../../.tim27/identity-browser.png), and
[`identity-provenance.json`](../../.tim27/identity-provenance.json).
The screenshot is deliberately a minimal continuation page, not an owner-dashboard
visual review. Current reruns default to a unique ignored `.tim27/runs/identity-*`
directory, created before Chromium captures. `TIM27_IDENTITY_EVIDENCE_DIR` selects an
explicit new capture directory; see the correction document for JSON-report commands.
Do not point a rerun at the accepted root captures or regenerate their manifests.

### Runtime findings that changed the implementation

- Actual workerd rejected `Request(..., {redirect: 'error'})`; `manual` plus rejection
  of all non-success responses is required at the edge.
- Better Auth's server-side `api.getSession` supplies no HTTP method to the hook.
  Middleware must recognize that read-only call rather than treating it as a POST.
- Returning an error-shaped `ctx.json` with a status option produced HTTP 200 through
  the locked auth routing seam. Completion now throws the library's `APIError`, and
  tests assert real HTTP failure status as well as authority effects.

### Additional checks

- `npm run typecheck`: all three TypeScript configurations pass.
- `npm run lint`: repository Oxlint passes; changed files also checked with
  `--deny-warnings`. Prettier passes on changed source/config/tests/docs/evidence.
- Six regression files passed **53 tests**: platform queue (20), platform repository
  (11), house model (3), TIM-26 cleanup deadline (7), inference waiter lifecycle (10),
  and legal Succession long path (2). Command:

  ```sh
  node node_modules/vitest/vitest.mjs run tests/worker-errors.test.ts tests/platform-queue.test.ts tests/platform-repository.test.ts tests/inference-cleanup-deadline.test.ts tests/inference-waiter-lifecycle.test.ts tests/house-model.test.ts tests/succession-long-path.test.ts
  ```

  That first combined run could not start `worker-errors` because `dist/client` was
  absent. `node node_modules/vite/bin/vite.js build` created only local assets; its
  two tests then passed, including production-mode development-login rejection.
  See [`identity-worker-regressions.json`](../../.tim27/identity-worker-regressions.json).

- Existing deterministic `tests/preview-worker.test.ts` passed both scripted games,
  including complete Succession acts and archive replay. Its normal configured
  bounds are 190/310 seconds; earlier foreground commands were stopped by shorter
  shell timeouts, then the full background run completed successfully. See
  [`identity-preview-regression.json`](../../.tim27/identity-preview-regression.json).
- No model/provider calls were made. Inference fixtures and the preview provider
  are deterministic. Expected fault-injection logs and occasional local workerd
  connection-reset diagnostics are not provider errors or test failures.

## Remaining acceptance / parent integration

Parent reviews and integrates identity before the next CLI/broker slice. Serialize
`0004`, auth/Worker/config hunks with `7233eb6` and TIM-23/TIM-30 deliveries; do not
take over their routes, history, images or CLI work. Trusted provisioning/registration,
PR entry links/artifact manifests and eventual cleanup remain parent-owned.

Hosted acceptance still needs usual GitHub/Google callbacks, usual OpenCode **and**
Claude connections, pinned branch rules, public-wakeup gameplay under both protocols,
shared source-executed inference/admission/accounting, complete real-model Succession
and real replay. Retain normal clocks, TIM-26 priority/headroom/unknown-cost handling,
and the existing operating ceiling. Reconcile the actual current operating ledger
before a hosted paid trial; the historical evaluation balance is not a new approval
requirement or local implementation blocker. This slice has no deployments, paid
calls, production credential/resource writes, package/lock changes, push or Linear
operations. The root Agentation listener/configuration was untouched.

## Retrieval / locked release policy

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
  and [D1 `batch`/primary-read semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)
  were retrieved for implementation.
- Latest published Workers declarations `5.20260914.1` were retrieved from npm and
  the D1 binding signatures compared. Runtime/build validation uses the repo's locked
  Wrangler `4.129.1`, generated workerd `1.20260907.1` declarations and compatibility
  date `2026-09-10`; packages were not upgraded.
- Better Auth's installed `1.7.3` `internal-adapter`, cookies and Better Call error/
  endpoint types were read directly. The provenance manifest pins those exact files.
- [RFC 7636 S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2) defines verifier
  challenge encoding. The original architecture document retains the broader source
  comparison and primary references.
