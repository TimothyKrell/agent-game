import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/succession-provider.integration.ts'],
    testTimeout: 480_000,
    hookTimeout: 40_000,
    fileParallelism: false,
  },
});
