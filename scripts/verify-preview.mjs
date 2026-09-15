import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { waitForDeployment } from './deployment-ready.mjs';
import { recordPreviewFailure } from './preview-failure.ts';
import {
  PreviewSmokeInvalid,
  observeSmoke,
  smokeJson,
  smokeResponse,
  SmokeHealth,
  SmokeIsolation,
  SmokeBootstrap,
  SmokeAssignment,
  SmokeObservation,
  SmokeFinished,
  SmokeSuccession,
  SmokeIndividualResult,
  SmokeSocketPacket,
  SmokeSocketResult,
  SmokeActs,
  SmokeHistory,
  SmokeRounds,
  SmokeReplay,
  SmokeAnchor,
} from './preview-smoke-observation.ts';

const sockets = new Set();

async function main() {
  const server = new URL(process.argv[2]).origin;

  if (new URL(server).protocol !== 'https:') throw new Error('Preview smoke requires an HTTPS target');
  await waitForDeployment(server);
  const socketChecks = [];

  async function request(path, status, schema, body, verify) {
    for (const check of socketChecks) check();

    const response = await fetch(server + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin: server, 'content-type': 'application/json', 'X-Agent-Game-Protocols': '1,2' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await smokeResponse(response, status, schema, verify);

    for (const check of socketChecks) check();

    return data;
  }

  function watchMatch(matchId, protocol) {
    const socket = new WebSocket(
      `${server.replace(/^http/, 'ws')}/api/matches/${matchId}/events?protocol=${protocol}`,
    );

    sockets.add(socket);
    const metrics = { packets: 0, maxBytes: 0, acts: new Set() };
    let failure;
    socketChecks.push(() => {
      if (failure) throw failure;
    });

    const terminal = new Promise((resolve) => {
      socket.addEventListener('error', () => {
        failure = new Error('Spectator socket failed');
        resolve({ error: failure });
      });
      socket.addEventListener('message', (message) => {
        try {
          const packet = smokeJson(SmokeSocketPacket(protocol), message.data, (value) => {
            assert.equal(value.type, 'observation');
            assert.equal(value.observation.protocolVersion, protocol);
            assert.equal(value.observation.you, null);
            assert.equal(value.observation.private, null);

            if (protocol === '2') assert.ok(Buffer.byteLength(message.data) <= 16_384);
          });

          const current = packet.observation;
          metrics.packets++;
          metrics.maxBytes = Math.max(metrics.maxBytes, Buffer.byteLength(message.data));

          if (protocol === '2') metrics.acts.add(current.act);

          if (current.status !== 'active') resolve({ status: current.status });
        } catch (error) {
          failure = error;
          resolve({ error });
        }
      });
    });

    return async () => {
      let timer;

      try {
        const result = await Promise.race([
          terminal,
          new Promise((resolve) => {
            timer = setTimeout(() => resolve({ error: new Error('No terminal socket frame') }), 15_000);
          }),
        ]);

        if (result.error) throw result.error;
        observeSmoke(
          SmokeSocketResult,
          { ...metrics, status: result.status, acts: [...metrics.acts] },
          (value) => {
            assert.equal(value.status, 'finished');
            assert.ok(value.packets > 0);

            if (protocol === '2') assert.deepEqual(value.acts.sort(), [1, 2]);
          },
        );

        return { ...metrics, acts: [...metrics.acts] };
      } finally {
        clearTimeout(timer);
        socket.close();
        sockets.delete(socket);
      }
    };
  }

  await request('/api/health', 200, SmokeHealth, undefined, (health) => {
    assert.equal(health.ok, true);
    assert.equal(health.protocolVersion, '1');
  });
  await request('/api/bootstrap', 200, SmokeBootstrap, undefined, (bootstrap) => {
    assert.equal(bootstrap.mode, 'preview');
    assert.equal(bootstrap.localLogin, false);
    assert.equal(bootstrap.houseAvailable, true);
    assert.deepEqual(bootstrap.authProviders, []);
  });

  // Unexpected HTTP statuses/JSON on isolation probes are unavailable, not
  // affirmative typed target observations that can authorize retirement.
  const isolation = async (path, status, body) =>
    smokeResponse(
      await fetch(server + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { origin: server, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }),
      status,
      SmokeIsolation,
    );

  await isolation('/api/dev/login', 404, { name: 'Preview isolation probe' });
  await isolation('/api/owner', 401);

  const { matchId } = await request('/api/dev/exhibition', 200, SmokeAssignment, {});
  const finishOriginalSocket = watchMatch(matchId, '1');
  const deadline = Date.now() + 180_000;
  let view;

  do {
    view = await request(`/api/matches/${matchId}`, 200, SmokeObservation, undefined, (current) => {
      assert.equal(current.mode, 'preview');
      assert.equal(current.you, null);
      assert.equal(current.private, null);
    });

    if (view.status !== 'active') break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (Date.now() < deadline);

  observeSmoke(SmokeObservation, view, (current) => {
    assert.equal(current.status, 'finished', current.winReason ?? 'Scripted preview must complete');
  });
  observeSmoke(SmokeFinished, view, (current) => {
    assert.equal(current.seats.length, 10);
    assert.ok(current.seats.every((seat) => seat.role && !seat.forfeited));
    assert.ok(current.reveal);
  });
  const originalSocket = await finishOriginalSocket();

  const succession = await request('/api/dev/exhibition', 200, SmokeAssignment, { gameId: 'succession' });
  const finishSuccessionSocket = watchMatch(succession.matchId, '2');
  const successionDeadline = Date.now() + 300_000;
  const acts = new Set();
  let maxCurrentBytes = 0;
  let individual;

  do {
    individual = await request(
      `/api/matches/${succession.matchId}`,
      200,
      SmokeSuccession,
      undefined,
      (current) => {
        assert.equal(current.protocolVersion, '2');
        assert.equal(current.gameId, 'succession');
        assert.equal(current.mode, 'preview');
        assert.equal(current.you, null);
        assert.equal(current.private, null);
        assert.ok(Buffer.byteLength(JSON.stringify(current)) <= 14_336);
        assert.ok(!('events' in current) && !('cursor' in current));
      },
    );
    maxCurrentBytes = Math.max(maxCurrentBytes, Buffer.byteLength(JSON.stringify(individual)));
    acts.add(individual.act);

    if (individual.status !== 'active') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (Date.now() < successionDeadline);

  observeSmoke(SmokeActs, [...acts].sort(), (value) => assert.deepEqual(value, [1, 2]));
  observeSmoke(SmokeSuccession, individual, (current) => {
    assert.equal(current.status, 'finished');
    assert.equal(current.result?.kind, 'individual');
    assert.equal(current.seats.length, 10);
    assert.ok(current.seats.every((seat) => !seat.forfeited));
  });
  observeSmoke(SmokeIndividualResult, individual.result);
  const successionSocket = await finishSuccessionSocket();
  const epoch = individual.history.visibilityEpoch;
  const archive = { pages: 0, events: 0, maxPageBytes: 0, maxEventBytes: 0 };
  let cursor = 0;

  while (cursor < individual.history.streamHead) {
    const page = await request(
      `/api/matches/${succession.matchId}/history?epoch=${epoch}&after=${cursor}&through=${individual.history.streamHead}&limit=64&maxBytes=12288`,
      200,
      SmokeHistory,
    );

    observeSmoke(SmokeHistory, page, (page) => {
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
      assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 12_288);
      assert.ok(archive.maxEventBytes <= 8192);
    });
    archive.pages++;
    archive.events += page.events.length;
    archive.maxPageBytes = Math.max(archive.maxPageBytes, Buffer.byteLength(JSON.stringify(page)));
  }

  const rounds = await request(
    `/api/matches/${succession.matchId}/rounds?epoch=${epoch}`,
    200,
    SmokeRounds,
    undefined,
    (value) => {
      assert.ok(value.rounds.length <= 42);
      assert.ok([1, 2].every((act) => value.rounds.some((entry) => entry.act === act)));
    },
  );

  for (const act of [1, 2]) {
    const round = rounds.rounds.find((entry) => entry.act === act);
    await request(
      `/api/matches/${succession.matchId}/replay?epoch=${epoch}&through=${round.through}`,
      200,
      SmokeReplay,
      undefined,
      (frame) => {
        assert.equal(frame.act, act);
        assert.equal(frame.archive?.act, act);
        assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 32_768);
      },
    );
    await request(
      `/api/matches/${succession.matchId}/history-anchor?epoch=${epoch}&eventKey=${encodeURIComponent(round.eventKey)}`,
      200,
      SmokeAnchor,
      undefined,
      (anchor) => {
        assert.equal(anchor.visibilityEpoch, epoch);
        assert.equal(anchor.cursor, round.through);
      },
    );
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
}

try {
  await main();
} catch (error) {
  if (error instanceof PreviewSmokeInvalid) await recordPreviewFailure('smoke-invalid', process.env);
  throw error;
} finally {
  for (const socket of sockets) socket.close();
}
