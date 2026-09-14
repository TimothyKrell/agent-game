import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/dialogue-baseline.integration.ts'], testTimeout: 120_000 },
});
