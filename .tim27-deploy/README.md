# TIM-27 delivery implementation — local evidence

Implementation commit: `f5a2f16078fbe8471ee56bb18f01ac70efbbd083`, based on `d0f5401bd48ce57639bb5fc7c2106edf67efc534`. The implementation was verified before committing; the committed source was then rebuilt and passed through the artifact producer again. This folder contains local evidence, not a GitHub/Cloudflare deployment attestation.

## Results

- **59/59 tests pass** in the five-file artifact/GitHub/workflow/comment/deployment-readiness/CLI-install group, zero failed or pending; 6.01 seconds. Exact machine report: [tests.json](tests.json).
- Existing `tests/preview-worker.test.ts`: **2/2 pass**, 177.19 seconds. Secret Overlord 49.475s; full two-act Succession and archive replay 124.543s. Both run the existing scripted provider; no paid inference.
- Full `npm run typecheck`: pass (all three TypeScript configurations).
- Full `npm run lint -- --deny-warnings`: pass, zero warnings/errors across 221 files.
- `npm run build`: pass, including released CLI packaging and Vite production assets.
- Scoped Prettier check of all changed code/tests/workflows/docs: pass.
- YAML parsed with installed `yaml` and policy-checked in `preview-workflow.test.ts`; PyYAML also parsed all three workflows. `actionlint` was not installed. Current GitHub job-concurrency documentation explicitly confirms `queue: max` with `cancel-in-progress: false`.
- `git diff --check`: pass.

The actual Wrangler-produced Worker runs under local Miniflare/workerd with all three exported DO classes, D1 migrations 0001–0003, existing loopback-only owner login, and R2 picture upload/readback. The actual locked Alchemy prebuilt reader preserves module bytes and names. A malicious entry remains inert during reading; a separate positive-control Node process proves importing that entry would execute its canary capture. No PR executable is selected by the tested trusted command wrapper.

## Reproduction commands

Run from this worktree with the lockfile's dependencies installed. Its `node_modules` link was temporary and pointed at the existing root installation; no dependency or lockfile edits were made.

```sh
npm run build
node node_modules/wrangler/bin/wrangler.js deploy --help
bun node_modules/alchemy/bin/alchemy.ts deploy --help

NO_COLOR=1 npm_config_cache="$PWD/.tim27-deploy/runs/npm-cache" node node_modules/vitest/vitest.mjs run tests/preview-artifact.test.ts tests/preview-github.test.ts tests/preview-workflow.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-deploy/tests.json

node node_modules/vitest/vitest.mjs run tests/preview-worker.test.ts --maxWorkers=1 --reporter=verbose
npm run typecheck
npm run lint -- --deny-warnings
node node_modules/prettier/bin/prettier.cjs --check alchemy.run.ts scripts/preview-artifact.ts scripts/produce-preview-artifact.ts scripts/preview-github.ts scripts/preview-controller.ts scripts/preview-comment.mjs tests/preview-artifact.test.ts tests/preview-github.test.ts tests/preview-workflow.test.ts tests/fixtures/preview-github.ts .github/workflows/ci.yml .github/workflows/preview-deploy.yml .github/workflows/preview-cleanup.yml docs/ci.md docs/evidence/TIM-27-trusted-deploy.md
git diff --check
```

Committed-source artifact production, using **synthetic CI identity fields for the local test only**:

```sh
GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REPOSITORY=TimothyKrell/agent-game GITHUB_RUN_ID=100 GITHUB_RUN_ATTEMPT=2 PR_HEAD_SHA=1111111111111111111111111111111111111111 node scripts/produce-preview-artifact.ts .tim27-deploy/runs/committed-artifact
```

Use a new output directory on another run; the producer refuses to overwrite an existing artifact. [artifact-manifest.json](artifact-manifest.json) is the exact output manifest for implementation commit `f5a2f16`: **22 payload files / 4,183,169 bytes**, including the 3,469,743-byte Worker. Manifest SHA-256 is `1050a1c22272c81bde1b82210dba9b302ee885cc1f6f6abb1c7ff67bc76a772d`. All payloads remain in the ignored local `runs/committed-artifact` directory.

This worktree's package baseline was 0.2.0. Its newly generated local 0.2.0 archive is **not** the parent's retained deployed 0.2.0 archive (`47bf567f9609a47c2b5267a11a697a2181b614b022591ec9d13351733cc0056f`). The parent owns the 0.3.0 bump and retention of that exact old release. Tests read the current package version dynamically; no archive/package/CLI file from this worktree should supersede the parent's release work. Build commit and every file digest remain separate from package version.

## Provenance

Versions used: Node 24.21.0, Wrangler 4.129.1, Alchemy 2.0.0-beta.76, Miniflare 5.20260907.0-alpha / workerd 1.20260907.1. Existing locked `es-module-lexer` provides nonexecuting import/export parsing, and existing locked `yaml` provides test-only workflow parsing. No dependency was added.

| Locked source                         | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| Alchemy `Workers/Sources/Prebuilt.ts` | `dfd863df763c691288d3faf3cf3b0ba13e84440f6d9825739c3e115d59dd428e` |
| Alchemy `Workers/Assets.ts`           | `9feccad1bb3095db4e08f34bcde33cee6c01d0c4e4f9b771faeb83a62713e31e` |
| Alchemy `D1/Database.ts`              | `80d9ed599144d4683ddf52b83e42b7a09cebce14f6b7c9e70c95aeb977ed3219` |
| Alchemy `R2/Bucket.ts`                | `92bef86de5eff3bc386861c73cdd9cf5a2b66adbec7e774d2645932cafde3c49` |
| Alchemy `Plan.ts`                     | `83d853052de601e9bc64b808b81dc44b7c448392452074723b5d979210095c07` |

Machine report SHA-256: `69cc90f2d5d71224769c3052db146a862ee8ed672bbd482f07fc86f43fae9427`. Local ignored raw logs include `tests-green.log`, `preview-regression.log`, `typecheck-green.log`, `lint-green.log`, `format-green.log`, `committed-build.log` and `committed-producer.log`. Preview-regression raw log SHA-256: `31cd6639133c0e50641bf1949bf6ed2fe04e3f3a3c9bbba23777bb84de1bfa70`.

## Integration handoff

The complete boundary, external credential cutover, `queue: max` rationale, manifest/proof interface and concrete D1 control-plane adapter handoff are in [docs/evidence/TIM-27-trusted-deploy.md](../docs/evidence/TIM-27-trusted-deploy.md).

Source registration is explicitly `not-configured`. The bridge owner's accepted functions are known, but their narrow control-plane environment adapter, retained incarnation/key state, `PREVIEW_SOURCE_URL`/Worker-first preview routing integration and close-before-destroy invocation must be integrated before enabling identity registration. Queue admission remains gated pending broker work. Hosted acceptance requires default-branch landing, removal of PR-reachable broad Cloudflare credentials, and real create/update/rerun/synchronize/close readback; none was triggered here.
