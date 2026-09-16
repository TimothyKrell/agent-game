import { defineConfig } from '@playwright/test';

const port = 5182;

export default defineConfig({
  testDir: '.',
  testMatch: ['parity.spec.ts'],
  workers: 1,
  timeout: 120_000,
  outputDir: '../../../test-results/dossier-parity/browser-results',
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
  },
  webServer: {
    command: `DOSSIER_PORT=${port} node tests/browser/dossier/serve.mjs`,
    cwd: '../../..',
    url: `http://127.0.0.1:${port}/tests/browser/dossier/browser.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
