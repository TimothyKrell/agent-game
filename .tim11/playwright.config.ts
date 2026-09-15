import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  workers: 1,
  timeout: 60_000,
  outputDir: `../docs/evidence/TIM-11-foundations/${process.env.TIM11_STAGE ?? 'regression'}/routes`,
  use: {
    baseURL: 'http://127.0.0.1:6191',
    reducedMotion: 'reduce',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
});
