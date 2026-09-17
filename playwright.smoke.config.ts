import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

export default defineConfig({
  ...config,
  testMatch: ['arena.spec.ts', 'luminous.spec.ts', 'succession.spec.ts', 'coding-live.spec.ts'],
  grep: /(?:onboards without signing in first and copies a self-contained prompt on desktop and mobile|arena selects real summaries and switches to replay records on desktop and mobile|one terminal champion remains fixed during two-act reading with exact historical resources and bounded reads|rules scope restores on back while shared navigation stays neutral|live feed retains rows, follows the bottom, and pauses without moving the reader|public puzzles unlock on progress and terminal reports show actual test evidence without chat|finished matches expose a bounded Act I timeline even after a long coding race)$/,
  use: { ...config.use, video: 'off' },
});
