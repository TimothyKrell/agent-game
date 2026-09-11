# Owner and Agent authentication

Research date: **2026-09-10**. External evidence is limited to official specifications, first-party documentation, and first-party release notes. Compatibility below is documentation-verified, not deployment-tested. All proposed product behavior and architecture are explicitly labeled **Proposal**; they are not settled requirements.

## Recommendation — proposal

**Use browser authentication for the Owner and a separately issued, single-Agent credential for the local harness. Support Owner-first and Agent-initiated onboarding through the same create/select-and-approve screen.** Neither onboarding order requires a different identity model.

- **Public entry:** show games, Agent profiles, standings, and connection instructions before login. Offer “Create an Agent” in the browser and instructions a user can give their harness: “Go play a match for me.”
- **Owner authentication:** start with GitHub and Google browser login. Prefer **Clerk** if reducing Owner-account implementation work is the priority; choose **Better Auth on Workers with D1** if owning the authentication service and its data is more important. The verified capabilities and tradeoffs appear below.
- **Harness authorization:** use an application-owned device authorization flow for headless/remote or outbound-only harness environments. Use external-browser authorization code + loopback PKCE when a local helper can reliably receive a callback on the same computer. A dashboard-created Agent token is the smallest initial connection mechanism.
- **Persistent identity:** credentials, machines, harness sessions, and model revisions all refer to a persistent `agentId`. Reconnecting or replacing a credential should preserve the Agent's standings.

Device authorization explicitly permits account signup during approval; native-app OAuth specifies external-browser flows and requires PKCE for public native clients. These standards support the proposed experiences, but do not define Agent creation, ownership, or rankings.[^device][^native]

## Starting point

The project's [CONTEXT.md](../../CONTEXT.md) defines an **Owner** as a person whose profile may have multiple **Agents**. Each Agent is a persistent competitor with its own standings; Owners have no standings. The task supplies the additional constraint that Agents run on users' computers and harnesses. The supplied sibling-project finding is anonymous cookie possession only, with no reusable product identity system; this research does not depend on reuse from that project.

## 1. Product flows — proposals, independent of the mechanism

| Flow | Proposed experience | Proposed identity outcome and tradeoff |
| --- | --- | --- |
| **Owner first** | Browse → sign in/sign up → create a named Agent → connect a harness or generate that Agent's credential → play. An existing Owner can select an existing Agent instead. | Ownership exists before credential issuance. This is the simplest dashboard experience, but requires the user to visit the site before the harness can play. |
| **Agent initiates, Owner approves** | The harness requests a connection, optionally suggesting an Agent name → displays a game-site URL and code → the Owner signs in or signs up → selects an existing Agent or confirms creation → approves → the originating harness receives its credential and canonical Agent identity. | A pending request can exist before an Owner account. Treat it as a draft, not an already-owned ranked Agent. Signup, ownership assignment, and credential approval can be one continuous browser flow. |
| **Guest entry, claimed later** | The harness obtains a provisional entry and can try practice play → later presents a claim request → a signed-in Owner claims it and chooses its final identity. | This adds a distinct guest lifecycle. Proposed default: guest play is unranked and guest results are not retroactively merged into an existing ranked Agent. Whether to preserve a guest's history when creating a new Agent is a product decision. |

**Proposal:** implement the first two as two entrances to one workflow. Defer playable guest entries unless “try before signup” is a deliberate goal. Agent-initiated registration does not itself require anonymous gameplay. RFC 8628 leaves the exact authorization UI to the service and expressly allows new users to sign up during it; the guest/history rules above are application proposals, not RFC behavior.[^device]

**Proposal:** the shared approval screen identifies the signed-in Owner, chosen Agent, requested actions, and requesting installation label. Treat the installation label as descriptive, not verified software identity. Confirm **create a new Agent** versus **connect to an existing Agent** explicitly, so repeated “go play” requests do not accidentally create fresh leaderboard identities. After connection, return the selected `agentId`, display name, and granted permissions to the harness.

**Proposal:** store the selected Agent and its credential in the local connection profile. A later “go play a match for me” reuses that connection while valid; an instruction such as “play as Finch” selects an already-authorized profile or starts a new approval. Whether approval authorizes one match or ongoing play is separate from whether the Agent identity is persistent.

## 2. Owner browser login

| Login option | What the primary source establishes | Product implication — proposal |
| --- | --- | --- |
| **GitHub** | GitHub documents browser authorization, exchanging a code, and calling `GET https://api.github.com/user` with the resulting token to establish the current GitHub identity. Current documentation supports PKCE with `S256`.[^github] | A suitable initial option for a developer-oriented audience. Request identity-related access only; game participation does not require repository access. |
| **Google** | Google offers OpenID Connect authentication and ID tokens. Its documentation distinguishes an ID token containing identity information from an access token sent to Google APIs. It instructs applications to use `sub`, not email, as the account identifier.[^google] | Offer alongside GitHub for Owners who do not want a GitHub account. Map the verified identity to an internal Owner record. |
| **Passkey** | Passkeys are credentials tied to an account and website/application, using a public/private key pair and browser/OS interaction. They can use device unlock rather than a remembered password.[^passkeys] | A useful Owner login option. Decide whether it is available at signup or added later, and how an Owner recovers access after losing their login methods. Support differs between the two shortlisted products. |

**Proposal:** allocate an internal immutable `ownerId`; associate it with a verified authentication-system user ID or provider-qualified subject. Keep public handles and contact email separate. Link an additional login method through an authenticated account-linking flow. An email string alone should not silently decide that two Owner records are the same person; Google's explicit warning against email as a primary key is particularly relevant.[^google]

**Proposal:** browser login produces an Owner session used for profile management, Agent creation/selection, and credential management. The local harness receives a game credential with narrower authority, rather than a copy of this management session.

## 3. Getting authorization from the browser to the harness

These mechanisms can serve either Owner-first or Agent-initiated onboarding. They do not decide who owns a leaderboard identity.

| Mechanism | Documented mechanics | Fit and tradeoff — proposal |
| --- | --- | --- |
| **Dashboard-created Agent token** | Bearer authentication accepts a token in the `Authorization` header. RFC 6750 allows bearer tokens from sources other than OAuth and does not require JWT encoding.[^bearer] | Smallest initial release: the Owner selects an Agent and generates a credential, then configures it locally. Manual transfer adds friction but requires no CLI browser callback or OAuth authorization server. |
| **Device authorization, RFC 8628** | The client obtains a private `device_code`, a user-facing `user_code`, verification URI, lifetime, and polling interval. The user authenticates and approves in a browser; the client polls for a token. Incoming connections to the client are unnecessary.[^device] | Best for remote terminals, headless machines, and generic harness tools with outbound HTTPS but no reliable callback listener. The game needs a pending-request service, approval UI, and token endpoint. |
| **External browser + loopback PKCE, RFC 8252/7636** | A native client opens the external browser and receives an authorization code on a loopback IP URI such as `http://127.0.0.1:{port}/callback`. It exchanges that code using its per-request PKCE verifier. Public native clients must use PKCE; `S256` hashes the verifier for the initial challenge.[^native][^pkce] | Good local-desktop experience when the helper and browser share a computer: approve and automatically return to the terminal. A browser on another machine cannot directly reach that helper's loopback listener, so remote/container arrangements need another mechanism or additional setup. |

### Application-owned device flow — proposed application mapping

1. The harness requests authorization **from Agent Game**, retaining the private device code locally.
2. Agent Game displays a verification URL and short user code. The Owner opens the URL, authenticates using any supported browser login method, and creates/selects the Agent.
3. The Owner approves the specific Agent connection. The game binds the pending grant to that `agentId` and permitted actions.
4. The originating harness polls the game's endpoint and receives a **game-issued** access credential after approval.

RFC 8628 specifies expiring codes and polling behavior: honor the returned interval, default to five seconds if absent, increase the interval on `slow_down`, and stop on denial or expiration. A complete verification URL can remove manual code entry, but the user still confirms the matching code and approval. These are part of the protocol's user interaction and completion semantics.[^device]

**Proposal:** keep pending authorization separate from Agent creation, with one authoritative approval outcome. If authorization expires or the client must reconnect, a new request should allow selection of the existing Agent rather than force a new identity. A later guest-claim flow would additionally require possession of a private provisional credential; knowing a public Agent name or profile URL would not establish ownership.

RFC 8628 says device authorization is intended for browser/input-constrained environments, not to replace browser-based OAuth on capable native devices.[^device] **Proposal:** choose based on the actual helper environment: loopback PKCE for a capable local helper, device flow for headless/remote use. If the first release offers only generic shell instructions, a dashboard token or device pairing is a practical starting point.

### Loopback PKCE — important distinction

The loopback listener is a temporary server on the **user's computer**, not a publicly deployed callback on Workers. RFC 8252 permits HTTP for this loopback-only hop, recommends IP literals instead of `localhost`, permits an ephemeral port, and requires exact registered redirect matching except for the loopback port. PKCE binds code redemption to the initiating client instance; merely redirecting to localhost does not supply that protection. Distributed native applications are public OAuth clients: a shared secret embedded in a CLI is not proof of a confidential client.[^native][^pkce]

**Proposal:** the game's browser authorization page can authenticate the Owner through an upstream provider, then issue its own authorization code for the selected Agent grant. The CLI redeems that game code plus its verifier at the game's token endpoint. The browser callback carries a short-lived authorization code, not a permanent Agent credential.

### Upstream device login is a different authorization boundary

GitHub's device flow must be enabled for the registered GitHub application. Its approval produces a **GitHub access token** that can call GitHub APIs on behalf of the GitHub user.[^github] It does not inherently select an Agent or grant access to Agent Game.

```text
Owner authentication:
  Browser → GitHub / Google / passkey → verified Owner session

Agent authorization — proposed:
  Local harness → Agent Game pending request
  Owner session → choose/create Agent → approve game permissions
  Agent Game → local harness: credential bound to that Agent
```

**Proposal:** use upstream browser login within the game's approval page. Then the game's device flow works regardless of whether a chosen upstream provider offers a device grant. Using GitHub's device flow directly would still require the game to validate the provider identity and separately authorize/create/select the Agent before issuing its credential. A token's field name, such as `access_token`, does not make tokens from different issuers interchangeable.[^github][^google][^bearer]

OAuth `client_id` identifies client software/registration in these protocols; it is distinct from both the end user and authorization grant.[^device][^native] **Proposal:** do not use a shared CLI client ID as a persistent Agent ID, and do not require a new OAuth client registration for every named Agent.

## 4. Two realistic auth choices, with current compatibility evidence

### A. Clerk for managed Owner authentication

**Verified:** Clerk's React quickstart explicitly targets React with Vite and provides sign-in, signup, and user-management components. Its backend SDK documentation explicitly lists Cloudflare Workers/V8 isolates and documents request authentication. Social connections include GitHub and Google, and their sign-in/signup flows can create the account if it does not yet exist.[^clerk-react][^clerk-workers][^clerk-social]

**Verified limitation relevant to onboarding:** Clerk currently requires another method for signup before a user can add a passkey. Its documentation also marks passkeys as requiring a paid plan for production.[^clerk-options]

**Proposal:** use Clerk only as the Owner authentication/account layer. Resolve the authenticated Clerk user to an internal Owner, then keep Agent ownership, rankings, pending connections, and game grants in the application. This avoids needing a DO database adapter for Owner authentication. It still requires the game's Agent approval and credential service; installing a login SDK does not define those policies.

**Assessment:** preferred proposal when easy public signup and less account-management code outweigh dependence on a managed identity service. No special Clerk–Effect or Clerk–Alchemy integration was established by this research; the proposed boundary is ordinary backend request authentication plus application services.

### B. Better Auth on Workers, with D1 for authentication data

**Verified:** Better Auth documents a Workers request handler, a React client, social login, and the `AsyncLocalStorage` requirement. Its first-party 1.5 release notes document native D1 support through a directly supplied D1 binding. Its passkey plugin now documents both authenticated enrollment and configurable passkey-first registration.[^better-install][^better-d1][^better-passkey]

**Runtime detail:** Better Auth's setup examples explicitly enable `nodejs_compat` or `nodejs_als`. Current Cloudflare documentation says Node.js compatibility is enabled by default for compatibility dates **2026-08-04 or later**; earlier relevant dates need explicit opt-in. Thus the actual requirement is the needed runtime APIs under the selected compatibility date, not blindly copying an older example's flags.[^better-install][^cf-node]

**Storage distinction:** the verified direct integration is **D1**, not a generic promise that any SQLite API is interchangeable. Cloudflare documents D1 and SQLite-backed DOs as different interfaces and architecture: each DO has private storage accessed through the object, including `ctx.storage.sql`.[^better-d1][^cf-do] No drop-in Better Auth adapter for `ctx.storage.sql` was verified in the reviewed official material. **Proposal:** use D1 for Better Auth's tables and DOs for game/Agent state. If all identity storage must reside in DOs, adapter integration remains an explicit investigation rather than an assumed capability.

**Device-flow detail:** Better Auth's standalone `deviceAuthorization()` path returns a **Better Auth session token**. Its documented OAuth Provider composition instead issues scoped, audience-bound OAuth access tokens, using a different token endpoint. The documentation explicitly warns against confusing these two paths.[^better-device]

**Proposal:** if adopting its OAuth path, bind game authorization to the Owner-approved Agent and enforce that binding in game requests. A generic `api:play` scope for an Owner does not identify which of several Agents may act. Avoid delivering an Owner management session to the harness just because the standalone device endpoint calls its result `access_token`. Agent grant metadata and identity mapping still need application-specific design.

**Assessment:** a realistic self-hosted choice if an additional D1 auth database and responsibility for auth schema/configuration are acceptable. It offers more existing authorization-server machinery than a login-only integration, but the documented paths are not a completed Agent identity system.

## 5. Identity, scope, and lifecycle — proposals

### Separate the durable identities from their access mechanisms

| Record | Proposed meaning |
| --- | --- |
| **Owner** | Stable management identity and recoverable profile; owns several Agents; never a leaderboard competitor. |
| **Agent** | Stable `agentId`, name, owning `ownerId`, and standings. Rename, reconnect, and credential rotation preserve this identity. |
| **Grant / credential** | Owner-approved authority for one Agent, with its own identifier, permissions, installation label, expiry, and revocation state. An Agent can have multiple separately revocable installations. |
| **Run** | A particular execution/session using an Agent credential, with a distinct `runId`; useful for assigning match control and distinguishing concurrent executions. |
| **Revision** | Declared model/prompt/code/configuration version associated with a run or match; its effect on rankings is a product decision. |

**Proposal:** authenticate game actions into an Agent principal derived from the credential's server-side grant. Permit only that Agent's allowed participation, observations, and actions. Owner profile changes, creation of sibling Agents, account linking, and issuance of broader credentials remain Owner-session operations. A supplied `agentId` in a request is not sufficient to switch the credential's identity. This applies the resource/action scoping described by OAuth's current best practice to the requested domain model.[^oauth-bcp]

### Credential policy choices

**Proposal — small initial release:** issue a random opaque Agent key with explicit expiry and revocation. Store a verifier/hash and metadata server-side; return the secret when issued. This is straightforward for dashboard-generated keys and preserves Agent identity across replacements. Opaque references are a documented bearer-token representation; JWTs are not required.[^bearer]

**Proposal — long-running standards-based CLI:** use short-lived game access tokens backed by a renewable grant, with refresh authority restricted to the same Agent and actions. If using OAuth refresh tokens for public clients, RFC 9700 requires sender-constraining or refresh-token rotation. Rotation issues a new refresh token and invalidates the previous one; the grant retains the approved scope/resource restrictions.[^oauth-bcp]

**Proposal:** give each installation its own credential or refresh-token family. Concurrent processes should coordinate renewal or use separate grants, rather than independently rotating the same refresh token. This avoids ordinary concurrency resembling replay under the rotation semantics.[^oauth-bcp] Exact access lifetime, renewal lifetime, and approval duration remain user decisions.

### Rotation and recovery

- **Proposal:** an authenticated Owner can revoke one installation and authorize a replacement for the **same Agent**. Rotation changes access, not standings. If the secret is lost, reissue after Owner authentication rather than requiring recovery of the old secret.
- **Proposal:** Owner account recovery uses an already-linked alternate login method or the chosen authentication service's recovery process. Decide the supported recovery route before relying on a single passkey/provider. Possession of an Agent play credential should not recover the Owner's management account.
- **Proposal:** normal Owner browser logout leaves independently approved Agent grants active; “disconnect this installation” or “revoke all Agent credentials” has its own meaning. This supports unattended play without treating a browser session as the Agent's lifetime.
- **Proposal:** check revocation at the authoritative credential/grant store for new game actions. If adopting independently validated signed access tokens, choose either a bounded expiry delay or an online grant check for revocation; define what disconnect means for an already-started match.
- **Proposal:** retire Agent identities in a way that preserves attributable match history. Account deletion, ownership transfer, and whether transfer is permitted at all need explicit product rules.

## 6. Fit with Workers, SQLite DOs, Alchemy, Effect, and React/Vite

| Layer | Documented capability | Proposed responsibility |
| --- | --- | --- |
| **Worker boundary** | Both shortlisted auth products document backend request authentication/handling compatible with Workers.[^clerk-workers][^better-install] | Resolve Owner sessions for management requests and Agent credentials for game requests; pass the resulting principal into application logic. |
| **SQLite DOs** | Each DO has private transactional, strongly consistent storage. Persistent storage survives eviction/restart, unlike relying only on in-memory state.[^cf-do] | Persist ownership records, pending approvals, and grants. Keep each claim/approval transition in its chosen authoritative object's transaction boundary; durable state makes pending approval survive restarts. Match logic receives the authorized Agent/run identity. |
| **Alchemy** | Its documented `DurableObjectNamespace` supports SQLite storage and Worker bindings. Its Vite resource deploys Vite applications to Workers and supports database/environment bindings.[^alchemy-do][^alchemy-vite] | Provision the app, DO namespaces, and auth configuration/bindings; add D1 if choosing the documented Better Auth route. |
| **Effect** | Effect documents services as replaceable dependencies declared through effect requirements and supplied by implementations.[^effect] | Put Owner-session resolution, Agent authorization, and identity persistence behind narrow application services. The auth vendor's user/session types should be translated into the game's Owner/Agent model at this boundary. |
| **React/Vite** | Clerk documents a Vite quickstart; Better Auth provides a React client and standard request/response backend handling.[^clerk-react][^better-install] | Build the public discovery pages, Owner dashboard, and create/select/approve screen. Show the resulting Agent profile and connection status after authorization. |

**Proposal:** retain the application's own Owner and Agent identifiers even if the authentication provider changes. Storage layout and sharding can then evolve independently of the public competitor identity.

## 7. What authentication establishes

These mechanisms establish account/credential control and granted permissions. They do **not** establish one unique human per Owner account, prove a ranked Agent acted autonomously, or attest which model produced a move. Google subjects identify accounts; passkeys authenticate account-bound credentials; RFC 8628 explicitly notes that users in possession of a device may extract its bearer tokens and impersonate the client.[^google][^passkeys][^device]

**Conclusion for this client model:** request attribution can reliably mean “authorized as Agent X,” not “provably generated autonomously by Agent X.” Server-side withholding of game information also cannot prevent an Owner from sharing information they possess with their own client. Rankings and any autonomy/version labels should be described with that distinction in mind.

## Outstanding user decisions

1. **Entry experience:** Owner-first launch, both entrances, or also playable guest entries? If guests can play, what history survives a claim, and can any results become ranked?
2. **Owner login and operation:** Clerk-managed authentication or Better Auth with D1? GitHub only, GitHub + Google, or passkey-first signup? Which alternate login/recovery route should be supported?
3. **Local connection experience:** manual Agent key initially, an installed local helper with loopback PKCE, or device pairing for generic/headless harnesses? Which environments must work on day one?
4. **Delegation duration:** does “go play a match for me” authorize that one match, a bounded series, or ongoing play? How long should an installation's credential/renewable grant remain usable?
5. **Identity and names:** are Agent names globally unique or Owner-scoped? Are ownership transfers allowed? Which public Owner details appear on Agent profiles?
6. **Concurrent runs:** may one Agent enter multiple matches concurrently? Can multiple runs control the same match, or does a match grant exclusive control to one run? How should reconnect/takeover work?
7. **Version continuity:** does changing model, prompt, code, or tools keep the same Agent's rating, create a separately rated revision, or require a new Agent? Are revisions self-declared metadata, and what should old match records display?

## Sources

[^device]: IETF, [RFC 8628 — OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628), especially §§1, 3.1–3.5, 5.2, and 5.6: intended environments, signup during approval, device/user codes, polling, client classification, and users' ability to obtain client tokens.
[^native]: IETF, [RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252), especially §§4.1, 6, 7.3, and 8.1–8.5: external browser, chained authentication, PKCE, loopback redirects, registration, and public clients.
[^pkce]: IETF, [RFC 7636 — Proof Key for Code Exchange by OAuth Public Clients](https://www.rfc-editor.org/rfc/rfc7636), §§1.1 and 4.1–4.6: per-request verifier, `S256`, and token-endpoint verification.
[^github]: GitHub, [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), “Web application flow,” “Device flow,” and “Loopback redirect URLs.”
[^google]: Google Identity, [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), “Authenticating the user,” “Exchange code for access token and ID token,” and “An ID token's payload.”
[^passkeys]: Google Identity, [Passkeys](https://developers.google.com/identity/passkeys), “What are passkeys?”, “How do passkeys work?”, and “Security Benefits.”
[^bearer]: IETF, [RFC 6750 — The OAuth 2.0 Authorization Framework: Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750), §§1–1.3, 2.1, and 5.2: bearer possession, use outside OAuth issuance, authorization header, and opaque token references. Read alongside RFC 9700 for updated OAuth practice.
[^oauth-bcp]: IETF, [RFC 9700 — Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700), §§2.2.2, 2.3, and 4.14.2: privilege restrictions, renewable-grant scope/resource binding, public-client refresh protection, and rotation semantics.
[^clerk-react]: Clerk, [React Quickstart](https://clerk.com/docs/react/getting-started/quickstart.md?manual=1): React/Vite setup and authentication/user components.
[^clerk-workers]: Clerk, [Backend-only SDK](https://clerk.com/docs/guides/development/sdk-development/backend-only): explicit Workers/V8-isolate compatibility and request authentication.
[^clerk-social]: Clerk, [Social connections (OAuth)](https://clerk.com/docs/react/guides/configure/auth-strategies/social-connections/overview): provider support, combined signup/sign-in behavior, and upstream provider tokens.
[^clerk-options]: Clerk, [Sign-up and sign-in options](https://clerk.com/docs/react/guides/configure/auth-strategies/sign-up-sign-in-options), “Passkeys”: post-signup enrollment and production plan requirement.
[^better-install]: Better Auth, [Installation](https://better-auth.com/docs/installation): Workers handler, React client, authentication methods, schema management, and AsyncLocalStorage configuration.
[^better-d1]: Better Auth, [Better Auth 1.5](https://better-auth.com/blog/1-5#cloudflare-d1-support), “Cloudflare D1 Support”: directly supplied D1 binding and built-in dialect, announced February 28, 2026.
[^better-passkey]: Better Auth, [Passkey](https://better-auth.com/docs/plugins/passkey), “Configuration” and “Passkey-first registration (pre-auth)”: authenticated enrollment and configurable signup behavior.
[^better-device]: Better Auth, [Device Authorization](https://better-auth.com/docs/plugins/device-authorization), especially “Choose the token your device needs,” “Authorize a CLI to call an API,” and “First-party session flow”: session-token versus OAuth-token paths.
[^cf-node]: Cloudflare, [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), “Get Started” and “Enable only AsyncLocalStorage”: compatibility-date-dependent defaults and explicit opt-ins.
[^cf-do]: Cloudflare, [Access Durable Objects Storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), especially the introduction, “Access storage,” and “SQL in Durable Objects vs D1”: persistence, object-private transactional storage, and distinct database interfaces.
[^alchemy-do]: Alchemy, [DurableObjectNamespace](https://alchemy.run/providers/cloudflare/durable-object-namespace/): SQLite option and Worker bindings.
[^alchemy-vite]: Alchemy, [Vite](https://alchemy.run/providers/cloudflare/vite/): Workers deployment and custom database/environment bindings.
[^effect]: Effect, [Managing Services](https://effect.website/docs/v3/requirements-management/services/): service dependencies, requirements, and replaceable implementations. This supports the proposed service boundary, not a claim of a dedicated auth-vendor adapter.
