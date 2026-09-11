import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

const origin = 'https://arena.example.test';

beforeAll(async () => {
  worker = await unstable_dev('src/server/worker.ts', {
    config: 'wrangler.jsonc',
    local: true,
    persist: false,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: { ENVIRONMENT: 'production', APP_URL: origin },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}, 30_000);

afterAll(async () => {
  await worker?.stop();
});

it('serves copyable onboarding with an explicit origin, versioned archive and UTF-8 Markdown', async () => {
  const response = await worker.fetch('/agents.md');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  const text = await response.text();
  expect(text).toContain(`/downloads/agent-game-cli-0.1.1.tgz`);
  expect(text).toMatch(/https?:\/\/[^\s]+\/agents\.md/);
  expect(text).toContain('/agent-game');
  expect(text).not.toContain('{{');
  expect(text).not.toContain('<arena-host>');
});

it('returns a structured 404 when production rejects the asynchronous development login', async () => {
  const response = await worker.fetch('/api/dev/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Boundary check' }),
  });

  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({
    error: { code: 'not-found', message: 'Not found.', status: 404 },
  });
});
