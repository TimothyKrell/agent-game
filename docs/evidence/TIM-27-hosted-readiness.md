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

## Prepared environment and state backend

After the initial inventory, the parent configured the `preview` environment to allow **only the `main` branch**, then read back the exact policy. No deployment, identity or broker activation variable was set, and no credential was read, created or installed. Before/after API records are retained under `/tmp/opencode/TIM-27-preview-environment-setup/`.

An unauthenticated GET of `https://alchemy-state-store.tk-d86.workers.dev/version` returned `{"version":7}`, matching the locked Alchemy backend contract. This confirms the public version endpoint; it does not establish authenticated state access or verify retained production outputs.

The dedicated token requires four **Account → Edit** grants scoped to the existing source/preview account: **Workers Scripts, D1, Workers R2 Storage and Secrets Store**. Cold Alchemy runners recover their state credential using a secret binding, which requires Secrets Store Edit even when the backend already exists. The fixed runner's `updateStateStore:false` prevents automatic backend provisioning or upgrades. The source/docs permission analysis is preserved in `/tmp/opencode/TIM-27-token-permission-plan.md` and the `TIM-27-CI-readiness-2026-09-15` recovery archive.

The existing repository deployment token remains unchanged. A new secret name containing that same value would not create distinct authority; the accepted trusted-preview configuration continues to require the dedicated protected credential.

## Ledger inspection before broker activation

The existing signed broker-status operation requires broker enablement, but Cloudflare Durable Objects Data Studio supplies an independent operator path to the actual SQLite ledger. After source deployment, identify the production `MATCHMAKING` binding and inspect the shared coordinator object named `secret-overlord`, used by both games. The documented read-only SELECT reports current-day measured/unknown/accounted amounts, active reservations and allocations, preview allocations and cross-day unresolved usage.

The procedure and exact query are retained at `/tmp/opencode/TIM-27-preactivation-ledger-path.md` and in the same readiness archive. Data Studio requires an authorized Cloudflare dashboard session; access and the live query have not been exercised. Missing data is not an empty ledger, and D1 match summaries or provider estimates do not replace this snapshot. Broker flags remain disabled during inspection.
