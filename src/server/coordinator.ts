import { Match } from 'effect';
import { GameError } from '../game/types';
import { shuffle } from '../game/random';
import type { Entrant } from '../game/types';
import type { QueueStatus, RpcResult } from '../shared/api';
import type { AgentPrincipal } from './auth';
import { entrant } from './repository';
import type { RepositoryGameId } from './repository';
import type { MatchSnapshot } from '../game/contracts';
import { gameDescriptor } from '../game/descriptors';
import { fault, opaqueId } from './http';
import { HOUSE_CHAT_MIN_REMAINING_MS } from './house-contract';
import { PreviewBrokerLedger } from './preview-ledger';
import { PreviewTargetAllocations } from './preview-allocation';
import { previewEnabled } from './preview-config';

type Ticket = {
  game_id: RepositoryGameId;
  agent_id: string;
  owner_id: string;
  grant_id: string;
  expires_at: number;
  request_id: string;
  joined_at: number;
  state: string;
  match_id: string | null;
};

type Allocation = {
  game_id: RepositoryGameId;
  snapshot: string | null;
  id: string;
  state: string;
  entries: string;
  grants: string;
  created_at: number;
  reservation: number;
};

export interface MatchInitialization {
  id: string;
  entrants: Entrant[];
  grants: Record<string, string>;
  gameId?: RepositoryGameId;
  snapshot?: MatchSnapshot;
  reservationUsd?: number;
}

type InferenceKind = 'required' | 'initial' | 'followup';

export interface InferenceRequest {
  id: string;
  matchId: string;
  estimate: number;
  deadline: number;
  mandatory: boolean;
  optionalKind?: 'initial' | 'followup';
}

export type InferenceDenial =
  | 'allocation-closed'
  | 'already-recorded'
  | 'request-conflict'
  | 'expired'
  | 'match-budget'
  | 'optional-budget'
  | 'followup-budget'
  | 'daily-budget'
  | 'rate-limit'
  | 'required-priority'
  | 'initial-priority';

export type InferenceReservation =
  | { allowed: true; retryAt: number }
  | {
      allowed: false;
      retryAt: number;
      reason: InferenceDenial;
      retryable: boolean;
    };

// Allocation assumptions, not predictions of a game's future decisions:
// retain half for required work; follow-ups can use only a quarter of optional funding.
const OPTIONAL_SHARE = 0.5;

const FOLLOWUP_SHARE = 0.25;

const INFERENCE_RETRY_MS = 1000;

type Funding = {
  kind: InferenceKind;
  calls: number;
  estimatedUsd: number;
  measuredUsd: number;
  accountedUsd: number;
  irreversibleUsd: number;
};

const LEGACY_INFERENCE_KIND =
  "coalesce(kind, CASE WHEN id LIKE '%:action:attempt:%' THEN 'required' WHEN id LIKE '%:chat:1:attempt:%' THEN 'followup' ELSE 'initial' END)";

export type PlatformQueueStatus = QueueStatus & {
  requestId: string | null;
  gameId: RepositoryGameId | null;
  rulesVersion: string | null;
  protocolVersion: '1' | '2' | null;
};

function queueIdentity(gameId: RepositoryGameId) {
  const descriptor = gameDescriptor(gameId);

  return { gameId, rulesVersion: descriptor.rulesVersion, protocolVersion: descriptor.protocolVersion };
}

const GAME_IDS: RepositoryGameId[] = ['secret-overlord', 'succession'];

function validGame(gameId: RepositoryGameId): void {
  if (!GAME_IDS.includes(gameId)) throw new GameError('game-not-found', 'Unknown game.', 400);
}

/** One deployed coordinator, two logical queues and global admission/participation limits. */
export class PlatformQueue {
  readonly preview: PreviewBrokerLedger;
  readonly previewTarget: PreviewTargetAllocations;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    ctx.storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS tickets (agent_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, grant_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
      request_id TEXT NOT NULL, joined_at INTEGER NOT NULL, state TEXT NOT NULL, match_id TEXT)`);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS joins (id TEXT PRIMARY KEY, match_id TEXT, cancelled INTEGER NOT NULL DEFAULT 0)',
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS allocations (id TEXT PRIMARY KEY, state TEXT NOT NULL, entries TEXT NOT NULL, grants TEXT NOT NULL, created_at INTEGER NOT NULL, reservation REAL NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, reserved REAL NOT NULL, actual REAL, done INTEGER NOT NULL DEFAULT 0)`,
    );
    const usageColumns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(usage)').toArray();

    if (!usageColumns.some((column) => column.name === 'kind'))
      ctx.storage.sql.exec('ALTER TABLE usage ADD COLUMN kind TEXT');
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS inference_waiters (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    );
    ctx.storage.transactionSync(() => {
      for (const table of ['tickets', 'joins', 'allocations']) {
        const columns = ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();

        if (!columns.some((column) => column.name === 'game_id'))
          ctx.storage.sql.exec(
            `ALTER TABLE ${table} ADD COLUMN game_id TEXT NOT NULL DEFAULT 'secret-overlord'`,
          );

        if (table === 'allocations' && !columns.some((column) => column.name === 'snapshot'))
          ctx.storage.sql.exec('ALTER TABLE allocations ADD COLUMN snapshot TEXT');
      }

      ctx.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS tickets_game_queue ON tickets(game_id, state, joined_at, agent_id)',
      );
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS coordinator_schema (version INTEGER PRIMARY KEY)');
      ctx.storage.sql.exec('INSERT OR IGNORE INTO coordinator_schema(version) VALUES (2)');
    });
    this.preview = new PreviewBrokerLedger(ctx, env, {
      capacity: (reservation) => this.capacity(reservation),
      reservation: (game) => this.reservation(game),
      reserve: (input) => this.reserveInference(input),
      record: (id, actual) => this.recordInference(id, actual),
      retire: (input) => this.retireInferenceWaiter(input),
    });
    this.previewTarget = new PreviewTargetAllocations(ctx, env);
  }

  private scale(): number {
    return Math.max(0.001, Number(this.env.TIME_SCALE) || 1);
  }
  private day(): string {
    return new Date().toISOString().slice(0, 10);
  }
  private allocations(): Allocation[] {
    return this.ctx.storage.sql
      .exec<Allocation>("SELECT * FROM allocations WHERE state != 'settled'")
      .toArray();
  }
  private reservation(gameId: RepositoryGameId): number {
    const override =
      gameId === 'succession' && 'HOUSE_SUCCESSION_MATCH_RESERVATION_USD' in this.env
        ? this.env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD
        : undefined;

    const configured =
      override === undefined || override === '' ? this.env.HOUSE_MATCH_RESERVATION_USD : override;

    const value = this.env.HOUSE_PROVIDER === 'preview' ? 0 : Number(configured);

    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid match reservation');

    return value;
  }
  private snapshot(gameId: RepositoryGameId, allHouse: boolean): MatchSnapshot {
    const descriptor = gameDescriptor(gameId);
    const timing = descriptor.timing;
    const scale = this.scale();
    const policyVersion = gameId === 'secret-overlord' ? 'house-4' : descriptor.housePolicyVersion;

    return {
      ...descriptor,
      housePolicyVersion: policyVersion,
      timing: {
        nomination: timing.nomination * scale,
        debate: timing.debate * scale,
        executive: timing.executive * scale,
        action: timing.action * scale,
        grace: timing.grace * scale,
        chatCooldown: timing.chatCooldown * scale,
      },
      mode: this.env.HOUSE_PROVIDER === 'preview' ? 'preview' : allHouse ? 'evaluation' : 'ranked',
      houseModel: { provider: this.env.HOUSE_PROVIDER, model: this.env.HOUSE_MODEL, policyVersion },
    };
  }
  private capacity(reservation = this.reservation('secret-overlord')): QueueStatus['capacity'] {
    const active = this.allocations();

    if (active.length >= Math.max(1, Number(this.env.MAX_CONCURRENT_MATCHES))) return 'busy';

    if (this.env.HOUSE_PROVIDER === 'preview') return 'available';

    const spent = this.ctx.storage.sql
      .exec<{ total: number }>(
        'SELECT coalesce(sum(coalesce(actual,reserved)),0) AS total FROM usage WHERE day = ?',
        this.day(),
      )
      .one().total;

    if (
      spent + active.reduce((sum, match) => sum + match.reservation, 0) + reservation >
      Number(this.env.HOUSE_DAILY_BUDGET_USD)
    )
      return 'budget';

    return 'available';
  }

  private queueCapacity(gameId: RepositoryGameId = 'secret-overlord'): QueueStatus['capacity'] {
    return previewEnabled(this.env)
      ? this.previewTarget.capacity(gameId)
      : this.capacity(this.reservation(gameId));
  }

  async retire(agentId: string, ownerId: string): Promise<RpcResult<{ retired: true }>> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const current = this.status(agentId);

      if (
        current.status === 'matched' ||
        (current.status === 'starting' &&
          (!current.matchId || !this.previewTarget.canCancel(current.matchId)))
      )
        return {
          ok: false,
          error: {
            code: 'agent-busy',
            message: 'Finish the current match before retiring this agent.',
            status: 409,
            gameId: current.gameId ?? undefined,
            matchId: current.matchId ?? undefined,
          },
        };
      this.cancel(agentId);
      await this.env.DB.batch([
        this.env.DB.prepare(
          'UPDATE agents SET retired_at = coalesce(retired_at, ?) WHERE id = ? AND owner_id = ?',
        ).bind(Date.now(), agentId, ownerId),
        this.env.DB.prepare(
          'UPDATE agent_grants SET revoked_at = coalesce(revoked_at, ?) WHERE agent_id = ?',
        ).bind(Date.now(), agentId),
      ]);

      return { ok: true, value: { retired: true } };
    });
  }

  async exhibition(gameId: RepositoryGameId = 'secret-overlord'): Promise<RpcResult<{ matchId: string }>> {
    validGame(gameId);
    const smoke = previewEnabled(this.env);
    const reservation = smoke ? 0 : this.reservation(gameId);
    const snapshot = smoke ? this.smokeSnapshot(gameId) : this.snapshot(gameId, true);

    if (
      this.env.ENVIRONMENT !== 'development' &&
      !(this.env.ENVIRONMENT === 'preview' && (smoke || this.env.HOUSE_PROVIDER === 'preview'))
    )
      return { ok: false, error: { code: 'not-found', message: 'Not found.', status: 404 } };

    if (this.capacity(reservation) !== 'available')
      return {
        ok: false,
        error: { code: 'capacity', message: 'The exhibition tables are busy.', status: 409 },
      };

    const houses = await this.env.DB.prepare(
      'SELECT id FROM agents WHERE house = 1 ORDER BY id LIMIT 10',
    ).all<{ id: string }>();

    const entries = await Promise.all(houses.results.map((house) => entrant(this.env, house.id, gameId)));

    if (this.capacity(reservation) !== 'available')
      return {
        ok: false,
        error: { code: 'capacity', message: 'The exhibition tables are busy.', status: 409 },
      };

    const allocation: Allocation = {
      game_id: gameId,
      snapshot: JSON.stringify(snapshot),
      id: opaqueId('match'),
      state: 'creating',
      entries: JSON.stringify(entries),
      grants: '{}',
      created_at: Date.now(),
      reservation,
    };

    this.ctx.storage.sql.exec(
      'INSERT INTO allocations (id, state, entries, grants, created_at, reservation, game_id, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      allocation.id,
      allocation.state,
      allocation.entries,
      allocation.grants,
      allocation.created_at,
      allocation.reservation,
      allocation.game_id,
      allocation.snapshot,
    );
    await this.finishAllocation(allocation);

    return { ok: true, value: { matchId: allocation.id } };
  }

  private smokeSnapshot(gameId: RepositoryGameId): MatchSnapshot {
    const descriptor = gameDescriptor(gameId);
    const timing = descriptor.timing;

    return {
      ...descriptor,
      mode: 'preview',
      timing: {
        nomination: timing.nomination * 0.1,
        debate: timing.debate * 0.1,
        executive: timing.executive * 0.1,
        action: timing.action * 0.1,
        grace: timing.grace * 0.1,
        chatCooldown: timing.chatCooldown * 0.1,
      },
      houseModel: { provider: 'preview', model: 'scripted', policyVersion: descriptor.housePolicyVersion },
    };
  }

  async join(
    principal: AgentPrincipal,
    requestId: string,
    gameId: RepositoryGameId = 'secret-overlord',
  ): Promise<RpcResult<PlatformQueueStatus>> {
    try {
      validGame(gameId);

      if (previewEnabled(this.env)) await this.previewTarget.refresh();

      const valid = await this.env.DB.prepare('SELECT id FROM agents WHERE id = ? AND retired_at IS NULL')
        .bind(principal.agentId)
        .first();

      if (!valid) throw new GameError('agent-retired', 'This agent is retired.');

      if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))
        throw new GameError(
          'request-id',
          'Supply a stable request ID of 8–100 letters, digits, underscores or hyphens.',
          400,
        );

      const receipt = this.ctx.storage.sql
        .exec<{ match_id: string | null; cancelled: number; game_id: RepositoryGameId }>(
          'SELECT match_id, cancelled, game_id FROM joins WHERE id = ?',
          `${principal.agentId}:${requestId}`,
        )
        .toArray()[0];

      if (receipt && receipt.game_id !== gameId)
        throw new GameError('request-id-conflict', 'This join request belongs to another game.');

      if (receipt?.match_id)
        return {
          ok: true,
          value: {
            requestId,
            ...queueIdentity(receipt.game_id),
            status: 'matched',
            matchId: receipt.match_id,
            joinedAt: null,
            fillAt: null,
            position: null,
            capacity: this.queueCapacity(receipt.game_id),
          },
        };

      if (receipt?.cancelled) return { ok: true, value: this.status(principal.agentId) };

      const current = this.ctx.storage.sql
        .exec<Ticket>('SELECT * FROM tickets WHERE agent_id = ?', principal.agentId)
        .toArray()[0];

      if (current && (current.grant_id !== principal.grantId || current.game_id !== gameId))
        return {
          ok: false,
          error: {
            code: 'agent-busy',
            message: `This agent already has a participation in ${current.game_id}.`,
            status: 409,
            gameId: current.game_id,
            matchId: current.match_id ?? undefined,
          },
        };

      if (!current)
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec(
            'INSERT INTO tickets (agent_id, owner_id, grant_id, expires_at, request_id, joined_at, state, game_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            principal.agentId,
            principal.ownerId,
            principal.grantId,
            principal.expiresAt,
            requestId,
            Date.now(),
            'queued',
            gameId,
          );
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO joins (id, game_id) VALUES (?, ?)',
            `${principal.agentId}:${requestId}`,
            gameId,
          );
        });
      await this.ctx.storage.setAlarm(Date.now() + 1);

      return { ok: true, value: this.status(principal.agentId) };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  status(agentId: string): PlatformQueueStatus {
    const ticket = this.ctx.storage.sql
      .exec<Ticket>('SELECT * FROM tickets WHERE agent_id = ?', agentId)
      .toArray()[0];

    if (!ticket)
      return {
        requestId: null,
        gameId: null,
        rulesVersion: null,
        protocolVersion: null,
        status: 'idle',
        matchId: null,
        joinedAt: null,
        fillAt: null,
        position: null,
        capacity: this.queueCapacity(),
      };

    const position = this.ctx.storage.sql
      .exec<{ n: number }>(
        "SELECT count(*) AS n FROM tickets WHERE state = 'queued' AND joined_at <= ? AND game_id = ?",
        ticket.joined_at,
        ticket.game_id,
      )
      .one().n;

    const oldest = this.ctx.storage.sql
      .exec<{ time: number | null }>(
        "SELECT min(joined_at) AS time FROM tickets WHERE state = 'queued' AND game_id = ?",
        ticket.game_id,
      )
      .one().time;

    return {
      requestId: ticket.request_id,
      ...queueIdentity(ticket.game_id),
      status: Match.value(ticket.state).pipe(
        Match.when('matched', () => 'matched' as const),
        Match.when('starting', () => 'starting' as const),
        Match.orElse(() => 'queued' as const),
      ),
      matchId: ticket.match_id,
      joinedAt: ticket.joined_at,
      fillAt: oldest === null ? null : oldest + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale(),
      position,
      capacity: this.queueCapacity(ticket.game_id),
    };
  }

  count(gameId: RepositoryGameId = 'secret-overlord'): number {
    validGame(gameId);

    return this.ctx.storage.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM tickets WHERE state = 'queued' AND game_id = ?", gameId)
      .one().n;
  }

  cancel(
    agentId: string,
    grantId?: string,
    expected?: { gameId: RepositoryGameId; requestId: string; joinedAt?: number },
  ): RpcResult<PlatformQueueStatus> {
    const ticket = this.ctx.storage.sql
      .exec<Ticket>('SELECT * FROM tickets WHERE agent_id = ?', agentId)
      .toArray()[0];

    if (!ticket) return { ok: true, value: this.status(agentId) };

    if (grantId && ticket.grant_id !== grantId)
      return {
        ok: false,
        error: {
          code: 'agent-busy',
          message: 'Another installation owns this queue entry.',
          status: 409,
          gameId: ticket.game_id,
          matchId: ticket.match_id ?? undefined,
        },
      };

    const cancellable =
      ticket.state === 'queued' ||
      (ticket.state === 'starting' && !!ticket.match_id && this.previewTarget.canCancel(ticket.match_id));

    if (
      expected &&
      (expected.gameId !== ticket.game_id ||
        expected.requestId !== ticket.request_id ||
        (expected.joinedAt !== undefined && expected.joinedAt !== ticket.joined_at) ||
        !cancellable)
    )
      return { ok: true, value: this.status(agentId) };

    if (!cancellable)
      return {
        ok: false,
        error: {
          code: 'match-started',
          message: 'This agent is already assigned to a match.',
          status: 409,
          gameId: ticket.game_id,
          matchId: ticket.match_id ?? undefined,
        },
      };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE agent_id = ?', agentId);
      this.ctx.storage.sql.exec(
        'UPDATE joins SET cancelled = 1 WHERE id = ?',
        `${agentId}:${ticket.request_id}`,
      );
    });
    this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 1));

    return { ok: true, value: this.status(agentId) };
  }

  async complete(matchId: string): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.previewTarget.close(matchId);
      this.ctx.storage.sql.exec("UPDATE allocations SET state = 'settled' WHERE id = ?", matchId);
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE match_id = ?', matchId);
      this.ctx.storage.sql.exec('DELETE FROM inference_waiters WHERE match_id = ?', matchId);
    });
    await this.ctx.storage.setAlarm(Date.now() + 1);
  }

  async revokeGrant(grantId: string): Promise<void> {
    const tickets = this.ctx.storage.sql
      .exec<Ticket>('SELECT * FROM tickets WHERE grant_id = ?', grantId)
      .toArray();

    for (const ticket of tickets) {
      if (ticket.state === 'queued') this.cancel(ticket.agent_id);
      else if (ticket.match_id) await this.env.MATCHES.getByName(ticket.match_id).revokeGrant(grantId);
    }
  }

  private funding(scope: 'match_id' | 'day', value: string): Funding[] {
    return this.ctx.storage.sql
      .exec<Funding>(
        `SELECT ${LEGACY_INFERENCE_KIND} AS kind, count(*) AS calls,
       sum(reserved) AS estimatedUsd, coalesce(sum(actual),0) AS measuredUsd,
       sum(coalesce(actual,reserved)) AS accountedUsd,
       sum(CASE WHEN done=1 OR expires_at<=? THEN coalesce(actual,reserved) ELSE 0 END) AS irreversibleUsd
       FROM usage WHERE ${scope}=? GROUP BY 1`,
        Date.now(),
        value,
      )
      .toArray();
  }

  reserveInference(input: InferenceRequest): InferenceReservation {
    const now = Date.now();

    const kind: InferenceKind = input.mandatory
      ? 'required'
      : (input.optionalKind ?? (input.id.includes(':chat:1:attempt:') ? 'followup' : 'initial'));

    const minimum = input.mandatory ? 500 : HOUSE_CHAT_MIN_REMAINING_MS;
    this.ctx.storage.sql.exec('DELETE FROM inference_waiters WHERE expires_at<=?', now);

    const deny = (
      reason: InferenceDenial,
      retryAt = input.deadline,
      transient = false,
    ): InferenceReservation => {
      const retryable = transient && retryAt > now && retryAt + minimum < input.deadline;

      if (retryable && kind !== 'followup')
        this.ctx.storage.sql.exec(
          'INSERT INTO inference_waiters(id,match_id,kind,expires_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at',
          input.id,
          input.matchId,
          kind,
          input.deadline - minimum,
        );
      else this.ctx.storage.sql.exec('DELETE FROM inference_waiters WHERE id=?', input.id);

      return { allowed: false, reason, retryable, retryAt: retryable ? retryAt : input.deadline };
    };

    if (!Number.isFinite(input.estimate) || input.estimate < 0) throw new Error('Invalid inference estimate');

    if (now >= input.deadline) return deny('expired');

    const existing = this.ctx.storage.sql
      .exec<{ done: number; match_id: string; kind: InferenceKind; reserved: number; expires_at: number }>(
        `SELECT done,match_id,${LEGACY_INFERENCE_KIND} AS kind,reserved,expires_at FROM usage WHERE id = ?`,
        input.id,
      )
      .toArray()[0];

    if (existing) {
      if (
        existing.match_id !== input.matchId ||
        existing.kind !== kind ||
        existing.reserved < input.estimate ||
        existing.expires_at !== input.deadline
      )
        return deny('request-conflict');

      if (existing.done) return deny('already-recorded');

      if (existing.expires_at <= now) return deny('expired');

      return { allowed: true, retryAt: now };
    }

    const allocation = this.ctx.storage.sql
      .exec<{ state: string; grants: string; reservation: number; snapshot: string | null }>(
        'SELECT state, grants, reservation, snapshot FROM allocations WHERE id = ?',
        input.matchId,
      )
      .toArray()[0];

    if (!allocation || allocation.state === 'settled') return deny('allocation-closed');

    const snapshot: MatchSnapshot | null = allocation.snapshot ? JSON.parse(allocation.snapshot) : null;

    const ceilings: { rows: Funding[]; limit: number; reason: InferenceDenial }[] = [];

    if (
      (allocation.grants === '{}' ||
        this.ctx.storage.sql
          .exec('SELECT id FROM preview_broker_allocations WHERE id=?', input.matchId)
          .toArray().length > 0) &&
      (snapshot?.houseModel.provider ?? this.env.HOUSE_PROVIDER) !== 'preview'
    ) {
      const funds = this.funding('match_id', input.matchId);
      ceilings.push({ rows: funds, limit: allocation.reservation, reason: 'match-budget' });

      if (!input.mandatory) {
        const optionalLimit = allocation.reservation * OPTIONAL_SHARE;

        if (kind === 'followup') {
          ceilings.push({
            rows: funds.filter((row) => row.kind === 'followup'),
            limit: optionalLimit * FOLLOWUP_SHARE,
            reason: 'followup-budget',
          });
        }

        ceilings.push({
          rows: funds.filter((row) => row.kind !== 'required'),
          limit: optionalLimit,
          reason: 'optional-budget',
        });
      }
    }

    if (!input.mandatory)
      ceilings.push({
        rows: this.funding('day', this.day()),
        limit: Number(this.env.HOUSE_DAILY_BUDGET_USD),
        reason: 'daily-budget',
      });

    // Waiting only helps if every applicable ceiling fits irreversible usage.
    // Prefer a permanent denial over transient pressure in another envelope.
    let pressure: InferenceDenial | null = null;

    for (const { rows, limit, reason } of ceilings) {
      const irreversible = rows.reduce((sum, row) => sum + row.irreversibleUsd, 0);

      if (irreversible + input.estimate > limit) return deny(reason);
      const accounted = rows.reduce((sum, row) => sum + row.accountedUsd, 0);

      if (accounted + input.estimate > limit) pressure ??= reason;
    }

    if (pressure) return deny(pressure, now + INFERENCE_RETRY_MS, true);

    const recent = this.ctx.storage.sql
      .exec<{ count: number; oldest: number | null }>(
        'SELECT count(*) AS count, min(created_at) AS oldest FROM usage WHERE created_at > ?',
        now - 60_000,
      )
      .one();

    const limit = input.mandatory ? 250 : 180;

    if (recent.count >= limit) return deny('rate-limit', (recent.oldest ?? now) + 60_001, true);

    if (!input.mandatory) {
      if (
        this.ctx.storage.sql.exec("SELECT id FROM inference_waiters WHERE kind='required' LIMIT 1").toArray()
          .length
      )
        return deny('required-priority', now + INFERENCE_RETRY_MS, true);

      if (
        kind === 'followup' &&
        this.ctx.storage.sql
          .exec("SELECT id FROM inference_waiters WHERE kind='initial' AND match_id=? LIMIT 1", input.matchId)
          .toArray().length
      )
        return deny('initial-priority', now + INFERENCE_RETRY_MS, true);
    }

    this.ctx.storage.sql.exec('DELETE FROM inference_waiters WHERE id=?', input.id);
    this.ctx.storage.sql.exec(
      'INSERT INTO usage (id, match_id, day, created_at, expires_at, reserved, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
      input.id,
      input.matchId,
      this.day(),
      now,
      input.deadline,
      input.estimate,
      kind,
    );

    return { allowed: true, retryAt: now };
  }

  /** Retire priority only. Usage (including unknown or live reservations) is untouched. */
  retireInferenceWaiter(input: Pick<InferenceRequest, 'id' | 'matchId'>): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM inference_waiters WHERE id=? AND match_id=?',
      input.id,
      input.matchId,
    );
  }

  recordInference(id: string, actual: number | null): void {
    this.ctx.storage.sql.exec('UPDATE usage SET done = 1, actual = ? WHERE id = ? AND done = 0', actual, id);
    this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 1));
  }

  inferenceSummary(matchId: string) {
    const rows = this.ctx.storage.sql
      .exec<{ created_at: number; actual: number | null; reserved: number; done: number }>(
        'SELECT created_at, actual, reserved, done FROM usage WHERE match_id = ? ORDER BY created_at',
        matchId,
      )
      .toArray();

    let left = 0;
    let peakRollingRpm = 0;

    for (let right = 0; right < rows.length; right++) {
      while (rows[right].created_at - rows[left].created_at >= 60_000) left++;
      peakRollingRpm = Math.max(peakRollingRpm, right - left + 1);
    }

    return {
      calls: rows.length,
      unknownUsageCalls: rows.filter((row) => row.actual === null).length,
      measuredUsd: rows.reduce((sum, row) => sum + (row.actual ?? 0), 0),
      accountedUsd: rows.reduce((sum, row) => sum + (row.actual ?? row.reserved), 0),
      peakRollingRpm,
      funding: this.funding('match_id', matchId),
    };
  }

  async alarm(): Promise<void> {
    try {
      if (!previewEnabled(this.env)) this.preview.dispatchReconciliation();

      for (const ticket of this.ctx.storage.sql
        .exec<Ticket>("SELECT * FROM tickets WHERE state = 'queued' AND expires_at <= ?", Date.now())
        .toArray())
        this.cancel(ticket.agent_id);

      for (const allocation of this.allocations().filter((entry) => entry.state === 'creating'))
        await this.finishAllocation(allocation);

      if (previewEnabled(this.env) && this.candidates().length) await this.previewTarget.refresh();

      while (true) {
        const candidate = this.candidates().find(
          (entry) => this.ready(entry.tickets) && this.queueCapacity(entry.gameId) === 'available',
        );

        if (!candidate) break;
        const { tickets: selected, gameId, reservation } = candidate;
        const snapshot = this.snapshot(gameId, false);
        const valid: Ticket[] = [];

        for (const ticket of selected) {
          const grant = await this.env.DB.prepare(
            'SELECT g.id FROM agent_grants g JOIN agents a ON a.id = g.agent_id WHERE g.id = ? AND g.revoked_at IS NULL AND g.expires_at > ? AND a.retired_at IS NULL',
          )
            .bind(ticket.grant_id, Date.now())
            .first<{ id: string }>();

          if (grant) valid.push(ticket);
          else this.cancel(ticket.agent_id);
        }

        if (!this.ready(valid)) continue;

        const houses = (
          await this.env.DB.prepare('SELECT id FROM agents WHERE house = 1 AND retired_at IS NULL').all<{
            id: string;
          }>()
        ).results;

        const entries = await Promise.all(
          [
            ...valid.map((ticket) => ticket.agent_id),
            ...shuffle(houses)
              .slice(0, 10 - valid.length)
              .map((house) => house.id),
          ].map((id) => entrant(this.env, id, gameId)),
        );

        const id = opaqueId('match');

        const previewIntent = previewEnabled(this.env)
          ? await this.previewTarget.prepare(id, valid, gameId)
          : null;

        // External reads may interleave with cancellation. Recheck the exact tickets before reservation.
        if (
          valid.some(
            (ticket) =>
              !this.ctx.storage.sql
                .exec<{ id: string }>(
                  "SELECT agent_id AS id FROM tickets WHERE agent_id = ? AND request_id = ? AND game_id = ? AND grant_id = ? AND joined_at = ? AND expires_at > ? AND state = 'queued'",
                  ticket.agent_id,
                  ticket.request_id,
                  ticket.game_id,
                  ticket.grant_id,
                  ticket.joined_at,
                  Date.now(),
                )
                .toArray().length,
          )
        )
          continue;

        // Other admissions can interleave while the entrant/credential reads await D1.
        if (this.queueCapacity(gameId) !== 'available') continue;

        if (entries.length !== 10)
          throw new GameError('house-unavailable', 'Ten distinct entrants are required.');
        const grants = Object.fromEntries(valid.map((ticket) => [ticket.agent_id, ticket.grant_id]));

        const allocation: Allocation = {
          game_id: gameId,
          snapshot: JSON.stringify(snapshot),
          id,
          state: 'creating',
          entries: JSON.stringify(entries),
          grants: JSON.stringify(grants),
          created_at: Date.now(),
          reservation,
        };

        this.ctx.storage.transactionSync(() => {
          if (previewIntent) this.previewTarget.persist(previewIntent);
          this.ctx.storage.sql.exec(
            'INSERT INTO allocations (id, state, entries, grants, created_at, reservation, game_id, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            id,
            allocation.state,
            allocation.entries,
            allocation.grants,
            allocation.created_at,
            allocation.reservation,
            allocation.game_id,
            allocation.snapshot,
          );

          for (const ticket of valid)
            this.ctx.storage.sql.exec(
              "UPDATE tickets SET state = 'starting', match_id = ? WHERE agent_id = ?",
              id,
              ticket.agent_id,
            );
        });
        await this.finishAllocation(allocation);

        // The source has the only live-preview slot; refresh before considering another local admission.
        if (previewIntent) await this.previewTarget.refresh();
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'matchmaking_retry',
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    } finally {
      this.previewTarget.dispatchCleanup();
      await this.schedule();
    }
  }

  private ready(tickets: Ticket[]): boolean {
    return tickets.length >= 10 || (tickets.length > 0 && Date.now() >= this.fillAt(tickets[0]));
  }

  private fillAt(ticket: Ticket): number {
    if (previewEnabled(this.env)) return ticket.joined_at + 30000;

    return ticket.joined_at + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale();
  }

  private candidates() {
    return GAME_IDS.flatMap((gameId) => {
      // Select the oldest ticket of each owner without an arbitrary prefix that can starve later owners.
      const tickets = this.ctx.storage.sql
        .exec<Ticket>(
          `SELECT t.* FROM tickets t WHERE t.game_id = ? AND t.state = 'queued'
        AND NOT EXISTS (SELECT 1 FROM tickets p WHERE p.game_id = t.game_id AND p.state = 'queued'
          AND p.owner_id = t.owner_id AND (p.joined_at < t.joined_at OR (p.joined_at = t.joined_at AND p.agent_id < t.agent_id)))
        ORDER BY t.joined_at, t.agent_id LIMIT 10`,
          gameId,
        )
        .toArray();

      return tickets.length ? [{ gameId, tickets, reservation: this.reservation(gameId) }] : [];
    }).sort(
      (left, right) =>
        left.tickets[0].joined_at - right.tickets[0].joined_at ||
        left.gameId.localeCompare(right.gameId) ||
        left.tickets[0].agent_id.localeCompare(right.tickets[0].agent_id),
    );
  }

  private async schedule(): Promise<void> {
    const now = Date.now();
    const candidates = this.candidates();
    const creating = this.allocations().some((allocation) => allocation.state === 'creating');

    const cleanup = this.previewTarget.cleanupAt();

    if (!candidates.length && !creating && cleanup === null && !this.preview.needsReconciliation()) return;
    const times = [now + 30_000];

    if (cleanup !== null) times.push(Math.max(now + 1, cleanup));

    const expiry = this.ctx.storage.sql
      .exec<{ at: number | null }>("SELECT min(expires_at) AS at FROM tickets WHERE state = 'queued'")
      .one().at;

    if (expiry !== null) times.push(Math.max(now + 1, expiry));

    if (creating) times.push(now + 1000);

    for (const candidate of candidates) {
      const fill = this.fillAt(candidate.tickets[0]);

      if (fill > now) times.push(fill);

      for (const ticket of candidate.tickets) if (ticket.expires_at > now) times.push(ticket.expires_at);

      if (this.queueCapacity(candidate.gameId) === 'budget') {
        const day = new Date(now);
        times.push(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
      }
    }

    await this.ctx.storage.setAlarm(Math.max(now + 1, Math.min(...times)));
  }

  private async finishAllocation(allocation: Allocation): Promise<void> {
    const input: MatchInitialization = {
      id: allocation.id,
      entrants: JSON.parse(allocation.entries),
      grants: JSON.parse(allocation.grants),
      gameId: allocation.game_id,
      reservationUsd: allocation.reservation,
    };

    if (allocation.snapshot) input.snapshot = JSON.parse(allocation.snapshot);

    const preview = await this.previewTarget.finish(input);

    if (preview === 'abandoned') return;

    if (preview === 'ordinary') await this.env.MATCHES.getByName(allocation.id).initialize(input);
    this.ctx.storage.transactionSync(() => {
      this.previewTarget.recoverParticipation(allocation.id);
      this.ctx.storage.sql.exec(
        "UPDATE allocations SET state = 'active' WHERE id = ? AND state = 'creating'",
        allocation.id,
      );

      const tickets = this.ctx.storage.sql
        .exec<Ticket>('SELECT * FROM tickets WHERE match_id = ?', allocation.id)
        .toArray();

      for (const ticket of tickets)
        this.ctx.storage.sql.exec(
          'UPDATE joins SET match_id = ? WHERE id = ?',
          allocation.id,
          `${ticket.agent_id}:${ticket.request_id}`,
        );
      this.ctx.storage.sql.exec("UPDATE tickets SET state = 'matched' WHERE match_id = ?", allocation.id);
    });
  }
}

/** Both logical game queues share the deployed coordinator and its global limits. */
export function platformCoordinator(env: Pick<Env, 'MATCHMAKING'>) {
  return env.MATCHMAKING.getByName('secret-overlord');
}
