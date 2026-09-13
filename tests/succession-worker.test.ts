import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { ActionRequest2, HistoryPage2, Observation2, ReplayFrame2 } from '../src/shared/succession';
import type { ActionRequest, Observation } from '../src/game/types';
import type { QueueStatus } from '../src/shared/api';
import type { FixtureController, FixtureInspection } from './fixtures/succession-worker';

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

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/succession-worker-');
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
  await startWorker();
}, 30_000);

afterAll(async () => {
  for (const socket of sockets) socket.close();
  await worker?.stop();

  if (directory) await rm(directory, { recursive: true, force: true });
});

async function request(
  path: string,
  controller?: FixtureController,
  init: TestRequest = {},
): Promise<WorkerResponse> {
  const headers: TestHeaders = { 'X-Agent-Game-Protocols': '1,2', ...init.headers };

  if (controller) headers.authorization = `Bearer ${controller.token}`;

  if (init.body) headers['content-type'] = 'application/json';

  return worker.fetch(path, { ...init, headers });
}

async function data<T>(path: string, controller?: FixtureController, init: TestRequest = {}): Promise<T> {
  const response = await request(path, controller, init);
  const text = await response.text();
  expect(response.ok, `${path}: ${response.status} ${text}`).toBe(true);
  const parsed: T = JSON.parse(text);

  return parsed;
}

async function until<T>(load: () => Promise<T>, ready: (value: T) => boolean, timeout = 10_000): Promise<T> {
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
  view: Observation2,
  kind: 'discussion' | 'grace' | 'late-alarm' = 'discussion',
) {
  await data(`/__fixture/matches/${matchId}/clock?kind=${kind}&phaseId=${encodeURIComponent(view.phase.id)}`);
}

function action(view: Observation2): ActionRequest2 {
  const actions = view.decision?.actions ?? [];

  const preferred = [
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

async function drive(
  matchId: string,
  controllers: FixtureController[],
  stop: (publicView: Observation2, seats: Observation2[]) => boolean,
  timeout = 120_000,
): Promise<{ publicView: Observation2; seats: Observation2[] }> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const publicView = await data<Observation2>(`/api/matches/${matchId}`);
    const seats = await views(matchId, controllers);
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

async function admitted(count: number): Promise<{ matchId: string; controllers: FixtureController[] }> {
  const controllers = await data<FixtureController[]>(`/__fixture/controllers?count=${count}`);
  await Promise.all(
    controllers.map((controller) =>
      data('/api/queue', controller, {
        method: 'POST',
        body: JSON.stringify({ gameId: 'succession', requestId: crypto.randomUUID() }),
      }),
    ),
  );

  if (count < 10) await data('/__fixture/fill');

  const ticket = await until(
    () => data<QueueStatus>('/api/queue', controllers[0]),
    (value) => value.status === 'matched',
  );

  if (!ticket.matchId) throw new Error('Missing admitted match ID');

  const tickets = await Promise.all(
    controllers.map((controller) => data<QueueStatus>('/api/queue', controller)),
  );

  expect(tickets.every((entry) => entry.matchId === ticket.matchId && entry.gameId === 'succession')).toBe(
    true,
  );

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

describe('actual Succession HTTP, Durable Object and house execution', () => {
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
    unrelated.socket.close();
    expect((await data<Observation2>(`/api/matches/${matchId}`, controllers[1])).you?.forfeited).toBe(false);
    const returned = await drive(matchId, controllers, (view) => view.act === 2);
    expect(returned.publicView).toMatchObject({ status: 'active', result: null, finishedAt: null });
    expect(returned.publicView.seats.every((seat) => seat.alive && seat.influence === 2)).toBe(true);

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
    const finalSnapshot = await data<Settlement>(`/__fixture/matches/${matchId}/settlement`);
    await submit(matchId, controllers[0], firstVote);
    expect(await data(`/__fixture/matches/${matchId}/settlement`)).toEqual(finalSnapshot);
    expect(spectator.frames.every((frame) => Buffer.byteLength(frame) <= 16_384)).toBe(true);
    expect(watching.frames.every((frame) => Buffer.byteLength(frame) <= 16_384)).toBe(true);
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
    await clock(matchId, externalTurn.publicView, 'grace');

    const forfeited = await until(
      () => data<Observation2>(`/api/matches/${matchId}`, controllers[0]),
      (view) => view.you?.forfeited === true,
    );

    expect(forfeited.private).toBeNull();
    expect(forfeited.status).toBe('active');
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
});
