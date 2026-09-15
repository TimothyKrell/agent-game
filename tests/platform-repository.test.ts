import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { gameDescriptor } from '../src/game/descriptors';
import {
  agentHistory,
  finalizeRatings,
  findAgent,
  indexMatch,
  listAgents,
  matchList,
  type IndexedMatch,
  type MatchSettlement,
  type RepositoryEnv,
} from '../src/server/repository';
import { applyPlatformMigrations } from './platform-migrations';

describe('platform migration and game-scoped repository', () => {
  let env: RepositoryEnv;
  let dispose: () => Promise<void>;
  let legacyAgents: unknown[];
  let legacyParticipants: unknown[];
  let legacyMatches: { id: string }[];

  beforeAll(async () => {
    const platform = await getPlatformProxy<RepositoryEnv>({
      configPath: 'tests/storage.wrangler.jsonc',
      persist: false,
    });

    env = platform.env;
    dispose = platform.dispose;
    await applyPlatformMigrations(env.DB, ['0001_initial.sql']);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u','Owner','platform@example.test',1,0,0)",
      ),
      env.DB.prepare(
        "INSERT INTO owners (id,user_id,handle,name,created_at) VALUES ('owner','u','owner','Owner',0)",
      ),
      env.DB.prepare(
        "INSERT INTO agents (id,owner_id,name,name_key,created_at,rating,games,wins,losses,placements,roles_json) VALUES ('external','owner','Contender','contender',0,1234,12,8,4,12,'{\"cooperative\":{\"games\":12,\"wins\":8,\"losses\":4}}')",
      ),
      env.DB.prepare(
        "UPDATE agents SET rating=1100,games=3,wins=1,losses=2,placements=3 WHERE id='house-axiom'",
      ),
    ]);

    for (const status of ['finished', 'interrupted', 'active']) {
      await env.DB.prepare(
        `INSERT INTO matches (id,status,mode,created_at,finished_at,house_count,names_json,result_applied,winner) VALUES (?,?,'ranked',1,?,9,'["Contender"]',?,?)`,
      )
        .bind(
          `legacy-${status}`,
          status,
          status === 'active' ? null : 5,
          status === 'active' ? 0 : 1,
          status === 'finished' ? 'cooperative' : null,
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO match_participants (match_id,agent_id,seat,role,won,rating_before,rating_delta) VALUES (?,'external',0,?,?,?,?)",
      )
        .bind(
          `legacy-${status}`,
          status === 'active' ? null : 'cooperative',
          status === 'finished' ? 1 : null,
          1000,
          status === 'finished' ? 32 : null,
        )
        .run();
    }

    legacyAgents = (await env.DB.prepare('SELECT * FROM agents ORDER BY id').all()).results;
    legacyParticipants = (await env.DB.prepare('SELECT * FROM match_participants ORDER BY match_id').all())
      .results;
    legacyMatches = (await env.DB.prepare('SELECT * FROM matches ORDER BY id').all<{ id: string }>()).results;
    await applyPlatformMigrations(env.DB, ['0002_games.sql', '0003_agent_pictures.sql']);
  });
  afterAll(async () => {
    await dispose?.();
  });

  it('uses scoped indexes for live listings, profile history and pool ranking', async () => {
    const queries = [
      {
        sql: "SELECT * FROM matches WHERE game_id='succession' AND status='active' ORDER BY created_at DESC LIMIT 20",
        index: 'matches_game_status_created',
      },
      {
        sql: "SELECT m.* FROM match_participants p JOIN matches m ON m.id=p.match_id WHERE p.agent_id='external' AND m.game_id='succession' ORDER BY m.created_at DESC LIMIT 50",
        index: 'participant_agent',
      },
      {
        sql: "SELECT agent_id FROM agent_game_stats WHERE game_id='succession' AND rating_pool_id='succession-1' AND placements>=10 ORDER BY rating DESC",
        index: 'game_stats_leaderboard',
      },
    ];

    for (const query of queries) {
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all<{ detail: string }>();
      expect(plan.results.some((row) => row.detail.includes(query.index))).toBe(true);
    }
  });

  async function fixture(
    id: string,
    status: IndexedMatch['status'] = 'finished',
    mode: IndexedMatch['snapshot']['mode'] = 'ranked',
  ): Promise<IndexedMatch> {
    const houses = await env.DB.prepare('SELECT id,name FROM agents WHERE house=1 ORDER BY id LIMIT 9').all<{
      id: string;
      name: string;
    }>();

    const participants: IndexedMatch['participants'] = [
      {
        seat: 0,
        entrant: { agentId: 'external', ownerId: 'owner', name: 'Contender', house: false, rating: 1000 },
        role: 'cooperative',
      },
      ...houses.results.map((house, i) => ({
        seat: i + 1,
        entrant: { agentId: house.id, ownerId: null, name: house.name, house: true, rating: 1000 },
      })),
    ];

    const result: IndexedMatch['result'] =
      status === 'finished'
        ? {
            kind: 'individual',
            winnerSeat: 0,
            reason: 'last-survivor',
            act1: { team: 'cooperative', reason: 'safeguards' },
            tieBreak: null,
          }
        : null;

    const finishedAt = status === 'active' ? null : 100;

    return {
      id,
      snapshot: {
        ...gameDescriptor('succession'),
        mode,
        houseModel: { provider: 'test', model: 'test', policyVersion: 'succession-1' },
      },
      createdAt: 10,
      finishedAt,
      status,
      round: 2,
      houseCount: 9,
      result,
      participants,
      summary: {
        gameId: 'succession',
        id,
        status,
        mode,
        round: 2,
        act: status === 'active' ? 1 : 2,
        createdAt: 10,
        finishedAt,
        houseCount: 9,
        names: participants.map((p) => p.entrant.name),
        result,
        act1Winner: 'cooperative',
        livingCount: status === 'finished' ? 1 : 10,
        winReason: result?.reason ?? null,
      },
    };
  }

  function settlement(state: IndexedMatch, forfeitedSeat?: number): MatchSettlement {
    return {
      gameId: 'succession',
      ratingPoolId: 'succession-1',
      ratingVersion: 'winner-softmax-1',
      mode: state.snapshot.mode,
      result: state.result,
      participants: state.participants.map(({ seat, entrant }) => ({
        seat,
        entrant,
        forfeited: seat === forfeitedSeat,
        won:
          state.status === 'interrupted' ? null : seat === state.result?.winnerSeat && seat !== forfeitedSeat,
        ratingBefore: entrant.rating,
        ratingDelta: state.status === 'finished' ? (seat === 0 && seat !== forfeitedSeat ? 28.8 : -3.2) : 0,
        placement: state.status === 'finished' && state.snapshot.mode === 'ranked' && seat !== forfeitedSeat,
      })),
    };
  }

  async function row(id: string) {
    return env.DB.prepare('SELECT * FROM matches WHERE id=?').bind(id).first();
  }

  it('preserves nonempty legacy standings, participants and all lifecycle rows', async () => {
    expect((await env.DB.prepare('SELECT * FROM agents ORDER BY id').all()).results).toEqual(legacyAgents);

    const participants = (await env.DB.prepare('SELECT * FROM match_participants ORDER BY match_id').all())
      .results;

    participants.forEach((participant, i) => expect(participant).toMatchObject(legacyParticipants[i]!));

    for (const previous of legacyMatches)
      expect(await row(String(previous.id))).toMatchObject({
        ...previous,
        rating_version: 'team-elo-1',
        game_id: 'secret-overlord',
        rules_version: 'secret-overlord-1',
        rating_pool_id: 'secret-overlord-1',
        source_revision: 0,
      });
    expect(await findAgent(env, 'external')).toMatchObject({ rating: 1234, games: 12, wins: 8, rank: 1 });
    expect((await matchList(env, true)).map((m) => m.id)).toEqual(['legacy-active']);
    expect(await matchList(env, false)).toHaveLength(2);
    expect(await agentHistory(env, 'external')).toHaveLength(3);
    expect(await matchList(env, false, 20, 'succession')).toEqual([]);
  });

  it('starts existing external and house agents at zero in Succession', async () => {
    for (const id of ['external', 'house-axiom'])
      expect(await findAgent(env, id, 'succession')).toMatchObject({
        rating: 1000,
        games: 0,
        wins: 0,
        losses: 0,
        placements: 0,
        rank: null,
        provisional: true,
        roles: {},
      });
    expect(await listAgents(env, { house: true, gameId: 'succession' })).toHaveLength(10);
  });

  it('does not release Act 1 participant results or count an active match', async () => {
    const state = await fixture('act-one', 'active');
    await finalizeRatings(env, state, 1);
    expect(await row(state.id)).toMatchObject({ status: 'active', result_applied: 0 });

    const participants = (
      await env.DB.prepare(
        'SELECT role,won,rating_delta,result_json,act1_json FROM match_participants WHERE match_id=?',
      )
        .bind(state.id)
        .all()
    ).results;

    expect(participants).toHaveLength(10);
    participants.forEach((p) =>
      expect(p).toEqual({ role: null, won: null, rating_delta: null, result_json: null, act1_json: null }),
    );
    expect(await findAgent(env, 'external', 'succession')).toMatchObject({ games: 0, placements: 0 });
    expect((await agentHistory(env, 'external', 'succession'))[0]).toMatchObject({
      role: null,
      won: null,
      delta: null,
    });
  });

  it('settles concurrent retries once, unlocks rank at ten, and isolates legacy standings', async () => {
    await env.DB.prepare(
      "INSERT INTO agent_game_stats (agent_id,game_id,rating_pool_id,placements) VALUES ('external','succession','succession-1',9)",
    ).run();
    expect(await findAgent(env, 'external', 'succession')).toMatchObject({
      placements: 9,
      rank: null,
      provisional: true,
    });
    const state = await fixture('concurrent');
    await Promise.all(Array.from({ length: 5 }, () => finalizeRatings(env, state, 10, settlement(state))));
    await finalizeRatings(env, state, 10, settlement(state));
    expect(await findAgent(env, 'external', 'succession')).toMatchObject({
      rating: 1028.8,
      games: 1,
      wins: 1,
      losses: 0,
      placements: 10,
      rank: 1,
      provisional: false,
    });

    const totals = await env.DB.prepare(
      "SELECT sum(games) games,sum(wins) wins,sum(rating-1000) delta FROM agent_game_stats WHERE game_id='succession'",
    ).first<{ games: number; wins: number; delta: number }>();

    expect(totals).toMatchObject({ games: 10, wins: 1 });
    expect(totals?.delta).toBeCloseTo(0);
    expect((await env.DB.prepare('SELECT * FROM agents ORDER BY id').all()).results).toEqual(legacyAgents);
    expect(await row(state.id)).toMatchObject({ result_applied: 1 });
    expect((await agentHistory(env, 'external', 'succession')).find((m) => m.id === state.id)).toMatchObject({
      won: true,
      delta: 28.8,
    });
  });

  it('records a forfeited champion as winning seat with zero credited wins', async () => {
    const state = await fixture('forfeit');
    await Promise.all([
      finalizeRatings(env, state, 5, settlement(state, 0)),
      finalizeRatings(env, state, 5, settlement(state, 0)),
    ]);
    expect(await findAgent(env, 'external', 'succession')).toMatchObject({
      games: 2,
      wins: 1,
      losses: 1,
      forfeits: 1,
      placements: 10,
    });

    const participants = (
      await env.DB.prepare(
        'SELECT won,forfeited,result_json,rating_delta FROM match_participants WHERE match_id=? ORDER BY seat',
      )
        .bind(state.id)
        .all()
    ).results;

    expect(participants.reduce((sum, p) => sum + Number(p.won), 0)).toBe(0);
    expect(participants[0]).toMatchObject({ won: 0, forfeited: 1, rating_delta: -3.2 });
    expect(JSON.parse(String(participants[0]!.result_json))).toEqual({
      winningSeat: true,
      creditedWin: false,
    });
  });

  it('keeps preview and interrupted history without rating or placements', async () => {
    const before = (await env.DB.prepare('SELECT * FROM agent_game_stats ORDER BY agent_id').all()).results;

    for (const state of [
      await fixture('preview', 'finished', 'preview'),
      await fixture('interrupted', 'interrupted'),
    ]) {
      await finalizeRatings(env, state, 7, settlement(state));
      expect(await row(state.id)).toMatchObject({ result_applied: 1 });
      expect(
        (await agentHistory(env, 'external', 'succession')).find((m) => m.id === state.id),
      ).toMatchObject({ delta: null, won: state.status === 'interrupted' ? null : true });
    }

    expect((await env.DB.prepare('SELECT * FROM agent_game_stats ORDER BY agent_id').all()).results).toEqual(
      before,
    );
  });

  it('rolls back every settlement write on a late failure and permits a clean retry', async () => {
    const state = await fixture('rollback');
    await indexMatch(env, state, 10);
    const before = (await env.DB.prepare('SELECT * FROM agent_game_stats ORDER BY agent_id').all()).results;
    await env.DB.prepare(
      `CREATE TRIGGER injected_settlement_failure BEFORE UPDATE ON match_participants
      WHEN NEW.match_id='rollback' AND NEW.seat=9
      BEGIN SELECT RAISE(ABORT, 'injected-settlement-failure'); END`,
    ).run();

    try {
      await expect(finalizeRatings(env, state, 10, settlement(state))).rejects.toThrow(
        'injected-settlement-failure',
      );
      expect(
        (await env.DB.prepare('SELECT * FROM agent_game_stats ORDER BY agent_id').all()).results,
      ).toEqual(before);
      expect(await row(state.id)).toMatchObject({ result_applied: 0, settlement_fingerprint: null });

      const participants = (
        await env.DB.prepare('SELECT won,rating_delta,result_json FROM match_participants WHERE match_id=?')
          .bind(state.id)
          .all()
      ).results;

      expect(participants).toHaveLength(10);
      participants.forEach((p) => expect(p).toEqual({ won: null, rating_delta: null, result_json: null }));
    } finally {
      await env.DB.prepare('DROP TRIGGER injected_settlement_failure').run();
    }

    await finalizeRatings(env, state, 10, settlement(state));
    expect(await row(state.id)).toMatchObject({ result_applied: 1 });
  });

  it('rejects a competing credit decision without mixing either settlement', async () => {
    const state = await fixture('competing-credit');
    const before = await findAgent(env, 'external', 'succession');
    const credits = [settlement(state), settlement(state, 0)];

    const attempts = await Promise.allSettled(
      credits.map((credit) => finalizeRatings(env, state, 10, credit)),
    );

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const winner = attempts.findIndex((attempt) => attempt.status === 'fulfilled');
    const creditedWin = winner === 0;
    const after = await findAgent(env, 'external', 'succession');
    expect(after?.games).toBe(before!.games + 1);
    expect(after?.wins).toBe(before!.wins + Number(creditedWin));
    expect(after?.forfeits).toBe(before!.forfeits + Number(!creditedWin));
    expect(after?.rating).toBeCloseTo(before!.rating + (creditedWin ? 28.8 : -3.2));

    const stored = await env.DB.prepare(
      'SELECT won,forfeited,rating_delta FROM match_participants WHERE match_id=? AND seat=0',
    )
      .bind(state.id)
      .first();

    expect(stored).toEqual({
      won: Number(creditedWin),
      forfeited: Number(!creditedWin),
      rating_delta: creditedWin ? 28.8 : -3.2,
    });
    await finalizeRatings(env, state, 10, credits[winner]);
    expect(await findAgent(env, 'external', 'succession')).toEqual(after);
  });

  it('atomically rejects concurrent initial snapshot and same-revision public conflicts', async () => {
    for (const kind of ['identity', 'public']) {
      const first = await fixture(`race-${kind}`, 'active');
      const second = structuredClone(first);

      if (kind === 'identity') second.snapshot.houseModel.model = 'conflicting-model';
      else {
        second.round = 3;
        second.summary.round = 3;
      }

      const attempts = await Promise.allSettled([indexMatch(env, first, 1), indexMatch(env, second, 1)]);
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
      const accepted = attempts[0]!.status === 'fulfilled' ? first : second;
      expect(await row(first.id)).toMatchObject({
        round: accepted.round,
        model: JSON.stringify(accepted.snapshot.houseModel),
        source_revision: 1,
      });
      expect(
        await env.DB.prepare('SELECT count(*) n FROM match_participants WHERE match_id=?')
          .bind(first.id)
          .first(),
      ).toEqual({ n: 10 });
    }
  });

  it('fences revisions, immutable snapshots, public fingerprints and terminal state', async () => {
    const active = await fixture('revisions', 'active');
    await expect(indexMatch(env, active)).rejects.toMatchObject({ code: 'integrity-error' });
    await indexMatch(env, active, 2);
    const initial = await row(active.id);
    await indexMatch(env, active, 2);
    expect(await row(active.id)).toEqual(initial);
    const changed = structuredClone(active);
    changed.round = 3;
    changed.summary.round = 3;
    await expect(indexMatch(env, changed, 2)).rejects.toMatchObject({ code: 'integrity-error' });
    await indexMatch(env, changed, 1);
    expect(await row(active.id)).toEqual(initial);
    await indexMatch(env, changed, 3);
    expect(await row(active.id)).toMatchObject({ round: 3, source_revision: 3 });
    const conflict = structuredClone(changed);
    conflict.snapshot.houseModel.model = 'different';
    await expect(indexMatch(env, conflict, 4)).rejects.toMatchObject({ code: 'integrity-error' });
    const participantConflict = structuredClone(changed);
    participantConflict.participants[0]!.entrant.rating = 1100;
    await expect(indexMatch(env, participantConflict, 4)).rejects.toMatchObject({ code: 'integrity-error' });
    const finished = await fixture(active.id);
    await finalizeRatings(env, finished, 4, settlement(finished));
    const terminal = await row(active.id);
    await indexMatch(env, active, 5);
    expect(await row(active.id)).toEqual(terminal);
    await indexMatch(env, finished, 6);
    expect(await row(active.id)).toMatchObject({ source_revision: 6, status: 'finished', result_applied: 1 });
    await expect(indexMatch(env, await fixture(active.id, 'interrupted'), 7)).rejects.toMatchObject({
      code: 'integrity-error',
    });
    await expect(
      env.DB.prepare('UPDATE matches SET result_applied=0 WHERE id=?').bind(active.id).run(),
    ).rejects.toThrow('match-terminal-integrity');
  });
});
