# GitHub CI and deployments

Repository: **https://github.com/TimothyKrell/agent-game** (private).

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
