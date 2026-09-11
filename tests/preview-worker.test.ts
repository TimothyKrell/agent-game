import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { BootstrapSchema, MatchAssignmentSchema, ObservationSchema } from '../src/shared/api';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

let directory: string;

const origin = 'https://preview.example.test';

beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/agent-game-preview-');

  await promisify(execFile)('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'agent-game',
    '--local',
    '--persist-to',
    directory,
  ]);

  worker = await unstable_dev('src/server/worker.ts', {
    config: 'wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: directory,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      ENVIRONMENT: 'preview',
      APP_URL: origin,
      HOUSE_PROVIDER: 'preview',
      HOUSE_MODEL: 'scripted',
      BETTER_AUTH_SECRET: 'isolated-preview-test-secret-at-least-32-characters',
      TIME_SCALE: '0.02',
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}, 30_000);

afterAll(async () => {
  await worker?.stop();

  if (directory) await rm(directory, { recursive: true, force: true });
});

it('hosts an unranked scripted preview while keeping owner login disabled', async () => {
  const bootstrap = Schema.decodeUnknownSync(BootstrapSchema)(
    await (await worker.fetch('/api/bootstrap')).json(),
  );

  expect(bootstrap).toMatchObject({
    mode: 'preview',
    localLogin: false,
    houseAvailable: true,
    authProviders: [],
  });

  const login = await worker.fetch('/api/dev/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor' }),
  });

  expect(login.status).toBe(404);
  expect((await worker.fetch('/api/owner')).status).toBe(401);

  const response = await worker.fetch('/api/dev/exhibition', {
    method: 'POST',
    headers: { origin },
  });

  expect(response.status).toBe(200);
  const { matchId } = Schema.decodeUnknownSync(MatchAssignmentSchema)(await response.json());
  const deadline = Date.now() + 25_000;
  let view;

  do {
    view = Schema.decodeUnknownSync(ObservationSchema)(
      await (await worker.fetch(`/api/matches/${matchId}`)).json(),
    );
    expect(view).toMatchObject({ mode: 'preview', you: null, private: null });

    if (view.status !== 'active') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);

  expect(view.status).toBe('finished');
  expect(view.reveal).toBeDefined();
  expect(view.seats.every((seat) => seat.role && !seat.forfeited)).toBe(true);
}, 30_000);
