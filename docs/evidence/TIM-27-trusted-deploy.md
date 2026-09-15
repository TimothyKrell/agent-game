# TIM-27 — trusted scripted preview delivery prerequisite

## Status

Implemented locally on `feat/tim-27-trusted-preview-deploy`, based on `d0f5401`. This is the trusted artifact-delivery prerequisite. It does not configure source-account registration, OAuth handoff or paid broker play. No Cloudflare deployment, GitHub workflow trigger, credential inspection/provisioning or push was performed.

Hosted acceptance requires the controller to land on the default branch, environment-restricted deployment credentials, and a real same-repository PR lifecycle run. Previous hosted preview evidence in `docs/ci.md` belongs to the former PR-executed deploy path.

## Trust boundary

```text
PR CI: locked install → app/CLI build → Wrangler dry-run → immutable ZIP artifact
                               no deployment/source credentials
                                            │ bytes only
default branch: GitHub eligibility → bounded ZIP quarantine → hash validation
                                            │ private read-only snapshot
default branch: fresh eligibility → Alchemy prebuilt upload + isolated SQL
                                            │
                 credential-free scripted smoke → fresh eligibility → PR comment
                                            └─ future source-registration seam
```

The controller never imports or executes a module, script, configuration or plugin from the PR artifact. Only reviewed default-branch code and its locked dependencies run on the deployment runner. `npm ci --ignore-scripts` runs before the secret step without PR-shared caches. SQL is data interpreted by D1 solely against Alchemy's trusted `Identity` resource in `pr-<number>`. Artifact metadata cannot specify a PR number, account, Worker name, origin, binding, token, shell command, plugin or migration target.

Artifact validation establishes **byte identity**, not benign PR semantics. An untrusted Worker can access its own preview bindings and serve arbitrary responses. Its credentials consist of its per-preview auth secret and isolated Worker/D1/DO/R2 resources. No production/source/broker authority is bound. Preview configuration stays `HOUSE_PROVIDER=preview`, `HOUSE_MODEL=scripted`, `TIME_SCALE=0.1`, two concurrent matches, both dollar budgets zero, and preview-mode ratings disabled.

### Required external credential cutover

Delivery is **default off**. Both the identity job and the actual deployment/environment job require the repository variable `TRUSTED_PREVIEW_DEPLOY_ENABLED` to equal `true` and the event ref to equal the repository default branch. The controller repeats that activation check and validates `GITHUB_WORKFLOW_REF` against the fixed default-branch delivery workflow. Immediately before starting Alchemy it requires the distinct `PREVIEW_DEPLOY_TOKEN` input, supplied only from `secrets.TRUSTED_PREVIEW_CLOUDFLARE_API_TOKEN`. It maps that input to Alchemy's `CLOUDFLARE_API_TOKEN` internally; the old secret name and cached CLI authentication are never fallbacks.

Operator cutover, before setting that repository variable:

1. Explicitly create/configure the `preview` environment with **Selected branches and tags**, allowing only the default branch (`main`), with no PR-ref/tag/wildcard rule. GitHub automatically creates an absent referenced environment without protections, so its name alone proves nothing.
2. Place `TRUSTED_PREVIEW_CLOUDFLARE_API_TOKEN` **only in that environment**, never at repository/organization scope. Set the existing trusted account/subdomain variables. Preserve production access by placing its existing `CLOUDFLARE_API_TOKEN` in the separately default-branch-only `production` environment.
3. Remove all PR-reachable repository/organization broad Cloudflare credentials, including the old repository `CLOUDFLARE_API_TOKEN`. A same-repository PR can request any remaining repository secret from its own workflow. Verify environment branch restrictions and credential scope externally.
4. Land the reviewed controller and producer workflow on the default branch, then set repository variable `TRUSTED_PREVIEW_DEPLOY_ENABLED=true`. Unset/false means no new delivery. Missing new credentials fail before Alchemy starts even if a legacy token exists.

Cleanup deliberately remains independent of the new-delivery switch, using the same environment-only new secret. A missing credential fails the close workflow visibly. Recover missed close events or retained old stages using `preview-cleanup.yml`'s `workflow_dispatch` on `main` with the canonical positive integer `pr-number`; it verifies the live same-repository PR is still closed under the shared lock before destroying anything. It requires neither an artifact nor the delivery activation variable. Configure the protected cleanup credential before retiring the old close path, and reconcile closed stages whose cleanup failed during cutover. No source bridge authority may be enabled before cutover is confirmed. No secret, variable or environment changes were performed here.

## GitHub verification and races

`scripts/preview-github.ts` obtains the current repository, canonical CI workflow, originating run, attempt-specific jobs/steps, artifact inventory, current PR, immutable tested-commit parents, same-head CI runs, and trusted/built producer blob IDs through GitHub's REST API. It requires:

- Exact repository numeric ID/name, same-repository head/base, `pull_request` event, `.github/workflows/ci.yml` path and workflow ID, completed successful originating run and exact triggering attempt.
- One associated open PR targeting the repository default branch, with its current head matching the run association. The built commit comes from the exact successful `Verify` job's first user step (number 2), whose GitHub-evaluated name is `Preview identity v1 merge=${{ github.sha }} base=${{ github.event.pull_request.base.sha }} head=${{ github.event.pull_request.head.sha }}`. It runs before checkout or PR tooling. Require one exact marker, successful step/job status, exact run/attempt/head, and GitHub commit parents equal to that historical base/head in order. Never derive tested identity from the artifact claim or moving `refs/pull/N/merge`. Run API head SHA and current PR head remain independently checked.
- Exactly one successful, completed job from the same run/attempt/head for each of Verify, all three unit shards, API/recovery, browser/motion and production provider transport. Skipped, pending, failed, duplicate, missing or old-attempt jobs fail closed.
- The CI workflow, setup action, producer, artifact verifier and content-archive codec blob IDs at the **tested merge** match the trusted controller commit. The workflow blob at the independently associated PR head must also match, preventing a modified PR workflow from nominating another merge through a forged step name. A PR changing those files must first land that controller/producer update on the default branch and use that accepted workflow. This prevents spoofing the required job/identity names.
- Exactly one `preview-bundle-<run-id>-<attempt>` artifact, nonexpired, correctly associated with the run/repositories/head and carrying a SHA-256 digest. Download uses that API artifact ID; the signed storage redirect receives no GitHub token. The downloaded ZIP digest must match before extraction.
- No newer same-PR CI run or newer attempt, even if it failed. Current-run presence and complete inventories are required. Inventories reaching 100 entries fail closed rather than silently truncating.

An identity-only job derives the concurrency key from verified API data. Delivery then repeats verification under `preview-<PR number>` concurrency, shared with close cleanup and `cancel-in-progress: false`. Both use the currently documented `queue: max`: default `single` queueing can cancel a pending close cleanup when a later deploy arrives. GitHub permits up to 100 pending entries with `max`; canceled/overflowed cleanup can be rerun or dispatched explicitly for that closed PR. Ordering is not assumed. The controller checks eligibility again immediately before deployment and publication. A close, synchronization, newer attempt or newer CI run during build/smoke prevents publication. A base-only advance preserves the historical tested merge and proof. A full rerun preserves its original event SHA/base/head and becomes eligible with the new successful attempt/artifact; rerunning only a subset remains ineligible because every required job must succeed in that attempt. Cleanup rechecks closed state before destruction and before its comment; a reopened PR is ineligible for stale cleanup.

GitHub and Cloudflare do not provide an atomic cross-service transaction. A close or synchronization during an already-started infrastructure write can leave an unadvertised old preview briefly; queued close cleanup or newer delivery converges it. There is no promise that a historical comment remains current after a later commit: the comment lists its verified head and explicitly invalidates that status on new commits. Future source registration must use its own lease/revocation fences in addition to these fresh API checks.

## Artifact format and prebuilt contract

`scripts/produce-preview-artifact.ts` runs only in unprivileged CI, after `npm run build`:

```sh
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir <local-directory> --no-autoconfig
```

The locked Wrangler 4.129.1 CLI help confirmed those flags. The producer copies the complete emitted Worker graph (excluding Wrangler's README/source-map diagnostics), existing built client assets and SQL migrations. It records `git rev-parse HEAD`, checks it against CI `GITHUB_SHA` and rechecks it after producing the artifact. CI uses the synthetic merge checkout; `PR_HEAD_SHA` comes separately from the pull-request event.

Canonical `manifest.json`, schema version 1:

```json
{
  "version": 1,
  "repository": "TimothyKrell/agent-game",
  "runId": 100,
  "runAttempt": 2,
  "prHeadSha": "1111111111111111111111111111111111111111",
  "builtCommit": "2222222222222222222222222222222222222222",
  "entry": "worker/worker.js",
  "branchContent": {
    "archivePath": "assets/downloads/previews/<builtCommit>/<archive-sha256>.tgz",
    "games": []
  },
  "files": [{ "path": "assets/index.html", "bytes": 123, "sha256": "<64 lowercase hex characters>" }]
}
```

The example above illustrates fields only; a deployable inventory includes all required files and actual SHA-256 values. The verifier accepts only the declared keys and sorted unique paths. Limits are 2,048 payload files, 240-character paths, 16 MiB per payload, 100 MiB total, 512 KiB manifest and 110 MiB downloaded ZIP. Allowed trees are `worker/`, `assets/` and `migrations/`. Symlinks, hardlinks, special files, traversal, dot/config files, header/redirect overrides, undeclared files/directories, duplicate ZIP paths, encrypted/unsupported ZIP entries, size/hash mismatches and mutating reads are rejected. A snapshot is written from validated buffers into a fresh private directory, with read-only files/directories; it is checked again before Alchemy reads it.

The manifest requires the real three Durable Object exports in the built entry, resolves all static/known literal module imports, and rejects missing modules. The one locked Better Auth optional `nodeSqlite` computed built-in import is explicitly recognized; arbitrary computed imports fail closed. No transformation or export generation occurs in the deployer. The Alchemy 2.0.0-beta.76 `Workers/Sources/Prebuilt.ts` contract reads the entry first, selects other modules with exact rules relative to the entry directory, and returns each file unchanged. Tests exercise that actual installed implementation, including a companion module and a malicious top-level entry.

Versioned CLI archives (including the retained 0.1.1 release), game rules, migration 0003 and private R2 storage survive the handoff. New SQL migrations such as 0004 are accepted as bounded data without this controller inventing their runtime contract. Actual retained prototype fixture filenames/markers, capture tools and Agentation payloads are forbidden in emitted assets. A legitimate future production filename such as `succession-dossier-a123.js` is accepted.

### Branch content archive

`scripts/preview-content.ts` adds one deterministic, regular-file-only USTAR/gzip archive at `assets/downloads/previews/<builtCommit>/<sha256>.tgz`. Its seven UTF-8 Markdown entries are the two games' rules/protocol/rating-method files under `package/public/` plus the shared `package/skills/agent-game/SKILL.md`. There are no CLI modules, package manifest/scripts, links, executable modes or extended tar headers. Compressed and expanded bytes are bounded at 2 MiB; each text file is bounded at the source registry's **128 KiB**. Validation checks exact headers, inventory, padding/trailer, sizes, text-file digests and equality of public archive entries with the built public assets.

The manifest's `branchContent` must contain both full game descriptors: `gameId`, internal string `protocol`, `rulesVersion`, and `{path,bytes,sha256}` for `rules`, `skill` and `protocolFile`; the abbreviated example above omits those entries. The unprivileged producer reads the PR's game descriptors, while the credentialed controller never imports them. The checked delivery proof converts protocols to numeric `1`/`2`, attaches the exact trusted target origin and carries the resulting `branchContent.games`. This is branch data, not source executable authority. Original 22-file evidence predates this additional archive and is preserved at its original implementation commit.

## Exact source-registration extension interface

After successful quarantine, the controller writes:

- `.agent-game/preview-manifest.json`: the exact canonical manifest bytes, with every file's size/SHA-256.
- `.agent-game/preview-delivery.json`: `deliveryProof(...)` from `scripts/preview-controller.ts`:
  - `version`, `repository`, `repositoryId`, `prNumber`, `prHeadSha`, `builtCommit`, `testedBaseSha`, `runHeadSha`, `identityStep: {jobId, number, name}`;
  - `runId`, `runAttempt`, `workflowId`, `jobs: [{id, name}]`;
  - `artifactId`, `artifactName`, `artifactDigest` (GitHub ZIP SHA-256), `manifestSha256`, `controllerCommit`;
  - `target: {stage, workerName, origin, policy: "scripted-zero-budget-unranked"}` derived entirely from the trusted PR number and configured Workers subdomain;
  - `branchContent: {games: [...]}` with numeric protocols, verified text descriptors and the shared target content-addressed archive URL/digest/size;
  - `sourceRegistration: {status: "not-configured"}`.

These files are retained with the smoke result for 30 days. The proof records verified input; actual deployment/smoke success comes from those workflow steps and their retained output. A future registration implementation belongs at the explicit workflow seam after credential-free smoke and before publication, inside the same per-PR lock. It must call `GitHub.verify(expected, controllerCommit)` and `verifyManifestIdentity(manifest, verified)` again, compare both retained hashes, and pin the **built commit plus artifact/manifest digests**, rather than treating the PR head as the uploaded commit.

The bridge owner's accepted module-level contract is now available in `src/server/preview-config.ts` on the parent integration branch:

```ts
registerPreviewTarget(sourceEnv, { origin, incarnation, commit, publicKey });
configurePreviewTarget(targetEnv, incarnation, commit, privateKey);
closePreviewTarget(sourceEnv, origin, incarnation);
```

Map `origin` to verified `proof.target.origin` and `commit` to `proof.builtCommit`, never to `prHeadSha` or a package version. Keys are ECDSA P-256 with base64 SPKI DER public keys and base64 PKCS8 DER private keys. The incarnation must come from retained trusted lifecycle state, remain stable across same-incarnation updates, and change after closure/recreation; it must not be an artifact claim or reused tombstone. The parent CLI package version can advance independently (currently 0.3.0); retained archive digests and per-commit manifest pins continue to identify the actual downloadable artifacts.

### Concrete privileged invocation handoff to the bridge owner

Use **default-branch in-process lifecycle functions with a D1 REST adapter**, rather than an application HTTP registration surface. A trusted registration module runs in the deployment process and imports only the accepted default-branch lifecycle module. Its D1 adapter forwards parameterized operations over the authenticated Cloudflare D1 API to database IDs obtained from trusted Alchemy stage state: source `agent-game/prod` output `databaseId`, target `agent-game/pr-<verified number>` output `databaseId`. These IDs, account ID and source origin cannot come from a PR artifact. Target configuration runs with the same retained `PreviewAuth` value used for the Worker binding, held in memory inside trusted Alchemy execution; that value must never appear in CLI arguments, logs, proof artifacts or source configuration. Source registration/closure needs no source auth secret or public endpoint.

Exact bridge-owned adapter requirement: expose narrowly typed control-plane environments for the existing functions (or a focused control-plane wrapper) so trusted tooling can provide D1 `prepare/bind/run` plus the environment fields actually used, without manufacturing a complete application `Env`. Registration needs `DB` and environment/origin validation; configuration additionally needs `APP_URL`, `PREVIEW_SOURCE_URL` and target `BETTER_AUTH_SECRET`; closure needs source `DB`. The adapter must use only the default branch's accepted functions/SQL and preserve their tombstone and encryption semantics. This worktree does not modify the concurrently owned runtime files or copy their implementation into an infra script.

The accepted artifact-registry seam at parent `dc60060` additionally requires real D1 `batch` and `first`: `registerPreviewArtifacts` performs its conditional insert/read in **one atomic batch**, not separate REST requests. Include this in the narrow source control-plane environment. The adapter must return standard D1 result metadata/results and preserve parameter binding; it must not translate registry SQL into independent writes.

Required lifecycle ordering once that handoff is implemented:

1. Under the existing per-PR lock, verify the same artifact/commit proof and resolve trusted source/target resources and retained incarnation/key material.
2. Deploy target bytes and migrations with trusted `PREVIEW_SOURCE_URL` set to the source origin. Add `/preview` and `/preview/*` to Worker-first routing alongside existing API/discovery paths for both source and target. The current prerequisite keeps source configuration absent; enabling it requires the paired runtime registration step.
3. Call `configurePreviewTarget(targetEnv, incarnation, proof.builtCommit, privateKey)`, then recheck current eligibility and call `registerPreviewTarget(sourceEnv, {origin: proof.target.origin, incarnation, commit: proof.builtCommit, publicKey})`. Confirm the source's bounded discovery reports the exact tuple and owner entry link before publishing it. The accepted functions return `void`; discovery supplies the entry link/readback, not an invented function response.
4. If eligibility changes after registration, close that exact incarnation before advertising anything. Close cleanup must invoke `closePreviewTarget(sourceEnv, origin, incarnation)` **before** destroying target resources, independent of artifact retention. Persist lifecycle state needed for this close/retry path outside the PR artifact, with source tombstones authoritative.

Source credentials exposed to PR workflows remain an external blocker. The bridge's queue stays gated pending broker followup, even after identity registration. Metadata is never an instruction to execute a registration command from the artifact. Source-account play requires this adapter, lifecycle readback and credential cutover to be integrated and tested before the comment's `not-configured` status changes.

### Source-published artifact mapping (`dc60060`)

`scripts/preview-publication.ts` provides the concrete source-artifact metadata and readback seam:

1. Obtain the **released source** executable descriptor from trusted source deployment/release state, independently of the PR artifact and current checkout package version. `verifySourceExecutable(sourceOrigin, executable)` fetches only the exact `${sourceOrigin}/downloads/agent-game-cli-${version}.tgz`, without credentials or redirects, and verifies its pinned bytes/hash and `[1,2]` protocol declaration. A matching URL alone is insufficient. This lane does not invent a hosted release pin.
2. After fresh GitHub and retained-manifest/proof verification under the per-PR lock, call `previewArtifactPublication(verified, validatedArtifact, {subdomain, sourceOrigin, incarnation, executable})`. It maps the independently verified **built commit**, trusted target origin, retained incarnation, verified target text/archive bytes and independently trusted source executable into the exact version-1 source contract.
3. In the default-branch D1 control-plane lifecycle wrapper, call the parent's `parsePreviewArtifactManifest(sourceEnv, JSON.stringify(publication))` then `registerPreviewArtifacts(sourceEnv, parsed)` after successful target configuration/registration. There is no HTTP write route and the source server performs no generic fetch. Recheck eligibility immediately before this write; retain immutable tuple conflicts rather than replacing them.
4. After credentials leave scope, call `verifySourcePublicationReadback(publication)`. It performs the real source `GET /api/preview/artifacts?origin=<target>&commit=<builtCommit>`, requires `no-store`, bounds JSON to 16 KiB and checks exact semantic equality before any source-artifact availability claim. A pending/stale/closed tuple or different executable pin fails publication.

The parent's source schema and lifecycle implementation are used directly in the local integration harness, not copied into deployment code. `.tim27-deploy/check-source-registry.mjs` reads a pinned `dc60060` source tree into this worktree's scratch space, dry-run bundles its actual Worker, uses real local D1 and actual source GET responses, and checks the parent's actual packaged 0.3.0 bytes through local source asset delivery. It covers 503 pending, successful publication/readback, immutable retry/conflict and stale/closed 503 responses. These local bytes are **not** evidence of a hosted 0.3.0 release. Source registration stays `not-configured` until the resource/environment adapter, released-source pin, identity lifecycle and credential cutover are integrated; broker admission remains separately gated.

## Cleanup and production

Stack/resource identities remain `agent-game`, `pr-<number>`, `Arena`, `Identity`, `Matches`, `Matchmaking`, `HouseSeats`, `PreviewAuth`, and `AgentPictures`. The `PREVIEW_OPERATION=destroy` branch returns an empty stack spec before any artifact lookup. Locked Alchemy `Plan.destroy` deletes the persisted stage's resources, including bindings and the preview R2 bucket; no client build or surviving artifact is required. Preview R2 resources are created with `forceDestroy: true` so their temporary objects do not block authorized close cleanup. Legacy nonempty buckets created without that persisted flag will fail closed and require operator review; the controller never performs account-wide deletion or adopts unrelated resources.

Production keeps the existing `prod` branch, source-bundled Worker, resource identities and binding policy. Preview-only inputs do not select production names, domains or resource IDs. All existing CI check jobs, three-shard inventory and 15-minute job deadlines remain in place.

## Local evidence and hosted acceptance

Review corrections to `b276c8f` are recorded separately in [`.tim27-deploy/corrections.md`](../../.tim27-deploy/corrections.md): five red regressions, then **77/77 passing checks**, immutable run-bound merge identity and default-off credential activation. Original artifact/game evidence is preserved byte-for-byte.

Commands, pinned-source references and the final validation record are retained under [`.tim27-deploy`](../../.tim27-deploy/README.md). The tests cover the actual Wrangler-produced app, Alchemy raw-byte reader, Miniflare/workerd health and three DO exports, all local D1 migrations, Better Auth's existing loopback-only owner session, R2 picture upload/readback, malformed/tampered archives, config injection, byte/count limits, symlinks and mutation. GitHub REST-shaped fixtures exercise current checks and race rejection, and command/comment tests use local process boundaries with synthetic credentials only. Existing preview-game, deployment-readiness and released-CLI regression tests are also run.

Still required on GitHub/Cloudflare after landing and credential cutover: fresh create/update with real API response shapes and artifact ZIP digest, both-game hosted smoke, synchronized/rerun/close race readback, no obsolete publication, cleanup with the original artifact deleted (including a nonempty preview R2 bucket), and confirmation of the existing production state. None of those hosted checks is represented as completed local evidence.

### References retrieved for this implementation

- [GitHub workflow events: `workflow_run` and `pull_request`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run): default-branch workflow requirement, privileged downstream workflow risk and merge-checkout SHA distinction.
- [GitHub workflow syntax: concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).
- [GitHub workflow run/job/artifact REST APIs](https://docs.github.com/en/rest/actions): exact run, attempt-specific jobs and artifact-ID download.
- [GitHub reruns](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/re-running-workflows-and-jobs): original `GITHUB_SHA` and `GITHUB_REF` survive reruns.
- [GitHub environment management](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments): automatic creation without protections, selected branch/tag rules and environment-only secrets.
- [Cloudflare Wrangler Worker commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/), plus the installed 4.129.1 `deploy --help`.
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
- Locked Alchemy source: `src/Cloudflare/Workers/Sources/Prebuilt.ts`, `src/Cloudflare/Workers/Assets.ts`, `src/Cloudflare/D1/Database.ts`, `src/Cloudflare/R2/Bucket.ts`, `src/Plan.ts`, `src/Cli/commands/deploy.ts`.
