import { DurableObject } from 'cloudflare:workers';
import { Match } from 'effect';
import { GameError } from '../game/types';
import { shuffle } from '../game/random';
import type { Entrant } from '../game/types';
import type { QueueStatus, RpcResult } from '../shared/api';
import type { AgentPrincipal } from './auth';
import { entrant } from './repository';
import { fault, opaqueId } from './http';

type Ticket = {
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
}

interface InferenceReservation {
  allowed: boolean;
  retryAt: number;
}

/** One coordination object per game queue; match actions never pass through this object. */
export class MatchmakingObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
  private capacity(): QueueStatus['capacity'] {
    const active = this.allocations();

    if (active.length >= Math.max(1, Number(this.env.MAX_CONCURRENT_MATCHES))) return 'busy';

    if (this.env.HOUSE_PROVIDER === 'preview') return 'available';

    const spent = this.ctx.storage.sql
      .exec<{ total: number }>(
        'SELECT coalesce(sum(coalesce(actual,reserved)),0) AS total FROM usage WHERE day = ?',
        this.day(),
      )
      .one().total;

    const reservation = Number(this.env.HOUSE_MATCH_RESERVATION_USD);

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

  async exhibition(): Promise<RpcResult<{ matchId: string }>> {
    if (
      this.env.ENVIRONMENT !== 'development' &&
      !(this.env.ENVIRONMENT === 'preview' && this.env.HOUSE_PROVIDER === 'preview')
    )
      return { ok: false, error: { code: 'not-found', message: 'Not found.', status: 404 } };

    if (this.capacity() !== 'available')
      return {
        ok: false,
        error: { code: 'capacity', message: 'The exhibition tables are busy.', status: 409 },
      };

    const houses = await this.env.DB.prepare(
      'SELECT id FROM agents WHERE house = 1 ORDER BY id LIMIT 10',
    ).all<{ id: string }>();

    const entries = await Promise.all(houses.results.map((house) => entrant(this.env, house.id)));

    if (this.capacity() !== 'available')
      return {
        ok: false,
        error: { code: 'capacity', message: 'The exhibition tables are busy.', status: 409 },
      };

    const allocation: Allocation = {
      id: opaqueId('match'),
      state: 'creating',
      entries: JSON.stringify(entries),
      grants: '{}',
      created_at: Date.now(),
      reservation: this.env.HOUSE_PROVIDER === 'preview' ? 0 : Number(this.env.HOUSE_MATCH_RESERVATION_USD),
    };

    this.ctx.storage.sql.exec(
      'INSERT INTO allocations (id, state, entries, grants, created_at, reservation) VALUES (?, ?, ?, ?, ?, ?)',
      allocation.id,
      allocation.state,
      allocation.entries,
      allocation.grants,
      allocation.created_at,
      allocation.reservation,
    );
    await this.finishAllocation(allocation);

    return { ok: true, value: { matchId: allocation.id } };
  }

  async join(principal: AgentPrincipal, requestId: string): Promise<RpcResult<QueueStatus>> {
    try {
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
        .exec<{ match_id: string | null; cancelled: number }>(
          'SELECT match_id, cancelled FROM joins WHERE id = ?',
          `${principal.agentId}:${requestId}`,
        )
        .toArray()[0];

      if (receipt?.match_id)
        return {
          ok: true,
          value: {
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

      if (current && current.grant_id !== principal.grantId)
        throw new GameError(
          'agent-busy',
          'Another installation controls this agent’s current participation.',
        );

      if (!current)
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec(
            'INSERT INTO tickets (agent_id, owner_id, grant_id, expires_at, request_id, joined_at, state) VALUES (?, ?, ?, ?, ?, ?, ?)',
            principal.agentId,
            principal.ownerId,
            principal.grantId,
            principal.expiresAt,
            requestId,
            Date.now(),
            'queued',
          );
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO joins (id) VALUES (?)',
            `${principal.agentId}:${requestId}`,
          );
        });
      await this.ctx.storage.setAlarm(Date.now() + 1);

      return { ok: true, value: this.status(principal.agentId) };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  status(agentId: string): QueueStatus {
    const ticket = this.ctx.storage.sql
      .exec<Ticket>('SELECT * FROM tickets WHERE agent_id = ?', agentId)
      .toArray()[0];

    if (!ticket)
      return {
        status: 'idle',
        matchId: null,
        joinedAt: null,
        fillAt: null,
        position: null,
        capacity: this.capacity(),
      };

    const position = this.ctx.storage.sql
      .exec<{ n: number }>(
        "SELECT count(*) AS n FROM tickets WHERE state = 'queued' AND joined_at <= ?",
        ticket.joined_at,
      )
      .one().n;

    const oldest = this.ctx.storage.sql
      .exec<{ time: number | null }>("SELECT min(joined_at) AS time FROM tickets WHERE state = 'queued'")
      .one().time;

    return {
      status: Match.value(ticket.state).pipe(
        Match.when('matched', () => 'matched' as const),
        Match.when('starting', () => 'starting' as const),
        Match.orElse(() => 'queued' as const),
      ),
      matchId: ticket.match_id,
      joinedAt: ticket.joined_at,
      fillAt: oldest === null ? null : oldest + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale(),
      position,
      capacity: this.capacity(),
    };
  }

  count(): number {
    return this.ctx.storage.sql
      .exec<{ n: number }>("SELECT count(*) AS n FROM tickets WHERE state = 'queued'")
      .one().n;
  }

  cancel(agentId: string, grantId?: string): RpcResult<QueueStatus> {
    const ticket = this.ctx.storage.sql
      .exec<Ticket>('SELECT * FROM tickets WHERE agent_id = ?', agentId)
      .toArray()[0];

    if (!ticket) return { ok: true, value: this.status(agentId) };

    if (ticket.state !== 'queued')
      return {
        ok: false,
        error: { code: 'match-started', message: 'This agent is already assigned to a match.', status: 409 },
      };

    if (grantId && ticket.grant_id !== grantId)
      return {
        ok: false,
        error: { code: 'agent-busy', message: 'Another installation owns this queue entry.', status: 409 },
      };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE agent_id = ?', agentId);
      this.ctx.storage.sql.exec(
        'UPDATE joins SET cancelled = 1 WHERE id = ?',
        `${agentId}:${ticket.request_id}`,
      );
    });

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
      .exec<{ state: string; grants: string; reservation: number }>(
        'SELECT state, grants, reservation FROM allocations WHERE id = ?',
        input.matchId,
      )
      .toArray()[0];

    if (!allocation || allocation.state === 'settled') return { allowed: false, retryAt: input.deadline };

    if (allocation.grants === '{}' && this.env.HOUSE_PROVIDER !== 'preview') {
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

      while (this.capacity() === 'available') {
        const all = this.ctx.storage.sql
          .exec<Ticket>(
            "SELECT * FROM tickets WHERE state = 'queued' ORDER BY joined_at, agent_id LIMIT 1000",
          )
          .toArray();

        const owners = new Set<string>();

        const selected = all
          .filter((ticket) => {
            if (owners.has(ticket.owner_id)) return false;
            owners.add(ticket.owner_id);

            return true;
          })
          .slice(0, 10);

        if (!selected.length) break;

        if (
          selected.length < 10 &&
          Date.now() < selected[0].joined_at + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale()
        )
          break;
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

        if (!valid.length) continue;

        if (
          valid.length < 10 &&
          Date.now() < valid[0].joined_at + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale()
        )
          break;

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
          ].map((id) => entrant(this.env, id)),
        );

        // External reads may interleave with cancellation. Recheck the exact tickets before reservation.
        if (
          valid.some(
            (ticket) =>
              !this.ctx.storage.sql
                .exec<{ id: string }>(
                  "SELECT agent_id AS id FROM tickets WHERE agent_id = ? AND request_id = ? AND state = 'queued'",
                  ticket.agent_id,
                  ticket.request_id,
                )
                .toArray().length,
          )
        )
          continue;

        // Other admissions can interleave while the entrant/credential reads await D1.
        if (this.capacity() !== 'available') break;
        const id = opaqueId('match');
        const grants = Object.fromEntries(valid.map((ticket) => [ticket.agent_id, ticket.grant_id]));

        const allocation: Allocation = {
          id,
          state: 'creating',
          entries: JSON.stringify(entries),
          grants: JSON.stringify(grants),
          created_at: Date.now(),
          reservation:
            this.env.HOUSE_PROVIDER === 'preview' ? 0 : Number(this.env.HOUSE_MATCH_RESERVATION_USD),
        };

        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec(
            'INSERT INTO allocations (id, state, entries, grants, created_at, reservation) VALUES (?, ?, ?, ?, ?, ?)',
            id,
            allocation.state,
            allocation.entries,
            allocation.grants,
            allocation.created_at,
            allocation.reservation,
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
      if (this.count() || this.allocations().some((entry) => entry.state === 'creating')) {
        const oldest = this.ctx.storage.sql
          .exec<{ time: number | null }>("SELECT min(joined_at) AS time FROM tickets WHERE state = 'queued'")
          .one().time;

        const wait = Math.max(
          250,
          Math.min(
            30_000,
            (oldest ?? Date.now()) + Number(this.env.QUEUE_WAIT_SECONDS) * 1000 * this.scale() - Date.now(),
          ),
        );

        await this.ctx.storage.setAlarm(Date.now() + (this.capacity() === 'available' ? wait : 30_000));
      }
    }
  }

  private async finishAllocation(allocation: Allocation): Promise<void> {
    const input: MatchInitialization = {
      id: allocation.id,
      entrants: JSON.parse(allocation.entries),
      grants: JSON.parse(allocation.grants),
    };

    await this.env.MATCHES.getByName(allocation.id).initialize(input);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("UPDATE allocations SET state = 'active' WHERE id = ?", allocation.id);

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
