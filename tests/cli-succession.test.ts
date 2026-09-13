import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const identity = { gameId: 'succession', rulesVersion: 'succession-1', protocolVersion: '2' };
const current = {
  ...identity,
  matchId: 'match_two',
  status: 'active',
  act: 2,
  round: 1,
  phase: { id: 'phase_a', kind: 'action', deadline: 1000, graceUntil: 2000 },
  private: { act: 2, hand: [{ id: 'opaque', capability: 'thief' }], exchangePool: [], reaction: null },
  history: { visibilityEpoch: 'live', streamHead: 150 },
  decision: { id: 'decision_a', actions: [{ label: 'Income', action: { type: 'income' } }] },
};

it('preserves selected game through first pairing and start recursion, then copies the exact action envelope', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-cli-');
  const bodies: { path: string; data: Record<string, unknown> }[] = [];
  let queued = false;
  const server = createServer(async (request, response) => {
    expect(request.headers['x-agent-game-protocols']).toBe('1,2');
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
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const config = `${directory}/connection.json`;
  const cli = async (...args: string[]) =>
    JSON.parse(
      (
        await run(process.execPath, [
          'cli/agent-game.mjs',
          ...args,
          '--server',
          `http://127.0.0.1:${address.port}`,
          '--config',
          config,
        ])
      ).stdout,
    );
  try {
    await cli('start', '--game', 'succession');
    expect(JSON.parse(await readFile(config, 'utf8')).selectedGame).toBe('succession');
    await cli('start');
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
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});

it('requests a bounded server page without advancing a delivered cursor to the current head', async () => {
  const directory = await mkdtemp('/tmp/opencode/succession-page-');
  let query = new URLSearchParams();
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    let value: unknown = current;
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
        events: [{ id: 5, eventKey: 'key', text: 'fact' }],
        hasMore: true,
        reset: false,
      };
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: 'match_two', cursor: 9 }),
  );
  try {
    const page = JSON.parse(
      (
        await run(process.execPath, [
          'cli/agent-game.mjs',
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
