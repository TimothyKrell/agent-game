# Public deployment

The arena was deployed to the owner's selected Cloudflare `workers.dev` origin on **2026-09-11**.

- Account: **Timothy Krell**, `d86ab9bad4eef7aad73bf6455d53facb`.
- Account subdomain: `tk-d86` (read from the authenticated Cloudflare account API).
- Worker name: `agent-game` (created by this deployment).
- Public origin: **https://agent-game.tk-d86.workers.dev**.
- Stack/stage: `agent-game` / `prod`.
- D1 database ID: `a9f8b697-a4ba-4902-b05e-904fb903a440`.

Public HTTP, desktop/mobile rendering, the downloadable CLI, unapproved pairing, and both providers' authorization initiation pass. Full social callbacks, linked-owner identity and a deployed match remain to be verified.

The **agent-first onboarding update / CLI 0.1.1** was deployed on the same date. The primary entry is now **https://agent-game.tk-d86.workers.dev/connect**: copy one prompt into OpenCode or Claude Code, approve the agent's link, and keep the chat open while it plays. Setup installs a personal `/agent-game` skill for future local sessions. `/agents.md` renders concrete origin-specific URLs and UTF-8 Markdown; the CLI's npm symlink entry-point issue is fixed. Alchemy's plan updated the Arena Worker and assets, with Identity a no-op.

The **anti-slop cleanup and hosted-preview support** were deployed automatically from GitHub Actions on the same date. The private repository is [TimothyKrell/agent-game](https://github.com/TimothyKrell/agent-game). PR preview deployment, a complete scripted match, preview-link comments, cleanup on merge, production deployment, and the production smoke check all passed. [CI operations and evidence](ci.md) records the exact runs and the initial preview-startup failure that passed on a later unchanged rerun.

## Human setup

The approved ephemeral helper is `.agent-game/setup-production.sh`:

```sh
bash .agent-game/setup-production.sh
```

It guides creation of the two OAuth clients and writes `.env.production` with mode 0600. It generates the authentication secret and fills the selected account/origin. Re-running preserves the authentication secret and offers existing OAuth values as defaults.

The owner completed the helper. Configuration validation confirmed both OAuth clients, the selected account/origin, an auth secret of at least 32 characters, and `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Secrets were not printed.

| Provider | Callback URL                                                     |
| -------- | ---------------------------------------------------------------- |
| GitHub   | `https://agent-game.tk-d86.workers.dev/api/auth/callback/github` |
| Google   | `https://agent-game.tk-d86.workers.dev/api/auth/callback/google` |

Google's OAuth client uses the **Web application** type, with the arena origin as its JavaScript origin. Its sign-in scopes are `openid`, `userinfo.email` and `userinfo.profile`. In Testing status, configure the accounts that will perform the initial callback checks as test users. Configure the Audience publishing status before general public Google sign-in.

The helper is intentionally local and ignored by source control. The canonical list of configuration names is [`.env.example`](../.env.example).

## Provisioning

Load the environment file **through Bun before the Alchemy command**. This stack reads `process.env`; Alchemy's own trailing `--env-file` flag only configured its Effect environment in the tested version and left the stack's `APP_URL` unset.

```sh
npm run build
bun --env-file=.env.production alchemy plan --stage prod --profile agent-game
bun --env-file=.env.production alchemy deploy --stage prod --profile agent-game
```

Cloudflare authentication for Alchemy must resolve to the selected account. This deployment refreshed Wrangler's existing OAuth login using `npx wrangler whoami` and supplied the refreshed token as `CLOUDFLARE_API_TOKEN` in the Alchemy child process environment, with `--profile agent-game`. The token was never placed in command-line arguments or copied to `.env.production`, and captured output was redacted. Alchemy does not automatically inherit Wrangler's login. Future invocations still need valid environment credentials or a configured Alchemy auth profile; a persistent default auth profile was not created here.

`alchemy.run.ts` provisions D1 and migrations, three SQLite Durable Object namespaces, the Worker, bundled assets, the downloadable CLI archive, and the production AI binding. The `prod` stage requires both sign-in providers, the HTTPS origin, an authentication secret and an explicit house model. Isolated `pr-<number>` stages use scripted opponents and a generated authentication secret. Read [build status](build-status.md) before selecting the production model and concurrency setting.

The checked-in Wrangler D1 ID is a local placeholder. Alchemy provisions the production database and binds its actual ID; a Wrangler dry run validates bundling rather than provisioning.

## Deployed verification

Run the repeatable public smoke check from the project root:

```sh
node scripts/verify-deployment.mjs https://agent-game.tk-d86.workers.dev
```

It checks the public API and docs, secure OAuth state cookies/callback URLs, anonymous authorization boundaries, desktop/mobile rendering, and the CLI archive downloaded from production. It starts one unapproved pairing request (expires after ten minutes), checks its pending proof cannot enter the queue, and removes its local test credential. It starts no match and makes no inference calls. Chromium must be installed for Playwright.

The passing record is [`evaluation/deployment-smoke.json`](evaluation/deployment-smoke.json). Desktop/mobile checks at 1440px and 390px had no page exceptions or home-page overflow. Separate real browser clicks reached **Sign in to GitHub** for `agent-games` and **Google Accounts** for `tk-d86.workers.dev`; no account credentials were entered. This verifies authorization initiation, not successful token exchange or callback completion.

The first deployment's disabled `/api/dev/login` path exposed an asynchronous rejection escaping the router's `try/catch`, producing a Cloudflare 500 page. `tests/worker-errors.test.ts` reproduced it in the real runtime with production settings. Awaiting delegated handlers fixed the boundary; production now returns the expected structured 404. All 27 unit/storage/Worker tests and six API/recovery tests passed after the fix.

### Next owner step

1. Open **https://agent-game.tk-d86.workers.dev/dashboard** and choose **Continue with GitHub**.
2. After returning to **Your roster**, find **Sign-in methods** and select **Link google** while still signed in.
3. Complete Google's consent and confirm it returns to the same roster. Create a competitor profile to prepare for installation pairing.

Then verify sign-out/sign-in with the linked provider, pair a CLI installation from a separate machine, and confirm profile continuity. Verify that a second installation cannot control an already assigned seat, and that revocation stops its authority.

Run the deployed smoke match through the supported supervisor, observe the public stream, and verify terminal replay and a single rating/history settlement. Check the recorded provider usage, failed calls and pending durable work to assess launch readiness. Local accelerated tests and a remote-inference/local-DO trial are separate evidence from this deployed-network path.

After the [cheaper-model follow-up](evaluation/cheaper-models-2026-09-11.md), the evaluation ledger has **$0.791523** available under the approved $10. The current $1.50 match reservation exceeds that remaining allowance; reconcile an appropriate reservation or obtain an increased evaluation allowance before starting another paid verification table. Ranked operating admission remains at the approved three-match / $5 daily target. Opaque local runtime errors and multi-table capacity remain open items in [build status](build-status.md).

## Setup references

- [GitHub: create an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
- [Google: configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent).
- [Google: create web-server authorization credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).
- Installed CLI syntax verified with `bun alchemy plan --help` and `bun alchemy login --help`.
