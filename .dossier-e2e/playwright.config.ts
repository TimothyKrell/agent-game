import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import established from '../playwright.config';

const root = fileURLToPath(new URL('../', import.meta.url));

const run = process.env.DOSSIER_RUN ?? `run-${Date.now()}`;

const baseURL = 'http://127.0.0.1:6401';

export default defineConfig({
  ...established,
  testDir: `${root}e2e`,
  outputDir: `${root}.dossier-e2e/results/${run}/artifacts`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${root}.dossier-e2e/results/${run}/report.json` }],
    ['html', { outputFolder: `${root}.dossier-e2e/results/${run}/html`, open: 'never' }],
  ],
  use: {
    ...established.use,
    baseURL,
    launchOptions: { executablePath: '/usr/bin/chromium' },
  },
  webServer: {
    command: 'node scripts/dev.mjs --test',
    cwd: root,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: '6401',
      HOUSE_PROVIDER: 'preview',
      HOUSE_MODEL: 'scripted',
      TIME_SCALE: '0.02',
      WRANGLER_SEND_METRICS: 'false',
    },
  },
});
