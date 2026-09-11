import { Schema } from 'effect';
import { GameError, terminal } from '../game/types';
import { PLACEMENT_RESULTS, RATING_VERSION, ratingChanges } from '../game/rating';
import type { Entrant, MatchState } from '../game/types';
import type { AgentProfile, ConnectionInfo, MatchSummary, OwnerProfile, RoleStats } from '../shared/api';
import { nameValue, opaqueId } from './http';

export type RepositoryEnv = Pick<Env, 'DB' | 'HOUSE_PROVIDER' | 'HOUSE_MODEL'>;

const RoleStatsSchema = Schema.Record(
  Schema.String,
  Schema.Struct({ games: Schema.Number, wins: Schema.Number, losses: Schema.Number }),
);

interface AgentRow {
  id: string;
  owner_id: string | null;
  owner_handle: string | null;
  name: string;
  description: string;
  house: number;
  retired_at: number | null;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  forfeits: number;
  placements: number;
  roles_json: string;
  created_at: number;
  rank: number | null;
  persona: string | null;
}

const AGENT_SELECT = `SELECT a.*, o.handle AS owner_handle,
  CASE WHEN a.house = 0 AND a.retired_at IS NULL AND a.placements >= ${PLACEMENT_RESULTS}
  THEN 1 + (SELECT COUNT(*) FROM agents b WHERE b.house = 0 AND b.retired_at IS NULL AND b.placements >= ${PLACEMENT_RESULTS} AND b.rating > a.rating)
  ELSE NULL END AS rank FROM agents a LEFT JOIN owners o ON o.id = a.owner_id`;

function agentView(row: AgentRow): AgentProfile {
  const roles: Record<string, RoleStats> = Schema.decodeUnknownSync(RoleStatsSchema)(
    JSON.parse(row.roles_json),
  );

  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerHandle: row.owner_handle,
    name: row.name,
    description: row.description,
    house: !!row.house,
    retired: row.retired_at !== null,
    rating: row.rating,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    forfeits: row.forfeits,
    placements: row.placements,
    provisional: row.placements < PLACEMENT_RESULTS,
    rank: row.rank,
    roles,
    createdAt: row.created_at,
  };
}

export async function listAgents(
  env: RepositoryEnv,
  options: { ownerId?: string; house?: boolean; limit?: number } = {},
): Promise<AgentProfile[]> {
  const where = options.ownerId ? 'a.owner_id = ?' : 'a.house = ? AND a.retired_at IS NULL';

  const rows = await env.DB.prepare(
    `${AGENT_SELECT} WHERE ${where} ORDER BY CASE WHEN a.placements >= ? THEN 0 ELSE 1 END, a.rating DESC, a.created_at, a.id LIMIT ?`,
  )
    .bind(options.ownerId ?? (options.house ? 1 : 0), PLACEMENT_RESULTS, options.limit ?? 100)
    .all<AgentRow>();

  return rows.results.map(agentView);
}

export async function findAgent(env: RepositoryEnv, id: string): Promise<AgentProfile | null> {
  const row = await env.DB.prepare(`${AGENT_SELECT} WHERE a.id = ?`).bind(id).first<AgentRow>();

  return row ? agentView(row) : null;
}

export async function entrant(env: RepositoryEnv, id: string): Promise<Entrant> {
  const row = await env.DB.prepare(`${AGENT_SELECT} WHERE a.id = ? AND a.retired_at IS NULL`)
    .bind(id)
    .first<AgentRow>();

  if (!row) throw new GameError('agent-not-found', 'Agent not found.', 404);

  const participant: Entrant = {
    agentId: row.id,
    ownerId: row.owner_id,
    name: row.name,
    house: !!row.house,
    rating: row.rating,
  };

  if (row.persona) participant.persona = row.persona;

  return participant;
}

export async function createAgent(
  env: RepositoryEnv,
  owner: OwnerProfile,
  name: string,
  description = '',
): Promise<AgentProfile> {
  const normalized = nameValue(name);

  if ([...description].length > 240)
    throw new GameError('description-length', 'Descriptions must be at most 240 characters.', 400);

  const existing = await env.DB.prepare('SELECT id FROM agents WHERE owner_id = ? AND name_key = ?')
    .bind(owner.id, normalized.toLowerCase())
    .first<{ id: string }>();

  if (existing) throw new GameError('name-taken', 'You already have an agent with that name.');
  const id = opaqueId('agent');
  await env.DB.prepare(
    'INSERT INTO agents (id, owner_id, name, name_key, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, owner.id, normalized, normalized.toLowerCase(), description.trim(), Date.now())
    .run();
  const result = await findAgent(env, id);

  if (!result) throw new Error('Agent creation failed');

  return result;
}

export async function ownedAgent(
  env: RepositoryEnv,
  ownerId: string,
  agentId: string,
): Promise<AgentProfile> {
  const profile = await findAgent(env, agentId);

  if (!profile || profile.ownerId !== ownerId)
    throw new GameError('agent-not-found', 'Agent not found.', 404);

  return profile;
}

export async function connections(env: RepositoryEnv, ownerId: string): Promise<ConnectionInfo[]> {
  const rows = await env.DB.prepare(
    `SELECT g.id, g.agent_id AS agentId, a.name AS agentName, g.name,
    g.created_at AS createdAt, g.expires_at AS expiresAt, g.revoked_at AS revokedAt
    FROM agent_grants g JOIN agents a ON a.id = g.agent_id WHERE a.owner_id = ? ORDER BY g.created_at DESC`,
  )
    .bind(ownerId)
    .all<ConnectionInfo>();

  return rows.results;
}

interface MatchRow {
  id: string;
  status: MatchSummary['status'];
  mode: string;
  round: number;
  created_at: number;
  finished_at: number | null;
  safeguards: number;
  overrides: number;
  house_count: number;
  winner: string | null;
  win_reason: string | null;
  names_json: string;
}

function summary(row: MatchRow): MatchSummary {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    round: row.round,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    safeguards: row.safeguards,
    overrides: row.overrides,
    houseCount: row.house_count,
    winner: row.winner,
    winReason: row.win_reason,
    names: [...Schema.decodeUnknownSync(Schema.Array(Schema.String))(JSON.parse(row.names_json))],
  };
}

export async function matchList(env: RepositoryEnv, active: boolean, limit = 20): Promise<MatchSummary[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM matches WHERE status ${active ? '=' : '!='} 'active' ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<MatchRow>();

  return rows.results.map(summary);
}

export async function agentHistory(env: RepositoryEnv, agentId: string) {
  const rows = await env.DB.prepare(
    `SELECT m.*, p.won, p.forfeited, p.rating_delta, p.role FROM matches m JOIN match_participants p ON p.match_id = m.id
    WHERE p.agent_id = ? ORDER BY m.created_at DESC LIMIT 50`,
  )
    .bind(agentId)
    .all<
      MatchRow & { won: number | null; forfeited: number; rating_delta: number | null; role: string | null }
    >();

  return rows.results.map((row) => ({
    ...summary(row),
    won: row.won === null ? null : !!row.won,
    forfeited: !!row.forfeited,
    delta: row.rating_delta,
    role: row.status === 'active' ? null : row.role,
  }));
}

export async function indexMatch(env: RepositoryEnv, state: MatchState): Promise<void> {
  const statements = [
    env.DB.prepare(
      `INSERT INTO matches (id, status, mode, round, created_at, finished_at, safeguards, overrides, house_count, winner, win_reason, names_json, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    status=excluded.status, round=excluded.round, finished_at=excluded.finished_at, safeguards=excluded.safeguards, overrides=excluded.overrides,
    house_count=excluded.house_count, winner=excluded.winner, win_reason=excluded.win_reason`,
    ).bind(
      state.id,
      terminal(state) ? state.phase.kind : 'active',
      state.mode,
      state.round,
      state.createdAt,
      state.finishedAt,
      state.safeguards,
      state.overrides,
      state.seats.filter((seat) => seat.houseProfile).length,
      state.winner,
      state.winReason,
      JSON.stringify(state.seats.map((seat) => seat.entrant.name)),
      JSON.stringify(
        state.houseModel ?? {
          provider: env.HOUSE_PROVIDER,
          model: env.HOUSE_MODEL,
          policyVersion: 'house-1',
        },
      ),
    ),
  ];

  for (const seat of state.seats)
    statements.push(
      env.DB.prepare(
        'INSERT OR IGNORE INTO match_participants (match_id, agent_id, seat, rating_before) VALUES (?, ?, ?, ?)',
      ).bind(state.id, seat.entrant.agentId, seat.number, seat.entrant.rating),
    );
  await env.DB.batch(statements);
}

/** D1 batch is transactional; result_applied guards every write against delivery/recovery retries. */
export async function finalizeRatings(env: RepositoryEnv, state: MatchState): Promise<void> {
  await indexMatch(env, state);

  if (!terminal(state)) return;
  const statements: D1PreparedStatement[] = [];

  for (const change of ratingChanges(state)) {
    const rolePath = `$.${change.role}`;

    if (state.mode === 'ranked')
      statements.push(
        env.DB.prepare(
          `UPDATE agents SET rating = rating + ?, games = games + 1, wins = wins + ?, losses = losses + ?, forfeits = forfeits + ?, placements = placements + ?,
      roles_json = json_set(roles_json, ?, json_object('games', coalesce(json_extract(roles_json, ?),0)+1,
        'wins', coalesce(json_extract(roles_json, ?),0)+?, 'losses', coalesce(json_extract(roles_json, ?),0)+?))
      WHERE id = ? AND (SELECT result_applied FROM matches WHERE id = ?) = 0`,
        ).bind(
          change.delta,
          change.won ? 1 : 0,
          change.won ? 0 : 1,
          change.forfeited ? 1 : 0,
          change.placement ? 1 : 0,
          rolePath,
          `${rolePath}.games`,
          `${rolePath}.wins`,
          change.won ? 1 : 0,
          `${rolePath}.losses`,
          change.won ? 0 : 1,
          change.agentId,
          state.id,
        ),
      );
    statements.push(
      env.DB.prepare(
        `UPDATE match_participants SET role = ?, won = ?, forfeited = ?, rating_delta = ?
      WHERE match_id = ? AND agent_id = ? AND (SELECT result_applied FROM matches WHERE id = ?) = 0`,
      ).bind(
        change.role,
        change.won ? 1 : 0,
        change.forfeited ? 1 : 0,
        state.mode === 'ranked' ? change.delta : null,
        state.id,
        change.agentId,
        state.id,
      ),
    );
  }

  // Interrupted replays reveal roles, but contribute no rated participation.
  if (state.phase.kind === 'interrupted')
    for (const seat of state.seats)
      statements.push(
        env.DB.prepare(
          `UPDATE match_participants SET role = ?, forfeited = ?, rating_delta = NULL
    WHERE match_id = ? AND agent_id = ? AND (SELECT result_applied FROM matches WHERE id = ?) = 0`,
        ).bind(seat.role, seat.forfeited ? 1 : 0, state.id, seat.entrant.agentId, state.id),
      );
  statements.push(
    env.DB.prepare(
      'UPDATE matches SET result_applied = 1, rating_version = ? WHERE id = ? AND result_applied = 0',
    ).bind(RATING_VERSION, state.id),
  );
  await env.DB.batch(statements);
}
