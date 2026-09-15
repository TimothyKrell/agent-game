# TIM-27 — parent integration checkpoints

## Accepted identity slice

The identity architecture/probes (`2066abd`), contract correction (`a104f60`), implementation (`7f7e447`) and focused correction (`4c2a97f`) are integrated through **546bb8b**. The parent reconciled migration0004 with accepted picture migration0003, preserved `AGENT_PICTURES`, and regenerated Worker types with `--env-file /dev/null --strict-vars=false` to avoid incorporating unrelated local development-secret declarations.

Independent parent checks:

- **14 initial two-origin Worker/D1/Better Auth identity cases passed**, including Chromium. Parent copies of the original run outputs are `/tmp/opencode/TIM-27-lead-identity/`; original committed screenshots/results were restored unchanged.
- **21 image/repository/Worker regression cases passed** after the initial merge.
- After correction, **29 cases passed**: 16 identity cases plus 13 repository/Worker regressions. Outputs use `/tmp/opencode/TIM-27-lead-correction/` and `/tmp/opencode/TIM-27-lead-correction-tests.json`.
- Typecheck, lint, build, scoped formatting and whitespace checks passed on the combined integration branch.

Original reviewers confirmed **Standards 0 / Spec 0 outstanding** after the collision-safe import and exact-agent introspection correction. The original four architecture findings are implemented or explicitly gated at this slice boundary. Accepted identity functions remain documented in `TIM-27-identity-bridge.md`; correction provenance and immutable evidence in `TIM-27-identity-correction.md`.

Live target admission remains `503 preview-allocation-pending` until the broker/recovery slice is complete. The parent assigned the shared source-ledger broker to a new worktree from the accepted checkpoint, and the reusable CLI selector to a separate worktree containing accepted TIM-30 onboarding and prepared CLI0.3.0. The source identity worktree is quiescent for later archival.

## Trusted deployment review

The separate trusted deployment implementation (`f5a2f16`, `b276c8f`) has **Standards 0**, with two Spec P2 corrections assigned before integration:

1. Derive the tested build commit from immutable run-bound GitHub provenance, rather than the moving `refs/pull/N/merge`. An unchanged PR head can have a new synthetic merge after unrelated base-branch changes, while its successful run/rerun still refers to the original commit.
2. Default automatic activation to off until credential cutover. Use a distinct protected-environment deployment-secret name so the existing repository-scoped token cannot silently satisfy the new controller. Preserve an explicit trusted cleanup route for retained stages.

The independent reviewer reran 27 verifier tests and preserved the changing-base reproduction in `/tmp/opencode/TIM27-trusted-deploy-review-aiBfyc3L/`. Initial recorded evidence includes 59 tests, both scripted games, actual raw prebuilt Worker/DO/migration/R2 checks and locked Alchemy provenance. Those passes do not close the two newly exercised lifecycle cases.

## Artifact coordination seam

Parent commit **dc60060** adds source-published immutable artifact identities, migration0006 and read-only discovery. It passed **16 local D1/registry/repository cases** and static/build checks; independent Standards and Spec reviews each found zero new issues. The reviewer also reproduced a pre-existing close→fresh-incarnation trigger failure. Parent additive migration0007 in **54fc037** fixes that root cause while preserving0004. The reviewer confirmed closure after parent **17 registry/repository cases and 16 actual two-origin identity cases** passed.

The exact consumer/controller interface is in `TIM-27-artifact-registry.md`. Broker migration0005 is reserved separately. Publication requires the independently verified built commit and trusted source executable descriptor; no target-supplied executable becomes source-trusted.

This document records local integration, not hosted deployment, real-model gameplay or operating-budget reconciliation. Those remain coordinated acceptance work after the source/target, broker, CLI and trusted controller paths are combined and reviewed.

## Accepted trusted delivery and active lifecycle adapter

The corrections and content-publication mapping through **acf47b6** are integrated at **635894b**. Parent independently passed **89 tests**, typecheck, lint, build and whitespace checks. Both original reviewers confirmed **Standards 0 / Spec 0 outstanding**, closing the moving-merge provenance and automatic-activation findings above.

The corrected verifier binds the historical merge/base/head to the exact successful attempt's GitHub-recorded identity step and trusted workflow/producer blobs. Default-off activation and a distinct protected-environment token are enforced before the fixed Alchemy subprocess. Artifact-independent cleanup checks the live closed same-repository PR. Branch content has a bounded regular-text inventory, while executable authority comes from an independently pinned source release. These local contracts do not imply hosted activation.

The implementation owner has moved to `/tmp/opencode/agent-game-preview-lifecycle` from635894b to connect the trusted D1 resource/environment adapter, retained keys/incarnations, source registration/publication/readback, and source-first closure. The source broker continues separately; neither lane receives another allowance.

The completed trusted-deploy source is archived at `/home/timothykrell/Code/agent-games-archive/TIM-27-deploy-2026-09-15/`, preserving **7,322 source/evidence entries and 1,299 parent/reviewer entries**. Every member hash, unchanged source inventory, bundle and independent source recovery was verified.

- `worktree-evidence.tar.gz`: 298,985,294 bytes; SHA-256 `f70c90d449b043e40522629767864423e0b5168667f8d5c03229bd4f17176ff0`.
- `lead-review-evidence.tar.gz`: SHA-256 `859450a24c6b231a54a7cd2d6b72e09e93d808f5a28a3f4b49b8d0f1555d6c50`.
- `repository.bundle`: SHA-256 `e5bb891bcaa51846a0117d5cbf412625d3e3dbbc896dff298d1b4c311b6f80af`.

The completed worktree/local branch were retired. Git removed the worktree registration but could not delete read-only quarantined snapshots. All6,336 remaining files were reverified against the archive before making only those snapshot directories removable and deleting the remnants; `metadata/retirement.json` records this final disposition.

## Reusable CLI integration checkpoint

Sources **854eeae / b42248e** are locally integrated at **ce1d622**. Parent independently passed **113 tests serially**: 21 installed-preview cases and 92 existing CLI/picture/supervisor cases. Application and dedicated fixture types/lint, build, package-content and whitespace checks pass. Logs: `/tmp/opencode/TIM-27-lead-cli-tests.log` and `/tmp/opencode/TIM-27-lead-cli-package.txt`.

The source registry had been cherry-picked into the CLI branch; parent resolved add/add conflicts by retaining the accepted0007 retirement regression and its review evidence. No CLI-specific source change was discarded. The prepared0.3.0 archive is now52,969 bytes; existing0.1.1/0.2.0 release bytes remain immutable. Independent CLI Standards and Spec review is underway. Complete-game tests use scripted fixture allocations, not hosted or paid inference.

## Identity/source-registry recovery archive

The completed original identity worktree is archived at `/home/timothykrell/Code/agent-games-archive/TIM-27-identity-2026-09-15/`: **692 source/evidence entries and 1,511 parent/reviewer entries**, all member hashes verified. The bundle preserves both the original identity branch through4c2a97f and integration through54fc037, including parent artifact metadata and retirement corrections. Unchanged-source inventory, bundle verification and independent source recovery passed.

- `worktree-evidence.tar.gz`: 37,357,485 bytes; SHA-256 `794a661916d21ff5cfe075bc4b390014fbffd029da161e9b8720aeb13f37a852`.
- `lead-review-evidence.tar.gz`: 100,884,706 bytes; SHA-256 `460bdebbc997cf2282eaf0281e95d8df92d35035ae3153e68415e2a0aa5358ff`.
- `repository.bundle`: SHA-256 `a67b3db7896c7cf86782d5845198bb6b6c823c8d28727388b4d0781eb7b6b3d6`.

The active broker, CLI and trusted-deployment worktrees are separate. The completed identity worktree and merged local branch were retired after the final unchanged-source audit. This does not mark the overall TIM-27 issue complete.
