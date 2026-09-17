import { createServer } from 'node:http';
import { connect } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { version } from '../package.json';
import { Schema } from 'effect';
import type { ActionRequest2, HistoryPage2, Observation2 } from '../src/shared/succession';
import { ActionRequest2Schema, Observation2Schema } from '../src/shared/succession';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';

const run = promisify(execFile);

function deferred() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { resolve, promise };
}

let installation: string;

let bin: string;

beforeAll(async () => {
  installation = await mkdtemp('/tmp/opencode/succession-installed-');
  await run(process.execPath, ['scripts/package-cli.mjs']);
  await run('npm', [
    'install',
    '--prefix',
    installation,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve(`public/downloads/agent-game-cli-${version}.tgz`),
  ]);
  bin = `${installation}/node_modules/.bin/agent-game`;
});

it.each([false, true])(
  'rejects delayed queue/current/receipt/history after terminal acceptance (reset=%s)',
  async (reset) => {
    const directory = await mkdtemp('/tmp/opencode/succession-delayed-');
    const heldCurrent = deferred();
    const heldPage = deferred();
    const releaseCurrent = deferred();
    const releasePage = deferred();
    const heldReceipt = deferred();
    const releaseReceipt = deferred();
    const heldQueue = deferred();
    const releaseQueue = deferred();
    let reads = 0;
    let finished = false;

    const final: Observation2 = {
      ...current,
      status: 'finished',
      decision: null,
      history: { visibilityEpoch: 'archive', streamHead: 200 },
    };

    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost');

      if (url.pathname === '/api/queue') {
        heldQueue.resolve();
        await releaseQueue.promise;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({ ...identity, status: 'matched', gameId: 'succession', matchId: 'match_two' }),
        );

        return;
      }

      if (url.pathname.endsWith('/actions')) {
        let body = '';

        for await (const chunk of request) body += chunk;
        heldReceipt.resolve();
        await releaseReceipt.promise;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({ accepted: true, actionId: JSON.parse(body).actionId, observation: current }),
        );

        return;
      }

      let value: Observation2 | HistoryPage2;

      if (url.pathname.endsWith('/history')) {
        const epoch = url.searchParams.get('epoch') ?? 'live';
        value = {
          ...identity,
          matchId: 'match_two',
          visibilityEpoch: epoch,
          streamHead: epoch === 'live' ? 150 : 200,
          after: 0,
          through: epoch === 'live' ? 150 : 200,
          cursor: 1,
          events: [{ id: 1, eventKey: 'fact', text: 'fact', at: 0, act: 2, round: 1, type: 'chat' }],
          hasMore: true,
          reset: false,
        };

        if (epoch === 'live') {
          heldPage.resolve();
          await releasePage.promise;

          if (reset)
            value = {
              ...value,
              visibilityEpoch: 'archive',
              streamHead: 200,
              through: 200,
              cursor: 0,
              events: [],
              reset: true,
            };
        }
      } else {
        value = finished ? final : current;

        if (++reads === 1) {
          heldCurrent.resolve();
          await releaseCurrent.promise;
        }
      }

      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(value));
    });

    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    const config = `${directory}/connection.json`;
    await writeFile(
      config,
      JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: 'match_two' }),
    );

    const cli = async (...commands: string[]) =>
      JSON.parse(
        (await run(process.execPath, [bin, ...commands, '--config', config], { cwd: installation })).stdout,
      );

    try {
      const oldQueue = cli('status');
      await heldQueue.promise;
      const oldCurrent = cli('observe');
      await heldCurrent.promise;
      const oldPage = cli('history');
      await heldPage.promise;
      const oldReceipt = cli('act', '--choice', '0');
      await heldReceipt.promise;
      finished = true;
      expect((await cli('observe')).status).toBe('finished');
      expect((await cli('history')).cursor).toBe(1);
      releaseCurrent.resolve();
      releasePage.resolve();
      releaseReceipt.resolve();
      releaseQueue.resolve();
      expect((await oldQueue).matchId).toBe('match_two');
      expect((await oldCurrent).status).toBe('finished');
      expect((await oldPage).status).toBe('stale-page');
      const receipt = await oldReceipt;
      expect(receipt.accepted).toBe(true);
      expect(receipt.observation.status).toBe('finished');
      const saved = JSON.parse(await readFile(config, 'utf8'));
      expect(saved.observation.status).toBe('finished');
      expect(saved.observation.history.visibilityEpoch).toBe('archive');
      expect(saved.historyWalk).toEqual({ epoch: 'archive', cursor: 1, through: 200 });
    } finally {
      releaseCurrent.resolve();
      releasePage.resolve();
      releaseReceipt.resolve();
      releaseQueue.resolve();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.each(['observe', 'terminal', 'act', 'history'])(
  'fences a held %s response after a new queued participation',
  async (kind) => {
    const directory = await mkdtemp('/tmp/opencode/succession-new-queue-');
    const held = deferred();
    const release = deferred();

    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      response.setHeader('content-type', 'application/json');

      if (url.pathname === '/api/queue') {
        let body = '';

        for await (const chunk of request) body += chunk;
        response.end(
          JSON.stringify(
            request.method === 'GET'
              ? { status: 'idle' }
              : {
                  ...identity,
                  status: 'queued',
                  requestId: JSON.parse(body).requestId,
                },
          ),
        );

        return;
      }

      const isReceipt = url.pathname.endsWith('/actions');
      const isPage = url.pathname.endsWith('/history');
      let body = '';

      if (isReceipt) for await (const chunk of request) body += chunk;

      if (kind === 'observe' || kind === 'terminal' || isReceipt || isPage) {
        held.resolve();
        await release.promise;
      }

      const view =
        kind === 'terminal'
          ? {
              ...current,
              status: 'finished',
              decision: null,
              history: { visibilityEpoch: 'archive', streamHead: 200 },
            }
          : current;

      response.end(
        JSON.stringify(
          isReceipt
            ? {
                accepted: true,
                actionId: JSON.parse(body).actionId,
                observation: view,
              }
            : isPage
              ? {
                  ...identity,
                  matchId: current.matchId,
                  visibilityEpoch: 'live',
                  streamHead: 150,
                  after: 0,
                  through: 150,
                  cursor: 1,
                  events: [{ id: 1, eventKey: 'old', text: 'old', at: 0, act: 2, round: 1, type: 'chat' }],
                  hasMore: true,
                  reset: false,
                }
              : view,
        ),
      );
    });

    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    const config = `${directory}/connection.json`;
    await writeFile(
      config,
      JSON.stringify({
        server: `http://127.0.0.1:${address.port}`,
        selectedGame: 'succession',
        matchId: current.matchId,
        observation: current,
        participation: { gameId: 'succession', matchId: current.matchId },
      }),
    );

    const cli = (...args: string[]) =>
      run(process.execPath, [bin, ...args, '--config', config], { cwd: installation }).then(
        (result) => JSON.parse(result.stdout),
        (error) => JSON.parse(error.stdout),
      );

    try {
      const delayed = cli(
        ...(kind === 'act' ? ['act', '--choice', '0'] : [kind === 'terminal' ? 'observe' : kind]),
      );

      await held.promise;
      expect((await cli('join')).status).toBe('queued');
      const queued = JSON.parse(await readFile(config, 'utf8'));
      expect(queued.matchId).toBeUndefined();
      expect(queued.pendingJoin.requestId).toBeTruthy();
      release.resolve();
      const result = await delayed;

      if (kind === 'history') expect(result.status).toBe('stale-page');
      else if (kind === 'act') {
        expect(result.accepted).toBe(true);
        expect(result.actionId).toBeTruthy();
        expect(result.status).toBe('stale-current');
        expect(result.observation).toBeUndefined();
      } else expect(result.error.code).toBe('stale-match');
      const saved = JSON.parse(await readFile(config, 'utf8'));
      expect(saved.pendingJoin).toEqual(queued.pendingJoin);
      expect(saved.joinRequest).toBe(queued.joinRequest);
      expect(saved.matchId).toBeUndefined();
      expect(saved.participation).toBeUndefined();
      expect(saved.observation).toBeUndefined();
      expect(saved.historyWalk).toBeUndefined();
      expect(saved.pending).toBeUndefined();
    } finally {
      release.resolve();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('honors the exported child deadline before starting network work', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-deadline-');

  try {
    await expect(
      run(
        process.execPath,
        [
          bin,
          'observe',
          '--server',
          'http://127.0.0.1:1',
          '--match',
          'match_expired',
          '--config',
          `${directory}/connection.json`,
        ],
        {
          cwd: installation,
          env: { ...process.env, AGENT_GAME_CHILD_DEADLINE: String(Date.now() - 1) },
        },
      ),
    ).rejects.toMatchObject({ stdout: expect.stringContaining('runtime-exhausted') });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('keeps replacement entitlement when an older private response arrives late', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-entitlement-');
  const held = deferred();
  const release = deferred();
  let reads = 0;

  const replacement: Observation2 = {
    ...current,
    private: null,
    decision: null,
    you: { seat: 0, agentId: 'agent_a', alive: true, forfeited: true, generation: 1 },
  };

  const server = createServer(async (_request, response) => {
    const value = reads++ === 0 ? current : replacement;

    if (value === current) {
      held.resolve();
      await release.promise;
    }

    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: 'match_two' }),
  );

  const cli = async () =>
    JSON.parse(
      (await run(process.execPath, [bin, 'observe', '--config', config], { cwd: installation })).stdout,
    );

  try {
    const old = cli();
    await held.promise;
    expect((await cli()).you.forfeited).toBe(true);
    release.resolve();
    expect((await old).private).toBeNull();
    const saved = JSON.parse(await readFile(config, 'utf8'));
    expect(saved.observation.you.generation).toBe(1);
    expect(saved.observation.private).toBeNull();
  } finally {
    release.resolve();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});

it('plays a complete real two-act engine through the installed CLI and an HTTP fixture', async () => {
  let serial = 0;
  let seed = 123;

  const random = {
    random(size: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return Math.floor((seed / 4294967296) * size);
    },
    id: () => `opaque-${serial++}`,
  };

  let { state } = await createSuccession(
    'match_packaged_engine',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Seat ${seat}`,
      house: seat !== 0,
      rating: 1000,
    })),
    0,
    { random, salt: new Uint8Array(32) },
  );

  const externalSeat = state.seats.findIndex((seat) => seat.entrant.agentId === 'agent-0');

  const currentView = () =>
    observeSuccession(state, externalSeat, {
      visibilityEpoch: state.status === 'active' ? 'live' : 'archive',
      streamHead: 0,
    });

  let houseDecisions = 0;

  const pump = () => {
    for (let steps = 0; state.status === 'active'; steps++) {
      if (steps > 10000) throw new Error('Fixture failed to progress');
      const runtime = inspectSuccession(state);

      if (runtime.pendingSeats.includes(externalSeat)) return;
      const seat = runtime.pendingSeats[0];

      if (seat !== undefined) {
        const view = observeSuccession(state, seat, undefined, true);
        const action = previewSuccessionAction(view, random.random);

        if (!action || !view.decision) throw new Error('Required fixture action missing');
        state = evolveSuccession(
          state,
          {
            type: 'act',
            seat,
            generation: state.seats[seat].generation,
            now: state.phase.startedAt + 1,
            request: {
              gameId: 'succession',
              actionId: random.id(),
              phaseId: view.phase.id,
              decisionId: view.decision.id,
              action,
            },
          },
          random,
        ).state;
        houseDecisions++;
      } else {
        if (state.phase.deadline === null) throw new Error('Fixture phase has no deadline');
        state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline }, random).state;
      }
    }
  };

  const server = createServer(async (request, response) => {
    try {
      let actionId: string | undefined;

      if (request.url?.endsWith('/actions')) {
        let body = '';

        for await (const chunk of request) body += chunk;
        const action = Schema.decodeUnknownSync(ActionRequest2Schema)(JSON.parse(body));
        actionId = action.actionId;
        state = evolveSuccession(
          state,
          {
            type: 'act',
            seat: externalSeat,
            generation: state.seats[externalSeat].generation,
            now: state.phase.startedAt + 1,
            request: action,
          },
          random,
        ).state;
      }

      pump();
      const view = currentView();
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(actionId ? { accepted: true, actionId, observation: view } : view));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const directory = await mkdtemp('/tmp/opencode/cli-real-engine-');
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: state.id, agentId: 'agent-0' }),
  );

  const cli = async (...args: string[]) =>
    JSON.parse(
      (await run(process.execPath, [bin, ...args, '--config', config], { cwd: installation })).stdout,
    );

  try {
    let view = Schema.decodeUnknownSync(Observation2Schema)(await cli('observe'));
    const acts = new Set<number>([view.act]);
    let choices = 0;

    while (view.status === 'active') {
      if (++choices > 1000 || !view.decision) throw new Error('Fixture expected a live external decision');
      const action = previewSuccessionAction(view, random.random);

      const choice = view.decision.actions.findIndex(
        (entry) => JSON.stringify(entry.action) === JSON.stringify(action),
      );

      expect(choice).toBeGreaterThanOrEqual(0);
      const result = await cli('act', '--choice', String(choice));
      view = Schema.decodeUnknownSync(Observation2Schema)(result.observation);
      acts.add(view.act);
    }

    expect(acts).toEqual(new Set([1, 2]));
    expect(view.status).toBe('finished');
    expect(view.result?.kind).toBe('individual');
    expect(view.you?.forfeited).toBe(false);
    expect(houseDecisions).toBeGreaterThan(100);
    expect(choices).toBeGreaterThan(10);
    expect(JSON.parse(await readFile(config, 'utf8')).observation.result).toEqual(view.result);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

afterAll(async () => {
  await rm(installation, { recursive: true, force: true });
});

const identity: Pick<Observation2, 'gameId' | 'rulesVersion' | 'protocolVersion'> = {
  gameId: 'succession',
  rulesVersion: 'succession-1',
  protocolVersion: '2',
};

const current: Observation2 = {
  ...identity,
  matchId: 'match_two',
  status: 'active',
  act: 2,
  round: 1,
  mode: 'preview',
  createdAt: 0,
  finishedAt: null,
  seats: [],
  act1Result: null,
  board: {
    act: 2,
    firstSeat: 0,
    activeSeat: 0,
    tableRound: 1,
    slot: 0,
    roundCap: 12,
    courtCount: 5,
    pending: null,
  },
  chat: { open: true, maxCharacters: 1000, cooldownMs: 5000, nextSpeakAt: null },
  you: { seat: 0, agentId: 'agent_a', alive: true, forfeited: false, generation: 0 },
  result: null,
  interruptionReason: null,
  commitment: { digest: 'digest', reveal: null },
  phase: { id: 'phase_a', kind: 'act-2:action', deadline: 1000, graceUntil: 2000 },
  private: { act: 2, hand: [{ id: 'opaque', capability: 'thief' }], exchangePool: [], reaction: null },
  history: { visibilityEpoch: 'live', streamHead: 150 },
  decision: {
    id: 'decision_a',
    deadline: 1000,
    graceUntil: 2000,
    actions: [{ label: 'Income', action: { type: 'income' } }],
  },
};

function successionPairingFixture() {
  const bodies: { path: string; data: Partial<ActionRequest2> & { requestId?: string } }[] = [];
  const failures: Error[] = [];
  const pending = new Set<Promise<void>>();
  let queued = false;

  const server = createServer((request, response) => {
    const path = request.url?.split('?')[0] ?? '/';

    const context = {
      method: request.method,
      path,
      headerNames: Object.keys(request.headers),
    };

    const handling = (async () => {
      if (
        ![
          'POST /api/pairing',
          'GET /api/pairing/status',
          'GET /api/queue',
          'POST /api/queue',
          `GET /api/matches/${current.matchId}`,
          `POST /api/matches/${current.matchId}/actions`,
        ].includes(`${request.method} ${path}`)
      ) {
        request.resume();
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'fixture-route-not-found' } }));

        return;
      }

      expect(request.headers['x-agent-game-protocols'], JSON.stringify(context)).toBe('1,2,3');
      let body = '';

      for await (const chunk of request) body += chunk;
      bodies.push({ path: request.url!, data: body ? JSON.parse(body) : {} });
      let value;

      if (request.url === '/api/pairing')
        value = { expiresAt: Date.now() + 60000, verificationUrl: 'https://approval.test' };
      else if (request.url === '/api/pairing/status') value = { status: 'approved', agentId: 'agent_a' };
      else if (request.url === '/api/queue') {
        if (request.method === 'POST') queued = true;
        value = queued ? { ...identity, status: 'matched', matchId: 'match_two' } : { status: 'idle' };
      } else if (request.url?.endsWith('/actions'))
        value = { accepted: true, actionId: JSON.parse(body).actionId, observation: current };
      else value = current;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(value));
    })().catch((error) => {
      failures.push(
        new Error(`Pairing fixture request failed: ${request.method} ${path} ${JSON.stringify(context)}`, {
          cause: error,
        }),
      );
      request.resume();

      if (response.headersSent || response.destroyed) response.destroy();
      else {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'fixture-handler-failed' } }));
      }
    });

    pending.add(handling);
    void handling.then(() => pending.delete(handling));
  });

  server.on('upgrade', (_request, socket) => {
    const body = JSON.stringify({ error: { code: 'fixture-upgrade-unsupported' } });
    socket.end(
      `HTTP/1.1 501 Not Implemented\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  });

  return {
    server,
    bodies,
    close: async () => {
      await new Promise<void>((done) => server.close(() => done()));
      await Promise.all(pending);

      if (failures.length)
        throw new AggregateError(failures, failures.map((error) => error.message).join('\n'));
    },
  };
}

async function pairingEvidence(name: string, value: Schema.Json) {
  const directory = process.env.PROTOCOL_CORRECTION_DIR;

  if (directory) await writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n');
}

function pairingRequest(port: number, request: string) {
  return new Promise<string>((done, reject) => {
    let response = '';
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(request));
    socket.setEncoding('utf8');
    socket.setTimeout(1000, () => socket.destroy(new Error('Pairing fixture response timed out')));
    socket.on('data', (chunk) => {
      response += chunk;
    });
    socket.on('error', reject);
    socket.on('end', () => done(response));
  });
}

it('preserves selected game through first pairing and start recursion, then copies the exact action envelope', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-cli-');
  const fixture = successionPairingFixture();
  const { server, bodies } = fixture;

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const config = `${directory}/connection.json`;

  const cli = async (...args: string[]) =>
    JSON.parse(
      (
        await run(
          process.execPath,
          [bin, ...args, '--server', `http://127.0.0.1:${address.port}`, '--config', config],
          { cwd: installation },
        )
      ).stdout,
    );

  try {
    await cli('start', '--game', 'succession');
    expect(JSON.parse(await readFile(config, 'utf8')).selectedGame).toBe('succession');
    const beforeProbe = bodies.length;
    const probes = [];

    for (const [path, body] of [
      ['/', undefined],
      ['/health', '{not-json'],
      ['/probe', '{"requestId":"unrelated"}'],
      ['/api/unknown', undefined],
    ]) {
      const headers = new Headers();

      if (path!.startsWith('/api/')) headers.set('X-Agent-Game-Protocols', '1,2,3');

      const probe = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        body,
        headers,
        signal: AbortSignal.timeout(1000),
      });

      expect(probe.status).toBe(404);
      expect(await probe.json()).toEqual({ error: { code: 'fixture-route-not-found' } });
      expect(bodies).toHaveLength(beforeProbe);
      probes.push({ path: path!, status: probe.status, apiRequests: bodies.length });
    }

    await cli('start', '--game', 'succession');
    expect(bodies.find((item) => item.path === '/api/queue' && item.data.requestId)?.data).toMatchObject({
      gameId: 'succession',
    });
    expect(JSON.parse(await readFile(config, 'utf8')).participation).toEqual({
      gameId: 'succession',
      matchId: 'match_two',
    });
    const view = await cli('observe');
    expect(view.private).toEqual(current.private);
    expect(view.events).toBeUndefined();
    expect(view.cursor).toBeUndefined();
    await cli('act', '--choice', '0');
    expect(bodies.at(-1)?.data).toMatchObject({
      gameId: 'succession',
      phaseId: 'phase_a',
      decisionId: 'decision_a',
      action: { type: 'income' },
    });
    await expect(cli('start', '--game', 'secret-overlord')).rejects.toThrow();
    await pairingEvidence('pairing-journey-controls', {
      beforeProbe,
      probes,
      apiPaths: bodies.map((entry) => entry.path),
    });
  } finally {
    try {
      await fixture.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

it.each([undefined, '1'])(
  'propagates a pairing fixture API protocol failure into awaited work (header=%s)',
  async (header) => {
    const fixture = successionPairingFixture();
    await new Promise<void>((done) => fixture.server.listen(0, '127.0.0.1', done));

    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(
      fixture.server.address(),
    );

    const protocol = header === undefined ? '' : `X-Agent-Game-Protocols: ${header}\r\n`;
    const request = `POST /api/queue HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: close\r\n${protocol}Content-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`;
    const response = await pairingRequest(address.port, request).catch(() => null);
    const completion = fixture.close();
    await expect(completion).rejects.toThrow(/POST \/api\/queue/);
    await expect(completion).rejects.toMatchObject({
      errors: [{ cause: { name: 'AssertionError', actual: header, expected: '1,2,3' } }],
    });
    expect(response).toMatch(/^HTTP\/1.1 500 /);
    expect(response).toContain('fixture-handler-failed');
    expect(fixture.bodies).toEqual([]);

    const rejected = await completion.then(
      () => false,
      () => true,
    );

    await pairingEvidence(`api-header-${header ?? 'missing'}`, {
      request,
      response,
      awaitedRejection: rejected,
      apiRequests: fixture.bodies.length,
    });
  },
);

it('propagates an asynchronous pairing body-parse failure after a complete HTTP request without mutating queue state', async () => {
  const fixture = successionPairingFixture();
  await new Promise<void>((done) => fixture.server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(fixture.server.address());
  const request = `POST /api/queue HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: close\r\nX-Agent-Game-Protocols: 1,2,3\r\nContent-Type: application/json\r\nContent-Length: 1\r\n\r\n{`;
  let response;

  try {
    const ignored = await fetch(`http://127.0.0.1:${address.port}/probe`, {
      signal: AbortSignal.timeout(1000),
    });

    expect(ignored.status).toBe(404);
    await ignored.text();
    response = await pairingRequest(address.port, request);
    expect(response).toMatch(/^HTTP\/1.1 500 /);
    expect(fixture.bodies).toEqual([]);

    const queue = await fetch(`http://127.0.0.1:${address.port}/api/queue`, {
      headers: { 'X-Agent-Game-Protocols': '1,2,3' },
      signal: AbortSignal.timeout(1000),
    });

    expect(await queue.json()).toEqual({ status: 'idle' });
    expect(fixture.bodies).toHaveLength(1);
  } finally {
    const completion = fixture.close();
    await expect(completion).rejects.toThrow(/POST \/api\/queue/);
    await expect(completion).rejects.toMatchObject({ errors: [{ cause: { name: 'SyntaxError' } }] });
    await pairingEvidence('async-body-parse', {
      request,
      response: response ?? null,
      awaitedRejection: await completion.then(
        () => false,
        () => true,
      ),
      apiRequests: fixture.bodies.length,
    });
  }
});

it('rejects unsupported pairing fixture WebSocket upgrades separately from API protocol headers', async () => {
  const fixture = successionPairingFixture();
  await new Promise<void>((done) => fixture.server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(fixture.server.address());
  const request = `GET /api/matches/match_two/events?protocol=2 HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ZGlhZ25vc3RpYy1jb250cm9s\r\n\r\n`;

  try {
    const response = await pairingRequest(address.port, request);
    expect(response).toMatch(/^HTTP\/1.1 501 /);
    expect(response).toContain('fixture-upgrade-unsupported');
    expect(fixture.bodies).toEqual([]);
    await pairingEvidence('unsupported-upgrade', { request, response, apiRequests: fixture.bodies.length });
  } finally {
    await fixture.close();
  }
});

it('requests a bounded server page without advancing a delivered cursor to the current head', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-page-');
  let query = new URLSearchParams();

  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    let value: Observation2 | HistoryPage2 = current;

    if (url.pathname.endsWith('/history')) {
      query = url.searchParams;
      value = {
        ...identity,
        matchId: 'match_two',
        visibilityEpoch: 'live',
        streamHead: 155,
        after: 4,
        through: 100,
        cursor: 5,
        events: [{ id: 5, eventKey: 'key', text: 'fact', at: 0, act: 2, round: 1, type: 'chat' }],
        hasMore: true,
        reset: false,
      };
    }

    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: 'match_two', cursor: 9 }),
  );

  try {
    const page = JSON.parse(
      (
        await run(process.execPath, [
          bin,
          'history',
          '--config',
          config,
          '--epoch',
          'live',
          '--after',
          '4',
          '--through',
          '100',
          '--limit',
          '1',
          '--max-bytes',
          '12288',
        ])
      ).stdout,
    );

    expect(Object.fromEntries(query)).toEqual({
      epoch: 'live',
      after: '4',
      through: '100',
      limit: '1',
      maxBytes: '12288',
    });
    expect(page.cursor).toBe(5);
    expect(page.streamHead).toBe(155);
    expect(JSON.parse(await readFile(config, 'utf8')).cursor).toBe(9);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
