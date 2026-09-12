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

## Pipeline

`.github/workflows/ci.yml` runs on pushes to `main`, open pull requests, and manual dispatch:

1. **Verify** installs the lockfile with dependency lifecycle scripts disabled, then runs lint (including warnings), formatting, all TypeScript checks, the production build, unit/storage tests, real Worker API/recovery tests, Playwright desktop/mobile tests, and a Worker bundle dry run.
2. **Deploy production** runs only after Verify passes for `main`. It deploys the existing `agent-game` / `prod` Alchemy stack and runs the public HTTP/OAuth-initiation/CLI/browser smoke check. The `production` GitHub environment is restricted to `main`.
3. **Deploy preview** runs after Verify passes for same-repository PRs. It checks that the PR is still open at the tested head, then creates or updates stage `pr-<number>` and comments its URL. Each stage has a separate Worker, D1 database, Durable Object namespaces, and generated auth secret.

Preview URLs are `https://agent-game-pr-<number>.tk-d86.workers.dev`. They offer accelerated scripted exhibitions and terminal replays. Ratings are disabled; OAuth clients and paid inference bindings are omitted. Owner/account flows are covered by the local integration tests and the production smoke check.

`.github/workflows/preview-cleanup.yml` removes that PR's stack when it closes or merges and updates the comment. Cleanup uses the default branch's code. Deploy and cleanup share a per-PR concurrency group; production has its own serialized group. In-progress deployments are allowed to finish rather than being canceled during infrastructure writes.

The build artifact and browser diagnostics are retained for seven days. Production smoke evidence is retained for thirty days. Smoke checks start no ranked games and invoke no paid models; the preview smoke completes one scripted exhibition.

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

GitHub supplies `GITHUB_TOKEN` for PR comments. Alchemy reads its Cloudflare credential from the deployment step's environment and reuses the account's remote state store. Local `.env.production`, `.dev.vars`, credentials, and generated deployment state are ignored by Git.

## Operations

- Open a PR to get a preview; its comment tracks the latest successful deployment.
- Merge into `main` to deploy production automatically after checks pass.
- Re-run a failed job in GitHub Actions after correcting credentials or a transient provider issue. Manual **CI and deploy** dispatch on `main` also verifies and deploys the current version.
- Rotate the Cloudflare token with `gh secret set CLOUDFLARE_API_TOKEN --repo TimothyKrell/agent-game`, using hidden terminal input.
- Rotate application secrets through the `production` environment, then re-run production deployment.
- Closing a PR deletes its preview data. Production data remains in the `prod` stack.

Pinned action revisions are maintained through weekly Dependabot PRs. npm dependencies remain governed by the existing lockfile and compatibility checks.
