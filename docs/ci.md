# GitHub CI and deployments

Repository: **https://github.com/TimothyKrell/agent-game** (private).

## Verified lifecycle — 2026-09-11

- [PR #1](https://github.com/TimothyKrell/agent-game/pull/1) passed the complete Verify job: 33 rules/storage/CLI/supervisor/Worker tests, six API/recovery tests, five browser tests, lint, formatting, typechecking, build, and Worker dry run.
- [Preview deployment, attempt 3](https://github.com/TimothyKrell/agent-game/actions/runs/34645833373/attempts/3) passed from a fresh GitHub runner using the repository's Cloudflare token. The scripted match `match_c3ca42dd-b695-4f08-8a30-78346861d2bf` finished without forfeits, revealed its terminal record, and the workflow posted its preview link. Additional browser checks at 1440px and 390px verified the exhibition control and replay timeline with no page errors or horizontal overflow.
- Merging the PR produced commit `e08d4ae8e88a79b9acb2a6d7ab3a2a5e71e28eaf` and automatically started [production CI/deployment](https://github.com/TimothyKrell/agent-game/actions/runs/34658759080). Both Verify and Deploy production passed. Alchemy updated Arena and reported Identity as a no-op, retaining production database `a9f8b697-a4ba-4902-b05e-904fb903a440`.
- The production HTTP/OAuth-initiation/downloaded-CLI/browser smoke check passed at `2026-09-11T23:44:58.540Z`; its record is [deployment-smoke.json](evaluation/deployment-smoke.json). The deployed CLI archive is 16,380 bytes, SHA-256 `edb620de0697a6d22a6c0460c229e9bc96c03ffadd26a9370861fe3bb9a63b04`.
- [Automatic preview cleanup](https://github.com/TimothyKrell/agent-game/actions/runs/34658759919) deleted Arena, Identity, and PreviewAuth and updated the PR comment. The preview health URL subsequently returned 404. Its temporary D1 database was `aff5be4d-f7c4-4dd6-b1cf-acc96df2a2ec`.

The initial preview creation in attempt 2 deployed successfully but its first exhibition POST returned 500. A direct retry started a game; the previously pending allocation later recovered, and both games finished. A subsequent unchanged workflow rerun passed. The original response body was not retained, and the available local credential could not query historical Worker telemetry, so that 500's cause is **unconfirmed**, not a demonstrated fix. The smoke script includes bounded response bodies and terminal failure reasons in its diagnostics.

A second fresh preview in [PR #2](https://github.com/TimothyKrell/agent-game/pull/2) exposed a separate, concrete readiness race: Alchemy reported success while `/api/health` still served Cloudflare's HTML 404 page. The same URL subsequently returned the expected JSON. Recreating the preview showed that one successful probe could still be followed immediately by 404. Both deployment smoke scripts now require valid protocol health over a ten-second window, within a 90-second overall allowance, using only GET requests before performing their strict checks. Regression tests exercise unavailable → healthy routing, intermittent readiness, and persistent failure with bounded retries. Exhibition POSTs remain single-attempt, so application failures remain visible.

These checks used scripted preview games and started no paid model inference. Production social callback completion, approved cross-machine pairing, and ranked-game verification retain their separate launch status in [deployment.md](deployment.md).

### Fresh-resource verification — 2026-09-12

[PR #2's final verification run](https://github.com/TimothyKrell/agent-game/actions/runs/34661664162) passed the full suite (**36 tests**, six API/recovery tests, five browser tests) and deployed a fresh `pr-2` stack with `Plan: 3 to create`. Its new D1 database was `0626fb9d-3ed5-4cbd-9d6c-157e0060150b`. The first smoke invocation completed scripted match `match_ff5f0549-9184-4315-9997-42aef42fd388` without forfeits, verified spectator privacy and terminal reveal, and posted the preview URL. PR #2 merged as `06102d7093f98228a2aaa532a92e91daa95b2211`.

An earlier attempt with sustained health still returned a structured 500 on exhibition creation. Two fresh-resource deployments driven locally subsequently completed their immediate smoke checks, followed by the successful fresh GitHub deployment above. The 500's underlying cause remains unconfirmed. Preview verification now captures filtered Worker exceptions and application logs alongside its original exit status; the final successful run printed no such errors. Request headers and full tail records are not published to the job log.

## Pipeline

`.github/workflows/ci.yml` runs on pushes to `main`, open pull requests, and manual dispatch:

1. **Verify** installs the lockfile with dependency lifecycle scripts disabled, then runs lint (including warnings), formatting, all TypeScript checks, the production build, and a Worker bundle dry run. **Unit and Worker tests** distributes the entire existing Vitest inventory across three built-in shards, with one test worker per runner. **API and recovery tests** and **Browser and motion tests** run their complete suites on separate runners. Each job retains its 15-minute deadline.
2. **Verify production provider transport** runs the separate `npm run test:provider` suite against an isolated local HTTP Responses API. The actual Worker/HouseSeat/structured-provider path completes both Succession acts, validates accounting and stale-job fences, and exercises saved-response retry plus invalid-response/deadline interruption. Provider usage is synthetic; no paid model is invoked. Bash pipeline failure propagation preserves the test exit status while retaining the log.
3. **Deploy production** runs only after Verify, all three unit shards, API/recovery, browser/motion and provider verification pass for `main`. It deploys the existing `agent-game` / `prod` Alchemy stack and runs the public HTTP/OAuth-initiation/CLI/browser smoke check. The `production` GitHub environment is restricted to `main`.
4. **Deploy preview** requires the same complete verification set for same-repository PRs. It checks that the PR is still open at the tested head, then creates or updates stage `pr-<number>` and comments its URL. Each stage has a separate Worker, D1 database, Durable Object namespaces, and generated auth secret.

Preview URLs are `https://agent-game-pr-<number>.tk-d86.workers.dev`. They offer accelerated scripted exhibitions and terminal replays. Ratings are disabled; OAuth clients and paid inference bindings are omitted. Owner/account flows are covered by the local integration tests and the production smoke check.

`.github/workflows/preview-cleanup.yml` removes that PR's stack when it closes or merges and updates the comment. Cleanup uses the default branch's code. Deploy and cleanup share a per-PR concurrency group; production has its own serialized group. In-progress deployments are allowed to finish rather than being canceled during infrastructure writes.

Build/unit/API/browser diagnostics and the synthetic-provider log are retained for seven days, including on failure. Explicit Bash shells propagate failure through each `tee`; verbose unit/API logs retain immediate failure messages, JSON reports retain completed test results, and unit artifacts retain actual-host bounds counters. Unit logs record Node version, available CPUs, total memory and the one-worker limit. Production and preview smoke evidence are retained for thirty days. The preview smoke completes one actual scripted exhibition of each game, checks public HTTP/WebSocket terminal delivery, both Succession acts, bounded current/full archive paging, round-index replay and opaque anchors. Its JSON records the tested source commit and match IDs. Production smoke checks public discovery, both scoped games, immutable old/new downloadable CLI packaging and browser rendering without starting a match.

### Succession CI diagnosis — 2026-09-13

[Run 34764414297](https://github.com/TimothyKrell/agent-game/actions/runs/34764414297) at `25fce1a` hit the original combined job deadline. The unit step progressed continuously from 15:03:40 through 15:18:00 UTC and was cancelled at 15:18:01. Its 29 completed file reports total **847.086 seconds**, after about 51 seconds of setup/static checks. The actual Worker (211.364s), history corpus (202.099s), preview Worker (204.133s), installed CLI/Worker (67.718s) and seeded engine (58.146s) alone total 743.460s. API/browser/dry-run/hosted steps were skipped. This establishes aggregate job-budget pressure; the cancelled run did not capture CPU or memory measurements.

The same log also contains a separate bounds-fixture failure after 191ms, following the passing small baseline. A focused, unchanged two-test run (`CI=true`, Node 24.21.0, `--maxWorkers=1 --bail=1 --reporter=verbose`) reproduced it in 13.96s: the second case read `queued` and immediately asserted `matched`. Queue join schedules the allocation alarm and returns the actual current participation; allocation is asynchronous. The fixture now waits up to ten seconds for the actual `matched` Succession ticket and asserts a nonempty match ID, following the existing real-Worker fixture pattern.

With that single fixture change, the identical command passes **2/2 in 226.23s**: small baseline 11.224s, complete large traversal 208.484s, including all 31,200 Unicode messages, 64 escaped messages and original native host/storage/wire assertions. Raw red/green logs are `/tmp/opencode/succession-ci-bounds-{baseline,corrected}-1a920d5.log`, SHA-256 `5317e92d60d23db0636c4156543433ddb54383f79f229ed256d7d54125fb0855` / `14060ab1a427d9cef414d3611978b92b3e4e2cda1e7176cccc10131734e90ded`. Corrected native-host counter JSON is `/tmp/opencode/succession-worker-bounds-results-3668649.json`, SHA-256 `1bcd905329be37bee8bb3fb288198652ea0fc2f32525da10f9018be409219b0d`. This local run uses the CI Node version and one Vitest worker; it does not reproduce the hosted runner's hardware.

The three-shard layout uses Vitest's actual `BaseSequencer` and complete configured inventory: **30 files, exact union, each once**. Recorded completed-file portions group into 274.589s, 304.029s and 268.468s; shard one's failed bounds timing is not a full traversal measurement, and the cancelled run did not complete `worker-errors.test.ts`. These figures justify distributing work but are not new-job pass results. All seeds, corpus sizes, test deadlines and assertions remain in scope; both deployments require every verification job. Final current-head CI supplies the post-correction runtime evidence.

## Credentials and configuration

Repository secret:

- `CLOUDFLARE_API_TOKEN`: Cloudflare account-scoped CI credential. Required account permissions: Workers Scripts **Edit**, D1 **Edit**, Secrets Store **Edit**, Account Settings **Read**. Alchemy uses Secrets Store when authenticating its existing remote state store from a fresh runner.

`production` environment secrets:

- `BETTER_AUTH_SECRET`
- `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`
- `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY` only if an OpenAI house provider is later selected

The `OAUTH_` prefix avoids GitHub's reserved `GITHUB_` secret-name prefix. Workflow steps map these names to the application's normal environment variables.

Repository variables:

- `CLOUDFLARE_ACCOUNT_ID`, `WORKERS_SUBDOMAIN`, `PRODUCTION_URL`
- `HOUSE_PROVIDER`, `HOUSE_MODEL`, `HOUSE_DAILY_BUDGET_USD`, `HOUSE_MATCH_RESERVATION_USD`, `MAX_CONCURRENT_MATCHES`
- Optional `HOUSE_SUCCESSION_MATCH_RESERVATION_USD`; an empty value uses `HOUSE_MATCH_RESERVATION_USD`.

GitHub supplies `GITHUB_TOKEN` for PR comments. Alchemy reads its Cloudflare credential from the deployment step's environment and reuses the account's remote state store. Local `.env.production`, `.dev.vars`, credentials, and generated deployment state are ignored by Git.

## Operations

- Open a PR to get a preview; its comment tracks the latest successful deployment.
- Merge into `main` to deploy production automatically after checks pass.
- Re-run a failed job in GitHub Actions after correcting credentials or a transient provider issue. Manual **CI and deploy** dispatch on `main` also verifies and deploys the current version.
- Rotate the Cloudflare token with `gh secret set CLOUDFLARE_API_TOKEN --repo TimothyKrell/agent-game`, using hidden terminal input.
- Rotate application secrets through the `production` environment, then re-run production deployment.
- Closing a PR deletes its preview data. Production data remains in the `prod` stack.

Pinned action revisions are maintained through weekly Dependabot PRs. npm dependencies remain governed by the existing lockfile and compatibility checks.
