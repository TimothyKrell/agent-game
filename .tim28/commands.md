# TIM-28 local verification commands

Working directory: `/tmp/opencode/agent-game-TIM-28`, branch `feat/tim-28-agent-pictures`, starting commit `d5d0630`.

Dependencies were reused through the approved `node_modules` symlink to `/home/timothykrell/Code/agent-games/node_modules`. Versions and package files were not changed. The symlink is intentionally untracked.

```bash
npx wrangler types --strict-vars=false
npm run build
npx vitest run tests/agent-pictures.test.ts
npx vitest run tests/platform-repository.test.ts tests/rating-storage.test.ts tests/client-api.test.ts tests/worker-errors.test.ts tests/succession-codecs.test.ts
npx playwright test --config .tim28/playwright.config.ts
npx playwright test --config .tim28/owner-regressions.config.ts
npm run typecheck
npm run lint
npm run format:check
npx prettier --check docs/evidence/TIM-28-agent-pictures.md '.tim28/*.{ts,mjs,jsonc}'
git diff --check
```

The Worker integration suite starts exclusive ephemeral local Workers and applies migrations into unique `.tim28/runs/api-*` / `isolation-*` stores. Browser configs start and stop `serve.mjs` on `8828` / inspector `9228` with `.tim28/runs/browser` storage. Run the browser configs sequentially. Every config is scripted and has no AI/remote binding. The probe-only Worker in this directory is never wired to production.

Final observed results: 8 Worker/D1/R2 tests; 33 existing Vitest regressions; 1 full picture browser flow; 2 existing owner/pairing browser flows; all passed. Typecheck, repository lint, repository format, build, evidence formatting, and diff checks passed. Full outputs are retained in this worktree's ignored `.tim28/*.log`; small screenshot evidence is committed in `captures/`.

`fixture.jpg` was made by format-converting and resizing the existing `docs/design/TIM-6/annotation-review-2/screenshots/desktop-portrait.png` to 8×8 with the already-installed `sharp`, solely as static JPEG transport-test data. No image inference or image-generation service was used. The white 1×1 PNG literal has valid chunk CRCs; a corrupt-CRC variant is a deliberate rejection test.

See [`docs/evidence/TIM-28-agent-pictures.md`](../docs/evidence/TIM-28-agent-pictures.md) for exact schema/API contracts, historical and preview policies, concurrency/collection reasoning, current documentation sources, and verification limits.
