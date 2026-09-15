import { defineConfig } from 'vitest/config';
import config, { previewActivationTests } from './vitest.config.ts';

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    exclude: [...(config.test?.exclude ?? []), ...previewActivationTests],
  },
});
