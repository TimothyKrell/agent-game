import { defineConfig } from 'vitest/config';
import release from './vitest.release.config.ts';

// Full-match, stress and deployment-lifecycle journeys are opt-in CI work.
export const extendedTests = [
  'tests/history.test.ts',
  'tests/succession-worker-bounds.test.ts',
  'tests/succession-worker.test.ts',
  'tests/cli-worker.test.ts',
  'tests/cli-preview.test.ts',
  'tests/preview-broker.test.ts',
  'tests/preview-lifecycle-state.test.ts',
  'tests/preview-worker.test.ts',
  'tests/preview-runner.test.ts',
  'tests/preview-finalizer.test.ts',
  'tests/preview-identity.test.ts',
];

export default defineConfig({
  ...release,
  test: {
    ...release.test,
    exclude: [...(release.test?.exclude ?? []), ...extendedTests],
  },
});
