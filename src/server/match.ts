import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { Schema } from 'effect';
import {
  createGame,
  decodeGameState,
  gameRegistry,
  inspectGame,
  observeGame,
  summaryGame,
} from '../game/registry';
import type { AnyMatchState } from '../game/registry';
import { gameDescriptor } from '../game/descriptors';
import type { MatchSnapshot } from '../game/contracts';
import type { SecretOverlordState } from '../game/secret-overlord';
import type { Evolution, SuccessionState } from '../game/succession/types';
import { replayFrameSuccession } from '../game/succession/replay';
import { decodeReplayCheckpoint } from '../game/succession/persistence';
import { GameError } from '../game/types';
import type { GameEvent, Observation } from '../game/types';
import { ActionRequestSchema } from '../shared/api';
import type { RpcResult, TransportActionRequest } from '../shared/api';
import { ActionRequest2Schema } from '../shared/succession';
import type { HistoryPage2, Observation2, ReplayFrame2 } from '../shared/succession';
import type { HistoryAnchor2, RoundIndex2 } from '../shared/history';
import type { AgentPrincipal } from './auth';
import type { HouseJob, HouseModelConfig } from './house-contract';
import type { MatchInitialization } from './matchmaking';
import { fault, hashSecret, json, randomSecret, stableJson } from './http';
import { finalizeRatings, indexMatch } from './repository';
import type { IndexedMatch } from './repository';
import { platformCoordinator } from './coordinator';
import { MatchHistory, jsonBytes } from './history';
import type { HistoryAudience, HistoryQuery } from './history';
import { ProtocolUpgradeError, requireGameProtocol } from './protocol';

const SocketStateSchema = Schema.Struct({
  seat: Schema.NullOr(Schema.Number),
  grantId: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.Number),
  cursor: Schema.Number,
  protocol: Schema.optional(Schema.Literals(['1', '2'])),
  signature: Schema.optional(Schema.String),
});

type SocketState = typeof SocketStateSchema.Type;

type Ticket = { seat: number; grant_id: string; grant_expires: number; expires_at: number; protocol: string };

type Current = Observation | Observation2;

function modelConfig(snapshot: MatchSnapshot): HouseModelConfig {
  const { provider, model, policyVersion } = snapshot.houseModel;

  if (provider !== 'preview' && provider !== 'workers-ai' && provider !== 'openai')
    throw new Error('Unsupported persisted house provider');

  return { provider, model, policyVersion };
}

function entrantIdentity(entrants: MatchInitialization['entrants']): string {
  return JSON.stringify(
    entrants
      .map((entrant) => [
        entrant.agentId,
        entrant.ownerId,
        entrant.name,
        entrant.house,
        entrant.rating,
        entrant.persona ?? null,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

function grantIdentity(grants: Record<string, string>): string {
  return JSON.stringify(Object.entries(grants).sort(([a], [b]) => a.localeCompare(b)));
}

function snapshotIdentity(snapshot: MatchSnapshot): string {
  return JSON.stringify([
    snapshot.gameId,
    snapshot.rulesVersion,
    snapshot.ratingPoolId,
    snapshot.ratingVersion,
    snapshot.protocolVersion,
    snapshot.playerCount,
    snapshot.mode,
    snapshot.houseModel.provider,
    snapshot.houseModel.model,
    snapshot.houseModel.policyVersion,
    snapshot.housePolicyVersion,
    snapshot.timing.nomination,
    snapshot.timing.debate,
    snapshot.timing.executive,
    snapshot.timing.action,
    snapshot.timing.grace,
    snapshot.timing.chatCooldown,
  ]);
}

export class MatchObject extends DurableObject<Env> {
  private readonly history: MatchHistory;

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

    const ticketColumns = ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(socket_tickets)')
      .toArray();

    if (!ticketColumns.some((column) => column.name === 'protocol'))
      ctx.storage.sql.exec("ALTER TABLE socket_tickets ADD COLUMN protocol TEXT NOT NULL DEFAULT '1'");
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS revoked (grant_id TEXT PRIMARY KEY)');
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS replay_frames (id INTEGER PRIMARY KEY, data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS replay_facts (id INTEGER PRIMARY KEY, data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS history_rounds (act INTEGER NOT NULL, round INTEGER NOT NULL, through_id INTEGER NOT NULL, event_key TEXT NOT NULL, PRIMARY KEY (act, round))',
    );
    this.history = new MatchHistory(ctx.storage.sql);
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

  private exists(): boolean {
    return this.ctx.storage.sql.exec('SELECT id FROM game WHERE id = 1').toArray().length > 0;
  }

  /** Succession reads one bounded current row, never any historical event/checkpoint rows. */
  private load(): AnyMatchState {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM game WHERE id = 1')
      .toArray()[0];

    if (!row) throw new GameError('match-not-found', 'Match not found.', 404);
    // Application-owned persistence is strictly version-decoded by its game adapter.
    const raw: { rulesVersion?: string; events?: GameEvent[] } = JSON.parse(row.data);

    if (raw.rulesVersion === 'secret-overlord-1')
      raw.events = this.ctx.storage.sql
        .exec<{ data: string }>('SELECT data FROM events ORDER BY id')
        .toArray()
        .map((event): GameEvent => JSON.parse(event.data));

    const model = this.getMeta('model');
    const legacyModel: HouseModelConfig | undefined = model ? JSON.parse(model) : undefined;

    return decodeGameState(raw, legacyModel);
  }

  private revision(): number {
    return Number(this.getMeta('source-revision') ?? 0);
  }

  private markChanged(): void {
    this.setMeta('source-revision', String(this.revision() + 1));
    this.setMeta('index-dirty', '1');
  }

  private saveLegacy(state: SecretOverlordState, previous: SecretOverlordState | null): void {
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
      this.markChanged();
      this.enqueueWork(state);
    });
  }

  private saveSuccession(evolution: Evolution, previous: SuccessionState | null): void {
    const { state, appendedEvents, replay, replayFrames } = evolution;

    if (jsonBytes(state) > 65_536) throw new Error('Current Succession board exceeds 64 KiB');
    this.ctx.storage.transactionSync(() => {
      if (!previous) this.history.initialize();

      for (const seat of state.seats)
        if (seat.forfeited && !previous?.seats[seat.number].forfeited)
          this.history.freezeOriginal(seat.number);
      const appended = this.history.append(appendedEvents);

      const eventIds = new Map(
        appendedEvents.map((event, index) => [event.eventKey, appended.first + index]),
      );

      for (const frame of replayFrames) {
        const id = eventIds.get(frame.eventKey);

        if (id === undefined || jsonBytes(frame.state) > 65_536)
          throw new Error('Invalid bounded replay checkpoint');
        this.ctx.storage.sql.exec(
          'INSERT INTO replay_frames (id, data) VALUES (?, ?)',
          id,
          JSON.stringify(frame.state),
        );
      }

      if (!previous) {
        const initial = replayFrames[0]?.state ?? state;
        this.ctx.storage.sql.exec(
          'INSERT INTO replay_frames (id, data) VALUES (0, ?)',
          JSON.stringify(initial),
        );
      }

      if (replay && appendedEvents.length)
        this.ctx.storage.sql.exec(
          'INSERT INTO replay_facts (id, data) VALUES (?, ?)',
          appended.through,
          JSON.stringify(replay),
        );

      for (const [index, event] of appendedEvents.entries())
        if (event.round > 0)
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO history_rounds (act, round, through_id, event_key) VALUES (?, ?, ?, ?)',
            event.act,
            event.round,
            appended.first + index,
            event.eventKey,
          );
      this.ctx.storage.sql.exec(
        'INSERT INTO game (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        JSON.stringify(state),
      );
      this.markChanged();
      this.enqueueWork(state);
    });
  }

  private initialSnapshot(input: MatchInitialization): MatchSnapshot {
    if (input.snapshot) {
      if (input.gameId !== undefined && input.gameId !== input.snapshot.gameId)
        throw new Error('Conflicting initialization game identity');

      return structuredClone(input.snapshot);
    }

    const descriptor = gameDescriptor(input.gameId ?? 'secret-overlord');
    const scale = Math.max(0.001, Number(this.env.TIME_SCALE) || 1);
    const provider = this.env.HOUSE_PROVIDER;

    if (provider !== 'preview' && provider !== 'workers-ai' && provider !== 'openai')
      throw new Error('Unsupported house provider');

    return {
      ...descriptor,
      mode:
        provider === 'preview'
          ? 'preview'
          : input.entrants.every((entrant) => entrant.house)
            ? 'evaluation'
            : 'ranked',
      timing: {
        nomination: descriptor.timing.nomination * scale,
        debate: descriptor.timing.debate * scale,
        executive: descriptor.timing.executive * scale,
        action: descriptor.timing.action * scale,
        grace: descriptor.timing.grace * scale,
        chatCooldown: descriptor.timing.chatCooldown * scale,
      },
      houseModel: {
        provider,
        model: this.env.HOUSE_MODEL,
        policyVersion: descriptor.gameId === 'secret-overlord' ? 'house-4' : descriptor.housePolicyVersion,
      },
    };
  }

  private validateInitialization(input: MatchInitialization): void {
    const state = this.load();
    const grants: Record<string, string> = JSON.parse(this.getMeta('grants') ?? '{}');

    if (
      state.id !== input.id ||
      state.gameId !== (input.gameId ?? input.snapshot?.gameId ?? 'secret-overlord') ||
      entrantIdentity(state.seats.map((seat) => seat.entrant)) !== entrantIdentity(input.entrants) ||
      grantIdentity(grants) !== grantIdentity(input.grants) ||
      (input.snapshot && snapshotIdentity(state.snapshot) !== snapshotIdentity(input.snapshot))
    )
      throw new Error('Conflicting immutable match initialization');
    const reservation = this.getMeta('reservation');

    if (
      reservation !== null &&
      input.reservationUsd !== undefined &&
      Number(reservation) !== input.reservationUsd
    )
      throw new Error('Conflicting match admission reservation');
  }

  async initialize(input: MatchInitialization): Promise<void> {
    if (!this.exists()) {
      const snapshot = this.initialSnapshot(input);
      const created = await createGame(input.id, input.entrants, Date.now(), snapshot);

      // Commitment hashing may await; a concurrent initialization must agree, never redeal.
      if (!this.exists())
        this.ctx.storage.transactionSync(() => {
          this.setMeta('grants', JSON.stringify(input.grants));
          this.setMeta('model', JSON.stringify(modelConfig(snapshot)));

          if (input.reservationUsd !== undefined) this.setMeta('reservation', String(input.reservationUsd));

          if ('replayFrames' in created) this.saveSuccession(created, null);
          else this.saveLegacy(created.state, null);
        });
    }

    this.validateInitialization(input);
    await this.arm();
  }

  identity() {
    const state = this.load();

    return {
      gameId: state.gameId,
      rulesVersion: state.rulesVersion,
      protocolVersion: state.snapshot.protocolVersion,
    };
  }

  private seatFor(state: AnyMatchState, principal: AgentPrincipal): number {
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

  private current(state: AnyMatchState, seat: number | null, after = 0, houseController = false): Current {
    const history =
      state.gameId === 'succession'
        ? this.history.metadata({ seat, house: houseController, terminal: state.status !== 'active' })
        : undefined;

    const view = observeGame(state, seat, { after, history, houseController });

    if (view.protocolVersion === '2' && jsonBytes(view) > 14_336)
      throw new Error('Current observation exceeds 14 KiB');

    return view;
  }

  private evolveClock(
    previous: AnyMatchState,
    type: 'advance' | 'recover' | 'interrupt',
    now: number,
    reason = '',
  ): AnyMatchState {
    const command = type === 'interrupt' ? { type, now, reason } : { type, now };

    if (previous.gameId === 'succession') {
      const evolution = gameRegistry.succession.evolve(previous, command);

      if (
        evolution.state === previous ||
        (!evolution.appendedEvents.length && JSON.stringify(evolution.state) === JSON.stringify(previous))
      )
        return previous;
      this.saveSuccession(evolution, previous);

      return evolution.state;
    }

    const evolution = gameRegistry['secret-overlord'].evolve(previous, command);

    if (!evolution.appendedEvents.length) return previous;
    this.saveLegacy(evolution.state, previous);

    return evolution.state;
  }

  private reconcile(): AnyMatchState {
    const previous = this.load();
    const now = Date.now();
    const due = Number(this.getMeta('alarm-due') ?? 0);
    const recovery = due > 0 && now - due > 5000 && inspectGame(previous).status === 'active';
    const state = this.evolveClock(previous, recovery ? 'recover' : 'advance', now);

    if (state !== previous) {
      if (recovery) this.setMeta('alarm-due', String(now));
      this.broadcast(state);
    }

    return state;
  }

  async observation(
    principal: AgentPrincipal | null,
    after = 0,
    protocols = '',
  ): Promise<RpcResult<Current>> {
    try {
      const state = this.reconcile();
      const seat = principal ? this.seatFor(state, principal) : null;
      requireGameProtocol(state.gameId, protocols, state.id);
      const view = this.current(state, seat, after);
      await this.arm();

      return { ok: true, value: view };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  private applyAction(
    state: AnyMatchState,
    seat: number,
    generation: number,
    raw: TransportActionRequest,
  ): AnyMatchState {
    if (state.gameId === 'succession') {
      if (raw.gameId === undefined) throw new ProtocolUpgradeError(state.id);

      if (raw.gameId !== state.gameId)
        throw new GameError('game-mismatch', 'This action belongs to another game.');
      const request = Schema.decodeUnknownSync(ActionRequest2Schema)(raw);

      const evolution = gameRegistry.succession.evolve(state, {
        type: 'act',
        seat,
        generation,
        request,
        now: Date.now(),
      });

      this.saveSuccession(evolution, state);

      return evolution.state;
    }

    if (raw.gameId !== undefined && raw.gameId !== state.gameId)
      throw new GameError('game-mismatch', 'This action belongs to another game.');
    const request = Schema.decodeUnknownSync(ActionRequestSchema)(raw);

    const evolution = gameRegistry['secret-overlord'].evolve(state, {
      type: 'act',
      seat,
      generation,
      request,
      now: Date.now(),
    });

    this.saveLegacy(evolution.state, state);

    return evolution.state;
  }

  async submit(
    principal: AgentPrincipal,
    request: TransportActionRequest,
    protocols = '',
  ): Promise<RpcResult<{ accepted: true; actionId: string; observation: Current }>> {
    try {
      const state = this.reconcile();
      const seat = this.seatFor(state, principal);
      requireGameProtocol(state.gameId, protocols, state.id);

      if (state.gameId === 'succession' && request.gameId === undefined)
        throw new ProtocolUpgradeError(state.id);

      if (request.gameId !== undefined && request.gameId !== state.gameId)
        throw new GameError('game-mismatch', 'This action belongs to another game.');
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

        const updated = this.ctx.storage.transactionSync(() => {
          const next = this.applyAction(state, seat, state.seats[seat].generation, request);
          this.ctx.storage.sql.exec(
            'INSERT INTO receipts (id, fingerprint) VALUES (?, ?)',
            receiptKey,
            fingerprint,
          );

          return next;
        });

        this.broadcast(updated);
      }

      await this.arm();

      return {
        ok: true,
        value: { accepted: true, actionId: request.actionId, observation: this.current(this.load(), seat) },
      };
    } catch (error) {
      await this.arm();

      return { ok: false, error: fault(error) };
    }
  }

  async houseObservation(seat: number, generation: number, phaseId: string) {
    const state = this.reconcile();
    const entry = state.seats[seat];
    await this.arm();

    if (
      !entry?.alive ||
      !entry.houseProfile ||
      entry.generation !== generation ||
      state.phase.id !== phaseId ||
      inspectGame(state).status !== 'active'
    )
      return null;

    return {
      observation: this.current(state, seat, 0, true),
      recent:
        state.gameId === 'succession' ? this.history.recent({ seat, house: true, terminal: false }) : [],
      persona: entry.forfeited
        ? state.gameId === 'succession'
          ? 'A composed substitute. Use entitled history and current capability evidence to pursue sole overall seat victory.'
          : 'A composed substitute. Reconstruct the permitted game history and pursue your assigned team’s victory.'
        : (entry.entrant.persona ?? 'A careful, concise strategist.'),
    };
  }

  async submitHouse(job: HouseJob, request: TransportActionRequest): Promise<RpcResult<{ accepted: true }>> {
    try {
      const state = this.reconcile();
      const seat = state.seats[job.seat];
      const key = `house:${job.id}`;
      const fingerprint = stableJson(request);

      const receipt = this.ctx.storage.sql
        .exec<{ fingerprint: string }>('SELECT fingerprint FROM receipts WHERE id = ?', key)
        .toArray()[0];

      if (receipt && receipt.fingerprint !== fingerprint)
        throw new GameError('action-id-conflict', 'House receipt input changed.');

      if (!receipt) {
        if (
          !seat?.houseProfile ||
          seat.generation !== job.generation ||
          state.phase.id !== job.phaseId ||
          Date.now() >= job.deadline ||
          (job.gameId ?? 'secret-overlord') !== state.gameId ||
          (job.rulesVersion ?? 'secret-overlord-1') !== state.rulesVersion ||
          job.model.policyVersion !== state.snapshot.houseModel.policyVersion ||
          (job.decisionId !== undefined && request.decisionId !== job.decisionId)
        )
          throw new GameError('obsolete-job', 'This house activation is no longer current.');

        const updated = this.ctx.storage.transactionSync(() => {
          const next = this.applyAction(state, job.seat, job.generation, request);
          this.ctx.storage.sql.exec('INSERT INTO receipts (id, fingerprint) VALUES (?, ?)', key, fingerprint);

          return next;
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

  private historyAudience(
    state: AnyMatchState,
    principal: AgentPrincipal | null,
    protocols: string,
  ): HistoryAudience {
    const seat = principal ? this.seatFor(state, principal) : null;
    requireGameProtocol(state.gameId, protocols, state.id);

    if (state.gameId !== 'succession')
      throw new GameError('history-protocol', 'Secret Overlord uses protocol-1 inline history.', 400);

    return { seat, house: false, terminal: state.status !== 'active' };
  }

  async historyPage(
    principal: AgentPrincipal | null,
    query: HistoryQuery,
    protocols: string,
  ): Promise<RpcResult<HistoryPage2>> {
    try {
      const state = this.reconcile();
      const audience = this.historyAudience(state, principal, protocols);
      const value = this.history.page(state.id, audience, query);
      await this.arm();

      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async historyAnchor(
    principal: AgentPrincipal | null,
    epoch: string | undefined,
    eventKey: string,
    protocols: string,
  ): Promise<RpcResult<HistoryAnchor2 | HistoryPage2>> {
    try {
      const state = this.reconcile();
      const audience = this.historyAudience(state, principal, protocols);
      const metadata = this.history.metadata(audience);

      if (epoch !== metadata.visibilityEpoch)
        return { ok: true, value: this.history.page(state.id, audience, { epoch }) };
      const cursor = this.history.anchor(audience, eventKey);
      await this.arm();

      return {
        ok: true,
        value: {
          protocolVersion: '2',
          gameId: 'succession',
          matchId: state.id,
          visibilityEpoch: metadata.visibilityEpoch,
          cursor,
        },
      };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async replay(
    principal: AgentPrincipal | null,
    epoch: string | undefined,
    through: number,
    protocols: string,
  ): Promise<RpcResult<ReplayFrame2 | HistoryPage2>> {
    try {
      const state = this.load();
      const audience = this.historyAudience(state, principal, protocols);

      if (!audience.terminal)
        throw new GameError(
          'replay-not-ready',
          'Replay is available after overall completion or interruption.',
        );

      if (state.gameId !== 'succession') throw new Error('Invalid replay game');
      await gameRegistry.succession.verifyReplayArchive(state);
      const metadata = this.history.metadata(audience);

      if (epoch !== metadata.visibilityEpoch)
        return { ok: true, value: this.history.page(state.id, audience, { epoch }) };

      if (!Number.isSafeInteger(through) || through < 0 || through > metadata.streamHead)
        throw new GameError('invalid-history-range', 'Replay cursor is outside this archive.', 400);

      const row = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM replay_frames WHERE id <= ? ORDER BY id DESC LIMIT 1',
          through,
        )
        .toArray()[0];

      if (!row) throw new Error('Missing bounded replay checkpoint');
      const checkpoint = decodeReplayCheckpoint(JSON.parse(row.data));
      const value = replayFrameSuccession(checkpoint, through, metadata.visibilityEpoch);

      if (jsonBytes(value) > 32_768) throw new Error('Replay frame exceeds 32 KiB');

      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  rounds(
    principal: AgentPrincipal | null,
    epoch: string | undefined,
    protocols: string,
  ): RpcResult<RoundIndex2 | HistoryPage2> {
    try {
      const state = this.load();
      const audience = this.historyAudience(state, principal, protocols);

      if (!audience.terminal)
        throw new GameError(
          'replay-not-ready',
          'The complete round index is available after overall termination.',
        );
      const metadata = this.history.metadata(audience);

      if (epoch !== metadata.visibilityEpoch)
        return { ok: true, value: this.history.page(state.id, audience, { epoch }) };

      const rows = this.ctx.storage.sql
        .exec<{ act: number; round: number; through_id: number; event_key: string }>(
          'SELECT act, round, through_id, event_key FROM history_rounds ORDER BY act, round LIMIT 43',
        )
        .toArray();

      if (rows.length > 42) throw new Error('Round index exceeds the rules bound');

      const rounds = rows.map((row): RoundIndex2['rounds'][number] => {
        if (row.act !== 1 && row.act !== 2) throw new Error('Invalid indexed act');

        return {
          key: `act-${row.act}:${row.act === 1 ? 'election' : 'table'}-${row.round}`,
          act: row.act,
          round: row.round,
          through: row.through_id,
          eventKey: row.event_key,
        };
      });

      return {
        ok: true,
        value: {
          protocolVersion: '2',
          gameId: 'succession',
          matchId: state.id,
          visibilityEpoch: metadata.visibilityEpoch,
          rounds,
        },
      };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async socketTicket(
    principal: AgentPrincipal,
    protocols = '',
  ): Promise<RpcResult<{ ticket: string; expiresAt: number }>> {
    try {
      const state = this.reconcile();
      const seat = this.seatFor(state, principal);
      requireGameProtocol(state.gameId, protocols, state.id);
      const ticket = randomSecret();
      const hash = await hashSecret(ticket);
      const expiresAt = Date.now() + 30_000;

      if (this.isRevoked(principal.grantId))
        throw new GameError('connection-revoked', 'This connection is no longer authorized.', 401);
      this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE expires_at <= ?', Date.now());
      this.ctx.storage.sql.exec(
        'INSERT INTO socket_tickets (hash, seat, grant_id, grant_expires, expires_at, protocol) VALUES (?, ?, ?, ?, ?, ?)',
        hash,
        seat,
        principal.grantId,
        principal.expiresAt,
        expiresAt,
        state.snapshot.protocolVersion,
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
      const protocol = url.searchParams.get('protocol') === '2' ? '2' : '1';

      let attachment: SocketState = {
        seat: null,
        grantId: null,
        expiresAt: null,
        cursor: Math.max(0, Number(url.searchParams.get('after')) || 0),
        protocol,
      };

      if (proof) {
        const hash = await hashSecret(proof);

        const ticket = this.ctx.storage.sql
          .exec<Ticket>('SELECT * FROM socket_tickets WHERE hash = ? AND expires_at > ?', hash, Date.now())
          .toArray()[0];

        if (!ticket || this.isRevoked(ticket.grant_id))
          throw new GameError('ticket-expired', 'Request a new single-use event ticket.', 401);

        if (ticket.protocol !== protocol) throw new ProtocolUpgradeError(this.load().id);
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
      requireGameProtocol(state.gameId, protocol, state.id);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      this.send(server, state, attachment, true);
      await this.arm();

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      const problem = fault(error);

      return json({ error: problem }, problem.status);
    }
  }

  private send(socket: WebSocket, state: AnyMatchState, attachment: SocketState, explicit = false): void {
    if (
      attachment.grantId &&
      (this.isRevoked(attachment.grantId) ||
        (attachment.expiresAt !== null && Date.now() >= attachment.expiresAt))
    ) {
      socket.close(4001, 'Connection authorization expired');

      return;
    }

    const view = this.current(state, attachment.seat, attachment.cursor);
    const packet = JSON.stringify({ type: 'observation', observation: view });

    if (view.protocolVersion === '2') {
      if (new TextEncoder().encode(packet).byteLength > 16_384)
        throw new Error('Socket envelope exceeds 16 KiB');
      const signature = createHash('sha256').update(packet).digest('hex');

      if (!explicit && signature === attachment.signature) return;
      socket.send(packet);
      socket.serializeAttachment({ ...attachment, protocol: '2', signature });
    } else {
      socket.send(packet);
      socket.serializeAttachment({ ...attachment, cursor: view.cursor });
    }
  }

  private broadcast(state: AnyMatchState): void {
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
      this.send(socket, this.reconcile(), { ...attachment, cursor: 0 }, true);
      await this.arm();
    }
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }

  revokeGrant(grantId: string): void {
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO revoked (grant_id) VALUES (?)', grantId);
    this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE grant_id = ?', grantId);

    for (const socket of this.ctx.getWebSockets())
      if (Schema.decodeUnknownSync(SocketStateSchema)(socket.deserializeAttachment()).grantId === grantId)
        socket.close(4001, 'Connection revoked');
  }

  private enqueueWork(state: AnyMatchState): void {
    const runtime = inspectGame(state);

    if (runtime.status !== 'active') return;
    const model = modelConfig(state.snapshot);
    const now = Date.now();

    for (const seat of runtime.participants) {
      if (!seat.alive || !seat.houseProfile) continue;

      const view = this.current(
        state,
        seat.number,
        state.gameId === 'secret-overlord' ? state.events.length : 0,
        true,
      );

      const jobs: HouseJob[] = [];

      const base = {
        gameId: state.gameId,
        rulesVersion: state.rulesVersion,
        matchId: state.id,
        seat: seat.number,
        generation: seat.generation,
        phaseId: runtime.phaseId,
        model,
      };

      if (view.decision)
        jobs.push({
          ...base,
          decisionId: view.decision.id,
          id: `${state.gameId}:${view.decision.id}:action`,
          kind: 'action',
          dueAt: now,
          deadline: view.decision.graceUntil,
        });

      if (
        runtime.discussion &&
        runtime.phase.deadline !== null &&
        runtime.discussion.seats.includes(seat.number)
      ) {
        const distance = (seat.number - runtime.discussion.anchor + 10) % 10;
        const deadline = runtime.phase.deadline - Math.min(500, runtime.timing.nomination / 10);
        const chatBase = { ...base, kind: 'chat' as const, deadline };

        if (distance < 4)
          jobs.push({
            ...chatBase,
            id: `${state.gameId}:${runtime.phaseId}:${seat.number}:${seat.generation}:chat:0`,
            dueAt: runtime.phase.startedAt + seat.number * Math.min(500, runtime.timing.nomination / 30),
          });
        const lastChatAt = state.seats[seat.number].lastChatAt;

        if (
          distance < 2 &&
          lastChatAt !== null &&
          lastChatAt >= runtime.phase.startedAt &&
          runtime.lastChat &&
          runtime.lastChat.seat !== seat.number &&
          runtime.lastChat.at >= lastChatAt
        )
          jobs.push({
            ...chatBase,
            id: `${state.gameId}:${runtime.phaseId}:${seat.number}:${seat.generation}:chat:1`,
            dueAt: Math.max(now, lastChatAt + runtime.timing.chatCooldown),
          });
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
    if (!this.exists()) return;
    const state = this.load();
    const runtime = inspectGame(state);

    const pending =
      this.getMeta('index-dirty') === '1' ||
      this.ctx.storage.sql.exec('SELECT id FROM outbox WHERE delivered = 0 LIMIT 1').toArray().length > 0 ||
      (runtime.status !== 'active' && this.getMeta('released') !== '1');

    const due = pending ? Math.min(runtime.nextDeadline ?? Infinity, Date.now() + 1) : runtime.nextDeadline;

    if (due !== null && Number.isFinite(due)) {
      const at = Math.max(Date.now() + 1, due);
      this.setMeta('alarm-due', String(at));
      await this.ctx.storage.setAlarm(at);
    } else {
      this.setMeta('alarm-due', '0');
      await this.ctx.storage.deleteAlarm();
    }
  }

  private indexed(state: SuccessionState): IndexedMatch {
    const summary = summaryGame(state);

    if (summary.gameId !== 'succession') throw new Error('Incorrect game summary');

    return {
      id: state.id,
      snapshot: state.snapshot,
      createdAt: state.createdAt,
      finishedAt: state.finishedAt,
      status: state.status,
      round: summary.round,
      houseCount: summary.houseCount,
      summary,
      result: state.result,
      participants: state.seats.map((seat) => ({
        seat: seat.number,
        entrant: seat.entrant,
        role: seat.role,
      })),
    };
  }

  async alarm(): Promise<void> {
    try {
      const state = this.reconcile();
      const revision = this.revision();

      if (this.getMeta('index-dirty') === '1') {
        await indexMatch(this.env, state.gameId === 'succession' ? this.indexed(state) : state, revision);

        if (this.revision() === revision) this.setMeta('index-dirty', '0');
      }

      const current = this.load();

      if (inspectGame(current).status !== 'active') {
        if (this.getMeta('released') !== '1') {
          if (current.gameId === 'succession') {
            const settlement = gameRegistry.succession.settle(current);

            if (!settlement) throw new Error('Terminal match has no settlement input');
            await finalizeRatings(this.env, this.indexed(current), this.revision(), settlement);
          } else await finalizeRatings(this.env, current, this.revision());
          await platformCoordinator(this.env).complete(current.id);
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

        const interrupted = this.evolveClock(
          previous,
          'interrupt',
          Date.now(),
          'The platform could not recover reliable match operation after three attempts.',
        );

        if (interrupted !== previous) this.broadcast(interrupted);
      }

      this.setMeta('alarm-due', String(Date.now() + 1000));
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }
}
