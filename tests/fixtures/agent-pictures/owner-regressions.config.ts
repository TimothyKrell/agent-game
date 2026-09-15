import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testDir: '../../../e2e',
  testMatch: 'arena.spec.ts',
  grep: /browser pairing approves|owner creates and retires/,
});
