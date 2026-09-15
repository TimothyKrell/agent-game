import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['.tim27/runtime.test.mjs'], maxWorkers: 1 },
});
