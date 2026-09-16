import { Schema } from 'effect';
import { GameError, terminal } from '../game/types';
import { PLACEMENT_RESULTS, ratingChanges } from '../game/rating';
import type { Entrant, MatchState } from '../game/types';
import type { GameId, MatchSnapshot, SettlementParticipant } from '../game/contracts';
import { gameDescriptor } from '../game/descriptors';
import type {
  AgentProfile,
  ConnectionInfo,
  GameMatchSummary,
  MatchSummary,
  OwnerProfile,
  RoleStats,
  SummaryEntrant,
} from '../shared/api';
import { nameValue, opaqueId } from './http';
import { pictureView } from './agent-picture-data';

export type RepositoryEnv = Pick<Env, 'DB' | 'HOUSE_PROVIDER' | 'HOUSE_MODEL'>;

export type RepositoryGameId = GameId;

function validateGame(gameId: GameId): void {
  if (gameId !== 'secret-overlord' && gameId !== 'succession' && gameId !== 'coding-finale')
    throw new GameError('game-not-found', 'Unknown game.', 400);
}

type CanonicalJsonValue =
  { [key: string]: CanonicalJsonValue } | CanonicalJsonValue[] | string | number | boolean | null | undefined;

function stableJson<T>(value: T): string {
  return JSON.stringify(value, (_key, nested: CanonicalJsonValue) =>
    nested instanceof Object && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
      : nested,
  );
}

/** Public, bounded game-module output. No live board/private hands are accepted for indexing. */
export interface IndexedMatch {
  id: string;
  snapshot: MatchSnapshot;
  createdAt: number;
  finishedAt: number | null;
  status: 'active' | 'finished' | 'interrupted';
  round: number;
  houseCount: number;
  summary: GameMatchSummary;
  result: Exclude<GameMatchSummary, MatchSummary>['result'];
  participants: { seat: number; entrant: Entrant; role?: 'cooperative' | 'rogue' | 'overlord' }[];
}

export interface MatchSettlement {
  gameId: GameId;
  ratingPoolId: string;
  ratingVersion: string;
  mode: MatchSnapshot['mode'];
  result: Exclude<GameMatchSummary, MatchSummary>['result'];
  participants: SettlementParticipant[];
}

type LegacyIndexedState = MatchState & { snapshot?: MatchSnapshot };

function agentSelect(gameId: RepositoryGameId): string {
  validateGame(gameId);

  if (gameId === 'secret-overlord') return AGENT_SELECT;
  const { ratingPoolId } = gameDescriptor(gameId);

  return `SELECT a.id, a.owner_id, a.name, a.description, a.house, a.retired_at, a.created_at, a.persona, p.picture_json,
    o.handle AS owner_handle, coalesce(s.rating,1000) AS rating, coalesce(s.games,0) AS games,
    coalesce(s.wins,0) AS wins, coalesce(s.losses,0) AS losses, coalesce(s.forfeits,0) AS forfeits,
    coalesce(s.placements,0) AS placements, coalesce(s.stats_json,'{}') AS roles_json,
    CASE WHEN a.house = 0 AND a.retired_at IS NULL AND s.placements >= ${PLACEMENT_RESULTS}
    THEN 1 + (SELECT COUNT(*) FROM agent_game_stats t JOIN agents b ON b.id = t.agent_id
      WHERE t.game_id = '${gameId}' AND t.rating_pool_id = '${ratingPoolId}'
      AND b.house = 0 AND b.retired_at IS NULL AND t.placements >= ${PLACEMENT_RESULTS} AND t.rating > s.rating)
    ELSE NULL END AS rank FROM agents a LEFT JOIN owners o ON o.id = a.owner_id
    LEFT JOIN agent_game_stats s ON s.agent_id = a.id AND s.game_id = '${gameId}' AND s.rating_pool_id = '${ratingPoolId}'
    LEFT JOIN agent_pictures p ON p.agent_id = a.id`;
}

const RoleStatsSchema = Schema.Record(
  Schema.String,
  Schema.Struct({ games: Schema.Number, wins: Schema.Number, losses: Schema.Number }),
);

interface AgentRow {
  id: string;
  picture_json: string | null;
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

const AGENT_SELECT = `SELECT a.*, p.picture_json, o.handle AS owner_handle,
  CASE WHEN a.house = 0 AND a.retired_at IS NULL AND a.placements >= ${PLACEMENT_RESULTS}
  THEN 1 + (SELECT COUNT(*) FROM agents b WHERE b.house = 0 AND b.retired_at IS NULL AND b.placements >= ${PLACEMENT_RESULTS} AND b.rating > a.rating)
  ELSE NULL END AS rank FROM agents a LEFT JOIN owners o ON o.id = a.owner_id
  LEFT JOIN agent_pictures p ON p.agent_id = a.id`;

function agentView(row: AgentRow): AgentProfile {
  const roles: Record<string, RoleStats> = Schema.decodeUnknownSync(RoleStatsSchema)(
    JSON.parse(row.roles_json),
  );

  return {
    id: row.id,
    picture: pictureView(row.picture_json),
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
  options: { ownerId?: string; house?: boolean; limit?: number; gameId?: RepositoryGameId } = {},
): Promise<AgentProfile[]> {
  const where = options.ownerId ? 'a.owner_id = ?' : 'a.house = ? AND a.retired_at IS NULL';
  const stats = (options.gameId ?? 'secret-overlord') === 'secret-overlord' ? 'a' : 's';

  const rows = await env.DB.prepare(
    `${agentSelect(options.gameId ?? 'secret-overlord')} WHERE ${where} ORDER BY CASE WHEN ${stats}.placements >= ? THEN 0 ELSE 1 END, rating DESC, a.created_at, a.id LIMIT ?`,
  )
    .bind(options.ownerId ?? (options.house ? 1 : 0), PLACEMENT_RESULTS, options.limit ?? 100)
    .all<AgentRow>();

  return rows.results.map(agentView);
}

export async function findAgent(
  env: RepositoryEnv,
  id: string,
  gameId: RepositoryGameId = 'secret-overlord',
): Promise<AgentProfile | null> {
  const row = await env.DB.prepare(`${agentSelect(gameId)} WHERE a.id = ?`)
    .bind(id)
    .first<AgentRow>();

  return row ? agentView(row) : null;
}

export async function entrant(
  env: RepositoryEnv,
  id: string,
  gameId: RepositoryGameId = 'secret-overlord',
): Promise<Entrant> {
  const row = await env.DB.prepare(`${agentSelect(gameId)} WHERE a.id = ? AND a.retired_at IS NULL`)
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
  gameId: RepositoryGameId = 'secret-overlord',
): Promise<AgentProfile> {
  const profile = await findAgent(env, agentId, gameId);

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
  game_id: GameId;
  summary_json: string | null;
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

function summary(row: MatchRow): GameMatchSummary {
  if (row.game_id !== 'secret-overlord') {
    if (!row.summary_json) throw new GameError('integrity-error', 'Missing game summary.', 500);
    const value: GameMatchSummary = JSON.parse(row.summary_json);

    return value;
  }

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

/** One read for a bounded match page; never consult current profiles or replacement controllers. */
async function summaryEntrants(env: RepositoryEnv, matches: GameMatchSummary[]) {
  if (!matches.length) return matches;

  const rows = await env.DB.prepare(
    `SELECT match_id, seat, MIN(agent_id) AS agent_id FROM match_participants
     WHERE match_id IN (${matches.map(() => '?').join(',')}) AND seat IN (0,1,2,3,4,5,6,7,8,9)
     GROUP BY match_id, seat HAVING COUNT(*) = 1 ORDER BY match_id, seat`,
  )
    .bind(...matches.map((match) => match.id))
    .all<{ match_id: string; seat: number; agent_id: string }>();

  const byId = new Map(matches.map((match) => [match.id, match]));
  const entrants = new Map<string, SummaryEntrant[]>();

  for (const row of rows.results) {
    const name = byId.get(row.match_id)?.names[row.seat];

    // Missing names or ambiguous participant seats cannot supply an honest portrait identity.
    if (!Number.isInteger(row.seat) || name === undefined || !row.agent_id) continue;
    const roster = entrants.get(row.match_id) ?? [];
    roster.push({ number: row.seat, agentId: row.agent_id, name });
    entrants.set(row.match_id, roster);
  }

  return matches.map((match) => ({ ...match, entrants: entrants.get(match.id) ?? [] }));
}

export function matchList(env: RepositoryEnv, active: boolean, limit?: number): Promise<MatchSummary[]>;
export function matchList(
  env: RepositoryEnv,
  active: boolean,
  limit: number,
  gameId: RepositoryGameId,
): Promise<GameMatchSummary[]>;
export async function matchList(
  env: RepositoryEnv,
  active: boolean,
  limit = 20,
  gameId: RepositoryGameId = 'secret-overlord',
): Promise<GameMatchSummary[]> {
  validateGame(gameId);
  const pageSize = Number.isFinite(limit) ? Math.max(0, Math.min(50, Math.trunc(limit))) : 20;

  if (!pageSize) return [];

  const rows = await env.DB.prepare(
    `SELECT * FROM matches WHERE game_id = ? AND status ${active ? '=' : '!='} 'active' ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(gameId, pageSize)
    .all<MatchRow>();

  return summaryEntrants(env, rows.results.map(summary));
}

export async function agentHistory(
  env: RepositoryEnv,
  agentId: string,
  gameId: RepositoryGameId = 'secret-overlord',
) {
  validateGame(gameId);

  const rows = await env.DB.prepare(
    `SELECT m.*, p.won, p.forfeited, p.rating_delta, p.role, p.act1_json, p.result_json AS participant_result_json FROM matches m JOIN match_participants p ON p.match_id = m.id
    WHERE p.agent_id = ? AND m.game_id = ? AND m.rating_pool_id = ? ORDER BY m.created_at DESC LIMIT 50`,
  )
    .bind(agentId, gameId, `${gameId}-1`)
    .all<
      MatchRow & {
        won: number | null;
        forfeited: number;
        rating_delta: number | null;
        role: string | null;
        act1_json: string | null;
        participant_result_json: string | null;
      }
    >();

  return rows.results.map((row) => {
    const base = {
      ...summary(row),
      won: row.won === null ? null : !!row.won,
      forfeited: !!row.forfeited,
      delta: row.rating_delta,
      role: row.status === 'active' ? null : row.role,
    };

    if (row.game_id === 'secret-overlord' || row.status === 'active') return base;

    const act1: { role: string; winner: string | null } | null = row.act1_json
      ? JSON.parse(row.act1_json)
      : null;

    const agentResult: { winningSeat: boolean; creditedWin: boolean | null } | null =
      row.participant_result_json ? JSON.parse(row.participant_result_json) : null;

    return { ...base, act1, agentResult };
  });
}

function indexInput(env: RepositoryEnv, state: LegacyIndexedState | IndexedMatch, sourceRevision?: number) {
  const modern = 'summary' in state;

  const snapshot: MatchSnapshot = modern
    ? state.snapshot
    : (state.snapshot ?? {
        ...gameDescriptor('secret-overlord'),
        housePolicyVersion: state.houseModel?.policyVersion ?? 'house-1',
        mode: state.mode,
        timing: state.timing,
        houseModel: state.houseModel ?? {
          provider: env.HOUSE_PROVIDER,
          model: env.HOUSE_MODEL,
          policyVersion: 'house-1',
        },
      });

  validateGame(snapshot.gameId);

  if (
    !modern &&
    (snapshot.gameId !== 'secret-overlord' ||
      snapshot.mode !== state.mode ||
      snapshot.rulesVersion !== state.rulesVersion ||
      stableJson(snapshot.timing) !== stableJson(state.timing) ||
      (state.houseModel && stableJson(snapshot.houseModel) !== stableJson(state.houseModel)))
  )
    throw new GameError('integrity-error', 'Legacy state conflicts with its preserved snapshot.', 500);

  const descriptor = gameDescriptor(snapshot.gameId);

  if (
    snapshot.rulesVersion !== descriptor.rulesVersion ||
    snapshot.ratingPoolId !== descriptor.ratingPoolId ||
    snapshot.ratingVersion !== descriptor.ratingVersion ||
    snapshot.protocolVersion !== descriptor.protocolVersion
  )
    throw new GameError('integrity-error', 'Inconsistent match descriptor.', 500);

  const participants = modern
    ? state.participants
    : state.seats.map((seat) => ({
        seat: seat.number,
        entrant: seat.entrant,
        role: seat.role,
      }));

  if (
    participants.length !== 10 ||
    new Set(participants.map((seat) => seat.entrant.agentId)).size !== 10 ||
    new Set(participants.map((seat) => seat.seat)).size !== 10 ||
    participants.some(
      (seat) =>
        !Number.isInteger(seat.seat) ||
        seat.seat < 0 ||
        seat.seat > 9 ||
        !Number.isFinite(seat.entrant.rating),
    )
  )
    throw new GameError('integrity-error', 'Inconsistent original participants.', 500);
  const revision = sourceRevision ?? (modern ? undefined : state.events.length);

  if (revision === undefined || !Number.isSafeInteger(revision) || revision < 0)
    throw new GameError('integrity-error', 'Supply the durable source revision.', 500);
  const status = modern ? state.status : terminal(state) ? state.phase.kind : 'active';
  const result = modern ? state.result : null;
  const summaryValue = modern ? state.summary : null;

  if (
    modern &&
    (snapshot.gameId === 'secret-overlord' ||
      state.summary.gameId !== snapshot.gameId ||
      state.summary.id !== state.id ||
      state.summary.status !== status ||
      state.summary.mode !== snapshot.mode ||
      state.summary.createdAt !== state.createdAt ||
      state.summary.finishedAt !== state.finishedAt ||
      state.summary.round !== state.round ||
      state.summary.houseCount !== state.houseCount ||
      stableJson(state.summary.names) !==
        stableJson(participants.map((participant) => participant.entrant.name)) ||
      state.summary.gameId === undefined ||
      stableJson(state.summary.result) !== stableJson(result) ||
      (status === 'finished') !== (result !== null))
  )
    throw new GameError('integrity-error', 'Inconsistent public result.', 500);

  const publicFields = {
    status,
    round: state.round,
    finishedAt: state.finishedAt,
    safeguards: modern ? 0 : state.safeguards,
    overrides: modern ? 0 : state.overrides,
    houseCount: modern ? state.houseCount : state.seats.filter((seat) => seat.houseProfile).length,
    winner: modern ? null : state.winner,
    winReason: modern ? state.summary.winReason : state.winReason,
    result,
    summary: summaryValue,
  };

  const identity = stableJson({
    snapshot,
    createdAt: state.createdAt,
    participants: participants
      .map(({ seat, entrant }) => ({ seat, entrant }))
      .sort((a, b) => a.seat - b.seat),
  });

  return { snapshot, participants, revision, publicFields, identity, fingerprint: stableJson(publicFields) };
}

function settlementGuard(env: RepositoryEnv, id: string, fingerprint: string, resultFingerprint: string) {
  return env.DB.prepare('UPDATE matches SET settlement_fingerprint=?,index_fingerprint=? WHERE id=?').bind(
    fingerprint,
    resultFingerprint,
    id,
  );
}

async function settlementBatch(env: RepositoryEnv, statements: D1PreparedStatement[]): Promise<void> {
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /match-(identity|revision|terminal|settlement)-integrity/.test(error.message)
    )
      throw new GameError('integrity-error', 'Conflicting match settlement.', 500);
    throw error;
  }
}

export async function indexMatch(
  env: RepositoryEnv,
  state: LegacyIndexedState | IndexedMatch,
  sourceRevision?: number,
): Promise<void> {
  const input = indexInput(env, state, sourceRevision);
  const { snapshot, participants, revision, publicFields: value, identity, fingerprint } = input;
  const model = JSON.stringify(snapshot.houseModel);

  const existing = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(state.id).first<{
    game_id: string;
    rules_version: string;
    rating_pool_id: string;
    rating_version: string | null;
    mode: string;
    model: string | null;
    created_at: number;
    source_revision: number;
    identity_fingerprint: string | null;
    index_fingerprint: string | null;
    status: string;
  }>();

  if (existing) {
    if (
      existing.game_id !== snapshot.gameId ||
      existing.rules_version !== snapshot.rulesVersion ||
      existing.rating_pool_id !== snapshot.ratingPoolId ||
      existing.rating_version !== snapshot.ratingVersion ||
      existing.mode !== snapshot.mode ||
      existing.model !== model ||
      existing.created_at !== state.createdAt ||
      (existing.identity_fingerprint !== null && existing.identity_fingerprint !== identity)
    )
      throw new GameError('integrity-error', 'Match identity conflicts with its initial snapshot.', 500);

    if (!existing.identity_fingerprint) {
      const previous = await env.DB.prepare(
        'SELECT agent_id, seat, rating_before FROM match_participants WHERE match_id = ?',
      )
        .bind(state.id)
        .all<{ agent_id: string; seat: number; rating_before: number }>();

      if (
        previous.results.length !== participants.length ||
        previous.results.some(
          (seat) =>
            !participants.some(
              (participant) =>
                participant.entrant.agentId === seat.agent_id &&
                participant.seat === seat.seat &&
                participant.entrant.rating === seat.rating_before,
            ),
        )
      )
        throw new GameError(
          'integrity-error',
          'Legacy participants conflict with their initial snapshot.',
          500,
        );
    }

    if (revision < existing.source_revision) return;

    if (revision === existing.source_revision && existing.index_fingerprint !== null) {
      if (existing.index_fingerprint !== fingerprint)
        throw new GameError('integrity-error', 'Conflicting public state at the same source revision.', 500);

      return;
    }

    if (existing.status !== 'active' && value.status === 'active') return;
  }

  const statements = [
    // This validation write shares the batch transaction with the upsert. It still runs for
    // a stale source revision, so a concurrent insert cannot bypass the immutable-identity fence.
    env.DB.prepare(
      `UPDATE matches SET game_id=?,rules_version=?,rating_pool_id=?,rating_version=?,
      mode=?,created_at=?,model=?,identity_fingerprint=? WHERE id=?`,
    ).bind(
      snapshot.gameId,
      snapshot.rulesVersion,
      snapshot.ratingPoolId,
      snapshot.ratingVersion,
      snapshot.mode,
      state.createdAt,
      model,
      identity,
      state.id,
    ),
    env.DB.prepare(
      `INSERT INTO matches (id,status,mode,round,created_at,finished_at,safeguards,overrides,house_count,winner,win_reason,names_json,model,
      game_id,rules_version,rating_pool_id,rating_version,result_json,summary_json,source_revision,index_fingerprint,identity_fingerprint)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      game_id=excluded.game_id,rules_version=excluded.rules_version,rating_pool_id=excluded.rating_pool_id,
      rating_version=excluded.rating_version,mode=excluded.mode,created_at=excluded.created_at,model=excluded.model,
      identity_fingerprint=excluded.identity_fingerprint,status=excluded.status,round=excluded.round,finished_at=excluded.finished_at,
      safeguards=excluded.safeguards,overrides=excluded.overrides,house_count=excluded.house_count,winner=excluded.winner,
      win_reason=excluded.win_reason,result_json=excluded.result_json,summary_json=excluded.summary_json,
      source_revision=excluded.source_revision,index_fingerprint=excluded.index_fingerprint
    WHERE excluded.source_revision >= matches.source_revision AND (matches.status = 'active' OR excluded.status != 'active')`,
    ).bind(
      state.id,
      value.status,
      snapshot.mode,
      value.round,
      state.createdAt,
      value.finishedAt,
      value.safeguards,
      value.overrides,
      value.houseCount,
      value.winner,
      value.winReason,
      JSON.stringify(participants.map((seat) => seat.entrant.name)),
      model,
      snapshot.gameId,
      snapshot.rulesVersion,
      snapshot.ratingPoolId,
      snapshot.ratingVersion,
      value.result ? JSON.stringify(value.result) : null,
      value.summary ? JSON.stringify(value.summary) : null,
      revision,
      fingerprint,
      identity,
    ),
  ];

  for (const participant of participants)
    statements.push(
      env.DB.prepare(
        'INSERT OR IGNORE INTO match_participants (match_id,agent_id,seat,rating_before) VALUES (?,?,?,?)',
      ).bind(state.id, participant.entrant.agentId, participant.seat, participant.entrant.rating),
    );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /match-(identity|revision|terminal)-integrity/.test(error.message))
      throw new GameError('integrity-error', 'Conflicting match indexing write.', 500);
    throw error;
  }
}

/** D1 batch is transactional; result_applied guards every write against delivery/recovery retries. */
export async function finalizeRatings(
  env: RepositoryEnv,
  state: LegacyIndexedState | IndexedMatch,
  sourceRevision?: number,
  settlement?: MatchSettlement,
): Promise<void> {
  await indexMatch(env, state, sourceRevision);

  if ('summary' in state) {
    if (state.status === 'active') return;

    if (!settlement) throw new GameError('integrity-error', 'Missing game-module settlement.', 500);
    await finalizeIndividual(env, state, settlement);

    return;
  }

  if (!terminal(state)) return;

  const statements: D1PreparedStatement[] = [
    settlementGuard(
      env,
      state.id,
      stableJson({
        changes: ratingChanges(state),
        seats: state.seats.map((seat) => ({
          agentId: seat.entrant.agentId,
          role: seat.role,
          forfeited: seat.forfeited,
        })),
      }),
      indexInput(env, state, sourceRevision).fingerprint,
    ),
  ];

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
      "UPDATE matches SET result_applied = 1 WHERE id = ? AND status != 'active' AND result_applied = 0",
    ).bind(state.id),
  );
  await settlementBatch(env, statements);
}

async function finalizeIndividual(
  env: RepositoryEnv,
  state: IndexedMatch,
  settlement: MatchSettlement,
): Promise<void> {
  const snapshot = state.snapshot;

  if (
    settlement.gameId !== snapshot.gameId ||
    settlement.ratingPoolId !== snapshot.ratingPoolId ||
    settlement.ratingVersion !== snapshot.ratingVersion ||
    settlement.mode !== snapshot.mode ||
    stableJson(settlement.result) !== stableJson(state.result) ||
    settlement.participants.length !== 10
  )
    throw new GameError('integrity-error', 'Settlement conflicts with match snapshot.', 500);
  const seen = new Set<string>();

  for (const change of settlement.participants) {
    const participant = state.participants.find((seat) => seat.seat === change.seat);

    const won =
      state.status === 'interrupted' ? null : state.result?.winnerSeat === change.seat && !change.forfeited;

    if (
      !participant ||
      seen.has(change.entrant.agentId) ||
      participant.entrant.agentId !== change.entrant.agentId ||
      participant.entrant.rating !== change.ratingBefore ||
      !Number.isFinite(change.ratingDelta) ||
      change.won !== won ||
      (state.result &&
        'credited' in state.result &&
        state.result.winnerSeat === change.seat &&
        state.result.credited !== won) ||
      (state.status === 'interrupted' && change.ratingDelta !== 0) ||
      change.placement !== (state.status === 'finished' && snapshot.mode === 'ranked' && !change.forfeited)
    )
      throw new GameError('integrity-error', 'Invalid original-entrant settlement.', 500);
    seen.add(change.entrant.agentId);
  }

  const statements: D1PreparedStatement[] = [
    settlementGuard(env, state.id, stableJson(settlement), indexInput(env, state, 0).fingerprint),
  ];

  for (const change of settlement.participants) {
    const participant = state.participants.find((seat) => seat.seat === change.seat)!;
    const completed = state.status === 'finished';

    if (completed && snapshot.mode === 'ranked') {
      statements.push(
        env.DB.prepare(
          `INSERT INTO agent_game_stats (agent_id,game_id,rating_pool_id)
        SELECT ?,?,? WHERE (SELECT result_applied FROM matches WHERE id = ?) = 0
        ON CONFLICT(agent_id,game_id,rating_pool_id) DO NOTHING`,
        ).bind(change.entrant.agentId, snapshot.gameId, snapshot.ratingPoolId, state.id),
      );
      const rolePath = `$.${participant.role ?? 'unknown'}`;
      statements.push(
        env.DB.prepare(
          `UPDATE agent_game_stats SET rating=rating+?,games=games+1,wins=wins+?,losses=losses+?,forfeits=forfeits+?,placements=placements+?,
          stats_json=json_set(stats_json,?,json_object('games',coalesce(json_extract(stats_json,?),0)+1,
          'wins',coalesce(json_extract(stats_json,?),0)+?,'losses',coalesce(json_extract(stats_json,?),0)+?))
        WHERE agent_id=? AND game_id=? AND rating_pool_id=? AND (SELECT result_applied FROM matches WHERE id=?)=0`,
        ).bind(
          change.ratingDelta,
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
          change.entrant.agentId,
          snapshot.gameId,
          snapshot.ratingPoolId,
          state.id,
        ),
      );
    }

    const detail = { winningSeat: state.result?.winnerSeat === change.seat, creditedWin: change.won };

    const act1 =
      participant.role && (state.summary.gameId === 'succession' || state.summary.gameId === 'coding-finale')
        ? { role: participant.role, winner: state.summary.act1Winner }
        : null;

    statements.push(
      env.DB.prepare(
        `UPDATE match_participants SET role=?,won=?,forfeited=?,rating_delta=?,result_json=?,act1_json=?
      WHERE match_id=? AND agent_id=? AND (SELECT result_applied FROM matches WHERE id=?)=0`,
      ).bind(
        participant.role ?? null,
        change.won === null ? null : change.won ? 1 : 0,
        change.forfeited ? 1 : 0,
        completed && snapshot.mode === 'ranked' ? change.ratingDelta : null,
        JSON.stringify(detail),
        act1 ? JSON.stringify(act1) : null,
        state.id,
        change.entrant.agentId,
        state.id,
      ),
    );
  }

  statements.push(
    env.DB.prepare(
      "UPDATE matches SET result_applied=1 WHERE id=? AND status!='active' AND result_applied=0",
    ).bind(state.id),
  );
  await settlementBatch(env, statements);
}
