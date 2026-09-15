import { defineConfig } from 'vitest/config';
import config from './vitest.config.ts';
import { extendedTests } from './vitest.core.config.ts';

export default defineConfig({
  ...config,
  test: { ...config.test, include: extendedTests },
});
