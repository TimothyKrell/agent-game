import { defineConfig } from 'vitest/config';

// Explicit red probe for the parent-owned generation-fence interface request.
export default defineConfig({
  test: { include: ['.tim27-lifecycle/generation-gap.test.ts'], testTimeout: 30_000, maxWorkers: 1 },
});
