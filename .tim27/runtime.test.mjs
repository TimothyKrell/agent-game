import { DatabaseSync } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { PlatformQueue } from '../src/server/coordinator';

function coordinator() {
  const db = new DatabaseSync(':memory:');

  const ctx = {
    storage: {
      sql: {
        exec(query, ...args) {
          const rows = db.prepare(query).all(...args);

          return { toArray: () => rows, one: () => rows[0] };
        },
      },
      transactionSync(fn) {
        db.exec('BEGIN');

        try {
          const result = fn();
          db.exec('COMMIT');

          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      async setAlarm() {},
    },
    waitUntil: (promise) => promise,
  };

  const queue = new PlatformQueue(ctx, {
    ENVIRONMENT: 'preview',
    HOUSE_PROVIDER: 'workers-ai',
    HOUSE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    TIME_SCALE: '1',
    MAX_CONCURRENT_MATCHES: '3',
    HOUSE_DAILY_BUDGET_USD: '5',
    HOUSE_MATCH_RESERVATION_USD: '1.5',
  });

  function allocation(id, grants = '{}') {
    db.prepare(
      `INSERT INTO allocations(id,state,entries,grants,created_at,reservation)
      VALUES (?,'active','[]',?,?,1.5)`,
    ).run(id, grants, Date.now());
  }

  return { db, queue, allocation };
}

it('measures actual coordinator isolation and all-house versus mixed ceiling scope', async () => {
  const first = coordinator();
  const second = coordinator();

  try {
    for (const arena of [first, second]) {
      for (const id of ['a', 'b', 'c']) {
        expect(arena.queue.status('idle').capacity).toBe('available');
        arena.allocation(id);
      }

      expect(arena.queue.status('idle').capacity).toBe('busy');
    }

    const reserved = [first, second].map(
      (arena) => arena.db.prepare('SELECT sum(reservation) AS total FROM allocations').get().total,
    );

    expect(reserved).toEqual([4.5, 4.5]);

    const request = (id, matchId, estimate, mandatory, optionalKind = 'initial') => ({
      id,
      matchId,
      estimate,
      mandatory,
      optionalKind,
      deadline: Date.now() + 60_000,
    });

    const allHouse = first.queue.reserveInference(request('all-required', 'a', 1.51, true));
    expect(allHouse).toMatchObject({ allowed: false, reason: 'match-budget', retryable: false });
    const optional = first.queue.reserveInference(request('all-optional', 'a', 0.76, false));
    expect(optional).toMatchObject({ allowed: false, reason: 'optional-budget' });
    const followup = first.queue.reserveInference(request('all-followup', 'a', 0.19, false, 'followup'));
    expect(followup).toMatchObject({ allowed: false, reason: 'followup-budget' });
    first.db.prepare('UPDATE allocations SET grants=? WHERE id=?').run('{"agent":"grant"}', 'a');
    const mixed = first.queue.reserveInference(request('mixed-required', 'a', 6, true));
    expect(mixed.allowed).toBe(true);
    first.queue.recordInference('mixed-required', null);
    expect(first.queue.inferenceSummary('a').accountedUsd).toBe(6);
    expect(first.queue.inferenceSummary('a').unknownUsageCalls).toBe(1);
    await writeFile(
      '.tim27/runtime-result.json',
      JSON.stringify(
        {
          runtime: process.version,
          implementation:
            'Unmodified src/server/coordinator.ts, native SQLite storage adapter; no inference or DO host.',
          separateCoordinators: { reservationEach: reserved, aggregateReserved: 9, configuredDailyEach: 5 },
          paidAllHouse: {
            requiredOverMatch: allHouse.reason,
            optionalOverHalf: optional.reason,
            followupOverEighth: followup.reason,
          },
          mixed: { sixDollarRequiredEstimateAllowed: mixed.allowed, unknownAccountedUsd: 6 },
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    first.db.close();
    second.db.close();
  }
});
