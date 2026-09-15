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

Parent commit **dc60060** adds source-published immutable artifact identities, migration0006 and read-only discovery. It passed **16 local D1/registry/repository cases** and static/build checks; independent review is running. The exact consumer/controller interface is in `TIM-27-artifact-registry.md`. Broker migration0005 is reserved separately. Publication requires the independently verified built commit and trusted source executable descriptor; no target-supplied executable becomes source-trusted.

This document records local integration, not hosted deployment, real-model gameplay or operating-budget reconciliation. Those remain coordinated acceptance work after the source/target, broker, CLI and trusted controller paths are combined and reviewed.
