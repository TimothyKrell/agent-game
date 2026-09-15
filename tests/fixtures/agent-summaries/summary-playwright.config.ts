import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'summary-browser.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: './test-results/summaries',
  use: { baseURL: 'http://127.0.0.1:6372', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/fixtures/agent-summaries/serve-summaries.mjs',
    cwd: '../../..',
    url: 'http://127.0.0.1:6372/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
