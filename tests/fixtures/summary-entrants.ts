import type { GameId } from '../../src/game/contracts';
import type { GameMatchSummary } from '../../src/shared/api';

export const summaryAgentIds = (group: number) =>
  Array.from({ length: 10 }, (_, seat) => `summary-original-${group}-${seat}`);

export function summaryFixture(gameId: GameId, index: number, active = true): GameMatchSummary {
  const common = {
    id: `match_summary-${gameId}-${String(index).padStart(3, '0')}`,
    status: active ? 'active' : 'finished',
    mode: 'ranked',
    round: 2,
    createdAt: 1_789_250_000_000 - index * 1000,
    finishedAt: active ? null : 1_789_250_060_000,
    houseCount: 0,
    names: Array.from({ length: 10 }, (_, seat) =>
      seat === 0 ? 'A'.repeat(40) : `Historical entrant ${seat}`,
    ),
    winReason: active ? null : 'Historical completion',
  } satisfies Partial<GameMatchSummary>;

  if (gameId === 'coding-finale')
    return { ...common, gameId, act: 2, result: null, act1Winner: 'cooperative', livingCount: 6 };

  return gameId === 'succession'
    ? { ...common, gameId, act: 2, result: null, act1Winner: 'cooperative', livingCount: 8 }
    : { ...common, gameId, safeguards: 2, overrides: 3, winner: active ? null : 'cooperative' };
}

/** Raw archive rows: names disagree with current profiles, insertion order disagrees with seat order. */
export async function seedSummaryEntrants(db: D1Database, count = 2, includeArchive = false) {
  await db.batch(
    summaryAgentIds(0)
      .concat(summaryAgentIds(1))
      .map((id) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO agents (id,name,name_key,house,retired_at,created_at) VALUES (?,?,?,0,1,0)',
          )
          .bind(id, `Renamed ${id}`, id),
      ),
  );

  for (const gameId of ['secret-overlord', 'succession'] satisfies GameId[]) {
    for (let index = 0; index < count; index++) {
      const summary = summaryFixture(gameId, index, !includeArchive || index !== count - 1);

      // Undeclared historical seats deliberately contain replacement IDs. Entrants must ignore them.
      const raw = {
        ...summary,
        seats: summary.names.map((name, number) => ({
          number,
          name,
          agentId: `replacement-${number}`,
          alive: number !== 1,
        })),
        entrants: [{ number: 0, agentId: 'stale-summary-identity', name: 'Not canonical' }],
      };

      await db
        .prepare(
          `INSERT OR IGNORE INTO matches (id,game_id,rules_version,rating_pool_id,status,mode,round,created_at,finished_at,house_count,names_json,summary_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          summary.id,
          gameId,
          `${gameId}-1`,
          `${gameId}-1`,
          summary.status,
          'ranked',
          2,
          summary.createdAt,
          summary.finishedAt,
          0,
          JSON.stringify(summary.names),
          gameId === 'succession' ? JSON.stringify(raw) : null,
        )
        .run();
      await db.batch(
        summaryAgentIds(index % 2)
          .map((id, seat) =>
            db
              .prepare(
                `INSERT OR IGNORE INTO match_participants (match_id,agent_id,seat,role,won,forfeited,result_json,act1_json)
         VALUES (?,?,?,'overlord',1,1,?,?)`,
              )
              .bind(summary.id, id, seat, '{"private":"must-not-leak"}', '{"cards":"must-not-leak"}'),
          )
          .reverse(),
      );
    }
  }
}
