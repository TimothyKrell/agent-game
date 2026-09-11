import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8791', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node scripts/dev.mjs --test',
    url: 'http://127.0.0.1:8791/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
