import { defineConfig } from '@playwright/test';

const output = process.env.DOSSIER_ENDING_EVIDENCE ?? '../../../test-results/dossier/ending';

export default defineConfig({
  testDir: '.',
  testMatch: 'ending.spec.mjs',
  workers: 1,
  outputDir: output,
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
  use: {
    baseURL: process.env.DOSSIER_ORIGIN ?? 'http://127.0.0.1:6291',
    reducedMotion: 'reduce',
    hasTouch: true,
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
});
