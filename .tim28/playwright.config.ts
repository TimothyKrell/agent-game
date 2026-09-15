import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:8828', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node .tim28/serve.mjs',
    cwd: '..',
    url: 'http://127.0.0.1:8828/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
