import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const run = promisify(execFile);

it.each(
  [false, true].flatMap((compact) =>
    ['clock', 'history', 'reclaim', 'decision', 'terminal', 'delayed-history', 'revoked', 'runtime'].map(
      (change) => ({
        compact,
        change,
      }),
    ),
  ),
)('wait distinguishes $change changes (compact=$compact)', async ({ change, compact }) => {
  const directory = await mkdtemp(join(tmpdir(), 'coding-wait-'));

  const view = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'match_wait',
    status: 'active',
    act: 1,
    serverNow: Date.now(),
    phase: { id: 'discussion', kind: 'government-discussion', deadline: Date.now() + 30000 },
    history: { visibilityEpoch: 'original', streamHead: 17 },
    decision: requiredDecision(false),
    you: { seat: 0, generation: 0, forfeited: false, canReclaim: false },
    seats: [],
    actOne: null,
    finale: null,
  };

  let changeAt = Infinity;

  const server = createServer((request, response) => {
    if (change === 'revoked' && Date.now() >= changeAt) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'connection-revoked', message: 'Fixture revoked.' } }));

      return;
    }

    if (!request.url?.includes('ticket')) {
      if (change === 'delayed-history' && Date.now() >= changeAt) view.history.streamHead = 18;
    }

    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url?.includes('ticket') ? { ticket: 'fixture' } : { ...view, serverNow: Date.now() },
      ),
    );
  });

  const sockets = new Set<Duplex>();
  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('data', (frame: Buffer) => {
      if ((frame[0] & 0x0f) === 8) socket.end(Buffer.from([0x88, 0]));
    });

    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    const data = Buffer.from(
      JSON.stringify({ type: 'observation', observation: { ...view, serverNow: Date.now() } }),
    );

    const prefix = Buffer.alloc(4);
    prefix[0] = 0x81;
    prefix[1] = 126;
    prefix.writeUInt16BE(data.length, 2);
    socket.write(Buffer.concat([prefix, data]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  // Node's listen(0) fixture uses a TCP address rather than a Unix socket.
  // eslint-disable-next-line anti-slop/no-runtime-typeof
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const config = `${directory}/connection.json`;
  await writeFile(
    config,
    JSON.stringify({
      server: `http://127.0.0.1:${address.port}`,
      token: 'fixture',
      matchId: view.matchId,
      observation: view,
    }),
  );

  try {
    await run('node', ['cli/agent-game.mjs', 'observe', '--config', config]);

    if (change === 'history') view.history.streamHead++;

    if (change === 'reclaim') view.you.canReclaim = true;

    if (change === 'decision') view.decision = requiredDecision(true);

    if (change === 'terminal') view.status = 'finished';
    const started = performance.now();
    changeAt = Date.now() + 2100;

    const pending = run(
      'node',
      [
        'cli/agent-game.mjs',
        'wait',
        '--timeout',
        '1',
        '--config',
        config,
        ...(compact ? ['--compact'] : []),
        ...(change !== 'clock' ? ['--until-change'] : []),
      ],
      {
        env:
          change === 'runtime'
            ? { ...process.env, AGENT_GAME_CHILD_DEADLINE: String(Date.now() + 1500) }
            : process.env,
      },
    );

    if (change === 'runtime') {
      await expect(pending).rejects.toMatchObject({ stdout: expect.stringContaining('runtime-exhausted') });
      expect(performance.now() - started).toBeLessThan(3000);

      return;
    }

    if (change === 'revoked') {
      await expect(pending).rejects.toMatchObject({ stdout: expect.stringContaining('connection-revoked') });

      return;
    }

    const result = await pending;

    expect(JSON.parse(result.stdout).decision).toEqual(view.decision);
    expect(JSON.parse(result.stdout).unchanged === true).toBe(compact && change === 'clock');

    if (change === 'delayed-history') {
      expect(JSON.parse(result.stdout).history.streamHead).toBe(18);
      expect(performance.now() - started).toBeGreaterThanOrEqual(1800);
    } else if (change === 'clock') expect(performance.now() - started).toBeGreaterThanOrEqual(800);
    else expect(performance.now() - started).toBeLessThan(800);
  } finally {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

function requiredDecision(required: boolean): { id: string; actions: never[] } | null {
  return required ? { id: 'required-vote', actions: [] } : null;
}
