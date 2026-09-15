import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

export default defineConfig({
  ...config,
  testMatch: ['arena.spec.ts', 'luminous.spec.ts', 'succession.spec.ts'],
  grep: /(?:onboards without signing in first and copies a self-contained prompt on desktop and mobile|arena selects real summaries and switches to replay records on desktop and mobile|one terminal champion remains fixed during two-act reading with exact historical resources and bounded reads|rules scope restores on back while shared navigation stays neutral)$/,
  use: { ...config.use, video: 'off' },
});
