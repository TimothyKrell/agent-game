import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const run = process.env.DOSSIER_RUN ?? `capture-lifetime-${Date.now()}`;

export default defineConfig({
  testDir: root,
  testMatch: process.env.CAPTURE_WORKER
    ? 'e2e/succession-worker.spec.ts'
    : 'tests/browser/history-capture/capture-lifetime.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: `${root}test-results/history-capture/${run}/artifacts`,
  reporter: [['list'], ['json', { outputFile: `${root}test-results/history-capture/${run}/report.json` }]],
  use: {
    baseURL: 'http://127.0.0.1:6461',
    launchOptions: { executablePath: '/usr/bin/chromium' },
    trace: 'on',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.CAPTURE_WORKER
    ? {
        command: 'node scripts/dev.mjs --test',
        cwd: root,
        url: 'http://127.0.0.1:6461/api/health',
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PORT: '6461',
          HOUSE_PROVIDER: 'preview',
          HOUSE_MODEL: 'scripted',
          TIME_SCALE: '0.02',
          WRANGLER_SEND_METRICS: 'false',
        },
      }
    : undefined,
});
