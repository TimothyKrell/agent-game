import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', '.tim27-playable/*.test.ts'],
    exclude: ['tests/api/**'],
    testTimeout: 15_000,
  },
});
