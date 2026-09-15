# TIM-27 — playable PR previews: first technical decision

**Decision date:** 2026-09-14. **Inspected baseline:** `73ca5627bfcd1a699650cd77d9c4e887a475ab06`
(accepted TIM-26 included). This is a proposed implementation contract
for parent review, with local feasibility evidence, not a hosted acceptance record.

## Chosen design

Keep the **separate Alchemy stack per PR**. Add a small, trusted **source-issued handoff**
for owner identity and existing installation authority. Import an allowlisted metadata
snapshot into preview D1, then issue entirely preview-local sessions/grants. Keep the
usual GitHub/Google sign-in on production's existing callbacks. A signed-in owner need
not sign in again, but automatic sign-in is not required.

For deliberate live play, use the **production-selected house provider through a narrow
source-side inference broker**, charging one shared admission ledger across production
and all previews. Keep match engines, history, replay, queues and edits in each preview.
Paid inference remains disabled until the production prerequisites and live-test budget
authorization below are satisfied.

The owner journey is:

```text
PR comment → preview → usual provider sign-in on source → imported profile + roster
existing OpenCode/Claude agent → choose preview using source connection
  → origin-bound handoff → new local preview connection → ordinary game → real replay
```

No registration/recreation or manual pairing is required for a currently authorized
source owner/installation. Expired/revoked source authority requires normal source
reauthorization. Signing in via a different, unlinked provider does not establish the
same owner; preserve existing explicit provider-linking behavior.

## Verified foundations and candidate comparison

The repo's conventions are in [CONTEXT](../../CONTEXT.md), [README](../../README.md),
[implementation contract](../implementation-spec.md), `.oxlintrc.json` and
`.prettierrc.json`; no `AGENTS.md` or separate coding-standards file was found here.
Use TypeScript/Effect, additive SQLite/D1 migrations, bounded transport and explicit
game/match/mode identities. Dependencies remain locked.

| Finding                                                                                                                                                                                                       | Evidence / consequence                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing PR stages have independent Worker, D1, Match/Matchmaking/HouseSeat namespaces and generated auth secret. They omit OAuth and AI; provider is `preview`, model `scripted`, scale `0.1`, budgets zero. | `alchemy.run.ts:9–85`; `.github/workflows/ci.yml:219–306`; `preview-cleanup.yml`. Retain stage identity across redeploys.                                                                      |
| Workers version/alias Preview URLs are unavailable for Workers implementing Durable Objects.                                                                                                                  | Cloudflare [preview limitations][cf-preview], fetched 2026-09-14. This is a separate Worker stack, not a production version URL.                                                               |
| A new Better Auth social user currently creates a new owner, with no source lookup. Agent authority is an `agk_` hash joined to a live grant and nonretired agent.                                            | `src/server/auth.ts:16–123`; `pairing.ts:79–153`. Social identity alone cannot supply the source roster or play grant.                                                                         |
| Mode is coupled to provider. Merely turning on Workers AI in a preview produces `ranked` mixed-match snapshots/bootstrap.                                                                                     | `coordinator.ts:190–209`, `worker.ts:89–113`. Decouple arena/match mode from inference transport before live play.                                                                             |
| Separate coordinators duplicate allowance. Current $1.50 match ceilings and TIM-26 optional shares apply only to paid **all-house** allocations; mixed required work bypasses both match and daily ceilings.  | `coordinator.ts:175–232,557–727`; [actual-code probe](../../.tim27/runtime-result.json). Two isolated coordinators each admit $4.50 of reservations; a mixed $6 required estimate is accepted. |
| CLI configs are arena-hashed, but `connections()` generates commands using the listing binary, and installation instructions overwrite one shared CLI prefix.                                                 | `cli/setup.mjs:23–128`, `public/agents.md:23–39`, `scripts/package-cli.mjs`. Prefix isolation alone is insufficient without per-record executables.                                            |

### Better Auth 1.7.3, not an assumed newer API

The installed package and `package-lock.json` both select **1.7.3**. The tagged upstream
source was also retrieved. Comparison:

| Candidate                                         | Supported API and actual behavior                                                                                                                                                                                                                                                                                                                                                                                                                | Decision                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OAuth proxy + source import                       | `oAuthProxy({ productionURL, currentURL, secret, maxAge })` from `better-auth/plugins`; completion is `/api/auth/callback/:id/oauth-proxy`. Source exchanges the OAuth code and forwards an encrypted payload; target runs `handleOAuthUserInfo` and sets a local session. The payload includes provider access/refresh/ID tokens, not just a public profile. Shared proxy encryption key is required; no source owner/grant export is supplied. | Reject for this slice. Still needs the source-authority bridge and import, adds shared-key/OAuth-token exposure, and creates preview users independently. A stable callback solves only redirect routing. [BA proxy docs/source][ba-proxy] [tagged implementation][ba-proxy-source]. |
| Built-in one-time token                           | `oneTimeToken()` stores a reference to an existing **session token** in verification storage; `verifyOneTimeToken` finds and returns that session and can set its cookie.                                                                                                                                                                                                                                                                        | Not a cross-database metadata/agent-grant exchange. Do not enable it as a source-session export. [Tagged source][ba-ott].                                                                                                                                                            |
| Source-issued constrained handoff + target plugin | `createAuthEndpoint` from `better-auth/api`; endpoint `ctx.context.internalAdapter.createSession(localUserId)`; `setSessionCookie` from `better-auth/cookies`; ordinary `auth.api.getSession({ headers })`. Supported plugin extension points are documented and present in 1.7.3.                                                                                                                                                               | **Chosen.** New narrow application protocol; source OAuth/session/grant checks stay authoritative. [Plugin docs][ba-plugins]; [local executed probe](../../.tim27/auth-result.json).                                                                                                 |

The real Better Auth memory-adapter probe created an independent target session and
host-only Secure/HttpOnly/SameSite=Lax cookie; source and target cookies were mutually
rejected. It also found that a **cookie-less custom POST reached its handler from a
foreign origin despite `trustedOrigins`**. Explicit origin enforcement rejects it.
Use the application's strict origin policy on both browser handoff endpoints, including
the first unauthenticated request. Do not rely on a plugin's default middleware.

## Source authority and handoff contract

Here **source** is the known production origin from the installed source connection,
not a URL suggested by arbitrary preview content. **Target identity** is the exact
HTTPS origin plus a random **arena incarnation** persisted for the life of that PR
stack. A redeploy changes `commit`, not incarnation; destroy/recreate changes both
incarnation and target key. Requests also carry the expected deployed commit.
An unconsumed handoff for a superseded commit is rejected. Completed delegations belong
to the incarnation and survive an ordinary redeploy; they are not invalidated just
because the commit changed. Active matches/broker allocations retain their original
snapshot commit and can finish across a compatible redeploy. Keep current deployment
identity and that immutable match identity as separate fields.

### Trusted target registration

The source keeps `preview_arenas`: exact origin, PR number, incarnation, current verified
commit, target public key, active/closed state and capability versions. A trusted
default-branch deployment controller updates this record after deploying verified
artifacts; the PR Worker cannot register itself or another target.

Target-to-source calls authenticate with an incarnation-specific **ECDSA P-256** key.
Sign a versioned fixed-order tuple of method, exact source origin/path, target identity,
timestamp, random request nonce and SHA-256 body digest. The source verifies against
the registered key and atomically records the nonce; allow at most 60 seconds of request
age and reject replay. Use Web Crypto, not new JWT/OAuth dependencies. Only that target's
handoffs/delegations/allocations are addressable. An `Origin` header is not server
authentication. The target gets no production D1/DO binding, OAuth secret, source auth
secret, provider key, or source bearer token.

### Owner flow

1. Preview `POST /api/preview/owner-start`: enforce exact browser Origin, generate a
   random browser state cookie and server-held verifier, persist a ten-minute pending
   request, and register its S256 challenge with the source using target authentication.
   Return a source `/preview/continue?request=<opaque-id>` URL.
2. The source page uses its existing Better Auth GitHub/Google sign-in, with a **source-
   local callback URL**. Resolve the existing owner through `ownerSession`. The source
   page identifies the target PR/origin and continues via a same-origin POST; no new
   competitor form. GET navigation alone does not issue authority.
3. Source authorization records owner ID and **source session ID**, target/incarnation/
   commit, request ID, scope `preview:owner`, verifier challenge, expiry and an opaque
   **60-second code hash**. Source derives identity from the session, never submitted
   email/handle/user IDs. Return only the code and state to the registered target's
   fixed `/preview/return` page in a fragment. Use `no-store`, `Referrer-Policy:
no-referrer`, no third-party callback assets, and remove the fragment immediately.
4. Target page POSTs to `/api/auth/preview/complete` with exact Origin and the bound
   browser state. The target server redeems through the source using its private key
   and verifier. Source atomically checks code/use/expiry/target/commit and **current**
   source session/owner authority, then supplies a versioned metadata snapshot and
   target-bound delegation reference. The target imports it and creates a fresh Better
   Auth session. Its response contains no bearer token; the cookie is preview-local.

The source callback registry does not expand Better Auth `trustedOrigins` to all PRs.
Only the bridge knows target return URLs. Source's normal auth/account-management API
continues accepting source-origin browser mutations only. Exact redirects, transaction-
bound S256 challenges and audience restrictions follow [RFC 9700 §§2.1–2.5][oauth-bcp];
this custom bridge is not advertised as a general OAuth authorization server.

### Existing game-agent flow

The trusted source CLI/compatibility helper chooses a source registry entry and target
from the source's arena registry. It creates a new random target `agk_` token and stores
it in the new mode-0600 target config **before I/O**. It sends only its hash/challenge,
target/incarnation/commit and stable request ID to source
`POST /api/preview/agent-handoffs`, authenticated by the existing source bearer.
The exchange verifier is a separately generated random value: submit its S256 challenge
alongside `targetTokenHash`. At redemption the source sees that verifier and the token
hash, never the raw target token; the target independently checks the raw target-token
proof against the bound hash. Do not use either bearer token as the PKCE verifier.

The source calls `agentSession` and binds the exchange to that exact source grant,
owner and competitor with scope `preview:play`. This authorizes neither other roster
competitors nor owner management. The helper sends the returned short-lived code and
target-token proof to target `POST /api/preview/agent-exchange`. The target redeems
through the signed source channel; source rechecks expiry/revocation/retirement and
the bound challenge. Target imports that competitor plus its public owner metadata and
inserts a **new** local `agent_grants` row. Production never sees the new raw token;
preview never sees the old raw token. All credential-bearing fetches use `redirect:
'error'`, as `GameClient.request` already does.

Owner import and agent import converge on the same source IDs regardless of order.
Neither transfer changes a source grant, queue ticket, match assignment or installation.
Selecting a preview does not cancel/resume a production participation under a different
origin. It selects a distinct connection and, when asked to play, starts one new target
participation through the existing `/api/queue` contract.

### Idempotency, authority lifetime and revocation

- Source consumption is a conditional write plus durable receipt, not read-then-delete.
  The exact authenticated target/request/verifier may retrieve the same receipt after
  an acknowledgement loss; it never obtains a second delegation. A different proof or
  request is rejected. Recheck live source authority on receipt retrieval too.
- Target records `(source, incarnation, exchangeId)` → local grant/session ID atomically
  with import/issuance state. Serialize completion per pending request. Repeated login
  keeps one imported owner/competitor; repeated exchange reuses that grant. Session
  cookie retries reuse the saved target session only for the same browser-state proof.
  Expired/consumed browser state requires a new login flow, not reusable sign-in links.
- Better Auth session creation and application import are separate writes. Persist a
  completion state machine and session reference; guard with a request lease/unique
  receipt. A crash must not expose an unbound session or leave two usable sessions.
  Revoke an orphan before retry. Do not claim cross-origin/D1 atomicity.
- Derived owner sessions and agent grants live no longer than the source authority
  and target registration. Store source delegation references separately from tokens.
  **Every privileged HTTP use** checks local authority and source introspection, with
  no positive cross-request cache. Source reads use primary/current authority, not a
  stale read replica. Network uncertainty fails closed for authority.
- Also introspect before asynchronous queue allocation, not only `POST /api/queue`.
  Source retirement, grant revocation/expiry, owner-session revocation, delegation
  revocation or arena closure denies subsequent derived operations. Local revoke or
  retirement remains local and cannot be undone by another import. A request already
  authorized concurrently with revocation has the ordinary authorization-check race;
  no zero-latency distributed revocation claim is made.
- Target pairing must not bypass this lineage. Any grant approved by an imported owner
  is bound to that owner's source delegation and current competitor eligibility; a
  derived play-only grant cannot approve another grant. Local revoke remains authoritative
  for that target grant, including when an identical exchange receipt is retried.
- Preview-derived installations use **public WebSockets as wakeups, authenticated HTTP
  for entitled observations**. Add `eventAuthorization: public-wakeup` connection
  capability: `GameClient.wait` must fetch current entitled state after a public packet,
  and never persist a public packet as its controller observation. Reject privileged
  socket tickets for these derived grants. Otherwise `MatchObject.send`'s synchronous
  broadcast checks only local expiry/revocation and could keep disclosing private state
  after source revocation (`match.ts:858–1018`). Both game protocols retain their public
  sockets/HTTP formats; production installations retain entitled sockets.

The probe explicitly verifies that revoking the source **does not automatically revoke
a target Better Auth cookie**. Introspection is a required implementation boundary,
not a property supplied by the authentication library.

## Metadata import and identity extension

Use a versioned `PreviewIdentitySnapshotV1` with issuer origin, source owner ID, owner
handle/name, and source agent ID/owner ID/name/description/retirement status. Owner
handoffs can page the entire own roster; agent handoffs can import only their bound
competitor. Do not silently truncate at `listAgents`' default 100; page a consistent
snapshot or return a resumable import cursor. Sign-in need not wait for optional media.

| Reuse / import                                                                                                                  | Fresh and arena-local                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `owners.id` and `agents.id`, name/handle/description initial values; provenance `(sourceOrigin, entityKind, sourceId)` | Better Auth user/session IDs and cookies; local pseudonymous required email; all agent-grant IDs, secrets/hashes, pending pairings, queue/request/receipt/controller state, active matches, history/replay, ratings/placements/statistics, subsequent edits |

Source provider IDs/emails are not identity-merge keys. A deterministic, non-deliverable
preview email derived from source origin/owner ID satisfies Better Auth's required user
column without copying provider accounts/tokens or enabling email sign-in. Only the
bridge can create authenticated preview users. No standalone preview social signup or
owner-management token export is needed.

Add `preview_sources` with unique source tuple **and** unique local entity binding;
`preview_authorities` maps local session/grant to source delegation. Verify ID/ownership
collisions before insert; never merge by matching name or ignore an unrelated unique
constraint. Import mutable metadata **on first sight only**. Subsequent logins add new
source competitors and refresh separate source eligibility/provenance, preserving
preview-local names, descriptions, retirements and edits. Source retirement blocks
derived play even if its copied local profile remains visible. A local name collision
for a newly imported competitor gets a deterministic, visibly suffixed imported name
within existing length/normalization rules; existing local records are not renamed.
Current owner HTTP mutations expose agent creation/retirement and grant revocation,
not name/description editing (`worker.ts:173–234`). Hosted isolation can exercise those
real mutations; the insert-only import must also preserve future local profile edits.
Adding a general profile editor is outside this slice's prerequisite set.

Use bounded transactional `DB.batch` operations and durable import receipts. D1 batches
roll back together [per its API][cf-d1], but cannot transact with the source or arbitrary
Better Auth calls. Concurrent owner/agent imports, partial pages, failure/retry and
collision behavior need native Worker/D1 tests. [The SQLite probe](../../.tim27/import-result.json)
applies both real migrations and proves the simple insert-only seam, including import
after a local edit and addition of a new source competitor; it does not prove those
distributed cases.

Ratings start at local defaults in both pools; no source results are copied. All hosted
PR matches have immutable `mode: preview`, even with real inference, so settlement
cannot rate them. A rating-isolation test can mutate isolated fixture stats to prove
storage independence without making live PR matches ranked. Public UI must label
source profile provenance and **unranked preview**, never imply imported rankings.

TIM-28 owns image data/upload. Give it this stable source tuple and a versioned optional
metadata-extension seam; future immutable image ID/content version can be copied as
metadata without sharing write authority. No raw upload credential or writable source
image key is imported. Local overrides/removal need an explicit tombstone so reimport
cannot resurrect them. TIM-29 owns shared presentation; TIM-30 owns optional guidance.
Missing/unsupported pictures never block handoff or play. The authoritative visual
handoff is the read-only `TIM-6/docs/design/TIM-6/annotation-review/README.md` in the
design worktree (sections “Profile-picture work requested” and “Verification”).

## CLI compatibility and immutable downloads

1. Add source-owned `preview-select` capability and immutable source-hosted compatibility
   helper for already installed 0.2.0/older skills. The preview connection prompt tells
   an existing agent to list its registered source connections and use that helper;
   the helper is fetched/cached automatically, without reinstalling the personal skill
   or manually pairing. Current old binaries cannot learn a new subcommand unaided.
2. Default production/compatible-preview gameplay uses the trusted source CLI. Store
   downloaded executables under `~/.agent-game/cli/<arena-hash>/<commit>-<archive-sha256>/`
   and record `cliPath`, archive digest, commit, protocols, source tuple and target
   incarnation **per connection**. Fetch a registered immutable artifact; fail digest
   mismatch. Install with `--ignore-scripts`. Avoid the shared `~/.agent-game/cli`
   package prefix and a mutable version-only preview download identity.
3. `connections()` returns each entry's executable, not the executable doing the listing.
   Keep legacy entries usable with their known source executable. Personal skill remains
   a protected dispatcher; changing preview/commit does not overwrite it. Downloading a
   new build must not replace a binary/skill/rules file used by an active participation.
4. Credentials are keyed by harness + arena + competitor + incarnation, not commit.
   Existing participation/supervisor ledgers pin the executable and their current
   allowances across redeploy/resume. No copying production observations, sessions,
   request IDs or budget ledgers into preview state. Preserve 120/10/10 Succession,
   35-minute Secret Overlord and existing harness-accounting behavior; a preview is not
   an extra Claude allowance.

Source-token transport must remain in the source-trusted dispatcher. The automatic
compatible path does not execute arbitrary code downloaded from a PR to read a source
config. Testing an actual changed PR CLI is a distinct reviewed-artifact choice, still
cached per arena/commit. Prefix isolation protects versions, **not an OS sandbox** for
arbitrary local code with access to the user's home directory. Do not claim otherwise.

## Real play versus deterministic smoke

Use two allocation profiles in the same isolated arena, selected server-side:

- **Smoke exhibition:** existing `/api/dev/exhibition`, scripted provider, scale `0.1`,
  zero inference, unranked. It snapshots those values explicitly; opening it cannot
  consume a live-play permit or acquire broker authority.
- **Deliberate live play:** authenticated imported installation enters ordinary queue;
  scale `1`, normal 30-second fill, actual production provider/model, current preview
  rules/policy and `mode: preview`. Snapshot all of these before initialization. Provider
  transport (`broker`) is separate from actual provider identity (`workers-ai`/`openai`).
  Disabled/unaffordable live play reports unavailable/budget and does not silently run
  scripted opponents.

The last committed [production configuration record](../deployment.md#human-setup)
names Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. This slice did not read live
configuration or credentials. The source broker must report and use its actual current
provider/model at trial time, rather than hardcoding that historical record.

`verify-preview.mjs` remains zero-inference and verifies both actual scripted engines,
privacy, sockets and complete terminal history/replay. Update its old `authProviders: []`
assumption to assert **source-handoff discovery**, not installed OAuth credentials.
`preview-comment.mjs` reports commit, sign-in/agent-selection instructions, live-play
availability and scripted smoke links accurately. CI never starts real inference.

## Aggregate budget: selected architecture and precise authorization boundary

**Choose one source-side broker + existing production coordinator ledger.** A reserved
per-PR slice or local file ledger cannot enforce aggregate usage when PR code has direct
AI/provider access. Cloning `$5/day` is plainly multiplicative. Static slices also
cannot protect ongoing production mixed-match required work without changing the shared
admission authority. Cloudflare AI usage/free allocation is shared; it is not a new
allowance for each binding [pricing][cf-ai].

Implementation shape:

1. Add namespaced preview allocations to the existing source coordinator, with separate
   storage records from production matchmaking tickets. Account preview reservations
   and usage in **the same** capacity/day/RPM calculations used by production. Keep the
   conservative admission formula: current accounted day usage + full active production
   and preview reservations + requested reservation ≤ existing **$5** target. Across
   midnight, active reservations remain held. Do not replace the deployed coordinator
   name `secret-overlord`, migrate its ledger away, or reset prior usage.
   The target coordinator retains queue fairness/busy checks and persists the returned
   source allocation reference before initializing its local Match DO. Its live capacity
   comes from the source broker, not a copied local `$5` environment setting; local
   inference telemetry is not a second authoritative usage ledger. Failed initialization
   retries the same allocation, while smoke allocations stay entirely local and free.
2. Source accepts at most **one active live-preview allocation globally**, within the
   existing three total slots and current remaining money. Bind each allocation to the
   registered incarnation/commit, authenticated play intent, game and preview match ID;
   retries return the same allocation. Reserve **$1.50** at current defaults (Succession
   uses the existing configured override when present, never silently larger). No PR
   controls these numbers or obtains a new daily pot. This reduces preview availability
   under pressure rather than multiplying capacity.
3. Source broker actually runs `generateHouse` with its real configured provider. It
   validates target signature/allocation, bounded payload/choice count, exact request
   fingerprint, useful deadline and two-attempt logical-job ceiling; chooses allowed
   model/output settings itself; computes estimates itself. Expose no generic fetch,
   model selection, raw AI binding or provider credential. Prompt/policy can be from
   the tested PR, but cannot alter source admission or pricing. Record both revisions.
4. New preview allocations, **including mixed external/house ones**, use the bounded
   paid-all-house funding policy: optional ≤50% of reservation, follow-ups ≤25% of that
   optional share; protect the remaining half for required work. Required can use all
   remaining match funds but cannot exceed the preview allocation. This is necessary
   because PR code's `mandatory` assertion is not trusted permission to spend without
   limit. Existing production mixed-match exemptions remain intact.
5. Retain TIM-26 transient versus irreversible refusal, useful-deadline retries,
   required-before-optional and initial-before-follow-up priority, global 180/250 rolling
   limits, exact waiter cleanup and nonblocking housekeeping. Broker usage includes
   `actual ?? reserved`; missing/failed/expired-uncertain provider usage retains its full
   estimate. Provider response/usage settlement is source-owned; a preview cannot report
   fake zero cost. Provider costs greater than estimate must be recorded honestly.
6. Add durable source broker receipts alongside coordinator usage: reservation/dispatch
   state, request fingerprint and saved result. Concurrent/retried identical HTTP calls
   return pending or the same saved response, never redispatch the same billed attempt.
   Crash after dispatch is unknown usage, not free retry. A new allowed attempt must
   reserve separately. Provider I/O happens outside coordinator storage transactions;
   target HouseSeat still fences stale phase/generation and durably saves submissions.
7. Explicit completion/abandonment closes only that allocation, blocks new calls and
   retains all usage/unknown reservations. Closing a PR disables authority first.
   Cleanup failure never silently refunds in-flight calls; an outstanding allocation
   stays held until reconciled. No new DO namespace is required for this proposal:
   source Worker runs bounded provider I/O; coordinator stores admission/receipts.

This is an **admission target, not a guaranteed invoice ceiling**, just as production
currently documents. Known long legal games and TIM-26's ceiling-charge negative control
can exhaust $1.50; optional fractions do not prove full-match affordability. Exhausted
preview required work follows existing bounded recovery → interrupted match/partial
replay, never fabricated choices or silent extra funding. See [TIM-26 budget review](../evaluation/TIM-26-budget-review.md#selected-policy-and-verification).
The source production policy has wider mixed-match completion obligations; its required
spending can still exceed the daily target. Newly added previews must not claim to make
that target a hard cap.

**Owner decision still needed before live hosted evidence:** authorize the particular
real-model preview trial against the **shared operating target's actual remaining
allowance**, accepting the bounded preview-allocation interruption policy above, or
allocate it to a separately approved evaluation envelope. This slice spends nothing.
The last committed separate $10 evaluation ledger reports only **$0.791523 remaining**
([deployment record](../deployment.md#next-owner-step)); that is below a
$1.50 reservation and is not permission to top it up from an unrelated ledger. The
parent must reconcile current usage and name the funding ledger before admitting a
trial. Guaranteeing arbitrary-length mixed preview completion, raising either ceiling,
or granting additional harness spend is a **new budget/product decision**, not inferred
from TIM-26's synthetic $1.2804700 completion.

## Exact implementation slices and ownership

All endpoint names below are **new proposed contracts**, not claims that these routes
already exist. Parent remains sole Linear writer and dependency/lockfile/integration owner.

| Slice                                 | APIs / files                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ownership and gate                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Trusted production identity bridge | New `src/server/preview-source.ts`; `worker.ts` routes: source `GET /api/preview/arenas`, target-signed `POST /api/preview/requests`, source-owner `POST /api/preview/owner-handoffs`, source-agent `POST /api/preview/agent-handoffs`, target-signed `POST /api/preview/redeem` and `/api/preview/introspect`. Source `/preview/continue` page uses existing `/api/auth/sign-in/social`. Add source target/handoff/delegation/nonce/receipt D1 tables. | Small independently reviewed production prerequisite. Scope-isolated export only; no generic production repository API.                                                                       |
| B. Preview auth/import                | New `preview-target.ts`/`preview-import.ts`; plugin endpoint `/api/auth/preview/complete`, browser `/api/preview/owner-start`, CLI `/api/preview/agent-exchange`. `auth.ts` local+source authority checks, `pairing.ts` derived-grant restriction, coordinator allocation recheck, `match.ts` ticket restriction, `repository.ts` provenance/import seam, shared schema and additive D1 migrations.                                                     | May be built against a local source fixture before A is hosted. TIM-28 coordinates optional metadata extension.                                                                               |
| C. Trusted CLI selector/downloads     | `cli/agent-game.mjs`, `setup.mjs`, `supervisor.mjs`/ledger pinning; new source compatibility helper; `scripts/package-cli.mjs`, `src/shared/onboarding.ts`, `public/agents.md`, skill dispatcher guidance.                                                                                                                                                                                                                                              | Parent coordinates version/packaging changes. Verify existing installs on both harnesses, preservation of source config and active ledgers, both protocols, public-wakeup private-fetch path. |
| D. Shared broker and live allocation  | New source `preview-inference.ts`; target-signed `/api/preview/allocations`, `/api/preview/inference`, `/api/preview/allocations/complete`, `/api/preview/inference/retire`; source `coordinator.ts`/`matchmaking.ts` typed admission/receipt methods, `house-seat.ts` broker transport, `house-model.ts` configuration seam, mode/profile snapshot selection.                                                                                          | Larger than the identity bridge; must pass TIM-26 gates and two-arena contention/restart/unknown-cost tests before enabling real play. Production ledger stays canonical.                     |
| E. Trusted lifecycle integration      | `alchemy.run.ts`, generated Env types, `.github/workflows/ci.yml`, `preview-cleanup.yml`, `scripts/verify-preview.mjs`, `preview-comment.mjs`, deployment docs. Publish incarnation/commit/archive manifest and exact source registration.                                                                                                                                                                                                              | **Parent-owned shared integration.** Trust/resource scoping prerequisite below, then hosted checks and final acceptance.                                                                      |

### Production/config prerequisites, in order

1. Merge/deploy A with bridge disabled until a target is registered. Existing provider
   callbacks remain usable; no provider-console change or shared OAuth proxy secret.
   Add bridge tables and exact target registry; register only tested source-owned keys.
2. Change deployment trust: current `ci.yml` executes PR-checkout Alchemy with an
   account-scoped Cloudflare edit token. That is not a sandbox against malicious PR
   deployment code. Build/test PR artifacts without production credentials; execute
   resource provisioning/registration using a **trusted default-branch controller and
   dependencies**, accepting only that PR's build assets/migrations and restricted stage
   inputs. Do not execute PR workflow/scripts in the privileged deployment job. The
   target registration credential/key is never present in a PR-controlled build job.
   This is a prerequisite to claiming narrow production privilege, not a new secret
   to add to the current PR checkout step.
3. The controller installs only per-preview bindings/auth secret/private target key,
   registers its public key/exact origin/commit at source, and publishes artifact
   digests. Preserve incarnation/key on redeploy. Cleanup tombstones source registration
   **before** destroy and reconciles allocation usage; recreation cannot reuse old codes.
4. Publish C's trusted helper/manifest; install B and retain zero-cost smoke. This enables
   hosted owner import/agent selection checks before paid play.
5. Review/deploy D's source accounting/broker changes, then enable live allocation only
   for an explicitly funded test intent. Target receives no direct AI binding/key.
   Changing normal game clocks/provider mode without this gate is not a playable-preview
   implementation.

## Evidence and remaining acceptance

Reproduce the three probes using [`.tim27/README.md`](../../.tim27/README.md). The auth
probe runs actual Better Auth 1.7.3; import runs both real migrations; runtime probe
executes the unchanged coordinator on native SQLite. No external model, hosted auth,
deploy, package change, credential mutation or production write occurred. The exchange
ledger is a model, not an audited network implementation. Cryptographic request signing,
concurrent native D1 completion, public-wakeup CLI and cross-origin hosted flows remain
unverified.

Before hosted acceptance, capture:

- Usual owner signing in through their usual linked provider, same source owner/agent
  IDs on roster, second login/redeploy without duplicates, local edit/retirement intact,
  no registration or source mutations. Test source-session revocation and target closure.
- Usual existing OpenCode **and** Claude installations choosing the preview without
  manual pairing/reinstallation. Source config, connection, active participation,
  executable/rules and cumulative harness ledger survive. Capture source-grant expiry/
  revoke before redemption, after redemption and before allocation; reimport cannot
  reopen a locally revoked grant. No production bearer reaches preview or logs.
- Wrong exact origin, sibling PR, stale incarnation/commit, callback substitution,
  verifier/token substitution, expired code, concurrent replay and acknowledgement-loss
  retries. Source bridge rejects unauthorized target keys and cross-scope IDs. Browser
  mutations from foreign and missing origins fail; public sockets cannot expose a seat.
- Both protocols and a **complete real-model Succession** when allowance permits, with
  actual provider/model/policy/commits, normal clocks, usage and unknown reservations,
  external harness evidence, both acts, terminal winner and actual complete replay.
  Also capture public/private HTTP and WebSocket behavior, local rating isolation and
  source unchanged. An interrupted game/partial replay is recorded as such, not success.
- Two PRs competing with production for the same ledger; headroom, daily rollover,
  duplicate dispatch, late result, source/target restart and cleanup failure. Rerun the
  accepted TIM-26 full-path, required-pressure and cleanup-deadline regressions through
  the broker seam. Synthetic provider tests establish transport/accounting; **none
  establish real-model dialogue quality, affordability or completion**.

**Blocker assessment:** no platform/API blocker to implementing A–C with the locked
dependencies. Hosted completion is blocked on trusted production bridge/lifecycle
provisioning and broker integration plus explicit available trial funding. These are
named prerequisites, not a reason to copy production credentials or fake a live match.

## Primary sources (retrieved 2026-09-14)

[ba-proxy]: https://www.better-auth.com/docs/plugins/oauth-proxy
[ba-proxy-source]: https://github.com/better-auth/better-auth/blob/v1.7.3/packages/better-auth/src/plugins/oauth-proxy/index.ts
[ba-ott]: https://github.com/better-auth/better-auth/blob/v1.7.3/packages/better-auth/src/plugins/one-time-token/index.ts
[ba-plugins]: https://www.better-auth.com/docs/concepts/plugins
[cf-preview]: https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations
[cf-d1]: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
[cf-ai]: https://developers.cloudflare.com/workers-ai/platform/pricing/
[oauth-bcp]: https://www.rfc-editor.org/rfc/rfc9700.html#section-2

Also checked [DO transactional SQL](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync)
and [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).
Service bindings are technically supported for cross-Worker calls, but a direct binding
to production's unrestricted DO API is not the selected authority boundary. The first
slice uses explicit narrow HTTPS contracts to permit local and hosted verification;
transport may later change without expanding those capabilities.
