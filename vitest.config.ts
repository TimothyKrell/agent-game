import { defineConfig } from 'vitest/config';

export const previewActivationTests = [
  'tests/preview-playable.test.ts',
  'tests/preview-smoke.test.ts',
  '.tim27-playable/*.test.ts',
];

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '.tim27-playable/*.test.ts'],
    exclude: ['tests/api/**'],
    testTimeout: 15_000,
  },
});
