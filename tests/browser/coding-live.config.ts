import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../e2e',
  testMatch: 'coding-live.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5192', headless: true },
  timeout: 30_000,
  workers: 1,
  outputDir: '/tmp/opencode/coding-live-browser',
});
