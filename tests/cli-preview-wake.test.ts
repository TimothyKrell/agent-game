import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { Schema } from 'effect';
import { GameClient } from '../cli/agent-game.mjs';

function gate() {
  let release = () => {};

  const promise = new Promise<void>((done) => {
    release = done;
  });

  return { promise, release };
}

async function wakeFixture(protocolVersion: '1' | '2') {
  const held = [gate(), gate()];
  const arrived = [gate(), gate()];
  const state = { reads: 0, activeReads: 0, maxReads: 0, holdThird: false, required: false, revoked: false };
  let socket: Duplex | undefined;
  const failures: Error[] = [];

  const before = {
    protocolVersion,
    gameId: protocolVersion === '2' ? 'succession' : 'secret-overlord',
    matchId: 'match_public_wake',
    rulesVersion: protocolVersion === '2' ? 'succession-1' : 'secret-overlord-1',
    status: 'active',
    cursor: 0,
    phase: { id: 'old', kind: 'discussion' },
    history: { visibilityEpoch: 'live', streamHead: 0 },
    decision: null,
  };

  const wake = (count = 1) => {
    // This public payload is deliberately not entitled state; only HTTP may return the decision.
    const text = Buffer.from('{"decision":{"id":"forged-public-decision"}}');

    for (let index = 0; index < count; index++)
      socket!.write(Buffer.concat([Buffer.from([0x81, text.length]), text]));
  };

  const server = createServer(async (request, response) => {
    try {
      expect(request.headers.authorization).toBe('Bearer target-local-fixture');
      expect(request.headers['x-agent-game-protocols']).toBe('1,2,3');
      expect(request.url).toBe('/api/matches/match_public_wake?after=0');
      state.reads++;
      state.activeReads++;
      state.maxReads = Math.max(state.maxReads, state.activeReads);
      const number = state.reads;
      const status = state.revoked ? 401 : 200;

      const snapshot = state.required
        ? {
            ...before,
            cursor: 1,
            phase: { id: 'new', kind: 'required-action' },
            history: { visibilityEpoch: 'live', streamHead: 1 },
            decision: { id: 'entitled-required-decision', deadline: Date.now() + 250 },
          }
        : before;

      if (number === 2 || (number === 3 && state.holdThird)) {
        arrived[number - 2].release();
        await held[number - 2].promise;
      }

      state.activeReads--;
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          status === 401
            ? { error: { code: 'preview-revoked', message: 'Fixture authority ended.' } }
            : snapshot,
        ),
      );
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
      response.destroy();
    }
  });

  server.on('upgrade', (request, raw) => {
    try {
      expect(request.headers.authorization).toBeUndefined();
      expect(new URL(request.url!, 'http://localhost').searchParams.has('ticket')).toBe(false);

      const accept = createHash('sha1')
        .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');

      socket = raw;
      raw.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      wake();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
      raw.destroy();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());

  const client = new GameClient(`http://127.0.0.1:${port}`, 'target-local-fixture', {
    eventAuthorization: 'public-wakeup',
  });

  return {
    state,
    held,
    arrived,
    wake,
    client,
    close: async () => {
      for (const item of held) item.release();
      socket?.destroy();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      expect(failures).toEqual([]);
    },
  };
}

for (const protocol of ['1', '2'] satisfies ('1' | '2')[]) {
  it.each(['decision', 'revocation'])(
    'drains a protocol-' + protocol + ' wake received during a stale read before the %s deadline',
    async (kind) => {
      const f = await wakeFixture(protocol);

      const waiting = f.client.wait('match_public_wake', 0, 1200).then(
        (view) => ({ decision: view.decision?.id, status: 200 }),
        (error) => ({ decision: undefined, status: error.status }),
      );

      try {
        await f.arrived[0].promise;
        f.state.required = kind === 'decision';
        f.state.revoked = kind === 'revocation';
        f.wake(20);
        await sleep(50);
        f.held[0].release();
        const result = await Promise.race([waiting, sleep(250).then(() => null)]);
        expect(result).toEqual({
          decision: kind === 'decision' ? 'entitled-required-decision' : undefined,
          status: kind === 'decision' ? 200 : 401,
        });
        expect(f.state.reads).toBe(3);
        expect(f.state.maxReads).toBe(1);
      } finally {
        await waiting;
        await f.close();
      }
    },
  );

  it('coalesces later protocol-' + protocol + ' wake bursts without waiting for a quiet table', async () => {
    const f = await wakeFixture(protocol);
    f.state.holdThird = true;
    const waiting = f.client.wait('match_public_wake', 0, 1200);

    try {
      await f.arrived[0].promise;
      f.wake(20);
      await sleep(50);
      f.held[0].release();
      expect(await Promise.race([f.arrived[1].promise.then(() => true), sleep(250).then(() => false)])).toBe(
        true,
      );
      f.state.required = true;
      f.wake(20);
      await sleep(50);
      f.held[1].release();
      const result = await Promise.race([waiting, sleep(250).then(() => null)]);
      expect(result?.decision?.id).toBe('entitled-required-decision');
      expect(f.state.reads).toBe(4);
      expect(f.state.maxReads).toBe(1);
    } finally {
      f.held[1].release();
      await waiting;
      await f.close();
    }
  });

  it('bounds protocol-' + protocol + ' wait termination and never overlaps a timeout read', async () => {
    const f = await wakeFixture(protocol);
    const started = Date.now();
    const waiting = f.client.wait('match_public_wake', 0, 200);

    try {
      await f.arrived[0].promise;
      await waiting;
      expect(Date.now() - started).toBeLessThan(500);
      expect(f.state.reads).toBe(2);
      expect(f.state.maxReads).toBe(1);
    } finally {
      await f.close();
    }
  });
}
