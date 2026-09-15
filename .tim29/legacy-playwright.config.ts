import { defineConfig } from '@playwright/test';
import worker from './owner-playwright.config';

export default defineConfig({
  ...worker,
  testDir: '../e2e',
  testMatch: ['feed.spec.ts', 'sitewide.spec.ts'],
  outputDir: './test-results/legacy',
});
