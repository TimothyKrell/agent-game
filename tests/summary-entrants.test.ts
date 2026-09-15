import { Schema } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { matchList, type RepositoryEnv } from '../src/server/repository';
import { GameMatchSummarySchema } from '../src/shared/api';
import { applyPlatformMigrations } from './platform-migrations';
import { seedSummaryEntrants, summaryAgentIds, summaryFixture } from './fixtures/summary-entrants';

function measured(env: RepositoryEnv) {
  const queries: string[] = [];

  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'prepare')
        return (sql: string) => {
          queries.push(sql);

          return target.prepare(sql);
        };

      throw new Error(`Unexpected repository database method: ${String(property)}`);
    },
  });

  return { env: { ...env, DB: db }, queries };
}

describe('original summary entrants through real D1', () => {
  let env: RepositoryEnv;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const platform = await getPlatformProxy<RepositoryEnv>({
      configPath: 'tests/storage.wrangler.jsonc',
      persist: false,
    });

    env = platform.env;
    dispose = platform.dispose;
    await applyPlatformMigrations(env.DB);
    await seedSummaryEntrants(env.DB, 55);
  }, 60_000);
  afterAll(async () => {
    await dispose?.();
  });

  for (const gameId of ['secret-overlord', 'succession'] as const) {
    it(`${gameId} hydrates original archived identities and public names with one bounded page query`, async () => {
      const before = await env.DB.prepare('SELECT * FROM match_participants ORDER BY match_id,seat').all();
      const matchesBefore = await env.DB.prepare('SELECT * FROM matches ORDER BY id').all();
      const run = measured(env);
      const summaries = await matchList(run.env, true, 5000, gameId);
      const sql = run.queries;
      expect(summaries).toHaveLength(50);
      expect(sql).toHaveLength(2);
      expect(sql[1].match(/\?/g)).toHaveLength(50);
      expect(sql[1]).not.toMatch(/role|won|forfeited|json|JOIN agents/i);
      expect(summaries.at(-1)?.id).toBe(summaryFixture(gameId, 49).id);

      for (const [index, match] of summaries.entries()) {
        const decoded = Schema.decodeUnknownSync(GameMatchSummarySchema)(match);
        expect(decoded.entrants).toEqual(
          summaryAgentIds(index % 2).map((agentId, number) => ({
            agentId,
            number,
            name: match.names[number],
          })),
        );
        expect(match.entrants?.flatMap(Object.keys).sort()).toEqual(
          Array.from({ length: 10 }, () => ['agentId', 'name', 'number'])
            .flat()
            .sort(),
        );
      }

      expect(
        (await env.DB.prepare('SELECT * FROM match_participants ORDER BY match_id,seat').all()).results,
      ).toEqual(before.results);
      expect((await env.DB.prepare('SELECT * FROM matches ORDER BY id').all()).results).toEqual(
        matchesBefore.results,
      );
    });
  }

  it('handles zero, fractional, nonfinite and empty pages without unbounded or unnecessary participant queries', async () => {
    const run = measured(env);
    expect(await matchList(run.env, true, 0)).toEqual([]);
    expect(await matchList(run.env, true, -10)).toEqual([]);
    expect(run.queries).toHaveLength(0);
    expect(await matchList(run.env, false, 20)).toEqual([]);
    expect(run.queries).toHaveLength(1);
    run.queries.length = 0;
    expect(await matchList(run.env, true, 1.9)).toHaveLength(1);
    expect(run.queries).toHaveLength(2);
    expect(run.queries[1].match(/\?/g)).toHaveLength(1);
    expect(await matchList(env, true, NaN)).toHaveLength(20);
    expect(await matchList(env, true, Infinity)).toHaveLength(20);
  });

  it('omits missing or ambiguous seats and never shifts names into the wrong participant slot', async () => {
    const id = summaryFixture('secret-overlord', 0).id;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM match_participants WHERE match_id=? AND seat=3').bind(id),
      env.DB.prepare('INSERT INTO match_participants (match_id,agent_id,seat) VALUES (?, ?, 4)').bind(
        id,
        'house-axiom',
      ),
      env.DB.prepare('UPDATE match_participants SET seat=11 WHERE match_id=? AND seat=9').bind(id),
    ]);
    const [match] = await matchList(env, true, 1);
    expect(match.entrants?.map((entrant) => entrant.number)).toEqual([0, 1, 2, 5, 6, 7, 8]);
    expect(match.entrants?.find((entrant) => entrant.number === 5)).toEqual({
      number: 5,
      agentId: summaryAgentIds(0)[5],
      name: 'Historical entrant 5',
    });
    await env.DB.prepare('DELETE FROM match_participants WHERE match_id=?').bind(id).run();
    expect((await matchList(env, true, 1))[0].entrants).toEqual([]);
  });
});

describe('additive summary codec compatibility', () => {
  for (const gameId of ['secret-overlord', 'succession'] as const) {
    it(`${gameId} accepts old omitted fields while enforcing ten seats numbered 0–9`, () => {
      const summary = summaryFixture(gameId, 0);
      const decode = Schema.decodeUnknownSync(GameMatchSummarySchema);
      expect(decode(summary).entrants).toBeUndefined();
      expect(decode({ ...summary, entrants: [] }).entrants).toEqual([]);

      for (const number of [-1, 10, 1.5])
        expect(() =>
          decode({ ...summary, entrants: [{ number, name: 'Past', agentId: 'original' }] }),
        ).toThrow();
      expect(() =>
        decode({
          ...summary,
          entrants: Array.from({ length: 11 }, () => ({ number: 0, name: 'Past', agentId: 'original' })),
        }),
      ).toThrow();
      expect(
        decode({
          ...summary,
          entrants: [
            { number: 0, name: 'Past', agentId: 'original', role: 'overlord', won: true, cards: ['private'] },
          ],
        }).entrants,
      ).toEqual([{ number: 0, name: 'Past', agentId: 'original' }]);
    });
  }
});
