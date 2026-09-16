import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'evidence-parity.spec.ts',
  workers: 1,
  outputDir: '../../../test-results/dossier/evidence-parity',
  use: {
    baseURL: 'http://127.0.0.1:5182',
    reducedMotion: 'reduce',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'DOSSIER_PORT=5182 node tests/browser/dossier/serve.mjs',
    cwd: '../../..',
    url: 'http://127.0.0.1:5182/tests/browser/dossier/browser.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
