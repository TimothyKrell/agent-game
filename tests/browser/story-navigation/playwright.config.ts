import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const evidence = resolve(
  process.env.TIM23_EVIDENCE_DIR ?? `test-results/story-navigation/browser-${Date.now()}-${process.pid}`,
);

export default defineConfig({
  testDir: '../../../e2e',
  testMatch: ['continuous-story.spec.ts', 'query-lifecycle.spec.ts'],
  workers: 1,
  timeout: 120_000,
  outputDir: resolve(evidence, 'browser-results'),
  reporter: [['list'], ['json', { outputFile: resolve(evidence, 'browser-results.json') }]],
  use: {
    baseURL: 'http://127.0.0.1:6283',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
