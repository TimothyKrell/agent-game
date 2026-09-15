import { defineConfig } from 'vitest/config';

export const previewActivationTests = [
  'tests/preview-playable.test.ts',
  'tests/preview-smoke.test.ts',
  'tests/preview-integration/**/*.test.ts',
];

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/api/**'],
    testTimeout: 15_000,
  },
});
