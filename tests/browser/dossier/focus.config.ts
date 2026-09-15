import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'rule-help-focus.spec.ts',
  workers: 1,
  outputDir: process.env.FOCUS_OUTPUT ?? '../../../test-results/dossier/focus',
  use: {
    baseURL: 'http://127.0.0.1:6191',
    reducedMotion: 'reduce',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
});
