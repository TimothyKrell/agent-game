import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Schema } from 'effect';
import { CodingPracticeSchema, TransportActionRequestSchema } from '../src/shared/api';
import { requireGameProtocol, selectedGame } from '../src/server/protocol';
import { HistoryPage3Schema } from '../src/shared/coding-finale-history';

const run = promisify(execFile);

const routingInput = {
  nodes: 1,
  start: 0,
  target: 0,
  edges: [],
  capacity: 0,
  rechargeTime: 1,
  rechargers: [],
};

it('defaults new selection to Coding Finale and requires explicit protocol 3 capability', () => {
  expect(selectedGame(undefined)).toBe('coding-finale');
  expect(selectedGame('secret-overlord')).toBe('secret-overlord');
  expect(() => requireGameProtocol('coding-finale', '1,2', 'match_coding')).toThrow('requires protocol 3');
  expect(() => requireGameProtocol('coding-finale', '1,2,3', 'match_coding')).not.toThrow();
  expect(() => requireGameProtocol('succession', '1,2', 'match_legacy')).not.toThrow();
});

it('bounds decoded UTF-8 source independently of JSON envelope size', () => {
  const request = {
    actionId: 'request_123',
    phaseId: 'phase_1',
    gameId: 'coding-finale',
    action: {
      type: 'submit-program',
      tier: 1,
      challengeId: 'challenge',
      program: { language: 'javascript', source: 'é'.repeat(16384) },
    },
  };

  expect(Schema.is(TransportActionRequestSchema)(request)).toBe(true);
  expect(
    Schema.is(TransportActionRequestSchema)({
      ...request,
      action: { ...request.action, program: { ...request.action.program, source: 'é'.repeat(16385) } },
    }),
  ).toBe(false);
  expect(Schema.is(CodingPracticeSchema)({ program: request.action.program, inputs: [routingInput] })).toBe(
    true,
  );
  expect(
    Schema.is(CodingPracticeSchema)({ program: request.action.program, inputs: Array(9).fill(routingInput) }),
  ).toBe(false);
});

it('preserves ordered history delivery and reset bounds for protocol 3', () => {
  const page = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    matchId: 'match_coding',
    visibilityEpoch: 'seat',
    streamHead: 3,
    after: 0,
    through: 3,
    cursor: 1,
    events: [{ id: 1, eventKey: 'one', at: 1, act: 2, round: 1, type: 'chat', text: 'Ready' }],
    hasMore: true,
    reset: false,
  };

  expect(Schema.is(HistoryPage3Schema)(page)).toBe(true);
  expect(Schema.is(HistoryPage3Schema)({ ...page, events: [{ ...page.events[0], id: 2 }], cursor: 2 })).toBe(
    false,
  );
  expect(Schema.is(HistoryPage3Schema)({ ...page, reset: true })).toBe(false);
  expect(Schema.is(HistoryPage3Schema)({ ...page, reset: true, cursor: 0, events: [] })).toBe(true);
});

it('submits supervised source as inert JSON, practices remotely and preserves protocol identity', async () => {
  const directory = await mkdtemp('/tmp/opencode/coding-cli-');
  const received: { path: string; body: unknown; protocols: string | string[] | undefined }[] = [];

  const view = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'match_coding',
    status: 'active',
    act: 2,
    phase: { id: 'race' },
    history: { visibilityEpoch: 'seat', streamHead: 0 },
    decision: null,
    you: { seat: 0, generation: 1, canReclaim: true },
    finale: { you: { unlockedTier: 1 } },
  };

  const server = createServer(async (request, response) => {
    let body = '';

    for await (const chunk of request) body += chunk;
    const parsed = body ? JSON.parse(body) : undefined;
    received.push({
      path: request.url ?? '',
      body: parsed,
      protocols: request.headers['x-agent-game-protocols'],
    });
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url?.endsWith('/actions')
          ? { accepted: true, actionId: parsed.actionId, observation: view }
          : request.url?.endsWith('/reclaim')
            ? { reclaimed: true, observation: view }
            : { outputs: [1] },
      ),
    );
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();

  const port = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(address).port;
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({
      server: `http://127.0.0.1:${port}`,
      token: 'test-token',
      matchId: view.matchId,
      observation: view,
    }),
  );

  const program = {
    language: 'javascript',
    source: 'export function solve(input) { return "$(touch NEVER)"; }',
  };

  const env = { ...process.env, AGENT_GAME_CHILD_DEADLINE: String(Date.now() + 60_000) };

  try {
    await run(
      process.execPath,
      [
        'cli/agent-game.mjs',
        'coding-submit',
        '--config',
        config,
        '--json',
        JSON.stringify({ challengeId: 'challenge', tier: 1, program }),
      ],
      { env },
    );
    await run(
      process.execPath,
      [
        'cli/agent-game.mjs',
        'coding-practice',
        '--config',
        config,
        '--json',
        JSON.stringify({ program, inputs: [routingInput] }),
      ],
      { env },
    );
    await run(process.execPath, ['cli/agent-game.mjs', 'reclaim', '--config', config], { env });
    expect(received.find((entry) => entry.path.endsWith('/actions'))).toMatchObject({
      path: '/api/matches/match_coding/actions',
      protocols: '1,2,3',
      body: {
        gameId: 'coding-finale',
        phaseId: 'race',
        action: { type: 'submit-program', tier: 1, program },
      },
    });
    expect(received.find((entry) => entry.path.endsWith('/coding/practice'))).toMatchObject({
      path: '/api/matches/match_coding/coding/practice',
      body: { program, inputs: [routingInput] },
    });
    const reclaim = received.find((entry) => entry.path.endsWith('/reclaim'));
    expect(reclaim).toMatchObject({
      path: '/api/matches/match_coding/reclaim',
      body: { expectedGeneration: 1 },
      protocols: '1,2,3',
    });
    expect(reclaim?.body).toMatchObject({ requestId: expect.any(String) });
    await expect(
      run(
        process.execPath,
        ['cli/agent-game.mjs', 'coding-submit', '--config', config, '--file', '/etc/passwd'],
        { env },
      ),
    ).rejects.toThrow();
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});

it('replays the exact persisted reclaim receipt after a lost acknowledgement', async () => {
  const directory = await mkdtemp('/tmp/opencode/reclaim-cli-');
  const requests: unknown[] = [];

  const view = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'match_reclaim',
    status: 'active',
    act: 1,
    phase: { id: 'nomination' },
    history: { visibilityEpoch: 'seat', streamHead: 0 },
    decision: null,
    you: { seat: 0, generation: 1, canReclaim: true },
  };

  const server = createServer(async (request, response) => {
    let body = '';

    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));

    if (requests.length <= 3) {
      request.socket.destroy();

      return;
    }

    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ reclaimed: true, generation: 2, observation: view }));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({
      server: `http://127.0.0.1:${address.port}`,
      token: 'test-token',
      matchId: view.matchId,
      observation: view,
    }),
  );

  try {
    await expect(
      run(process.execPath, ['cli/agent-game.mjs', 'reclaim', '--config', config]),
    ).rejects.toThrow();
    const pending = JSON.parse(await readFile(config, 'utf8')).pendingReclaim;
    expect(pending).toMatchObject({
      request: { requestId: expect.any(String), expectedGeneration: 1 },
    });
    await run(process.execPath, ['cli/agent-game.mjs', 'reclaim', '--config', config]);
    expect(requests).toEqual([pending.request, pending.request, pending.request, pending.request]);
    expect(JSON.parse(await readFile(config, 'utf8')).pendingReclaim).toBeUndefined();
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
