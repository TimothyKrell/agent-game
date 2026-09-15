import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  testMatch: 'agent-portrait-consumers.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: './test-results/adoption',
  use: { baseURL: 'http://127.0.0.1:6371', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 6371 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:6371',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
