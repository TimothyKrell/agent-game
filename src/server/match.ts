import { DurableObject } from 'cloudflare:workers';
import { Schema } from 'effect';
import { act, advance, createMatch, interruptMatch, nextDeadline, recoverMatch } from '../game/engine';
import { observe } from '../game/observation';
import { DEFAULT_TIMING, GameError, terminal } from '../game/types';
import type { ActionRequest, GameEvent, MatchState, Observation, Timing } from '../game/types';
import type { RpcResult } from '../shared/api';
import { ActionRequestSchema } from '../shared/api';
import type { AgentPrincipal } from './auth';
import type { HouseJob, HouseModelConfig } from './house-contract';
import type { MatchInitialization } from './matchmaking';
import { fault, hashSecret, json, randomSecret, stableJson } from './http';
import { finalizeRatings, indexMatch } from './repository';

const SocketStateSchema = Schema.Struct({
  seat: Schema.NullOr(Schema.Number),
  grantId: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.Number),
  cursor: Schema.Number,
});

type SocketState = typeof SocketStateSchema.Type;

type Ticket = { seat: number; grant_id: string; grant_expires: number; expires_at: number };

export class MatchObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS socket_tickets (hash TEXT PRIMARY KEY, seat INTEGER NOT NULL, grant_id TEXT NOT NULL, grant_expires INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
    );
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS revoked (grant_id TEXT PRIMARY KEY)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private getMeta(key: string): string | null {
    return (
      this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]
        ?.value ?? null
    );
  }
  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
  private load(): MatchState {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM game WHERE id = 1')
      .toArray()[0];

    if (!row) throw new GameError('match-not-found', 'Match not found.', 404);
    // Application-owned versioned persistence; external payloads are decoded separately.
    const state: MatchState = JSON.parse(row.data);

    if (state.rulesVersion !== 'secret-overlord-1') throw new Error('Unsupported persisted rules version');
    state.events = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM events ORDER BY id')
      .toArray()
      .map((event): GameEvent => JSON.parse(event.data));

    return state;
  }

  private save(state: MatchState, previous: MatchState | null): void {
    const { events, ...record } = state;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO game (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        JSON.stringify(record),
      );

      for (const event of events.slice(previous?.events.length ?? 0))
        this.ctx.storage.sql.exec(
          'INSERT INTO events (id, data) VALUES (?, ?)',
          event.id,
          JSON.stringify(event),
        );

      if (
        !previous ||
        previous.phase.id !== state.phase.id ||
        previous.seats.some((seat, i) => seat.generation !== state.seats[i].generation)
      )
        this.setMeta('index-dirty', '1');
      this.enqueueWork(state);
    });
  }

  async initialize(input: MatchInitialization): Promise<void> {
    if (!this.ctx.storage.sql.exec('SELECT id FROM game WHERE id = 1').toArray().length) {
      const scale = Math.max(0.001, Number(this.env.TIME_SCALE) || 1);

      const timing: Timing = {
        nomination: DEFAULT_TIMING.nomination * scale,
        debate: DEFAULT_TIMING.debate * scale,
        executive: DEFAULT_TIMING.executive * scale,
        action: DEFAULT_TIMING.action * scale,
        grace: DEFAULT_TIMING.grace * scale,
        chatCooldown: DEFAULT_TIMING.chatCooldown * scale,
      };

      const provider = this.env.HOUSE_PROVIDER;

      if (provider !== 'preview' && provider !== 'workers-ai' && provider !== 'openai')
        throw new Error('Unsupported house provider');
      const config: HouseModelConfig = { provider, model: this.env.HOUSE_MODEL, policyVersion: 'house-4' };

      const state = createMatch(input.id, input.entrants, Date.now(), {
        timing,
        mode:
          provider === 'preview'
            ? 'preview'
            : input.entrants.every((entrant) => entrant.house)
              ? 'evaluation'
              : 'ranked',
      });

      state.houseModel = config;
      this.ctx.storage.transactionSync(() => {
        this.setMeta('grants', JSON.stringify(input.grants));
        this.setMeta('model', JSON.stringify(config));
        this.save(state, null);
      });
    }

    await this.arm();
  }

  private seatFor(state: MatchState, principal: AgentPrincipal): number {
    const seat = state.seats.find((entry) => entry.entrant.agentId === principal.agentId);
    const grants: Record<string, string> = JSON.parse(this.getMeta('grants') ?? '{}');

    if (!seat || grants[principal.agentId] !== principal.grantId || this.isRevoked(principal.grantId))
      throw new GameError(
        'not-your-match',
        'This connection does not control a participant in this match.',
        403,
      );

    return seat.number;
  }
  private isRevoked(grantId: string): boolean {
    return !!this.ctx.storage.sql.exec('SELECT grant_id FROM revoked WHERE grant_id = ?', grantId).toArray()
      .length;
  }

  private reconcile(): MatchState {
    const previous = this.load();
    const now = Date.now();
    const due = Number(this.getMeta('alarm-due') ?? 0);

    const state =
      due && now - due > 5000 && !terminal(previous) ? recoverMatch(previous, now) : advance(previous, now);

    if (
      state !== previous &&
      state.events.some((event) => event.id > previous.events.length && event.type === 'recovered')
    )
      this.setMeta('alarm-due', String(now));

    if (state !== previous) {
      this.save(state, previous);
      this.broadcast(state);
    }

    return state;
  }

  async observation(principal: AgentPrincipal | null, after = 0): Promise<RpcResult<Observation>> {
    try {
      const state = this.reconcile();
      const seat = principal ? this.seatFor(state, principal) : null;
      await this.arm();

      return { ok: true, value: observe(state, seat, after) };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async submit(
    principal: AgentPrincipal,
    request: ActionRequest,
  ): Promise<RpcResult<{ accepted: true; actionId: string; observation: Observation }>> {
    try {
      const state = this.reconcile();
      const seat = this.seatFor(state, principal);
      const receiptKey = `${principal.agentId}:${request.actionId}`;
      const fingerprint = stableJson(request);

      const receipt = this.ctx.storage.sql
        .exec<{ fingerprint: string }>('SELECT fingerprint FROM receipts WHERE id = ?', receiptKey)
        .toArray()[0];

      if (receipt && receipt.fingerprint !== fingerprint)
        throw new GameError('action-id-conflict', 'This action ID was already used with different input.');

      if (!receipt) {
        if (state.seats[seat].forfeited || state.seats[seat].houseProfile)
          throw new GameError('controller-replaced', 'A house agent has taken over this seat.');
        const updated = act(state, seat, state.seats[seat].generation, request, Date.now());
        this.ctx.storage.transactionSync(() => {
          this.save(updated, state);
          this.ctx.storage.sql.exec(
            'INSERT INTO receipts (id, fingerprint) VALUES (?, ?)',
            receiptKey,
            fingerprint,
          );
        });
        this.broadcast(updated);
      }

      await this.arm();

      return {
        ok: true,
        value: { accepted: true, actionId: request.actionId, observation: observe(this.load(), seat) },
      };
    } catch (error) {
      await this.arm();

      return { ok: false, error: fault(error) };
    }
  }

  async houseObservation(
    seat: number,
    generation: number,
    phaseId: string,
  ): Promise<{ observation: Observation; persona: string } | null> {
    const state = this.reconcile();
    await this.arm();
    const entry = state.seats[seat];

    if (
      !entry?.alive ||
      !entry.houseProfile ||
      entry.generation !== generation ||
      state.phase.id !== phaseId ||
      terminal(state)
    )
      return null;

    return {
      observation: observe(state, seat, 0, true),
      persona: entry.forfeited
        ? 'A composed substitute. Reconstruct the permitted game history and pursue your assigned team’s victory.'
        : (entry.entrant.persona ?? 'A careful, concise strategist.'),
    };
  }

  async submitHouse(job: HouseJob, raw: ActionRequest): Promise<RpcResult<{ accepted: true }>> {
    try {
      const request = Schema.decodeUnknownSync(ActionRequestSchema)(raw);
      const state = this.reconcile();
      const seat = state.seats[job.seat];
      const key = `house:${job.id}`;
      const receipt = this.ctx.storage.sql.exec('SELECT id FROM receipts WHERE id = ?', key).toArray()[0];

      if (!receipt) {
        if (
          !seat?.houseProfile ||
          seat.generation !== job.generation ||
          state.phase.id !== job.phaseId ||
          Date.now() >= job.deadline
        )
          throw new GameError('obsolete-job', 'This house activation is no longer current.');
        const updated = act(state, job.seat, job.generation, request, Date.now());
        this.ctx.storage.transactionSync(() => {
          this.save(updated, state);
          this.ctx.storage.sql.exec(
            'INSERT INTO receipts (id, fingerprint) VALUES (?, ?)',
            key,
            stableJson(request),
          );
        });
        this.broadcast(updated);
      }

      await this.arm();

      return { ok: true, value: { accepted: true } };
    } catch (error) {
      await this.arm();

      return { ok: false, error: fault(error) };
    }
  }

  async socketTicket(principal: AgentPrincipal): Promise<RpcResult<{ ticket: string; expiresAt: number }>> {
    try {
      const state = this.reconcile();
      const seat = this.seatFor(state, principal);
      const ticket = randomSecret();
      const hash = await hashSecret(ticket);
      const expiresAt = Date.now() + 30_000;
      this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE expires_at <= ?', Date.now());
      this.ctx.storage.sql.exec(
        'INSERT INTO socket_tickets (hash, seat, grant_id, grant_expires, expires_at) VALUES (?, ?, ?, ?, ?)',
        hash,
        seat,
        principal.grantId,
        principal.expiresAt,
        expiresAt,
      );
      await this.arm();

      return { ok: true, value: { ticket, expiresAt } };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
        return json({ error: { code: 'upgrade-required', message: 'Use a WebSocket connection.' } }, 426);
      const url = new URL(request.url);
      const proof = url.searchParams.get('ticket');

      let attachment: SocketState = {
        seat: null,
        grantId: null,
        expiresAt: null,
        cursor: Math.max(0, Number(url.searchParams.get('after')) || 0),
      };

      if (proof) {
        const hash = await hashSecret(proof);

        const ticket = this.ctx.storage.sql
          .exec<Ticket>('SELECT * FROM socket_tickets WHERE hash = ? AND expires_at > ?', hash, Date.now())
          .toArray()[0];

        if (!ticket || this.isRevoked(ticket.grant_id))
          throw new GameError('ticket-expired', 'Request a new single-use event ticket.', 401);
        this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE hash = ?', hash);

        const active = await this.env.DB.prepare(
          'SELECT id FROM agent_grants WHERE id = ? AND revoked_at IS NULL AND expires_at > ?',
        )
          .bind(ticket.grant_id, Date.now())
          .first();

        if (!active || this.isRevoked(ticket.grant_id))
          throw new GameError('connection-revoked', 'This connection is no longer authorized.', 401);
        attachment = {
          ...attachment,
          seat: ticket.seat,
          grantId: ticket.grant_id,
          expiresAt: ticket.grant_expires,
        };
      }

      const state = this.reconcile();
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      this.send(server, state, attachment);
      await this.arm();

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      const problem = fault(error);

      return json({ error: problem }, problem.status);
    }
  }

  private send(socket: WebSocket, state: MatchState, attachment: SocketState): void {
    if (
      attachment.grantId &&
      (this.isRevoked(attachment.grantId) ||
        (attachment.expiresAt !== null && Date.now() >= attachment.expiresAt))
    ) {
      socket.close(4001, 'Connection authorization expired');

      return;
    }

    const view = observe(state, attachment.seat, attachment.cursor);
    socket.send(JSON.stringify({ type: 'observation', observation: view }));
    socket.serializeAttachment({ ...attachment, cursor: view.cursor });
  }
  private broadcast(state: MatchState): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        this.send(socket, state, Schema.decodeUnknownSync(SocketStateSchema)(socket.deserializeAttachment()));
      } catch {
        try {
          socket.close(1011, 'Reconnect to resume events');
        } catch {
          /* Already closed. */
        }
      }
    }
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message instanceof ArrayBuffer || message.length > 128) {
      socket.close(1008, 'Only resync and heartbeat messages are supported');

      return;
    }

    if (message === 'resync') {
      const attachment = Schema.decodeUnknownSync(SocketStateSchema)(socket.deserializeAttachment());
      this.send(socket, this.reconcile(), { ...attachment, cursor: 0 });
      await this.arm();
    }
  }
  webSocketClose(socket: WebSocket, code: number): void {
    // 1005/1006/1015 describe a local status; they cannot be sent in a close frame.
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }
  revokeGrant(grantId: string): void {
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO revoked (grant_id) VALUES (?)', grantId);
    this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE grant_id = ?', grantId);

    for (const socket of this.ctx.getWebSockets())
      if (Schema.decodeUnknownSync(SocketStateSchema)(socket.deserializeAttachment()).grantId === grantId)
        socket.close(4001, 'Connection revoked');
  }

  private enqueueWork(state: MatchState): void {
    if (terminal(state)) return;
    const model: HouseModelConfig = JSON.parse(this.getMeta('model')!);
    const now = Date.now();

    const discussion = ['nomination-discussion', 'government-discussion', 'executive-discussion'].includes(
      state.phase.kind,
    );

    const lastChat = state.events.findLast((event) => event.type === 'chat');

    for (const seat of state.seats.filter((entry) => entry.alive && entry.houseProfile)) {
      const view = observe(state, seat.number, state.events.length, true);
      const jobs: HouseJob[] = [];

      if (view.decision)
        jobs.push({
          id: `${state.phase.id}:${seat.number}:${seat.generation}:action`,
          matchId: state.id,
          seat: seat.number,
          generation: seat.generation,
          phaseId: state.phase.id,
          kind: 'action',
          dueAt: now,
          deadline: view.decision.graceUntil,
          model,
        });

      if (discussion && state.phase.deadline !== null) {
        const base = {
          matchId: state.id,
          seat: seat.number,
          generation: seat.generation,
          phaseId: state.phase.id,
          kind: 'chat' as const,
          deadline: state.phase.deadline - Math.min(500, state.timing.nomination / 10),
          model,
        };

        // Rotate inference admissions, not a speaking order. External chat is always open.
        // Two of the four starters may react once; required actions run for every pending seat.
        const distance = (seat.number - state.coordinator + 10) % 10;

        if (distance < 4)
          jobs.push({
            ...base,
            id: `${state.phase.id}:${seat.number}:${seat.generation}:chat:0`,
            dueAt: state.phase.startedAt + seat.number * Math.min(500, state.timing.nomination / 30),
          });

        if (
          distance < 2 &&
          seat.lastChatAt !== null &&
          seat.lastChatAt >= state.phase.startedAt &&
          lastChat &&
          lastChat.seat !== seat.number &&
          lastChat.at >= seat.lastChatAt
        ) {
          jobs.push({
            ...base,
            id: `${state.phase.id}:${seat.number}:${seat.generation}:chat:1`,
            dueAt: Math.max(now, seat.lastChatAt + state.timing.chatCooldown),
          });
        }
      }

      for (const job of jobs)
        if (job.dueAt < job.deadline)
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO outbox (id, data) VALUES (?, ?)',
            job.id,
            JSON.stringify(job),
          );
    }
  }

  private async arm(): Promise<void> {
    if (!this.ctx.storage.sql.exec('SELECT id FROM game WHERE id = 1').toArray().length) return;
    const state = this.load();
    const deadline = nextDeadline(state);

    const pending =
      this.getMeta('index-dirty') === '1' ||
      this.ctx.storage.sql.exec('SELECT id FROM outbox WHERE delivered = 0 LIMIT 1').toArray().length > 0 ||
      (terminal(state) && this.getMeta('released') !== '1');

    const due = pending ? Math.min(deadline ?? Infinity, Date.now() + 1) : deadline;

    if (due !== null && Number.isFinite(due)) {
      const at = Math.max(Date.now() + 1, due);
      this.setMeta('alarm-due', String(at));
      await this.ctx.storage.setAlarm(at);
    } else {
      this.setMeta('alarm-due', '0');
      await this.ctx.storage.deleteAlarm();
    }
  }

  async alarm(): Promise<void> {
    try {
      const state = this.reconcile();

      if (this.getMeta('index-dirty') === '1') {
        await indexMatch(this.env, state);

        // Another request may have advanced the match while D1 was writing.
        if (this.load().phase.id === state.phase.id) this.setMeta('index-dirty', '0');
      }

      const current = this.load();

      if (terminal(current)) {
        if (this.getMeta('released') !== '1') {
          await finalizeRatings(this.env, current);
          await this.env.MATCHMAKING.getByName('secret-overlord').complete(current.id);
          this.setMeta('released', '1');
        }

        this.ctx.storage.sql.exec('UPDATE outbox SET delivered = 1 WHERE delivered = 0');
      } else {
        const rows = this.ctx.storage.sql
          .exec<{ id: string; data: string }>('SELECT id, data FROM outbox WHERE delivered = 0 LIMIT 30')
          .toArray();

        await Promise.all(
          rows.map(async (row) => {
            const job: HouseJob = JSON.parse(row.data);

            if (job.deadline > Date.now() && job.phaseId === this.load().phase.id)
              await this.env.HOUSE_SEATS.getByName(`${job.matchId}:${job.seat}`).enqueue(job);
            this.ctx.storage.sql.exec('UPDATE outbox SET delivered = 1 WHERE id = ?', row.id);
          }),
        );
      }

      this.setMeta('recovery-failures', '0');
      await this.arm();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'match_recovery_retry',
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      const failures = Number(this.getMeta('recovery-failures') ?? 0) + 1;
      this.setMeta('recovery-failures', String(failures));

      if (failures >= 3) {
        const previous = this.load();

        const interrupted = interruptMatch(
          previous,
          Date.now(),
          'The platform could not recover reliable match operation after three attempts.',
        );

        if (interrupted !== previous) {
          this.save(interrupted, previous);
          this.broadcast(interrupted);
        }
      }

      this.setMeta('alarm-due', String(Date.now() + 1000));
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }
}
