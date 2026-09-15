import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testMatch: 'response-recovery.spec.ts',
  outputDir: './test-results/correction',
});
