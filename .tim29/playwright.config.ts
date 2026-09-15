import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  testMatch: 'agent-pictures-data.spec.ts',
  workers: 1,
  timeout: 30_000,
  outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:6371', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
