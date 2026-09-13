import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import type { MatchInitialization } from '../src/server/matchmaking';

import { PlatformQueue as MatchmakingObject } from '../src/server/coordinator';

function harness(legacy = false) {
  const db = new DatabaseSync(':memory:');

  if (legacy)
    db.exec(`
    CREATE TABLE tickets(agent_id TEXT PRIMARY KEY,owner_id TEXT,grant_id TEXT,expires_at INTEGER,request_id TEXT,joined_at INTEGER,state TEXT,match_id TEXT);
    CREATE TABLE joins(id TEXT PRIMARY KEY,match_id TEXT,cancelled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE allocations(id TEXT PRIMARY KEY,state TEXT,entries TEXT,grants TEXT,created_at INTEGER,reservation REAL);
    INSERT INTO tickets VALUES ('old','owner-old','grant-old',9999999999999,'request-old',100,'queued',NULL);
    INSERT INTO joins VALUES ('old:request-old',NULL,0);
    INSERT INTO allocations VALUES ('old-match','active','[]','{"old":"grant-old"}',100,1);
  `);
  const initialized: MatchInitialization[] = [];
  const revoked: { matchId: string; grantId: string }[] = [];
  let beforeRead: (() => void) | undefined;
  let failInitialize = false;
  let alarm = 0;

  const storage = {
    sql: {
      exec(sql: string, ...bindings: (string | number | null)[]) {
        const statement = db.prepare(sql);
        const rows = statement.all(...bindings);

        return {
          toArray: () => rows,
          one: () => {
            if (rows.length !== 1) throw new Error('Expected one row');

            return rows[0];
          },
        };
      },
    },
    transactionSync<T>(callback: () => T) {
      db.exec('SAVEPOINT test_transaction');

      try {
        const value = callback();
        db.exec('RELEASE test_transaction');

        return value;
      } catch (error) {
        db.exec('ROLLBACK TO test_transaction; RELEASE test_transaction');
        throw error;
      }
    },
    async setAlarm(value: number) {
      alarm = value;
    },
  };

  const ctx = {
    storage,
    waitUntil: (promise: Promise<void>) => promise,
    blockConcurrencyWhile: <T>(callback: () => T) => callback(),
  };

  const env = {
    TIME_SCALE: '1',
    QUEUE_WAIT_SECONDS: '30',
    MAX_CONCURRENT_MATCHES: '3',
    HOUSE_PROVIDER: 'openai',
    HOUSE_MODEL: 'test',
    HOUSE_MATCH_RESERVATION_USD: '1',
    HOUSE_SUCCESSION_MATCH_RESERVATION_USD: '1',
    HOUSE_DAILY_BUDGET_USD: '10',
    ENVIRONMENT: 'development',
    DB: {
      prepare(sql: string) {
        let bindings: unknown[] = [];

        return {
          bind(...values: unknown[]) {
            bindings = values;

            return this;
          },
          async first() {
            const callback = beforeRead;
            beforeRead = undefined;
            callback?.();

            if (sql.includes('SELECT g.id') || sql.includes('SELECT id FROM agents'))
              return { id: bindings[0] };
            const id = String(bindings[0]);

            return {
              id,
              owner_id: id.startsWith('house-') ? null : `owner-${id}`,
              owner_handle: 'owner',
              name: id,
              description: '',
              house: id.startsWith('house-') ? 1 : 0,
              retired_at: null,
              rating: sql.includes('agent_game_stats') ? 1000 : 1200,
              games: 0,
              wins: 0,
              losses: 0,
              forfeits: 0,
              placements: 0,
              roles_json: '{}',
              created_at: 0,
              rank: null,
              persona: null,
            };
          },
          async all() {
            return { results: Array.from({ length: 10 }, (_, index) => ({ id: `house-${index}` })) };
          },
        };
      },
    },
    MATCHES: {
      getByName(matchId: string) {
        return {
          async initialize(input: MatchInitialization) {
            initialized.push(structuredClone(input));

            if (failInitialize) throw new Error('injected lost initialize acknowledgement');
          },
          async revokeGrant(grantId: string) {
            revoked.push({ matchId, grantId });
          },
        };
      },
    },
  };

  // The queue consumes a faithful SQLite storage harness; the DO host only forwards RPCs.
  const queue: MatchmakingObject = Reflect.construct(MatchmakingObject, [ctx, env]);

  function ticket(
    agent: string,
    game = 'secret-overlord',
    joined = Date.now() - 31_000,
    owner = `owner-${agent}`,
  ) {
    db.prepare(
      'INSERT INTO tickets(agent_id,owner_id,grant_id,expires_at,request_id,joined_at,state,game_id) VALUES (?,?,?,?,?,?,?,?)',
    ).run(agent, owner, `grant-${agent}`, Date.now() + 60_000, `request-${agent}`, joined, 'queued', game);
    db.prepare('INSERT INTO joins(id,game_id) VALUES (?,?)').run(`${agent}:request-${agent}`, game);
  }

  return {
    db,
    queue,
    env,
    ctx,
    initialized,
    revoked,
    ticket,
    get alarm() {
      return alarm;
    },
    readRace(callback: () => void) {
      beforeRead = callback;
    },
    failInitialization(value: boolean) {
      failInitialize = value;
    },
  };
}

describe('one physical coordinator with game-scoped candidates', () => {
  it('rechecks global capacity after an admission interleaves with entrant reads', async () => {
    const h = harness();
    h.env.MAX_CONCURRENT_MATCHES = '1';
    h.ticket('capacity-race', 'succession');
    h.readRace(() => {
      h.db
        .prepare(
          'INSERT INTO allocations(id,state,entries,grants,created_at,reservation) VALUES (?,?,?,?,?,?)',
        )
        .run('other-admission', 'active', '[]', '{}', Date.now(), 1);
    });
    await h.queue.alarm();
    expect(h.initialized).toHaveLength(0);
    expect(h.queue.status('capacity-race')).toMatchObject({ status: 'queued', capacity: 'busy' });
  });

  it('retains active reservations across UTC midnight while changing only the usage day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-13T23:59:50.000Z'));

    try {
      const h = harness();
      h.env.HOUSE_DAILY_BUDGET_USD = '3';
      h.db
        .prepare(
          'INSERT INTO allocations(id,state,entries,grants,created_at,reservation) VALUES (?,?,?,?,?,?)',
        )
        .run('still-playing', 'active', '[]', '{"external":"grant"}', Date.now(), 2);
      h.db
        .prepare(
          'INSERT INTO usage(id,match_id,day,created_at,expires_at,reserved,done) VALUES (?,?,?,?,?,?,?)',
        )
        .run('old-usage', 'still-playing', '2026-09-13', Date.now(), Date.now() + 30_000, 1, 1);
      h.ticket('midnight', 'succession');
      await h.queue.alarm();
      expect(h.initialized).toHaveLength(0);
      expect(h.alarm).toBe(Date.parse('2026-09-14T00:00:00.000Z'));
      vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
      await h.queue.alarm();
      expect(h.initialized).toHaveLength(1);
      expect(
        h.db.prepare("SELECT sum(reservation) AS total FROM allocations WHERE state!='settled'").get(),
      ).toEqual({ total: 3 });
      expect(h.db.prepare('SELECT count(*) AS n FROM usage').get()).toEqual({ n: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows distinct profiles of one owner in separate games and revokes/retire-checks them globally', async () => {
    const h = harness();
    h.env.MAX_CONCURRENT_MATCHES = '2';
    const joined = Date.now() - 31_000;
    h.ticket('a', 'secret-overlord', joined, 'same-owner');
    h.ticket('b', 'succession', joined, 'same-owner');
    h.ticket('c', 'succession', joined + 1, 'same-owner');
    await h.queue.alarm();
    expect(h.initialized).toHaveLength(2);
    expect(h.initialized.map((input) => input.gameId)).toEqual(['secret-overlord', 'succession']);
    expect(h.initialized.every((input) => Object.keys(input.grants).length === 1)).toBe(true);
    expect(await h.queue.retire('b', 'same-owner')).toMatchObject({
      ok: false,
      error: { code: 'agent-busy', gameId: 'succession' },
    });
    await h.queue.revokeGrant('grant-a');
    await h.queue.revokeGrant('grant-b');
    await h.queue.revokeGrant('grant-c');
    expect(h.revoked).toEqual([
      { matchId: h.initialized[0].id, grantId: 'grant-a' },
      { matchId: h.initialized[1].id, grantId: 'grant-b' },
    ]);
    expect(h.queue.status('c').status).toBe('idle');
  });
  it('additively migrates a populated legacy object and preserves its tickets, receipts and reservation', () => {
    const h = harness(true);
    expect(h.queue.status('old')).toMatchObject({
      status: 'queued',
      gameId: 'secret-overlord',
      joinedAt: 100,
    });
    expect(h.db.prepare('SELECT game_id, snapshot, reservation FROM allocations').get()).toEqual({
      game_id: 'secret-overlord',
      snapshot: null,
      reservation: 1,
    });
    Reflect.construct(MatchmakingObject, [h.ctx, h.env]);
    expect(h.db.prepare('SELECT count(*) AS n FROM joins').get()).toEqual({ n: 1 });
  });

  it('admits a younger affordable game past the older unaffordable candidate, with independent entrants', async () => {
    const h = harness();
    h.env.HOUSE_DAILY_BUDGET_USD = '3';
    h.env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD = '5';
    h.ticket('older', 'succession', Date.now() - 50_000);
    h.ticket('younger', 'secret-overlord');
    await h.queue.alarm();
    expect(h.initialized).toHaveLength(1);
    expect(h.initialized[0]).toMatchObject({
      gameId: 'secret-overlord',
      reservationUsd: 1,
      snapshot: { mode: 'ranked' },
    });
    expect(h.queue.status('older')).toMatchObject({ status: 'queued', capacity: 'budget' });
    expect(h.alarm).toBeGreaterThan(Date.now() + 20_000);
  });

  it('does not combine logical queues; an unready older candidate cannot block a ready table', async () => {
    const h = harness();
    h.env.MAX_CONCURRENT_MATCHES = '1';
    h.ticket('waiting', 'secret-overlord', Date.now() - 1000);

    for (let index = 0; index < 10; index++) h.ticket(`s-${index}`, 'succession', Date.now());
    await h.queue.alarm();
    expect(h.initialized).toHaveLength(1);
    expect(h.initialized[0].gameId).toBe('succession');
    expect(h.initialized[0].entrants).toHaveLength(10);
    expect(
      h.initialized[0].entrants.every(
        (entrant) => entrant.agentId.startsWith('s-') && entrant.rating === 1000,
      ),
    ).toBe(true);
    expect(h.queue.status('waiting').status).toBe('queued');
  });

  it('rechecks cancellation after awaited D1 credential reads before reserving capacity', async () => {
    const h = harness();
    h.ticket('cancelled', 'succession');
    h.readRace(() => {
      h.queue.cancel('cancelled');
    });
    await h.queue.alarm();
    expect(h.initialized).toHaveLength(0);
    expect(h.db.prepare('SELECT count(*) AS n FROM allocations').get()).toEqual({ n: 0 });
  });

  it('persists immutable initialization inputs across lost acknowledgment and configuration changes', async () => {
    const h = harness();
    h.ticket('retry', 'succession');
    h.failInitialization(true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await h.queue.alarm();
    h.env.HOUSE_MODEL = 'changed';
    h.env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD = '9';
    h.env.TIME_SCALE = '0.1';
    h.failInitialization(false);
    await h.queue.alarm();
    error.mockRestore();
    expect(h.initialized).toHaveLength(2);
    expect(h.initialized[1]).toEqual(h.initialized[0]);
    expect(h.queue.status('retry').status).toBe('matched');
    await h.queue.complete(h.initialized[0].id);
    await h.queue.complete(h.initialized[0].id);
    expect(h.queue.status('retry').status).toBe('idle');
  });

  it('rejects cross-game joins globally and conflicts stable join receipts', async () => {
    const h = harness();
    h.ticket('busy', 'succession');

    const principal = {
      agentId: 'busy',
      ownerId: 'owner-busy',
      grantId: 'grant-busy',
      expiresAt: Date.now() + 60_000,
    };

    expect(await h.queue.join(principal, 'other-request', 'secret-overlord')).toMatchObject({
      ok: false,
      error: { code: 'agent-busy' },
    });
    expect(await h.queue.join(principal, 'request-busy', 'secret-overlord')).toMatchObject({
      ok: false,
      error: { code: 'request-id-conflict' },
    });
  });

  it('exact cancellation preserves a newer ticket and truthfully reports an assignment race', async () => {
    const h = harness();
    h.ticket('race', 'succession');
    expect(
      h.queue.cancel('race', 'wrong-grant', { gameId: 'succession', requestId: 'request-race' }),
    ).toMatchObject({ ok: false, error: { code: 'agent-busy' } });
    expect(
      h.queue.cancel('race', 'grant-race', { gameId: 'succession', requestId: 'older-request' }),
    ).toMatchObject({ ok: true, value: { status: 'queued', requestId: 'request-race' } });
    await h.queue.alarm();
    expect(
      h.queue.cancel('race', 'grant-race', { gameId: 'succession', requestId: 'request-race' }),
    ).toMatchObject({
      ok: true,
      value: { status: 'matched', gameId: 'succession', matchId: h.initialized[0].id },
    });
    expect(h.queue.cancel('race', 'grant-race')).toMatchObject({
      ok: false,
      error: { code: 'match-started' },
    });
    h.ticket('queued', 'succession');
    expect(
      h.queue.cancel('queued', 'grant-queued', { gameId: 'succession', requestId: 'request-queued' }),
    ).toMatchObject({ ok: true, value: { status: 'idle', requestId: null } });
  });

  it('preserves required mixed-match budget bypass and the original all-house ceiling', async () => {
    const h = harness();
    const now = Date.now();
    h.db
      .prepare('INSERT INTO allocations(id,state,entries,grants,created_at,reservation) VALUES (?,?,?,?,?,?)')
      .run('mixed', 'active', '[]', '{"external":"grant"}', now, 1);
    h.db
      .prepare('INSERT INTO allocations(id,state,entries,grants,created_at,reservation) VALUES (?,?,?,?,?,?)')
      .run('house', 'active', '[]', '{}', now, 1);
    h.env.HOUSE_DAILY_BUDGET_USD = '0';
    expect(
      h.queue.reserveInference({
        id: 'required',
        matchId: 'mixed',
        estimate: 2,
        deadline: now + 30_000,
        mandatory: true,
      }).allowed,
    ).toBe(true);
    expect(
      h.queue.reserveInference({
        id: 'chat',
        matchId: 'mixed',
        estimate: 0.1,
        deadline: now + 30_000,
        mandatory: false,
      }).allowed,
    ).toBe(false);
    expect(
      h.queue.reserveInference({
        id: 'ceiling',
        matchId: 'house',
        estimate: 2,
        deadline: now + 30_000,
        mandatory: true,
      }).allowed,
    ).toBe(false);
  });
});
