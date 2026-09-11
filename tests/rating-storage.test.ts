import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { readFile } from 'node:fs/promises';
import { act, createMatch, decisionId, interruptMatch } from '../src/game/engine';
import { ratingChanges } from '../src/game/rating';
import { finalizeRatings, findAgent, type RepositoryEnv } from '../src/server/repository';

describe('D1 settlement of durable results', () => {
  let env: RepositoryEnv;
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    const platform = await getPlatformProxy<RepositoryEnv>({
      configPath: 'tests/storage.wrangler.jsonc',
      persist: false,
    });

    env = platform.env;
    dispose = platform.dispose;
    const migration = await readFile('migrations/0001_initial.sql', 'utf8');
    await env.DB.batch(
      migration
        .split(/;\s*(?=\n|$)/)
        .map((sql) => sql.trim())
        .filter(Boolean)
        .map((sql) => env.DB.prepare(sql)),
    );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u','Owner','owner@example.test',1,0,0)`,
      ),
      env.DB.prepare(
        `INSERT INTO owners (id,user_id,handle,name,created_at) VALUES ('owner','u','owner','Owner',0)`,
      ),
      env.DB.prepare(
        `INSERT INTO agents (id,owner_id,name,name_key,created_at,placements) VALUES ('external','owner','Contender','contender',0,9)`,
      ),
    ]);
  });
  afterAll(async () => {
    await dispose?.();
  });

  async function winningMatch(id: string) {
    const houses = await env.DB.prepare(
      'SELECT id,name,rating FROM agents WHERE house=1 ORDER BY id LIMIT 9',
    ).all<{ id: string; name: string; rating: number }>();

    const state = createMatch(
      id,
      [
        { agentId: 'external', ownerId: 'owner', name: 'Contender', house: false, rating: 1000 },
        ...houses.results.map((house) => ({
          agentId: house.id,
          ownerId: null,
          name: house.name,
          house: true,
          rating: house.rating,
        })),
      ],
      0,
      { random: (n) => n - 1, mode: 'ranked' },
    );

    state.coordinator = 0;
    state.power = 'execute';
    state.phase.kind = 'executive-action';

    return act(
      state,
      0,
      0,
      {
        actionId: crypto.randomUUID(),
        phaseId: state.phase.id,
        decisionId: decisionId(state, 0),
        action: { type: 'execute', target: 9 },
      },
      1,
    );
  }

  it('applies competing settlement retries exactly once, and unlocks rank on the tenth participation', async () => {
    const state = await winningMatch('ranked-one');
    const expected = ratingChanges(state)[0].delta;
    await Promise.all([
      finalizeRatings(env, state),
      finalizeRatings(env, state),
      finalizeRatings(env, state),
    ]);
    const agent = await findAgent(env, 'external');
    expect(agent).toMatchObject({
      games: 1,
      wins: 1,
      losses: 0,
      placements: 10,
      rank: 1,
      provisional: false,
    });
    expect(agent?.rating).toBeCloseTo(1000 + expected);
    expect(agent?.roles.cooperative).toEqual({ games: 1, wins: 1, losses: 0 });

    const houses = await env.DB.prepare('SELECT sum(games) AS games FROM agents WHERE house=1').first<{
      games: number;
    }>();

    expect(houses?.games).toBe(9);
  });
  it('a forfeiting teammate loses rating, preserves placement count, and records the forfeit', async () => {
    const before = await findAgent(env, 'external');
    const state = await winningMatch('ranked-forfeit');
    state.seats[0].forfeited = true;
    await finalizeRatings(env, state);
    const after = await findAgent(env, 'external');
    expect(after?.rating).toBeLessThan(before!.rating);
    expect(after).toMatchObject({ games: 2, wins: 1, losses: 1, forfeits: 1, placements: 10 });
  });
  it('interrupted and preview records preserve history without adding rating or placement', async () => {
    const before = await findAgent(env, 'external');
    const preview = await winningMatch('preview-one');
    preview.mode = 'preview';
    await finalizeRatings(env, preview);
    const unfinished = await winningMatch('interrupted-one');
    unfinished.phase.kind = 'voting';
    unfinished.winner = null;
    const interrupted = interruptMatch(unfinished, 10, 'Injected platform failure');
    await finalizeRatings(env, interrupted);
    const after = await findAgent(env, 'external');
    expect(after).toEqual(before);

    const records = await env.DB.prepare('SELECT count(*) AS n FROM match_participants WHERE agent_id = ?')
      .bind('external')
      .first<{ n: number }>();

    expect(records?.n).toBe(4);
  });
});
