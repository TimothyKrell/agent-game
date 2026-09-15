import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['foundations.spec.ts', 'rule-help.spec.ts'],
  workers: 1,
  outputDir: '../../../test-results/foundations/interactions',
  use: {
    baseURL: 'http://127.0.0.1:6191',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
});
