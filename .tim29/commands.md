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

## Spec-review correction

The original review preservation set at `/tmp/opencode/TIM29-spec-review/` was read only. New regression evidence uses separate names:

```bash
# Ran before the source correction: 4 expected failures at the reviewed boundaries.
npx playwright test --config .tim29/correction-playwright.config.ts agent-pictures-lifecycle > .tim29/correction-lifecycle-red.log 2>&1

# Passing correction checks: 36 scoped tests and 10 browser tests.
npx vitest run tests/agent-picture-data.test.ts tests/client-api.test.ts tests/agent-picture-api.test.ts tests/agent-picture-lifecycle.test.ts > .tim29/correction-tests.log 2>&1
npx playwright test --config .tim29/correction-playwright.config.ts > .tim29/correction-browser-green.log 2>&1
npm run typecheck > .tim29/correction-typecheck.log 2>&1
npm run lint > .tim29/correction-lint.log 2>&1
npm run build > .tim29/correction-build.log 2>&1
git diff --check
```

The correction config includes both original and new suites and writes to `.tim29/test-results/correction/`. Red traces/context are preserved separately in `.tim29/test-results/correction-red/`. The new lifecycle suite builds the actual hook/provider in memory and drives held responses through native HTTP on OS-assigned ports; it verifies zero browser page errors and real native connection aborts. Original lookup logs/config/fixture remain intact.
