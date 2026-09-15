# TIM-27 branch content / source registry handoff

Implementation: `f07b4bfd345b3cf1c54ebd151136e2c6550ef427`, following independent review-correction commit `14b3455`. Parent source registry used for local integration: **`dc600600202d2994ee105ddcddd5ab9e5ab4c125`**. No parent-owned source, migration, package, CLI or release file was changed or cherry-picked into this lane.

## Checks and evidence

- **89/89 tests pass**, seven files, 8.52 seconds: real producer/Alchemy/Miniflare/D1/R2, archive integrity/limits, source executable verification, run/attempt/merge identity, activation/cleanup, readiness and released CLI regression checks.
- Full typecheck, full lint with `--deny-warnings`, production build, scoped Prettier and `git diff --check` pass.
- The implementation commit was rebuilt and passed through the real unprivileged Wrangler artifact producer again. **23 payloads / 4,200,858 bytes**: original Worker/assets/migrations plus the content-addressed branch text archive.
- The actual parent source Worker was independently dry-run bundled from the pinned `dc60060` tree and run locally with real D1 migrations 0001–0004/0006. Its actual `GET /api/preview/artifacts` returned **503/no-store before publication**, the exact mapped descriptor after real source registration, and **503/no-store after commit change and closure**. Equal registration retries succeed; a changed source executable digest conflicts. Readback with an incorrect expected executable pin rejects. No fixture endpoint implements the source GET.
- Source executable bytes were downloaded from local Miniflare source assets and verified against the independently supplied pin for the parent's actual packaged 0.3.0 file. This tests the byte-verification path; it does **not** attest a hosted 0.3.0 release.
- Existing original 59-test report, 2 scripted-game results, 22-file artifact manifest and five Alchemy source hashes remain unchanged. The source and target test runtimes use ephemeral ports; 6321–6324 are clear.

| Committed record                 | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `content-tests.json`             | `65a1d08e40094c78d601cacacc74f63cf8567104fd0cc4f1cc150dc52938d0a5` |
| `content-artifact-manifest.json` | `bb30f360938233ab97e8104c5a1f63337c019fccd1ba1f639d1b6a030b71a039` |
| `source-registry.json`           | `c4aab542fe778599d48e2c9a068c7bd72ed2d02c480d75504b5a099ac3d9d8cf` |

The exact text archive is **17,689 bytes**, SHA-256 `d899d22d659e63badfa13b52cf6dc1c74100767e4d39539918f100b458514dea`, at:

```text
/downloads/previews/f07b4bfd345b3cf1c54ebd151136e2c6550ef427/d899d22d659e63badfa13b52cf6dc1c74100767e4d39539918f100b458514dea.tgz
```

It contains seven regular UTF-8 Markdown files: both games' rules/protocol/rating method plus the shared skill. The decoder enforces canonical USTAR headers and inventory, no links/metadata extensions/executable modes, 128 KiB per text entry and 2 MiB compressed/expanded limits. Rules-only revisions change the archive/text digests independently of CLI package version. Public text entries must exactly match the built public assets. Both games' publication points to this one archive and the same skill bytes.

Local source executable pin used in the full-Worker integration: version **0.3.0**, **44,567 bytes**, SHA-256 `d0ff9b7c39e36e1f5b331ba1d2dcd856ac495a96ed5acb2dda368c6f83a7fb99`. The target build remains this lane's original 0.2.0 package baseline. Neither local archive substitutes for the parent's retained deployed 0.2.0 archive (`47bf567f9609a47c2b5267a11a697a2181b614b022591ec9d13351733cc0056f`).

## Reproduction

Use the existing locked dependencies. No package/lockfile edit was required. `check-source-registry.mjs` reads the supplied parent's git object database and packaged source archive, extracts only pinned source/migrations/package metadata/test migration helper into this lane's ignored scratch directory, and bundles that accepted source locally. It refuses deployment credentials and writes neither the parent checkout nor hosted resources.

```sh
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-content.test.ts tests/preview-publication.test.ts tests/preview-artifact.test.ts tests/preview-github.test.ts tests/preview-workflow.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-deploy/content-tests.json
npm run typecheck
npm run lint -- --deny-warnings
npm run build
GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REPOSITORY=TimothyKrell/agent-game GITHUB_RUN_ID=100 GITHUB_RUN_ATTEMPT=2 PR_HEAD_SHA=1111111111111111111111111111111111111111 node scripts/produce-preview-artifact.ts .tim27-deploy/runs/content-committed-artifact
node .tim27-deploy/check-source-registry.mjs /home/timothykrell/Code/agent-games .tim27-deploy/runs/content-committed-artifact /home/timothykrell/Code/agent-games/public/downloads/agent-game-cli-0.3.0.tgz
git diff --check
```

Choose a new artifact output directory when repeating: the producer refuses overwrite. The recorded artifact uses the implementation SHA above; its run/attempt/PR-head fields are explicitly synthetic local-test inputs, not GitHub attestations. Local ignored logs include `content-tests-green.log`, `content-typecheck-green.log`, `content-lint-green.log`, `content-format-green.log`, `content-committed-build.log`, `content-committed-producer.log` and `source-registry-committed.log`.

## Exact parent integration

`scripts/preview-publication.ts` exports:

```ts
verifySourceExecutable(sourceOrigin, trustedReleasedExecutableDescriptor);
previewArtifactPublication(verifiedRun, validatedArtifact, {
  subdomain,
  sourceOrigin,
  incarnation,
  executable,
});
verifySourcePublicationReadback(publication);
```

The manifest mapper uses **verified `builtCommit`**, trusted target origin and retained incarnation; it normalizes internal protocol strings to numeric `1`/`2`. It never accepts a source executable claim from the PR artifact. The source pin must come from trusted **released source** state, with actual byte verification against the exact source-origin versioned URL. The branch archive stays data-only, so no executable file from its target can become the selected CLI.

Within the accepted default-branch lifecycle/resource adapter, after fresh GitHub/proof verification and successful target identity configuration/registration, invoke:

```ts
const parsed = parsePreviewArtifactManifest(sourceEnv, JSON.stringify(publication));
await registerPreviewArtifacts(sourceEnv, parsed);
```

Use the real source D1 atomic batch contract (`prepare`/`bind`, `batch`, `first`), with trusted source resource IDs; separate REST writes must not emulate its conditional insert/read transaction. Then drop privileged credentials and call the source GET readback before claiming artifact availability. The narrow environment/resource adapter and retained incarnation/key lifecycle remain the exact bridge-owner handoff described in `docs/evidence/TIM-27-trusted-deploy.md`.

**Activation state:** source registration remains `not-configured`; hosted released-source pin, runtime/resource adapter, identity close lifecycle and external credential cutover are integration prerequisites. New preview deployment is default-off behind the corrected explicit activation variable and distinct protected-environment token. No deployment, GitHub trigger, secret change, paid inference, nested agent or push occurred.
