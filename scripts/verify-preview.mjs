import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { waitForDeployment } from './deployment-ready.mjs';

const server = new URL(process.argv[2]).origin;

assert.equal(new URL(server).protocol, 'https:');

await waitForDeployment(server);

async function request(path, status, body) {
  const response = await fetch(server + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: server, 'content-type': 'application/json', 'X-Agent-Game-Protocols': '1,2' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();

  assert.equal(response.status, status, `${path}: ${text.slice(0, 2048)}`);

  return JSON.parse(text);
}

function watchMatch(matchId, protocol) {
  const socket = new WebSocket(
    `${server.replace(/^http/, 'ws')}/api/matches/${matchId}/events?protocol=${protocol}`,
  );

  const metrics = { packets: 0, maxBytes: 0, acts: new Set() };

  const terminal = new Promise((resolve) => {
    socket.addEventListener('error', () => resolve({ error: 'Spectator socket failed' }));
    socket.addEventListener('message', (message) => {
      try {
        const packet = JSON.parse(message.data);
        assert.equal(packet.type, 'observation');
        const current = packet.observation;
        assert.equal(current.protocolVersion, protocol);
        assert.equal(current.you, null);
        assert.equal(current.private, null);
        metrics.packets++;
        metrics.maxBytes = Math.max(metrics.maxBytes, Buffer.byteLength(message.data));

        if (protocol === '2') {
          assert.ok(metrics.maxBytes <= 16_384);
          metrics.acts.add(current.act);
        }

        if (current.status !== 'active') resolve({ status: current.status });
      } catch (error) {
        resolve({ error: error.message });
      }
    });
  });

  return async () => {
    let timer;

    try {
      const result = await Promise.race([
        terminal,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ error: 'No terminal socket frame' }), 15_000);
        }),
      ]);

      assert.equal(result.error, undefined);
      assert.equal(result.status, 'finished');
      assert.ok(metrics.packets > 0);

      if (protocol === '2') assert.deepEqual([...metrics.acts].sort(), [1, 2]);

      return { ...metrics, acts: [...metrics.acts] };
    } finally {
      clearTimeout(timer);
      socket.close();
    }
  };
}

assert.deepEqual(await request('/api/health', 200), { ok: true, protocolVersion: '1' });

const bootstrap = await request('/api/bootstrap', 200);

assert.equal(bootstrap.mode, 'preview');

assert.equal(bootstrap.localLogin, false);

assert.equal(bootstrap.houseAvailable, true);

assert.deepEqual(bootstrap.authProviders, []);

await request('/api/dev/login', 404, { name: 'Preview isolation probe' });

await request('/api/owner', 401);

const { matchId } = await request('/api/dev/exhibition', 200, {});

const finishOriginalSocket = watchMatch(matchId, '1');

const deadline = Date.now() + 180_000;

let view;

do {
  view = await request(`/api/matches/${matchId}`, 200);
  assert.equal(view.mode, 'preview');
  assert.equal(view.you, null);
  assert.equal(view.private, null);

  if (view.status !== 'active') break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
} while (Date.now() < deadline);

assert.equal(view.status, 'finished', view.winReason ?? 'Scripted preview must complete');

assert.equal(view.seats.length, 10);

assert.ok(view.seats.every((seat) => seat.role && !seat.forfeited));

assert.ok(view.reveal);

const originalSocket = await finishOriginalSocket();

const succession = await request('/api/dev/exhibition', 200, { gameId: 'succession' });

const finishSuccessionSocket = watchMatch(succession.matchId, '2');

const successionDeadline = Date.now() + 300_000;

const acts = new Set();

let maxCurrentBytes = 0;

let individual;

do {
  individual = await request(`/api/matches/${succession.matchId}`, 200);
  assert.equal(individual.protocolVersion, '2');
  assert.equal(individual.gameId, 'succession');
  assert.equal(individual.mode, 'preview');
  assert.equal(individual.you, null);
  assert.equal(individual.private, null);
  maxCurrentBytes = Math.max(maxCurrentBytes, Buffer.byteLength(JSON.stringify(individual)));
  assert.ok(maxCurrentBytes <= 14_336);
  assert.ok(!('events' in individual) && !('cursor' in individual));
  acts.add(individual.act);

  if (individual.status !== 'active') break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
} while (Date.now() < successionDeadline);

assert.deepEqual([...acts].sort(), [1, 2]);

assert.equal(individual.status, 'finished');

assert.equal(individual.result.kind, 'individual');

assert.equal(individual.seats.length, 10);

assert.ok(individual.seats.every((seat) => !seat.forfeited));

const successionSocket = await finishSuccessionSocket();

const epoch = individual.history.visibilityEpoch;

const archive = { pages: 0, events: 0, maxPageBytes: 0, maxEventBytes: 0 };

let cursor = 0;

while (cursor < individual.history.streamHead) {
  const page = await request(
    `/api/matches/${succession.matchId}/history?epoch=${epoch}&after=${cursor}&through=${individual.history.streamHead}&limit=64&maxBytes=12288`,
    200,
  );

  assert.equal(page.visibilityEpoch, epoch);
  assert.equal(page.reset, false);
  assert.equal(page.streamHead, individual.history.streamHead);
  assert.equal(page.through, individual.history.streamHead);
  assert.equal(page.after, cursor);
  assert.ok(page.events.length > 0 && page.events.length <= 64);

  for (const event of page.events) {
    assert.equal(event.id, ++cursor);
    archive.maxEventBytes = Math.max(archive.maxEventBytes, Buffer.byteLength(JSON.stringify(event)));
  }

  assert.equal(page.cursor, cursor);
  assert.equal(page.hasMore, cursor < page.through);
  archive.pages++;
  archive.events += page.events.length;
  archive.maxPageBytes = Math.max(archive.maxPageBytes, Buffer.byteLength(JSON.stringify(page)));
  assert.ok(archive.maxPageBytes <= 12_288);
  assert.ok(archive.maxEventBytes <= 8192);
}

const rounds = await request(`/api/matches/${succession.matchId}/rounds?epoch=${epoch}`, 200);

assert.ok(rounds.rounds.length <= 42);

for (const act of [1, 2]) {
  const round = rounds.rounds.find((entry) => entry.act === act);
  assert.ok(round);

  const frame = await request(
    `/api/matches/${succession.matchId}/replay?epoch=${epoch}&through=${round.through}`,
    200,
  );

  assert.equal(frame.act, act);
  assert.equal(frame.archive.act, act);
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 32_768);

  const anchor = await request(
    `/api/matches/${succession.matchId}/history-anchor?epoch=${epoch}&eventKey=${encodeURIComponent(round.eventKey)}`,
    200,
  );

  assert.equal(anchor.visibilityEpoch, epoch);
  assert.equal(anchor.cursor, round.through);
}

const result = {
  at: new Date().toISOString(),
  sourceCommit: process.env.PR_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
  server,
  matches: [
    {
      gameId: 'secret-overlord',
      matchId,
      status: view.status,
      winner: view.winner,
      socket: originalSocket,
    },
    {
      gameId: 'succession',
      matchId: succession.matchId,
      status: individual.status,
      winnerSeat: individual.result.winnerSeat,
      maxCurrentBytes,
      archiveHead: individual.history.streamHead,
      archive,
      rounds: rounds.rounds.length,
      socket: successionSocket,
    },
  ],
};

const output = process.env.SMOKE_OUTPUT ?? '.agent-game/preview-smoke.json';

await mkdir(dirname(output), { recursive: true });

await writeFile(output, JSON.stringify(result, null, 2) + '\n');

console.log(JSON.stringify(result, null, 2));
