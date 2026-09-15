# TIM-27 — hosted activation prerequisites

Read-only GitHub metadata captured at **2026-09-15 07:00 UTC** establishes the current cutover state:

- Default branch `main` is still `c74b915f427def75681ed0c8f323c75768914e1c`; the reviewed integration is on its separate branch.
- The `preview` environment has no protection rules or deployment-branch policy.
- That environment has no configured secrets or variables.
- Repository variable `TRUSTED_PREVIEW_DEPLOY_ENABLED` is absent, so trusted preview deployment remains off.
- Dedicated secret `TRUSTED_PREVIEW_CLOUDFLARE_API_TOKEN` is absent at both repository and preview-environment scope.
- The existing production environment permits only `main`. The legacy repository token was not changed.

The inventory retrieved names, update timestamps and policy metadata only. It did not retrieve secret values, create credentials, modify settings, start a workflow or deploy anything. Raw metadata and hashes are in `/tmp/opencode/TIM-27-hosted-readiness/`.

## Cutover sequence

The remaining smoke-classification correction and final delivery checks precede cutover. Then the trusted default-branch producer/controller and source capabilities/migrations must land and deploy. The preview environment needs a default-branch restriction and a **distinct** deployment credential; the legacy token cannot activate this path.

The protected source-release descriptor must identify a genuinely released source archive and its independently verified digest, byte count, version and protocol support. The normalized development0.3.0 archive alone is not that attestation. Identity activation follows deployed source capability/generation-schema readback and target-before-source configuration.

Source-broker activation remains a separate operator step after reconciling actual source allocations/usage with the existing shared allowance. Target broker activation follows that source operation. Hosted owner sign-in/import, agent selection, callbacks, revocation and full integration are then verified. No new or per-preview inference allowance is introduced.

Most settings and deployment checks are agent-executable once the code and source release are ready. Creating the dedicated Cloudflare credential may require the owner's authenticated dashboard; any interactive handoff should be limited to that one-time step and write directly to the protected GitHub environment, without placing a token in chat or project files.
