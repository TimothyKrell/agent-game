import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { BootstrapSchema, MatchAssignmentSchema, ObservationSchema } from '../src/shared/api';
import { HistoryPage2Schema, Observation2Schema, ReplayFrame2Schema } from '../src/shared/succession';
import { HistoryAnchor2Schema, RoundIndex2Schema } from '../src/shared/history';

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
      TIME_SCALE: '0.1',
      CODING_MAX_CONCURRENT_MATCHES: '0',
    },
    experimental: {
      forceLocal: true,
      disableExperimentalWarning: true,
      watch: false,
      enableContainers: false,
    },
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

  const response = await worker.fetch('/api/dev/exhibition?gameId=secret-overlord', {
    method: 'POST',
    headers: { origin },
  });

  expect(response.status).toBe(200);
  const { matchId } = Schema.decodeUnknownSync(MatchAssignmentSchema)(await response.json());
  const deadline = Date.now() + 180_000;
  let view;

  do {
    view = Schema.decodeUnknownSync(ObservationSchema)(
      await (await worker.fetch(`/api/matches/${matchId}`)).json(),
    );
    expect(view).toMatchObject({ mode: 'preview', you: null, private: null });

    if (view.status !== 'active') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);

  expect(view.status, view.winReason ?? 'Preview did not reach a terminal result').toBe('finished');
  expect(view.reveal).toBeDefined();
  expect(view.seats.every((seat) => seat.role && !seat.forfeited)).toBe(true);
}, 190_000);

it('completes both actual Succession acts through house DO jobs and serves bounded archive replay', async () => {
  const headers = { origin, 'content-type': 'application/json', 'X-Agent-Game-Protocols': '1,2' };

  const response = await worker.fetch('/api/dev/exhibition', {
    method: 'POST',
    headers,
    body: JSON.stringify({ gameId: 'succession' }),
  });

  expect(response.status, await response.clone().text()).toBe(200);
  const { matchId } = Schema.decodeUnknownSync(MatchAssignmentSchema)(await response.json());
  const legacy = await worker.fetch(`/api/matches/${matchId}`);
  expect(legacy.status).toBe(426);
  expect(await legacy.text()).toContain(matchId);
  const deadline = Date.now() + 300_000;
  const acts = new Set<number>();
  let view;

  do {
    const current = await worker.fetch(`/api/matches/${matchId}`, { headers });
    expect(current.status, await current.clone().text()).toBe(200);
    const text = await current.text();
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(14_336);
    view = Schema.decodeUnknownSync(Observation2Schema)(JSON.parse(text));
    acts.add(view.act);
    expect(view).toMatchObject({ mode: 'preview', you: null, private: null });

    if (view.status !== 'active') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);

  expect(acts).toEqual(new Set([1, 2]));
  expect(view.status).toBe('finished');
  expect(view.result?.kind).toBe('individual');
  expect(view.seats.every((seat) => !seat.forfeited)).toBe(true);
  const epoch = view.history.visibilityEpoch;

  async function archiveRead<A, I>(path: string, schema: Schema.Codec<A, I>): Promise<A> {
    const response = await worker.fetch(`/api/matches/${matchId}/${path}`, { headers });
    const text = await response.text();

    expect(response.status, `${path}: ${text}`).toBe(200);

    return Schema.decodeUnknownSync(schema)(JSON.parse(text));
  }

  const rounds = await archiveRead(`rounds?epoch=${epoch}`, RoundIndex2Schema);

  expect(new Set(rounds.rounds.map((round) => round.act))).toEqual(new Set([1, 2]));
  expect(rounds.rounds.length).toBeLessThanOrEqual(42);

  for (const round of [rounds.rounds[0], rounds.rounds.find((entry) => entry.act === 2)!]) {
    const anchor = await archiveRead(
      `history-anchor?epoch=${epoch}&eventKey=${round.eventKey}`,
      HistoryAnchor2Schema,
    );

    expect(anchor.cursor).toBe(round.through);

    const frame = await archiveRead(`replay?epoch=${epoch}&through=${round.through}`, ReplayFrame2Schema);

    expect(frame.act).toBe(round.act);
    expect(frame.archive?.act).toBe(round.act);
  }

  const page = await archiveRead(`history?epoch=${epoch}&maxBytes=12288&limit=64`, HistoryPage2Schema);

  expect(page.events.length).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(12_288);
}, 310_000);
