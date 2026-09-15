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

## Production consumer adoption

```bash
npm run build > .tim29/adoption-build.log 2>&1
npx playwright test --config .tim29/adoption-playwright.config.ts > .tim29/adoption-browser.log 2>&1
npx playwright test --config .tim29/owner-playwright.config.ts > .tim29/adoption-owner-browser.log 2>&1
npx playwright test --config .tim29/legacy-playwright.config.ts > .tim29/adoption-legacy-browser.log 2>&1
npx playwright test --config .tim29/correction-playwright.config.ts > .tim29/adoption-lookup-browser.log 2>&1
npx vitest run tests/agent-picture-data.test.ts tests/client-api.test.ts tests/agent-picture-api.test.ts tests/agent-picture-lifecycle.test.ts > .tim29/adoption-tests.log 2>&1
node .tim29/check-production.mjs > .tim29/adoption-production.log 2>&1
npm run typecheck > .tim29/adoption-typecheck.log 2>&1
npm run lint > .tim29/adoption-lint.log 2>&1
npm run format:check > .tim29/adoption-format-check.log 2>&1
git diff --check
```

Results: **7 production consumer + 7 real owner/Worker + 13 existing feed/sitewide + 10 lookup browser scenarios passed**, plus **36 scoped Vitest tests**. Preview uses 6371, Worker/inspector 6372/6373, and the exclusion scanner 6374. The owner and legacy configs share the same exclusive local Worker pair; run those two commands sequentially. Local state stays in ignored `.tim29/runs/worker/`. Wrangler 4.129.1 runs `--local` with the existing TIM-28 test Worker and binding shapes, a fresh D1/R2 namespace, scripted house provider and no AI binding.

The production scanner adapts the accepted TIM-11 boundary check into owned ports/output paths, preserves original evidence, and asserts the guide sources match `6b83e92` byte for byte. See `.tim29/production.json` and `.tim29/captures/`. Visual fixture portraits use a known decodable PNG; missing/broken states exercise the shared graphical fallback.

## Home summary entrant completion

```bash
npm run build > .tim29/summary-build.log 2>&1
npx vitest run tests/summary-entrants.test.ts tests/platform-repository.test.ts tests/agent-picture-data.test.ts tests/client-api.test.ts tests/agent-picture-api.test.ts tests/agent-picture-lifecycle.test.ts > .tim29/summary-tests.log 2>&1
npx playwright test --config .tim29/summary-playwright.config.ts > .tim29/summary-browser.log 2>&1
npx playwright test --config .tim29/correction-playwright.config.ts --output .tim29/test-results/summary-lookup > .tim29/summary-lookup-browser.log 2>&1
npx playwright test --config .tim29/legacy-playwright.config.ts --output .tim29/test-results/summary-legacy > .tim29/summary-legacy-browser.log 2>&1
node .tim29/check-summary-production.mjs > .tim29/summary-production.log 2>&1
npm run typecheck > .tim29/summary-typecheck.log 2>&1
npm run lint > .tim29/summary-lint.log 2>&1
npm run format:check > .tim29/summary-format-check.log 2>&1
git diff --check
```

Results: **53 Vitest tests**, **7 real-Worker Home + 10 lookup + 13 feed/sitewide browser scenarios**. The summary Worker uses 6372/6373 and isolated state in `.tim29/runs/summaries/`; run it sequentially with the legacy config, which uses the same ports. Native selection-cancellation verification uses an OS-assigned proxy port. The production scanner uses 6374 and writes separate `.tim29/summary-production.json` / `.tim29/summary-captures/` artifacts, retaining all prior adoption evidence. Only the three approved production files (`src/shared/api.ts`, `src/server/repository.ts`, `src/client/main.tsx`) change; additional files are local fixtures, tests and evidence.
