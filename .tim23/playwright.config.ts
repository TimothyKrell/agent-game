import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  testMatch: ['continuous-story.spec.ts', 'query-lifecycle.spec.ts'],
  workers: 1,
  timeout: 120_000,
  outputDir: './browser-results',
  reporter: [['list'], ['json', { outputFile: 'browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:6283',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
