import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { ActionRequest2, HistoryPage2, Observation2, ReplayFrame2 } from '../src/shared/succession';
import type { ActionRequest, Observation } from '../src/game/types';
import type { GameId } from '../src/game/contracts';
import { previewAction } from '../src/game/preview';
import type { QueueStatus } from '../src/shared/api';
import type { FixtureController, FixtureInspection } from './fixtures/succession-worker';
import { Schema } from 'effect';
import { HistoryCheckpoint2Schema } from '../src/shared/history-checkpoint';
import type { HistoryCheckpoint2 } from '../src/shared/history-checkpoint';
import type { RoundIndex2 } from '../src/shared/history';
import { buildSuccessionStory } from '../src/client/succession-story';

type RunningWorker = Awaited<ReturnType<typeof unstable_dev>>;

type WorkerResponse = Awaited<ReturnType<RunningWorker['fetch']>>;

interface TestHeaders {
  [name: string]: string;
}

type TestRequest = { method?: string; body?: string; headers?: Record<string, string> };

type Ack = { accepted: true; actionId: string; observation: Observation2 };

type Settlement = {
  inference: { calls: number };
  record: {
    game_id: string;
    status: string;
    mode: string;
    result_applied: number;
    result_json: string;
  } | null;
  participants: {
    agent_id: string;
    seat: number;
    won: number | null;
    forfeited: number;
    rating_delta: number | null;
    act1_json: string | null;
  }[];
};

let worker: RunningWorker;

let directory: string;

let provider: 'openai' | 'preview' = 'openai';

const sockets = new Set<WebSocket>();

let lifetime: AbortController;

let signal: AbortSignal;

let firstFailure: Promise<void> | undefined;

const pending = new Set<Promise<unknown>>();

const progress = new Map<string, ReturnType<typeof currentMatch>>();

const queues = new Map<string, QueueStatus>();

function currentMatch(view: Observation | Observation2) {
  return {
    at: Date.now(),
    matchId: view.matchId,
    status: view.status,
    phase: view.phase,
    cursor: 'history' in view ? view.history : view.cursor,
    seats: view.seats.map(({ number, alive, house, forfeited }) => ({ number, alive, house, forfeited })),
  };
}

function captureFailure(error: Error): Promise<void> {
  if (firstFailure) return firstFailure;

  const snapshot = {
    at: Date.now(),
    error: error.message,
    directory,
    matches: [...progress.values()],
    queues: [...queues.values()],
    recentDriverSteps: driverSteps.slice(-12),
  };

  const current = worker;

  firstFailure = (async () => {
    let allocations;

    try {
      const response = await current.fetch('/__fixture/allocations', { signal: AbortSignal.timeout(2000) });
      allocations = { status: response.status, body: await response.text() };
    } catch (error) {
      allocations = { error: String(error) };
    }

    const record = JSON.stringify({ ...snapshot, allocations }, null, 2) + '\n';
    console.error('Succession fixture first failure:', record);
    await writeFile(join(directory, 'first-failure.json'), record);
  })();

  return firstFailure;
}

function owned<T>(work: () => Promise<T>): Promise<T> {
  const result = (async () => {
    try {
      signal.throwIfAborted();

      return await work();
    } catch (error) {
      const capture = captureFailure(error instanceof Error ? error : new Error(String(error)));
      lifetime.abort(error);
      await capture;
      throw error;
    }
  })();

  pending.add(result);
  void result.then(
    () => pending.delete(result),
    () => pending.delete(result),
  );

  return result;
}

const delay = (ms: number) => owned(() => pause(ms, undefined, { signal }));

async function startWorker(): Promise<void> {
  worker = await unstable_dev('tests/fixtures/succession-worker.ts', {
    config: 'tests/succession-worker.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: directory,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      HOUSE_PROVIDER: provider,
      HOUSE_MODEL: provider === 'openai' ? 'gpt-4.1-mini' : 'integration-scripted',
      OPENAI_API_KEY: 'fixture-unusable-key',
      OPENAI_BASE_URL: 'http://127.0.0.1:1',
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}

beforeEach(async (context) => {
  lifetime = new AbortController();
  signal = AbortSignal.any([lifetime.signal, context.signal]);
  firstFailure = undefined;
  progress.clear();
  queues.clear();
  driverSteps.length = 0;
  provider = 'openai';
  const root = resolve(process.env.GAME_FIXTURE_EVIDENCE_DIR ?? join(tmpdir(), 'agent-game-fixtures'));
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(`${root}/succession-worker-`);
  await promisify(execFile)(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js',
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
  await startWorker();
}, 30_000);

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail')
      await captureFailure(new Error(task.result.errors?.[0]?.message ?? 'Worker journey failed'));
    await firstFailure;
  } finally {
    lifetime.abort(new Error('Worker journey ended'));

    while (pending.size) await Promise.allSettled(pending);

    for (const socket of sockets) socket.close();
    sockets.clear();

    try {
      await writeFile(join(directory, 'driver-steps.json'), JSON.stringify(driverSteps));
    } finally {
      await worker?.stop();
    }
  }
});

async function request(
  path: string,
  controller?: FixtureController,
  init: TestRequest = {},
): Promise<WorkerResponse> {
  const headers: TestHeaders = { 'X-Agent-Game-Protocols': '1,2', ...init.headers };

  if (controller) headers.authorization = `Bearer ${controller.token}`;

  if (init.body) headers['content-type'] = 'application/json';

  return owned(() => worker.fetch(path, { ...init, headers, signal }));
}

function data<T>(path: string, controller?: FixtureController, init: TestRequest = {}): Promise<T> {
  return owned(async () => {
    const response = await request(path, controller, init);
    const text = await response.text();
    expect(response.ok, `${path}: ${response.status} ${text}`).toBe(true);
    const parsed: T = JSON.parse(text);

    return parsed;
  });
}

function until<T>(load: () => Promise<T>, ready: (value: T) => boolean, timeout = 10_000): Promise<T> {
  return owned(() => poll(load, ready, timeout));
}

async function poll<T>(load: () => Promise<T>, ready: (value: T) => boolean, timeout: number): Promise<T> {
  const deadline = Date.now() + timeout;
  let value = await load();

  while (!ready(value) && Date.now() < deadline) {
    await delay(15);
    value = await load();
  }

  expect(ready(value), 'Timed out waiting for actual Worker progress').toBe(true);

  return value;
}

async function clock(
  matchId: string,
  view: Observation2 | Observation,
  kind: 'discussion' | 'grace' | 'late-alarm' = 'discussion',
) {
  progress.set(matchId, currentMatch(view));
  await data(`/__fixture/matches/${matchId}/clock?kind=${kind}&phaseId=${encodeURIComponent(view.phase.id)}`);
}

function action(view: Observation2): ActionRequest2 {
  const actions = view.decision?.actions ?? [];

  const preferred = [
    'coup',
    // These journeys require settlement, not twelve rounds of coin accumulation. Use the
    // published lower-cost attack when available; every decision still goes through HTTP.
    'assassinate',
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

  const approve = actions.find(({ action }) => action.type === 'vote' && action.approve);

  const safeguard =
    view.private?.act === 1 ? view.private.hand.find((card) => card.policy === 'safeguard') : undefined;

  const override =
    view.private?.act === 1 ? view.private.hand.find((card) => card.policy === 'override') : undefined;

  const enact = actions.find(({ action }) => action.type === 'enact' && action.cardId === safeguard?.id);
  const discard = actions.find(({ action }) => action.type === 'discard' && action.cardId === override?.id);

  const selected =
    approve ??
    enact ??
    discard ??
    preferred.flatMap((type) => actions.filter((option) => option.action.type === type))[0] ??
    actions[0];

  if (!selected || !view.decision) throw new Error('No entitled legal action');

  return {
    gameId: 'succession',
    actionId: crypto.randomUUID(),
    phaseId: view.phase.id,
    decisionId: view.decision.id,
    action: selected.action,
  };
}

async function submit(matchId: string, controller: FixtureController, input: ActionRequest2): Promise<Ack> {
  const ack = await data<Ack>(`/api/matches/${matchId}/actions`, controller, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  expect(Buffer.byteLength(JSON.stringify(ack))).toBeLessThanOrEqual(16_384);

  return ack;
}

async function views(matchId: string, controllers: FixtureController[]): Promise<Observation2[]> {
  return Promise.all(
    controllers.map((controller) => data<Observation2>(`/api/matches/${matchId}`, controller)),
  );
}

async function checkpoint(
  view: Observation2,
  controller?: FixtureController,
  through = view.history.streamHead,
): Promise<HistoryCheckpoint2> {
  const value = await data(
    `/api/matches/${view.matchId}/checkpoint?epoch=${view.history.visibilityEpoch}&through=${through}`,
    controller,
  );

  return Schema.decodeUnknownSync(HistoryCheckpoint2Schema)(value);
}

function drive(...args: Parameters<typeof driveSteps>): ReturnType<typeof driveSteps> {
  return owned(() => driveSteps(...args));
}

const driverSteps: {
  at: number;
  matchId: string;
  phase: string;
  head: number;
  publicReadMs: number;
  seatReadsMs: number;
  readWindowMs: number;
  decisions: number;
}[] = [];

async function driveSteps(
  matchId: string,
  controllers: FixtureController[],
  stop: (publicView: Observation2, seats: Observation2[]) => boolean,
  timeout = 120_000,
): Promise<{ publicView: Observation2; seats: Observation2[] }> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const started = Date.now();
    let publicReadMs = 0;
    let seatReadsMs = 0;
    // These are independent entitled reads. Await every response before choosing an action or
    // advancing a clock, without paying a second serial transport round trip for each phase.

    const [publicView, seats] = await Promise.all([
      data<Observation2>(`/api/matches/${matchId}`).then((view) => {
        publicReadMs = Date.now() - started;

        return view;
      }),
      views(matchId, controllers).then((views) => {
        seatReadsMs = Date.now() - started;

        return views;
      }),
    ]);

    progress.set(matchId, currentMatch(publicView));
    driverSteps.push({
      at: Date.now(),
      matchId,
      phase: publicView.phase.kind,
      head: publicView.history.streamHead,
      publicReadMs,
      seatReadsMs,
      readWindowMs: Date.now() - started,
      decisions: seats.filter((view) => view.decision).length,
    });
    expect(Buffer.byteLength(JSON.stringify(publicView))).toBeLessThanOrEqual(14_336);
    expect(publicView.status, publicView.interruptionReason ?? '').not.toBe('interrupted');

    if (stop(publicView, seats)) return { publicView, seats };

    if (publicView.status === 'finished') throw new Error('Match finished before the requested checkpoint');

    if (publicView.phase.kind.includes('discussion')) {
      await clock(matchId, publicView);
      continue;
    }

    const decisions = seats.flatMap((view, index) =>
      view.decision ? [{ controller: controllers[index], input: action(view) }] : [],
    );

    await Promise.all(decisions.map(({ controller, input }) => submit(matchId, controller, input)));

    if (!decisions.length) await delay(10);
  }

  throw new Error(`Match ${matchId} did not reach its checkpoint within ${timeout}ms`);
}

function driveOriginal(matchId: string, controllers: FixtureController[]): Promise<Observation> {
  return owned(() => driveOriginalSteps(matchId, controllers));
}

async function driveOriginalSteps(matchId: string, controllers: FixtureController[]): Promise<Observation> {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const publicView = await data<Observation>(`/api/matches/${matchId}`);
    progress.set(matchId, currentMatch(publicView));
    expect(publicView.status, publicView.winReason ?? '').not.toBe('interrupted');

    if (publicView.status === 'finished') return publicView;

    if (publicView.phase.kind.includes('discussion')) {
      await clock(matchId, publicView);
      continue;
    }

    const seats = await Promise.all(
      controllers.map((controller) => data<Observation>(`/api/matches/${matchId}`, controller)),
    );

    await Promise.all(
      seats.map(async (view, index) => {
        const choice = previewAction(view);

        if (!choice || !view.decision) return;

        const input: ActionRequest = {
          actionId: crypto.randomUUID(),
          phaseId: view.phase.id,
          decisionId: view.decision.id,
          action: choice,
        };

        await data(`/api/matches/${matchId}/actions`, controllers[index], {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }),
    );
  }

  throw new Error('Original game did not finish through actual HTTP decisions');
}

async function joinDrivers<A, B>(first: Promise<A>, second: Promise<B>): Promise<[A, B]> {
  const [left, right] = await Promise.allSettled([first, second]);

  if (left.status === 'rejected') throw left.reason;

  if (right.status === 'rejected') throw right.reason;

  return [left.value, right.value];
}

function admitted(...args: Parameters<typeof admitControllers>): ReturnType<typeof admitControllers> {
  return owned(() => admitControllers(...args));
}

async function admitControllers(
  count: number,
  gameId: GameId = 'succession',
): Promise<{ matchId: string; controllers: FixtureController[] }> {
  const controllers = await data<FixtureController[]>(`/__fixture/controllers?count=${count}`);
  await Promise.all(
    controllers.map((controller) =>
      data('/api/queue', controller, {
        method: 'POST',
        body: JSON.stringify({ gameId, requestId: crypto.randomUUID() }),
      }),
    ),
  );

  if (count < 10) await data('/__fixture/fill');

  const ticket = await until(
    async () => {
      const status = await data<QueueStatus>('/api/queue', controllers[0]);
      queues.set(controllers[0].agentId, status);

      return status;
    },
    (value) => value.status === 'matched',
  );

  if (!ticket.matchId) throw new Error('Missing admitted match ID');

  const tickets = await Promise.all(
    controllers.map((controller) => data<QueueStatus>('/api/queue', controller)),
  );

  expect(tickets.every((entry) => entry.matchId === ticket.matchId && entry.gameId === gameId)).toBe(true);

  return { matchId: ticket.matchId, controllers };
}

async function stream(
  matchId: string,
  controller?: FixtureController,
  legacyTicket?: string,
  protocol = '2',
) {
  const ticket =
    legacyTicket ??
    (controller
      ? (await data<{ ticket: string }>(`/api/matches/${matchId}/ticket`, controller, { method: 'POST' }))
          .ticket
      : undefined);

  const url = new URL(`ws://${worker.address}:${worker.port}/api/matches/${matchId}/events`);
  url.searchParams.set('protocol', protocol);

  if (ticket) url.searchParams.set('ticket', ticket);
  const socket = new WebSocket(url);
  sockets.add(socket);
  const frames: string[] = [];
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    frames.push(event.data);
  });
  await until(
    async () => frames.length,
    (count) => count > 0,
  );

  return { socket, frames };
}

async function restart(): Promise<void> {
  for (const socket of sockets) socket.close();
  sockets.clear();
  await worker.stop();
  await startWorker();
}

function specificAction(view: Observation2, type: ActionRequest2['action']['type']): ActionRequest2 {
  const choice = view.decision?.actions.find((option) => option.action.type === type);

  if (!choice) throw new Error(`Missing entitled ${type} action`);

  return { ...action(view), action: choice.action };
}

async function recoverPending(
  matchId: string,
  controller: FixtureController,
  before: Observation2,
): Promise<Observation2> {
  await clock(matchId, before, 'late-alarm');
  await restart();
  const recovered = await data<Observation2>(`/api/matches/${matchId}`, controller);
  expect(recovered.status).toBe('active');
  expect(recovered.phase.id).not.toBe(before.phase.id);
  expect(recovered.private).toEqual(before.private);
  expect(recovered.board).toEqual(before.board);
  expect(recovered.seats).toEqual(before.seats);
  expect(recovered.commitment).toEqual(before.commitment);
  expect(recovered.createdAt).toBe(before.createdAt);
  expect(recovered.history.visibilityEpoch).toBe(before.history.visibilityEpoch);
  expect(recovered.decision?.actions).toEqual(before.decision?.actions);

  return recovered;
}

describe('actual Succession HTTP, Durable Object and house execution', () => {
  it('recovers durably paid attacks, pending influence losses and private exchanges without repeating effects', async () => {
    provider = 'openai';
    const { matchId, controllers } = await admitted(10);

    const payment = await drive(matchId, controllers, (_public, seats) =>
      seats.some((view) => view.decision?.actions.some((option) => option.action.type === 'assassinate')),
    );

    const assassin = payment.seats.find((view) =>
      view.decision?.actions.some((option) => option.action.type === 'assassinate'),
    )!;

    const assassinController = controllers.find(
      (controller) => controller.agentId === assassin.you?.agentId,
    )!;

    const paidRequest = specificAction(assassin, 'assassinate');
    const paid = await submit(matchId, assassinController, paidRequest);
    expect(paid.observation.board).toMatchObject({ act: 2, pending: { action: 'assassinate', paid: 3 } });
    const beforeCoins = assassin.seats.find((seat) => seat.agentId === assassinController.agentId)!.coins!;
    expect(paid.observation.seats.find((seat) => seat.agentId === assassinController.agentId)?.coins).toBe(
      beforeCoins - 3,
    );
    const paidRecovered = await recoverPending(matchId, assassinController, paid.observation);
    const paidRetry = await submit(matchId, assassinController, paidRequest);
    expect(paidRetry.observation.board).toEqual(paidRecovered.board);
    expect(paidRetry.observation.seats).toEqual(paidRecovered.seats);

    const losing = await drive(matchId, controllers, (_public, seats) =>
      seats.some((view) => view.decision?.actions.some((option) => option.action.type === 'lose-influence')),
    );

    const loser = losing.seats.find((view) =>
      view.decision?.actions.some((option) => option.action.type === 'lose-influence'),
    )!;

    const loserController = controllers.find((controller) => controller.agentId === loser.you?.agentId)!;
    const lossRecovered = await recoverPending(matchId, loserController, loser);
    const lossRequest = specificAction(lossRecovered, 'lose-influence');
    const lost = await submit(matchId, loserController, lossRequest);
    const influenceBefore = loser.seats.find((seat) => seat.agentId === loserController.agentId)!.influence!;
    expect(lost.observation.seats.find((seat) => seat.agentId === loserController.agentId)?.influence).toBe(
      influenceBefore - 1,
    );
    const lossRetry = await submit(matchId, loserController, lossRequest);
    expect(lossRetry.observation.private).toEqual(lost.observation.private);
    expect(lossRetry.observation.seats).toEqual(lost.observation.seats);

    const exchanging = await drive(matchId, controllers, (_public, seats) =>
      seats.some((view) => view.decision?.actions.some((option) => option.action.type === 'exchange')),
    );

    const exchanger = exchanging.seats.find((view) =>
      view.decision?.actions.some((option) => option.action.type === 'exchange'),
    )!;

    const exchangeController = controllers.find(
      (controller) => controller.agentId === exchanger.you?.agentId,
    )!;

    const declaration = specificAction(exchanger, 'exchange');
    await submit(matchId, exchangeController, declaration);

    const choosing = await drive(matchId, controllers, (_public, seats) =>
      seats.some((view) =>
        view.decision?.actions.some((option) => option.action.type === 'return-influence'),
      ),
    );

    const choices = choosing.seats.find((view) => view.you?.agentId === exchangeController.agentId)!;
    expect(choices.board).toMatchObject({ act: 2, courtCount: 3 });
    expect(choices.private?.act).toBe(2);
    const exchangeRecovered = await recoverPending(matchId, exchangeController, choices);
    const declarationRetry = await submit(matchId, exchangeController, declaration);
    expect(declarationRetry.observation.private).toEqual(exchangeRecovered.private);
    expect(declarationRetry.observation.board).toEqual(exchangeRecovered.board);
    const returnedRequest = specificAction(exchangeRecovered, 'return-influence');
    const returned = await submit(matchId, exchangeController, returnedRequest);
    expect(returned.observation.board).toMatchObject({ act: 2, courtCount: 5 });
    expect(returned.observation.private).toMatchObject({ act: 2, exchangePool: [] });
    const returnRetry = await submit(matchId, exchangeController, returnedRequest);
    expect(returnRetry.observation.private).toEqual(returned.observation.private);
    expect(returnRetry.observation.board).toEqual(returned.observation.board);
    await drive(matchId, controllers, (view) => view.status === 'finished');

    const settled = await until(
      () => data<Settlement>(`/__fixture/matches/${matchId}/settlement`),
      (value) => value.record?.result_applied === 1,
    );

    expect(settled.inference.calls).toBe(0);
    expect(settled.participants.filter((participant) => participant.won === 1)).toHaveLength(1);
    expect(settled.participants.every((participant) => participant.forfeited === 0)).toBe(true);
    await until(
      () => data<QueueStatus>('/api/queue', controllers[0]),
      (value) => value.status === 'idle',
    );
  }, 180_000);

  it('runs both games concurrently through one coordinator and independently settles twenty ranked external agents', async () => {
    provider = 'openai';

    const [original, succession] = await Promise.all([
      admitted(10, 'secret-overlord'),
      admitted(10, 'succession'),
    ]);

    expect(original.matchId).not.toBe(succession.matchId);

    const groups = [
      { ...original, gameId: 'secret-overlord' as const, otherGame: 'succession' as const },
      { ...succession, gameId: 'succession' as const, otherGame: 'secret-overlord' as const },
    ];

    const allocations =
      await data<{ id: string; game_id: GameId; state: string; reservation: number }[]>(
        '/__fixture/allocations',
      );

    expect(allocations.filter((entry) => entry.state === 'active')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: original.matchId, game_id: 'secret-overlord', reservation: 1.5 }),
        expect.objectContaining({ id: succession.matchId, game_id: 'succession', reservation: 1.5 }),
      ]),
    );

    for (const group of groups) {
      const current = await data<Observation | Observation2>(
        `/api/matches/${group.matchId}`,
        group.controllers[0],
      );

      expect(current.status).toBe('active');
      expect(current.mode).toBe('ranked');
      expect(current.seats.every((seat) => !seat.originalHouse)).toBe(true);
      const before = await data<QueueStatus>('/api/queue', group.controllers[0]);

      const conflict = await request('/api/queue', group.controllers[0], {
        method: 'POST',
        body: JSON.stringify({ gameId: group.otherGame, requestId: crypto.randomUUID() }),
      });

      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        error: { code: 'agent-busy', gameId: group.gameId, matchId: group.matchId },
      });
      expect(await data('/api/queue', group.controllers[0])).toEqual(before);

      const selected = await until(
        () => data<{ id: string }[]>(`/api/matches?gameId=${group.gameId}`),
        (matches) => matches.some((entry) => entry.id === group.matchId),
      );

      expect(selected.some((entry) => entry.id === group.matchId)).toBe(true);
      expect(
        selected.some(
          (entry) => entry.id === (group.gameId === 'succession' ? original.matchId : succession.matchId),
        ),
      ).toBe(false);
    }

    const [teamResult, individualResult] = await joinDrivers(
      driveOriginal(original.matchId, original.controllers),
      drive(succession.matchId, succession.controllers, (view) => view.status === 'finished'),
    );

    expect(teamResult.winner).not.toBeNull();
    expect(individualResult.publicView.result?.kind).toBe('individual');

    for (const group of groups) {
      const settled = await until(
        () => data<Settlement>(`/__fixture/matches/${group.matchId}/settlement`),
        (value) => value.record?.result_applied === 1,
      );

      expect(settled.record).toMatchObject({
        game_id: group.gameId,
        status: 'finished',
        mode: 'ranked',
        result_applied: 1,
      });
      expect(settled.participants).toHaveLength(10);
      expect(settled.inference.calls).toBe(0);
      const winners = settled.participants.filter((participant) => participant.won === 1);
      expect(winners).toHaveLength(
        group.gameId === 'succession' ? 1 : teamResult.winner === 'cooperative' ? 6 : 4,
      );

      for (const participant of settled.participants) {
        expect(participant.forfeited).toBe(0);

        const own = await data<{
          agent: { games: number; wins: number; placements: number; rating: number };
          history: { id: string }[];
        }>(`/api/agents/${participant.agent_id}?gameId=${group.gameId}`);

        const other = await data<{
          agent: { games: number; wins: number; placements: number; rating: number };
          history: { id: string }[];
        }>(`/api/agents/${participant.agent_id}?gameId=${group.otherGame}`);

        expect(own.agent).toMatchObject({ games: 1, placements: 1, wins: participant.won });
        expect(own.agent.rating).toBeCloseTo(1000 + (participant.rating_delta ?? 0));
        expect(own.history.map((match) => match.id)).toEqual([group.matchId]);
        expect(other.agent).toMatchObject({ games: 0, placements: 0, wins: 0, rating: 1000 });
        expect(other.history).toEqual([]);
      }

      await until(
        () => data<QueueStatus>('/api/queue', group.controllers[0]),
        (value) => value.status === 'idle',
      );
    }

    const released = await data<{ id: string; state: string }[]>('/__fixture/allocations');
    expect(
      released
        .filter((entry) => entry.id === original.matchId || entry.id === succession.matchId)
        .every((entry) => entry.state === 'settled'),
    ).toBe(true);
  }, 180_000);

  it('plays ten external controllers through both acts with sealed delivery, persistent receipts, recovery and one overall settlement', async () => {
    const { matchId, controllers } = await admitted(10);

    const voting = await drive(
      matchId,
      controllers,
      (view) => view.act === 1 && view.phase.kind === 'voting',
    );

    expect(voting.seats.every((view) => view.decision)).toBe(true);
    const spectator = await stream(matchId);
    const unrelated = await stream(matchId, controllers[1]);
    const beforePublic = await data<Observation2>(`/api/matches/${matchId}`);
    const beforeOther = await data<Observation2>(`/api/matches/${matchId}`, controllers[1]);
    const firstVote = action(voting.seats[0]);
    const historicalPublic = await checkpoint(beforePublic);
    const historicalSeat = await checkpoint(voting.seats[0], controllers[0]);
    expect(historicalPublic.baseline).toMatchObject({
      private: null,
      you: null,
      decision: null,
      chat: { open: false },
      commitment: { reveal: null },
    });
    expect(historicalPublic.baseline && 'archive' in historicalPublic.baseline).toBe(false);
    expect(historicalSeat.baseline?.private).toEqual(voting.seats[0].private);
    expect((await checkpoint(beforePublic, undefined, 0)).through).toBe(0);
    expect(
      (
        await request(
          `/api/matches/${matchId}/replay?epoch=${beforePublic.history.visibilityEpoch}&through=0`,
        )
      ).status,
    ).toBe(409);

    const downgraded = await request('/api/queue', controllers[0], {
      headers: { 'X-Agent-Game-Protocols': '' },
    });

    expect(downgraded.status).toBe(426);
    expect(await downgraded.json()).toMatchObject({
      error: { code: 'protocol-upgrade-required', gameId: 'succession', matchId },
    });

    const missingGame = await request(`/api/matches/${matchId}/actions`, controllers[0], {
      method: 'POST',
      body: JSON.stringify({
        actionId: firstVote.actionId,
        phaseId: firstVote.phaseId,
        decisionId: firstVote.decisionId,
        action: firstVote.action,
      }),
    });

    expect(missingGame.status).toBe(426);
    await submit(matchId, controllers[0], firstVote);
    await delay(70);
    expect(spectator.frames).toHaveLength(1);
    expect(unrelated.frames).toHaveLength(1);
    expect(await data(`/api/matches/${matchId}`)).toEqual(beforePublic);
    expect(await data(`/api/matches/${matchId}`, controllers[1])).toEqual(beforeOther);
    expect(await checkpoint(beforePublic)).toEqual(historicalPublic);
    expect(await checkpoint(voting.seats[0], controllers[0])).toEqual(historicalSeat);
    await Promise.all(
      voting.seats.slice(1, 9).map((view, index) => submit(matchId, controllers[index + 1], action(view))),
    );
    await delay(50);
    expect(spectator.frames).toHaveLength(1);
    await submit(matchId, controllers[9], action(voting.seats[9]));
    await until(
      async () => spectator.frames.length,
      (count) => count > 1,
    );
    const receipts = await data<FixtureInspection>(`/__fixture/matches/${matchId}`);
    await submit(matchId, controllers[0], firstVote);
    expect((await data<FixtureInspection>(`/__fixture/matches/${matchId}`)).receiptCount).toBe(
      receipts.receiptCount,
    );

    const alternate = await data<FixtureController>(
      `/__fixture/alternate-grant?agentId=${controllers[0].agentId}`,
    );

    expect((await request(`/api/matches/${matchId}`, alternate)).status).toBe(403);
    expect(
      (
        await request(
          `/api/matches/${matchId}/checkpoint?epoch=${beforePublic.history.visibilityEpoch}&through=0`,
          alternate,
        )
      ).status,
    ).toBe(403);
    unrelated.socket.close();
    expect((await data<Observation2>(`/api/matches/${matchId}`, controllers[1])).you?.forfeited).toBe(false);
    const returned = await drive(matchId, controllers, (view) => view.act === 2);
    expect(returned.publicView).toMatchObject({ status: 'active', result: null, finishedAt: null });
    expect(returned.publicView.seats.every((seat) => seat.alive && seat.influence === 2)).toBe(true);

    const liveIndex = await data<RoundIndex2>(
      `/api/matches/${matchId}/rounds?epoch=${returned.publicView.history.visibilityEpoch}`,
    );

    const returnLandmark = liveIndex.rounds.find((round) => round.act === 2)!;
    const liveReturn = await checkpoint(returned.publicView, undefined, returnLandmark.through);
    expect(liveReturn.baseline?.seats.every((seat) => seat.alive && seat.influence === 2)).toBe(true);
    expect(liveReturn.baseline?.private).toBeNull();
    expect(await checkpoint(beforePublic)).toEqual(historicalPublic);

    for (const seat of returned.publicView.seats)
      expect(seat.coins).toBe(2 + (returned.publicView.act1Result?.bonuses[seat.number] ?? -1));

    const act1Index = await until(
      () => data<Settlement>(`/__fixture/matches/${matchId}/settlement`),
      (value) => value.record !== null,
    );

    expect(act1Index.record).toMatchObject({ status: 'active', result_applied: 0 });
    expect(act1Index.participants.every((participant) => participant.won === null)).toBe(true);
    const activeTicket = await data<QueueStatus>('/api/queue', controllers[0]);

    const cancellation = await data<QueueStatus>('/api/queue', controllers[0], {
      method: 'DELETE',
      body: JSON.stringify({
        gameId: 'succession',
        requestId: activeTicket.requestId,
      }),
    });

    expect(cancellation).toMatchObject({ status: 'matched', matchId });
    expect(
      (
        await request('/api/queue', controllers[0], {
          method: 'POST',
          body: JSON.stringify({ gameId: 'secret-overlord', requestId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(409);

    const reactions = await drive(
      matchId,
      controllers,
      (_view, seats) =>
        seats.filter((seat) => seat.decision?.actions.some((option) => option.action.type === 'challenge'))
          .length === 9,
    );

    const responders = reactions.seats.flatMap((view, index) =>
      view.decision ? [{ view, controller: controllers[index] }] : [],
    );

    const watching = await stream(matchId);
    const untouched = await stream(matchId, responders[8].controller);
    const frozenPublic = await data<Observation2>(`/api/matches/${matchId}`);
    const frozenOther = await data<Observation2>(`/api/matches/${matchId}`, responders[8].controller);
    const response = action(responders[0].view);
    const accepted = await submit(matchId, responders[0].controller, response);
    await delay(70);
    expect(watching.frames).toHaveLength(1);
    expect(untouched.frames).toHaveLength(1);
    expect(await data(`/api/matches/${matchId}`)).toEqual(frozenPublic);
    expect(await data(`/api/matches/${matchId}`, responders[8].controller)).toEqual(frozenOther);
    await Promise.all(
      responders.slice(1, 8).map(({ controller, view }) => submit(matchId, controller, action(view))),
    );
    await delay(70);
    expect(watching.frames).toHaveLength(1);
    expect(untouched.frames).toHaveLength(1);
    expect(await data(`/api/matches/${matchId}`)).toEqual(frozenPublic);
    expect(await data(`/api/matches/${matchId}`, responders[8].controller)).toEqual(frozenOther);
    const durable = await data<FixtureInspection>(`/__fixture/matches/${matchId}`);
    await clock(matchId, frozenPublic, 'late-alarm');
    await restart();
    const recovered = await data<Observation2>(`/api/matches/${matchId}`, responders[0].controller);
    expect(recovered.status).toBe('active');
    expect(recovered.private).toEqual(accepted.observation.private);
    expect(recovered.decision).toBeNull();
    expect(recovered.commitment).toEqual(accepted.observation.commitment);
    expect(recovered.history.visibilityEpoch).toBe(accepted.observation.history.visibilityEpoch);
    expect(recovered.seats.every((seat) => !seat.forfeited)).toBe(true);
    await submit(matchId, responders[0].controller, response);
    const afterRestart = await data<FixtureInspection>(`/__fixture/matches/${matchId}`);
    expect(afterRestart.grants).toEqual(durable.grants);
    expect(afterRestart.receiptCount).toBe(durable.receiptCount);
    const resumedPublic = await stream(matchId);
    const lastReaction = await data<Observation2>(`/api/matches/${matchId}`, responders[8].controller);
    await submit(matchId, responders[8].controller, action(lastReaction));
    await until(
      async () => resumedPublic.frames.length,
      (count) => count > 1,
    );
    expect((await data<Observation2>(`/api/matches/${matchId}`)).phase.id).not.toBe(lastReaction.phase.id);
    const finished = await drive(matchId, controllers, (view) => view.status === 'finished');

    const settled = await until(
      () => data<Settlement>(`/__fixture/matches/${matchId}/settlement`),
      (value) => value.record?.result_applied === 1,
    );

    expect(finished.publicView.result?.kind).toBe('individual');
    expect(settled.participants).toHaveLength(10);
    expect(settled.participants.filter((participant) => participant.won === 1)).toHaveLength(1);
    expect(
      settled.participants.every(
        (participant) => participant.forfeited === 0 && participant.rating_delta !== null,
      ),
    ).toBe(true);
    expect(settled.record).toMatchObject({ mode: 'ranked', result_applied: 1 });
    expect(settled.inference.calls).toBe(0);

    for (const participant of settled.participants) {
      expect(participant.rating_delta).toBeCloseTo(participant.won ? 28.8 : -3.2);

      const selected = await data<{
        agent: { rating: number; games: number; placements: number; wins: number };
      }>(`/api/agents/${participant.agent_id}?gameId=succession`);

      expect(selected.agent).toMatchObject({ games: 1, placements: 1, wins: participant.won });
      expect(selected.agent.rating).toBeCloseTo(1000 + (participant.rating_delta ?? 0));
      expect(
        (
          await data<{ agent: { rating: number; games: number; placements: number } }>(
            `/api/agents/${participant.agent_id}`,
          )
        ).agent,
      ).toMatchObject({ rating: 1000, games: 0, placements: 0 });
    }

    await until(
      () => data<QueueStatus>('/api/queue', controllers[0]),
      (value) => value.status === 'idle',
    );
    const reset = await data<HistoryPage2>(`/api/matches/${matchId}/history`);
    expect(reset).toMatchObject({ reset: true, cursor: 0, events: [] });
    let cursor = 0;
    const events: HistoryPage2['events'] = [];

    while (cursor < reset.streamHead) {
      const page = await data<HistoryPage2>(
        `/api/matches/${matchId}/history?epoch=${reset.visibilityEpoch}&after=${cursor}&through=${reset.streamHead}&maxBytes=12288&limit=32`,
      );

      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(12_288);
      expect(page.events[0]?.id).toBe(cursor + 1);
      events.push(...page.events);
      cursor = page.cursor;
    }

    expect(new Set(events.map((event) => event.eventKey)).size).toBe(events.length);
    expect(events.some((event) => event.act === 1)).toBe(true);
    expect(events.some((event) => event.act === 2)).toBe(true);

    const finalFrame = await data<ReplayFrame2>(
      `/api/matches/${matchId}/replay?epoch=${reset.visibilityEpoch}&through=${reset.streamHead}`,
    );

    expect(Buffer.byteLength(JSON.stringify(finalFrame))).toBeLessThanOrEqual(32_768);
    expect(finalFrame.result).toEqual(finished.publicView.result);
    const firstAct = events.find((event) => event.act === 1)!;
    const secondAct = events.find((event) => event.act === 2 && event.type === 'act-started')!;

    const oldBoard = await data<ReplayFrame2>(
      `/api/matches/${matchId}/replay?epoch=${reset.visibilityEpoch}&through=${firstAct.id}`,
    );

    const returnBoard = await data<ReplayFrame2>(
      `/api/matches/${matchId}/replay?epoch=${reset.visibilityEpoch}&through=${secondAct.id}`,
    );

    expect(oldBoard).toMatchObject({ act: 1, status: 'active', result: null });
    expect(returnBoard).toMatchObject({ act: 2, status: 'active', result: null });
    expect(returnBoard.seats.every((seat) => seat.alive && seat.influence === 2)).toBe(true);
    expect((await checkpoint(finished.publicView, undefined, secondAct.id)).baseline).toEqual(returnBoard);
    expect(
      await data(
        `/api/matches/${matchId}/checkpoint?epoch=${beforePublic.history.visibilityEpoch}&through=0`,
      ),
    ).toMatchObject({ reset: true, events: [] });

    for (const event of events.filter((entry) =>
      ['executed', 'influence-lost', 'act-started'].includes(entry.type),
    )) {
      const before = await checkpoint(finished.publicView, undefined, event.id - 1);
      const at = await checkpoint(finished.publicView, undefined, event.id);

      const model = buildSuccessionStory({
        scope: { matchId, visibilityEpoch: reset.visibilityEpoch },
        after: event.id - 1,
        through: event.id,
        baseline: before.baseline ?? undefined,
        events: [event],
      });

      expect(
        model.end.map((seat) => (seat.alive.status === 'unavailable' ? null : seat.alive.value)),
      ).toEqual(at.baseline?.seats.map((seat) => seat.alive));
    }

    const finalSnapshot = await data<Settlement>(`/__fixture/matches/${matchId}/settlement`);
    await submit(matchId, controllers[0], firstVote);
    expect(await data(`/__fixture/matches/${matchId}/settlement`)).toEqual(finalSnapshot);
    expect(spectator.frames.every((frame) => Buffer.byteLength(frame) <= 16_384)).toBe(true);
    expect(watching.frames.every((frame) => Buffer.byteLength(frame) <= 16_384)).toBe(true);
    await data(`/__fixture/matches/${matchId}/revoke?grantId=${controllers[0].grantId}`);
    expect(
      (
        await request(
          `/api/matches/${matchId}/checkpoint?epoch=${reset.visibilityEpoch}&through=0`,
          controllers[0],
        )
      ).status,
    ).toBe(403);
  }, 180_000);

  it('runs mixed house fill through resurrection, actual timeout takeover, restart and final forfeit credit', async () => {
    provider = 'preview';
    await restart();
    const { matchId, controllers } = await admitted(1);
    const start = await data<Observation2>(`/api/matches/${matchId}`, controllers[0]);
    expect(start.seats.filter((seat) => seat.originalHouse)).toHaveLength(9);

    const externalTurn = await drive(
      matchId,
      controllers,
      (_view, seats) =>
        seats[0].act === 2 && !!seats[0].decision?.actions.some((option) => option.action.type === 'income'),
    );

    const obsolete = action(externalTurn.seats[0]);
    const beforeTakeover = await checkpoint(externalTurn.seats[0], controllers[0]);
    expect(beforeTakeover.baseline?.private).not.toBeNull();
    await clock(matchId, externalTurn.publicView, 'grace');

    const forfeited = await until(
      () => data<Observation2>(`/api/matches/${matchId}`, controllers[0]),
      (view) => view.you?.forfeited === true,
    );

    expect(forfeited.private).toBeNull();
    expect(forfeited.status).toBe('active');
    expect(await checkpoint(externalTurn.seats[0], controllers[0])).toEqual(beforeTakeover);
    expect((await checkpoint(forfeited, controllers[0])).baseline?.private).toBeNull();
    expect(
      (
        await request(`/api/matches/${matchId}/actions`, controllers[0], {
          method: 'POST',
          body: JSON.stringify(obsolete),
        })
      ).status,
    ).toBe(409);
    expect((await data<QueueStatus>('/api/queue', controllers[0])).status).toBe('matched');
    await restart();
    const restored = await data<Observation2>(`/api/matches/${matchId}`, controllers[0]);
    expect(restored.you).toMatchObject({ forfeited: true, generation: forfeited.you?.generation });
    await drive(matchId, controllers, (view) => view.status === 'finished');

    const settled = await until(
      () => data<Settlement>(`/__fixture/matches/${matchId}/settlement`),
      (value) => value.record?.result_applied === 1,
    );

    expect(settled.participants).toHaveLength(10);
    expect(
      settled.participants.find((participant) => participant.agent_id === controllers[0].agentId),
    ).toMatchObject({ won: 0, forfeited: 1 });
    expect(settled.participants.filter((participant) => participant.won === 1).length).toBeLessThanOrEqual(1);
    await until(
      () => data<QueueStatus>('/api/queue', controllers[0]),
      (value) => value.status === 'idle',
    );
  }, 180_000);

  it('resumes actual legacy SQLite records, old action fingerprints and pre-migration socket tickets after restart', async () => {
    provider = 'preview';
    const controllers = await data<FixtureController[]>('/__fixture/controllers?count=10');

    const legacy = await data<{
      matchId: string;
      controller: FixtureController;
      request: ActionRequest;
      ticket: string;
      eventCount: number;
      phaseId: string;
    }>('/__fixture/legacy', undefined, { method: 'POST', body: JSON.stringify({ controllers }) });

    await restart();

    const current = await data<Observation>(`/api/matches/${legacy.matchId}`, legacy.controller, {
      headers: { 'X-Agent-Game-Protocols': '1' },
    });

    expect(current.protocolVersion).toBe('1');
    expect(current.phase.id).toBe(legacy.phaseId);
    const socket = await stream(legacy.matchId, undefined, legacy.ticket, '1');
    const before = await data<FixtureInspection>(`/__fixture/matches/${legacy.matchId}`);
    await data(`/api/matches/${legacy.matchId}/actions`, legacy.controller, {
      method: 'POST',
      headers: { 'X-Agent-Game-Protocols': '1' },
      body: JSON.stringify(legacy.request),
    });
    const after = await data<FixtureInspection>(`/__fixture/matches/${legacy.matchId}`);
    expect(after.receiptCount).toBe(1);
    expect(after.eventCount).toBe(legacy.eventCount);
    expect(after.grants).toEqual(before.grants);
    expect(after.socketColumns).toContain('protocol');
    expect(socket.frames.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('drains sibling HTTP drivers when an actual checkpoint fails without clearing their allocations', async () => {
    const first = await admitted(10);
    const second = await admitted(10);
    let peerObserved = false;
    let peerSettled = false;
    let peerStopped = false;
    const failure = new Error('Fixture checkpoint failure after both drivers started');

    const peer = drive(second.matchId, second.controllers, () => {
      peerObserved = true;

      return peerStopped;
    }).finally(() => {
      peerSettled = true;
    });

    const failing = drive(first.matchId, first.controllers, () => {
      if (peerObserved) throw failure;

      return false;
    });

    try {
      await expect(joinDrivers(failing, peer)).rejects.toBe(failure);
      const allocations = await (await worker.fetch('/__fixture/allocations')).json();
      await writeFile(
        `${directory}/driver-failure-control.json`,
        JSON.stringify({ peerSettled, allocations }),
      );
      expect(peerSettled).toBe(true);
      expect(allocations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: first.matchId, state: 'active', reservation: 1.5 }),
          expect.objectContaining({ id: second.matchId, state: 'active', reservation: 1.5 }),
        ]),
      );
    } finally {
      // The red control must also drain its intentionally failed work before stopping the runtime.
      peerStopped = true;
      await Promise.allSettled([failing, peer]);
    }
  }, 30_000);

  it('starts an independent journey with fresh storage after unfinished games', async () => {
    expect(await data('/__fixture/allocations')).toEqual([]);
  });
});
