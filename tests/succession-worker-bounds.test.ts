import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { Observation2, ActionRequest2, HistoryPage2, ReplayFrame2 } from '../src/shared/succession';
import type { QueueStatus } from '../src/shared/api';
import type { FixtureController } from './fixtures/succession-worker';
import type { BoundsReport } from './fixtures/succession-worker-metrics';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

let directory: string;

let matchId: string;

let controllers: FixtureController[];

const measurements: Record<string, BoundsReport> = {};

const bytes = <T>(value: T) => Buffer.byteLength(JSON.stringify(value));

async function start() {
  worker = await unstable_dev('tests/fixtures/succession-worker.ts', {
    config: 'tests/succession-worker.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: directory,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}

interface RequestHeaders {
  [name: string]: string;
}

async function get<T>(path: string, controller?: FixtureController, body?: string): Promise<T> {
  const headers: RequestHeaders = {
    'X-Agent-Game-Protocols': '1,2',
    'content-type': 'application/json',
  };

  if (controller) headers.authorization = `Bearer ${controller.token}`;

  const response = await worker.fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    body,
    headers,
  });

  const text = await response.text();
  expect(response.ok, `${path}: ${response.status} ${text}`).toBe(true);

  return JSON.parse(text);
}

const current = (controller?: FixtureController) => get<Observation2>(`/api/matches/${matchId}`, controller);

const fixture = (suffix: string) => `/__fixture/matches/${matchId}/${suffix}`;

const reset = () => get<BoundsReport>(fixture('metrics?reset'));

async function record(name: string, context = false) {
  const report = await get<BoundsReport>(fixture('metrics'));
  measurements[name] = report;

  const historical = report.queries.filter(
    ({ sql }) => /^SELECT/i.test(sql) && /\b(events|replay_facts|replay_frames)\b/i.test(sql),
  );

  if (!context) {
    expect(historical, name).toEqual([]);
    expect(report.maxCloneEvents, name).toBe(0);
  } else
    for (const query of historical) {
      expect(query.sql, name).toMatch(/LIMIT|WHERE.*\bid\b/i);
      // Index traversal and canonical table access both contribute to native rowsRead.
      expect(query.rowsRead, `${name}: ${query.sql}`).toBeLessThanOrEqual(128);
      expect(query.materializedRows, name).toBeLessThanOrEqual(64);
    }

  expect(report.maxCloneBytes, name).toBeLessThanOrEqual(65_536);
  expect(report.maxCloneEvents, name).toBeLessThanOrEqual(64);
  expect(report.maxStateWriteBytes, name).toBeLessThanOrEqual(65_536);

  for (const query of report.queries.filter(({ sql }) =>
    /^SELECT data FROM (game|replay_frames)\b/i.test(sql),
  ))
    expect(query.materializedBytes, name).toBeLessThanOrEqual(65_536);

  return report;
}

function decision(view: Observation2): ActionRequest2 {
  const options = view.decision?.actions ?? [];

  const priorities = [
    'coup',
    'tax',
    'pass',
    'income',
    'lose-influence',
    'return-influence',
    'execute',
    'investigate',
    'special-election',
    'nominate',
  ];

  const hand = view.private?.act === 1 ? view.private.hand : [];

  const selected =
    options.find(({ action }) => action.type === 'vote' && action.approve) ??
    options.find(
      ({ action }) =>
        action.type === 'enact' && action.cardId === hand.find((card) => card.policy === 'safeguard')?.id,
    ) ??
    options.find(
      ({ action }) =>
        action.type === 'discard' && action.cardId === hand.find((card) => card.policy === 'override')?.id,
    ) ??
    priorities.flatMap((type) => options.filter(({ action }) => action.type === type))[0] ??
    options[0];

  if (!selected || !view.decision) throw new Error('No entitled decision');

  return {
    gameId: 'succession',
    actionId: crypto.randomUUID(),
    phaseId: view.phase.id,
    decisionId: view.decision.id,
    action: selected.action,
  };
}

async function drive(stop: (view: Observation2) => boolean) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const view = await current();
    expect(view.status).not.toBe('interrupted');

    if (stop(view)) return view;

    if (view.phase.kind.includes('discussion')) {
      await get(fixture(`clock?kind=discussion&phaseId=${view.phase.id}`));
      continue;
    }

    const seats = await Promise.all(controllers.map((controller) => current(controller)));
    await Promise.all(
      seats.map((seat, index) =>
        seat.decision && !seat.you?.forfeited
          ? get(`/api/matches/${matchId}/actions`, controllers[index], JSON.stringify(decision(seat)))
          : Promise.resolve(),
      ),
    );
  }

  throw new Error('Actual engine did not reach checkpoint');
}

beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/succession-bounds-');
  await promisify(execFile)('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'succession-worker-test',
    '--config',
    'tests/succession-worker.wrangler.jsonc',
    '--local',
    '--persist-to',
    directory,
  ]);
  await start();
}, 60_000);

afterAll(async () => {
  await worker?.stop();

  if (directory) await rm(directory, { recursive: true, force: true });
});

async function admitExternalGroup() {
  controllers = await get<FixtureController[]>('/__fixture/controllers?count=10');
  await Promise.all(
    controllers.map((controller) =>
      get('/api/queue', controller, JSON.stringify({ gameId: 'succession', requestId: crypto.randomUUID() })),
    ),
  );
  const ticket = await get<QueueStatus>('/api/queue', controllers[0]);
  expect(ticket.status).toBe('matched');
  matchId = ticket.matchId!;
}

it('measures a small-history public/private current baseline on the actual host', async () => {
  await admitExternalGroup();
  await reset();
  const publicView = await current();
  const privateView = await current(controllers[0]);
  const report = await record('small-history-current');
  expect(publicView.history.streamHead).toBeLessThan(64);
  await writeFile(
    `/tmp/opencode/succession-worker-small-baseline-${process.pid}.json`,
    JSON.stringify({ report, publicBytes: bytes(publicView), privateBytes: bytes(privateView) }, null, 2),
  );
  await drive((view) => view.status === 'finished');
}, 120_000);

it('bounds actual cold host, mutations, sockets, house context and terminal archives with 31,200 Unicode messages', async () => {
  await admitExternalGroup();
  const initial = await current();
  await reset();
  await current();
  await current(controllers[0]);
  await record('small-history-current');
  let corpusStart = 0;

  for (let offset = 0; offset < 31_200; offset += 64) {
    const batch = await get<{ first: number }>(
      fixture(`populate?offset=${offset}&count=${Math.min(64, 31_200 - offset)}`),
    );

    if (offset === 0) corpusStart = batch.first - 1;
  }

  const corpusEnd = (await get<{ through: number }>(fixture('populate?offset=0&count=64&escaping'))).through;
  await worker.stop();
  await start();
  const cold = await current(controllers[0]);
  expect(bytes(cold)).toBeLessThanOrEqual(14_336);
  await record('cold-restarted-private-current');
  await reset();
  await current();
  await current(controllers[0]);
  await record('no-op-reconcile-current-arm');
  await reset();
  await get(fixture('alarm'));
  await record('explicit-alarm');
  await reset();
  const frames: string[] = [];

  const socket = new WebSocket(
    `ws://${worker.address}:${worker.port}/api/matches/${matchId}/events?protocol=2`,
  );

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener(
      'message',
      (event: MessageEvent<string>) => {
        frames.push(event.data);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener('error', reject, { once: true });
  });
  expect(Buffer.byteLength(frames[0])).toBeLessThanOrEqual(16_384);
  socket.close();
  await record('socket-resync');
  const actionable = await drive((view) => !view.phase.kind.includes('discussion'));
  const seats = await Promise.all(controllers.map((controller) => current(controller)));
  const index = seats.findIndex((view) => view.decision);
  const input = decision(seats[index]);
  await reset();
  const ack = await get(`/api/matches/${matchId}/actions`, controllers[index], JSON.stringify(input));
  expect(bytes(ack)).toBeLessThanOrEqual(16_384);
  await record('accepted-action-save-enqueue-broadcast-arm');
  await reset();
  await get(`/api/matches/${matchId}/actions`, controllers[index], JSON.stringify(input));
  await record('receipt-retry');
  expect(actionable.status).toBe('active');
  const act2 = await drive((view) => view.act === 2 && !view.phase.kind.includes('discussion'));
  await reset();
  await get(fixture(`clock?kind=grace&phaseId=${act2.phase.id}`));
  await record('timeout-takeover-enqueue', true);
  const taken = await current();
  const house = taken.seats.find((seat) => seat.forfeited);
  expect(house).toBeDefined();
  await reset();

  const context = await get<{ recent: { text: string }[]; observation: Observation2 } | null>(
    fixture(`house-context?seat=${house!.number}`),
  );

  expect(context).not.toBeNull();
  expect(context!.recent.length).toBeLessThanOrEqual(64);
  expect(bytes(context!.recent)).toBeLessThanOrEqual(64 * 8192);
  expect(bytes(context!.observation)).toBeLessThanOrEqual(14_336);
  await record('entitled-house-context', true);
  const terminal = await drive((view) => view.status === 'finished');
  await worker.stop();
  await start();
  const archived = await current();
  expect(bytes(archived)).toBeLessThanOrEqual(14_336);
  await record('terminal-cold-current');
  await reset();

  const page = await get<HistoryPage2>(
    `/api/matches/${matchId}/history?epoch=${archived.history.visibilityEpoch}&after=${corpusStart}&through=${archived.history.streamHead}&limit=64`,
  );

  expect(page.events.length).toBeLessThanOrEqual(64);
  expect(bytes(page)).toBeLessThanOrEqual(32_768);
  await record('terminal-indexed-page', true);
  await reset();

  const stale = await get<HistoryPage2>(
    `/api/matches/${matchId}/history?epoch=${initial.history.visibilityEpoch}&after=0`,
  );

  expect(stale.reset).toBe(true);
  await record('terminal-epoch-reset', true);
  await reset();

  const replay = await get<ReplayFrame2>(
    `/api/matches/${matchId}/replay?epoch=${archived.history.visibilityEpoch}&through=${archived.history.streamHead}`,
  );

  expect(bytes(replay)).toBeLessThanOrEqual(32_768);
  expect(replay.result).toEqual(terminal.result);
  await record('terminal-replay', true);
  // Explicit complete traversal is a preservation check, not a hot-path benchmark.
  let after = corpusStart;
  let unicode = 0;
  let escaping = 0;

  while (after < corpusEnd) {
    await reset();

    const part = await get<HistoryPage2>(
      `/api/matches/${matchId}/history?epoch=${archived.history.visibilityEpoch}&after=${after}&through=${corpusEnd}&limit=64`,
    );

    expect(part.events.length).toBeLessThanOrEqual(64);
    expect(bytes(part)).toBeLessThanOrEqual(32_768);
    const reads = await get<BoundsReport>(fixture('metrics'));

    for (const query of reads.queries.filter(({ sql }) => /^SELECT/i.test(sql) && /\bevents\b/i.test(sql))) {
      expect(query.materializedRows).toBeLessThanOrEqual(64);
      expect(query.rowsRead).toBeLessThanOrEqual(128);
    }

    for (const event of part.events) {
      if (event.eventKey.startsWith('bounds-unicode-')) {
        expect(event.text).toBe('🦊'.repeat(1000));
        unicode++;
      }

      if (event.eventKey.startsWith('bounds-escape-')) {
        expect(event.text).toBe('\u0000\\"\n'.repeat(250));
        escaping++;
      }
    }

    expect(part.cursor).toBeGreaterThan(after);
    after = part.cursor;
  }

  expect(unicode).toBe(31_200);
  expect(escaping).toBe(64);

  const artifact =
    process.env.SUCCESSION_BOUNDS_RESULTS_PATH ??
    `/tmp/opencode/succession-worker-bounds-results-${process.pid}.json`;

  await writeFile(
    artifact,
    JSON.stringify(
      {
        measurements,
        unicode,
        escaping,
        contextBytes: bytes(context),
        currentBytes: bytes(cold),
        replayBytes: bytes(replay),
      },
      null,
      2,
    ),
  );
  console.info(`Actual Worker bounds metrics: ${artifact}`);
}, 240_000);
