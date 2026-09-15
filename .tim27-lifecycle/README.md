# TIM-27 lifecycle working evidence

**Current follow-up:** [durable generation fencing and classified finalization](generation.md)
supersede the [earlier blocker](followup.md). The approved additive 0008/helper
extension is implemented; activation remains default-off pending independent
integration review and hosted source prerequisites. Original reports below remain
historical evidence, including the unchanged two tuple-only red probes.

This new lane starts at parent `635894b`. Original delivery worktree and its
evidence remain archived separately and untouched.

The initial checkpoint implements the atomic D1 REST adapter, fixed SQL read
guards around the accepted helpers, persisted Alchemy identity and auth state,
trusted resource lookup, source-first retirement, protected released-source pin,
separate default-off bridge activation and credential-free readiness readback.
Only types changed in the accepted source helpers. No migration added here.

Local integration uses full source/target Worker bundles, actual D1 databases,
Cloudflare REST-shaped requests and actual Alchemy apply/destroy state. Public
result: `integration.json`; GitHub identities are synthetic and the locally
packaged 0.3.0 archive is not a hosted release attestation. No inference/deployment
or credential changes occurred. Further broker configuration integration and
final combined checks follow this checkpoint.

## Final delivery

Implementation: **`1a7d537d6fe213ec008c5c4456efa3fdb501d3fa`**, following checkpoint
`55d92a7` and broker consumption `1701258` (original handoff `a953a3c`).
Parent integrates the lifecycle commits and owns the broker/source merge.

- **118/118 tests**, ten files, **51.23 seconds**; `tests.json` records assertions.
- Existing full scripted Worker regressions: **2/2**, **170.95 seconds**. Secret
  Overlord finished in 44.02 seconds; two-act Succession/archive replay in
  123.46 seconds. `smoke-tests.json` and `smoke.txt` retain the results.
  This run preceded the final infrastructure-only retirement-diff correction;
  its application runtime code is identical to the committed implementation.
- Full typecheck, repository lint `--deny-warnings`, production build, scoped
  Prettier and `git diff --check` passed.
- Actual source/target Workers complete owner import and agent handoff through
  the new REST adapter/accepted helpers. Tests include atomic rollback, malformed
  REST responses, distinct DB IDs, delayed source/target writes, lost register and
  close acknowledgements, artifact-independent retirement, source migration
  refusal, same-proof recreation and an old close arriving after a new identity.
- `refresh-red.txt` / `refresh-green.txt` retain the real Alchemy no-op regression
  and correction for same-proof refresh of retired state.
- `checks.json` retains versions, exact hashes and both suite summaries;
  `artifact-manifest.json` is the actual committed prebuilt inventory.

Final artifact: **28 payload files / 4,354,556 bytes**. Manifest SHA-256:
`c815aa7f46527c34868a28397a4f7f318baf1c80b09c7663331f708e302f3928`.
The branch text archive is **18,026 bytes**, SHA-256
`c03c9aa85e12ae05d0072e8eaba6c2bbf60caa07167fafaabb64b033d774660e`, at
`/downloads/previews/1a7d537d6fe213ec008c5c4456efa3fdb501d3fa/c03c9aa85e12ae05d0072e8eaba6c2bbf60caa07167fafaabb64b033d774660e.tgz`.

The local source archive was version **0.3.0**, **44,554 bytes**, SHA-256
`9999081559a89be5ea1251d9195beda8bad6775d1915fd440197eb2978d8e616`.
It is this lane's actual packaged file, distinct from earlier delivery evidence's
local package and from every hosted release pin. The fixture's run 100/attempt 2
and all-ones PR head are explicitly synthetic GitHub identities.

Full lifecycle contract, ordering, failure boundaries, broker seam and exact
external activation steps:
[`docs/evidence/TIM27-preview-lifecycle.md`](../docs/evidence/TIM27-preview-lifecycle.md).
Deployment, identity and broker activation remain separate and default-off.
The source operator must supply the hosted released CLI descriptor, deploy the
source capabilities/migrations and reconcile live operating configuration before
enabling those seams. Hosted lifecycle acceptance remains pending.

## Reproduction

From the committed implementation with its locked dependencies installed:

```sh
npm run build
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-lifecycle-state.test.ts tests/preview-d1.test.ts tests/preview-workflow.test.ts tests/preview-artifacts.test.ts tests/preview-publication.test.ts tests/preview-content.test.ts tests/preview-artifact.test.ts tests/preview-github.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/tests.json
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-worker.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/smoke-tests.json
npm run typecheck
npm run lint -- --deny-warnings
GITHUB_SHA=1a7d537d6fe213ec008c5c4456efa3fdb501d3fa GITHUB_REPOSITORY=TimothyKrell/agent-game GITHUB_RUN_ID=100 GITHUB_RUN_ATTEMPT=2 PR_HEAD_SHA=1111111111111111111111111111111111111111 node scripts/produce-preview-artifact.ts .tim27-lifecycle/runs/committed-1a7d537
```

Tests use OS-assigned ports. Scratch stays under `.tim27-lifecycle/runs/` and is
ignored. `record-evidence.mjs` revalidates the retained committed artifact and
records final local results; original debug/check logs stay local, while the
relevant smoke/red-green logs are retained as text files with final blank lines
normalized to one newline. Original log hashes remain separately recorded.
