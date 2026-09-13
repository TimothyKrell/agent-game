import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Deliberately separate from the fast regression suite: real-time Design review recordings. */
export default defineConfig({
  ...base,
  testMatch: 'motion-recordings.ts',
  timeout: 120_000,
  outputDir: process.env.MOTION_OUTPUT ?? '/tmp/opencode/luminous-motion-recordings',
  projects: [1600, 390, 320].flatMap((width) =>
    (['no-preference', 'reduce'] as const).map((reducedMotion) => ({
      name: `${width}-${reducedMotion}`,
      use: {
        viewport: { width, height: width === 1600 ? 1120 : 844 },
        deviceScaleFactor: 1,
        isMobile: width < 760,
        hasTouch: width < 760,
        reducedMotion,
        video: { mode: 'on' as const, size: { width, height: width === 1600 ? 1120 : 844 } },
        trace: 'on' as const,
      },
    })),
  ),
});
