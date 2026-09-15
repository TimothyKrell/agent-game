import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['.tim27-protocol/blanket-rejection.test.mjs'],
    testTimeout: 10000,
    fileParallelism: false,
  },
});
