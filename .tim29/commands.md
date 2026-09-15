# TIM-29 local verification

Run from `/tmp/opencode/agent-game-TIM-29` using the approved root `node_modules` symlink.

```bash
npx vitest run tests/agent-picture-data.test.ts tests/client-api.test.ts tests/agent-picture-api.test.ts > .tim29/lookup-tests.log 2>&1
npx playwright test --config .tim29/playwright.config.ts > .tim29/lookup-browser.log 2>&1
npm run typecheck > .tim29/typecheck.log 2>&1
npm run lint > .tim29/lint.log 2>&1
npm run build > .tim29/build.log 2>&1
npm run format:check > .tim29/format-check.log 2>&1
git diff --check
```

The lookup browser config uses `http://127.0.0.1:6371` for intercepted fixture routes and needs no running server. It builds `e2e/fixtures/agent-pictures.tsx` in memory against the real production hook/provider. The native HTTP test listens on an OS-assigned port. Browser failures retain traces/screenshots in `.tim29/test-results/`.

Initial lookup result: **32 scoped tests and 5 browser hook scenarios passed**. Consumer/image/dialog verification belongs to the subsequent shared component integration; see `docs/evidence/TIM-29-shared-portraits.md` for the exact dependency and insertion seams.
