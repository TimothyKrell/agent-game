# TIM-27 review corrections to `b276c8f`

The two P2 findings were reproduced and corrected independently of the branch-content archive follow-up. Original evidence in `README.md`, `tests.json`, `artifact-manifest.json` and `preview-regression.txt` remains historical and byte-identical.

## Red → green

- **Red:** 5 failures / 29 passes. The base-advance probe attempted producer-blob validation at new merge `5555…` instead of tested merge `2222…`; the deployment workflow lacked its activation condition; all three privileged-wrapper negative cases actually launched the stub Alchemy process (missing switch, false switch, missing new secret with legacy token present).
- **Green:** **77/77 tests**, five files, 7.67 seconds. Includes original artifact/Miniflare/readiness/CLI checks, historical-base/rerun stability, wrong identity/ancestry rejection, gated subprocess tests and live-PR manual/automatic cleanup through the real controller CLI boundary.
- Full typecheck, repository lint (`--deny-warnings`), production build, scoped Prettier and `git diff --check` passed. Workflow YAML is parsed and its trust/concurrency policy checked by `tests/preview-workflow.test.ts`.
- Existing 2/2 scripted preview-game results and original 22-file production manifest remain in the original evidence; infrastructure-only corrections did not require rerunning those games or replacing their hashes.

Commands:

```sh
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-github.test.ts tests/preview-workflow.test.ts --maxWorkers=1 --reporter=verbose
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-github.test.ts tests/preview-workflow.test.ts tests/preview-artifact.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-deploy/corrections-tests.json
npm run typecheck
npm run lint -- --deny-warnings
npm run build
git diff --check
```

| Evidence                                    | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Ignored `corrections-red.log`               | `9e4e4bc1500ef8d7bc93fd0e2bc8526517c205d0044d395e4a11c881a693d80f` |
| Ignored `corrections-green.log`             | `8e856021555455ea2db903d952244ffb7c8123b2807d6b82696fd3f469b49a3d` |
| Committed `corrections-tests.json`          | `0f6d5830f2bd11734a040d21177b9333451ccde10f32599245e1ed1dde405c2c` |
| Unchanged original `tests.json`             | `69cc90f2d5d71224769c3052db146a862ee8ed672bbd482f07fc86f43fae9427` |
| Unchanged original `artifact-manifest.json` | `1050a1c22272c81bde1b82210dba9b302ee885cc1f6f6abb1c7ff67bc76a772d` |

## Immutable tested identity

The CI `Verify` job now starts with a no-op identity step before checkout, number 2 after GitHub's `Set up job`. Its name is evaluated from intrinsic GitHub context:

```text
Preview identity v1 merge=${{ github.sha }} base=${{ github.event.pull_request.base.sha }} head=${{ github.event.pull_request.head.sha }}
```

The controller obtains this through `GET /actions/runs/<run>/attempts/<attempt>/jobs`, validates the exact successful job, step name/position/status and run/attempt/head, then reads that immutable commit's parents. Those parents must equal the historical base/head in order; the PR's live head must still match. Producer blobs are checked at this tested merge. The workflow blob is also checked at the independently associated PR head to prevent a modified workflow from nominating another merge in a forged marker.

The proof retains `testedBaseSha` and `identityStep: {jobId, number, name}`. Base-only movement before preparation or publication does not change it. A full successful rerun uses the original event SHA/base/head and its new attempt/artifact IDs. A newer run/attempt or changed/closed PR still rejects the old delivery. A partial rerun with old successful jobs remains ineligible. Pre-correction workflows have no marker and fail closed; use a fresh event with the accepted workflow after default-branch landing.

Primary references retrieved:

- [Attempt-specific workflow job API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt): `id`, `run_id`, `run_attempt`, `head_sha`, job status/conclusion, and `steps` with `name`, `number`, status/conclusion.
- [Rerunning workflows](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/re-running-workflows-and-jobs): original `GITHUB_SHA` and `GITHUB_REF` are preserved.
- **Read-only public API shape check**, without authentication: [actions/checkout run 34850901683 attempt 1 jobs](https://api.github.com/repos/actions/checkout/actions/runs/34850901683/attempts/1/jobs?per_page=100). Job `103998297472` reports `run_attempt: 1`, `head_sha: f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a`, successful job status, step 1 `Set up job`, and first user step 2 `Create job directory`. This confirms the fields/numbering with the controller's `2022-11-28` API header. It is not a hosted run of this repository's new marker.

## Explicit activation and recovery

Actual deployment requires repository variable `TRUSTED_PREVIEW_DEPLOY_ENABLED=true`, the default-branch workflow/ref, and **environment-only** `TRUSTED_PREVIEW_CLOUDFLARE_API_TOKEN` in the explicitly main-only `preview` environment. The workflow supplies it as `PREVIEW_DEPLOY_TOKEN`; only the fixed Alchemy wrapper maps it to the conventional Cloudflare variable. No old repository token or cached credential fallback exists. The negative subprocess tests prove the command is not launched when activation/credentials are missing; the positive test selects the fixed trusted command despite hostile PR tooling beside it.

Cleanup remains independent of the deployment switch, with the same distinct protected credential. A missing credential causes visible failure. `workflow_dispatch` on the default branch accepts only a canonical positive `pr-number`, uses the same noncancelling `preview-N` lock, checks the live same-repository PR is closed and targets only its retained `pr-N` stage. Open/fork/nondefault/malformed inputs reject before the infrastructure subprocess. This recovers missed close events and old stages without any PR artifact.

[GitHub environment documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) confirms nonexistent named environments are automatically created without protection. Full operator cutover ordering is in [the updated evidence](../docs/evidence/TIM-27-trusted-deploy.md#required-external-credential-cutover). No variable, secret, deployment, workflow trigger, source registration or paid inference was performed.
