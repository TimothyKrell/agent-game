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

interface InferenceReservation {
  allowed: boolean;
  retryAt: number;
}

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

  async retire(agentId: string, ownerId: string): Promise<RpcResult<{ retired: true }>> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const current = this.status(agentId);

      if (current.status === 'matched' || current.status === 'starting')
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
    const reservation = this.reservation(gameId);
    const snapshot = this.snapshot(gameId, true);

    if (
      this.env.ENVIRONMENT !== 'development' &&
      !(this.env.ENVIRONMENT === 'preview' && this.env.HOUSE_PROVIDER === 'preview')
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

  async join(
    principal: AgentPrincipal,
    requestId: string,
    gameId: RepositoryGameId = 'secret-overlord',
  ): Promise<RpcResult<PlatformQueueStatus>> {
    try {
      validGame(gameId);

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
            capacity: this.capacity(),
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
        capacity: this.capacity(),
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
      capacity: this.capacity(this.reservation(ticket.game_id)),
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

    if (
      expected &&
      (expected.gameId !== ticket.game_id ||
        expected.requestId !== ticket.request_id ||
        (expected.joinedAt !== undefined && expected.joinedAt !== ticket.joined_at) ||
        ticket.state !== 'queued')
    )
      return { ok: true, value: this.status(agentId) };

    if (ticket.state !== 'queued')
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
      this.ctx.storage.sql.exec("UPDATE allocations SET state = 'settled' WHERE id = ?", matchId);
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE match_id = ?', matchId);
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

  reserveInference(input: {
    id: string;
    matchId: string;
    estimate: number;
    deadline: number;
    mandatory: boolean;
  }): InferenceReservation {
    const existing = this.ctx.storage.sql
      .exec<{ done: number }>('SELECT done FROM usage WHERE id = ?', input.id)
      .toArray()[0];

    if (existing) return { allowed: existing.done === 0, retryAt: Date.now() + 1000 };

    const allocation = this.ctx.storage.sql
      .exec<{ state: string; grants: string; reservation: number; snapshot: string | null }>(
        'SELECT state, grants, reservation, snapshot FROM allocations WHERE id = ?',
        input.matchId,
      )
      .toArray()[0];

    if (!allocation || allocation.state === 'settled') return { allowed: false, retryAt: input.deadline };

    const snapshot: MatchSnapshot | null = allocation.snapshot ? JSON.parse(allocation.snapshot) : null;

    if (
      allocation.grants === '{}' &&
      (snapshot?.houseModel.provider ?? this.env.HOUSE_PROVIDER) !== 'preview'
    ) {
      const used = this.inferenceSummary(input.matchId).accountedUsd;

      if (used + input.estimate > allocation.reservation) return { allowed: false, retryAt: input.deadline };
    }

    const now = Date.now();

    const recent = this.ctx.storage.sql
      .exec<{ count: number; oldest: number | null }>(
        'SELECT count(*) AS count, min(created_at) AS oldest FROM usage WHERE created_at > ?',
        now - 60_000,
      )
      .one();

    const limit = input.mandatory ? 250 : 180;

    if (recent.count >= limit) return { allowed: false, retryAt: (recent.oldest ?? now) + 60_001 };

    if (!input.mandatory) {
      const spent = this.ctx.storage.sql
        .exec<{ total: number }>(
          'SELECT coalesce(sum(coalesce(actual,reserved)),0) AS total FROM usage WHERE day = ?',
          this.day(),
        )
        .one().total;

      if (spent + input.estimate > Number(this.env.HOUSE_DAILY_BUDGET_USD))
        return { allowed: false, retryAt: input.deadline };
    }

    this.ctx.storage.sql.exec(
      'INSERT INTO usage (id, match_id, day, created_at, expires_at, reserved) VALUES (?, ?, ?, ?, ?, ?)',
      input.id,
      input.matchId,
      this.day(),
      now,
      input.deadline,
      input.estimate,
    );

    return { allowed: true, retryAt: now };
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
    };
  }

  async alarm(): Promise<void> {
    try {
      for (const ticket of this.ctx.storage.sql
        .exec<Ticket>("SELECT * FROM tickets WHERE state = 'queued' AND expires_at <= ?", Date.now())
        .toArray())
        this.cancel(ticket.agent_id);

      for (const allocation of this.allocations().filter((entry) => entry.state === 'creating'))
        await this.finishAllocation(allocation);

      while (true) {
        const candidate = this.candidates().find(
          (entry) => this.ready(entry.tickets) && this.capacity(entry.reservation) === 'available',
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
        if (this.capacity(reservation) !== 'available') continue;

        if (entries.length !== 10)
          throw new GameError('house-unavailable', 'Ten distinct entrants are required.');
        const id = opaqueId('match');
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
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'matchmaking_retry',
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    } finally {
      await this.schedule();
    }
  }

  private ready(tickets: Ticket[]): boolean {
    return tickets.length >= 10 || (tickets.length > 0 && Date.now() >= this.fillAt(tickets[0]));
  }

  private fillAt(ticket: Ticket): number {
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

    if (!candidates.length && !creating) return;
    const times = [now + 30_000];

    const expiry = this.ctx.storage.sql
      .exec<{ at: number | null }>("SELECT min(expires_at) AS at FROM tickets WHERE state = 'queued'")
      .one().at;

    if (expiry !== null) times.push(Math.max(now + 1, expiry));

    if (creating) times.push(now + 1000);

    for (const candidate of candidates) {
      const fill = this.fillAt(candidate.tickets[0]);

      if (fill > now) times.push(fill);

      for (const ticket of candidate.tickets) if (ticket.expires_at > now) times.push(ticket.expires_at);

      if (this.capacity(candidate.reservation) === 'budget') {
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

    await this.env.MATCHES.getByName(allocation.id).initialize(input);
    this.ctx.storage.transactionSync(() => {
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
