import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['agent-pictures-data.spec.ts', 'agent-pictures-lifecycle.spec.ts'],
  outputDir: './test-results/correction',
});
