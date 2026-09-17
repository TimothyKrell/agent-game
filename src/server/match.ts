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
import { observeSuccession } from '../game/succession/observation';
import { decodeReplayCheckpoint } from '../game/succession/persistence';
import { GameError } from '../game/types';
import type { GameEvent, Observation } from '../game/types';
import { ActionRequestSchema } from '../shared/api';
import type { ReclaimRequest, RpcResult, TransportActionRequest } from '../shared/api';
import { ActionRequest2Schema } from '../shared/succession';
import type { HistoryPage2, Observation2, ReplayFrame2 } from '../shared/succession';
import type { HistoryAnchor2, RoundIndex2 } from '../shared/history';
import type { HistoryCheckpoint2 } from '../shared/history-checkpoint';
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
import { ActionRequest3Schema } from '../shared/coding-finale';
import type { Observation3 } from '../shared/coding-finale';
import type {
  HistoryPage3 as CodingHistoryPage,
  HistoryAnchor3 as CodingHistoryAnchor,
  RoundIndex3 as CodingRoundIndex,
  HistoryCheckpoint3 as CodingCheckpoint,
} from '../shared/coding-finale-history';
import {
  authorizeCodingFinaleChallenge,
  publicCodingFinaleChallenge,
  evolveCodingFinale,
  observeCodingFinale,
  decodeCodingFinaleReplayState,
  settleCodingFinale,
} from '../game/coding-finale/game';
import type { CodingFinaleState, CodingFinaleEvolution } from '../game/coding-finale/game';
import { FINALE_RULES, ProgramSchema } from '../game/coding-finale/types';
import type { Program, Tier } from '../game/coding-finale/types';
import type { CodingInput } from '../game/coding-finale/puzzle-input';
import {
  PublicCodingChallengeSchema,
  CodingSubmissionReportSchema,
  CodingJudgeEvidenceSchema,
} from '../shared/coding-finale-artifacts';
import {
  prepareCodingEnvironment,
  practiceCodingProgram,
  judgeCodingSubmission,
  closeCodingEnvironment,
} from './coding-runtime';

const SocketStateSchema = Schema.Struct({
  seat: Schema.NullOr(Schema.Number),
  grantId: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.Number),
  cursor: Schema.Number,
  protocol: Schema.optional(Schema.Literals(['1', '2', '3'])),
  signature: Schema.optional(Schema.String),
});

type SocketState = typeof SocketStateSchema.Type;

type Ticket = { seat: number; grant_id: string; grant_expires: number; expires_at: number; protocol: string };

type Current = Observation | Observation2 | Observation3;

type SilentChatCompletion = { at: number; observedChat: { seat: number; at: number } | null };

function codingCreation(value: Awaited<ReturnType<typeof createGame>>): value is CodingFinaleEvolution {
  return value.state.gameId === 'coding-finale';
}

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
  private codingPreparing = false;
  private codingJudging = new Set<number>();
  private codingCleaning = false;

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
    const outboxColumns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(outbox)').toArray();

    if (!outboxColumns.some((column) => column.name === 'silent_completion'))
      ctx.storage.sql.exec('ALTER TABLE outbox ADD COLUMN silent_completion TEXT');
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
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS coding_programs (sequence INTEGER PRIMARY KEY, data TEXT NOT NULL, started_at INTEGER)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS coding_judge_evidence (sequence INTEGER PRIMARY KEY, data TEXT NOT NULL)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS coding_practice (seat INTEGER PRIMARY KEY, runs INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0)',
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private getMeta(key: string): string | null {
    return (
      this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]
        ?.value ?? null
    );
  }

  /** Deletion is authorized by an operator-created D1 tombstone, never by an HTTP caller. */
  async purgeRetired(matchId: string): Promise<void> {
    if (
      this.ctx.id.toString() !== this.env.MATCHES.idFromName(matchId).toString() ||
      !(await this.env.DB.prepare('SELECT id FROM retired_matches WHERE id=?').bind(matchId).first())
    )
      throw new GameError('not-retired', 'This match is not eligible for deletion.', 409);
    const state = this.exists() ? this.load() : null;

    const cleanupSeats =
      state?.gameId === 'coding-finale'
        ? (state.finale?.finalists.map((finalist) => finalist.seat) ?? [])
        : Schema.decodeUnknownSync(Schema.Array(Schema.Int))(
            JSON.parse(this.getMeta('retired-cleanup') ?? '[]'),
          );

    this.ctx.storage.transactionSync(() => {
      const tables = this.ctx.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '__cf_*'",
        )
        .toArray();

      for (const { name } of tables) this.ctx.storage.sql.exec(`DELETE FROM "${name.replaceAll('"', '""')}"`);
      this.setMeta('retired', '1');
      this.setMeta('retired-cleanup', JSON.stringify(cleanupSeats));
    });
    await this.ctx.storage.deleteAlarm();

    for (const socket of this.ctx.getWebSockets()) socket.close(1000, 'Match history reset');

    await Promise.all(cleanupSeats.map((seat) => closeCodingEnvironment(this.env, matchId, seat)));
    this.setMeta('retired-cleanup', '[]');
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
    if (this.getMeta('retired'))
      throw new GameError('match-retired', 'This match was removed in the arena reset.', 410);

    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM game WHERE id = 1')
      .toArray()[0];

    if (!row) throw new GameError('match-not-found', 'Match not found.', 404);
    // Application-owned persistence is strictly version-decoded by its game adapter.
    const raw: { gameId?: string; rulesVersion?: string; events?: GameEvent[] } = JSON.parse(row.data);

    if (
      (raw.gameId === undefined || raw.gameId === 'secret-overlord') &&
      raw.rulesVersion === 'secret-overlord-1'
    )
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
    if (this.getMeta('retired')) throw new GameError('match-retired', 'Match retired.', 410);
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
    if (this.getMeta('retired')) throw new GameError('match-retired', 'Match retired.', 410);
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

  private saveCoding(
    evolution: ReturnType<typeof evolveCodingFinale>,
    previous: CodingFinaleState | null,
  ): void {
    if (this.getMeta('retired')) throw new GameError('match-retired', 'Match retired.', 410);
    const { state, appendedEvents, replayFrames } = evolution;

    if (jsonBytes(state) > 65_536) throw new Error('Current coding board exceeds 64 KiB');
    this.ctx.storage.transactionSync(() => {
      if (!previous) {
        this.history.initialize();

        if (state.snapshot.controllerRecovery === 'recoverable-house-1')
          this.history.enableRecoverableOriginals();
      }

      for (const seat of state.seats)
        if (seat.houseProfile !== null && previous?.seats[seat.number].houseProfile === null)
          this.history.freezeOriginal(seat.number);
        else if (seat.houseProfile === null && previous?.seats[seat.number].houseProfile !== null)
          this.history.restoreOriginal(seat.number);
      const appended = this.history.append(appendedEvents);

      const ids = new Map(appendedEvents.map((event, index) => [event.eventKey, appended.first + index]));

      // Coding snapshots contain only bounded metadata, never submitted source or hidden suites.
      for (const frame of replayFrames) {
        const id = ids.get(frame.eventKey);

        if (id === undefined || jsonBytes(frame.state) > 65_536)
          throw new Error('Invalid coding replay frame.');
        this.ctx.storage.sql.exec(
          'INSERT INTO replay_frames (id,data) VALUES (?,?)',
          id,
          JSON.stringify(frame.state),
        );
      }

      if (!previous)
        this.ctx.storage.sql.exec(
          'INSERT INTO replay_frames (id,data) VALUES (0,?)',
          JSON.stringify(replayFrames[0]?.state ?? state),
        );

      for (const [index, event] of appendedEvents.entries())
        if (event.round > 0)
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO history_rounds (act,round,through_id,event_key) VALUES (?,?,?,?)',
            event.act,
            event.round,
            appended.first + index,
            event.eventKey,
          );
      this.ctx.storage.sql.exec(
        'INSERT INTO game (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
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

          if (codingCreation(created)) this.saveCoding(created, null);
          else if ('replayFrames' in created) this.saveSuccession(created, null);
          else this.saveLegacy(created.state, null);
        });
    }

    this.validateInitialization(input);
    await this.arm();
  }

  /** Read-only recovery receipt. Initialization commits the game and immutable admission fields together. */
  initializationReceipt(input: MatchInitialization): boolean {
    if (!this.exists()) return false;
    this.validateInitialization(input);

    return true;
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
      state.gameId !== 'secret-overlord'
        ? this.history.metadata({ seat, house: houseController, terminal: state.status !== 'active' })
        : undefined;

    const view =
      state.gameId === 'coding-finale'
        ? observeCodingFinale(state, seat, { history, houseController, serverNow: Date.now() })
        : observeGame(state, seat, { after, history, houseController });

    if (view.protocolVersion === '2' && jsonBytes(view) > 14_336)
      throw new Error('Current observation exceeds 14 KiB');

    if (view.protocolVersion === '3' && jsonBytes(view) > 31_744)
      throw new Error('Current coding observation exceeds 31 KiB');

    return view;
  }

  private evolveClock(
    previous: AnyMatchState,
    type: 'advance' | 'recover' | 'interrupt',
    now: number,
    reason = '',
  ): AnyMatchState {
    const command = type === 'interrupt' ? { type, now, reason } : { type, now };

    if (previous.gameId === 'coding-finale') {
      const evolution = evolveCodingFinale(previous, command);

      if (
        evolution.state === previous ||
        (!evolution.appendedEvents.length && JSON.stringify(evolution.state) === JSON.stringify(previous))
      )
        return previous;
      this.saveCoding(evolution, previous);

      return evolution.state;
    }

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

  private codingCheckpoint(
    state: CodingFinaleState,
    audience: HistoryAudience,
    epoch: string | undefined,
    through: number,
  ): CodingCheckpoint | CodingHistoryPage {
    const metadata = this.history.metadata(audience);

    if (epoch !== metadata.visibilityEpoch)
      return {
        ...this.history.page(state.id, audience, { epoch }),
        gameId: 'coding-finale',
        protocolVersion: '3',
      };
    const position = this.history.checkpointPosition(audience, through);

    const row = this.ctx.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM replay_frames WHERE id<=? ORDER BY id DESC LIMIT 1',
        position.eventId,
      )
      .toArray()[0];

    const saved = row ? decodeCodingFinaleReplayState(JSON.parse(row.data)) : null;

    const baseline = saved
      ? observeCodingFinale(saved, position.privateEntitled ? audience.seat : null, {
          history: { ...metadata, streamHead: through },
          serverNow: Date.now(),
          houseController: audience.house,
        })
      : null;

    if (baseline) {
      baseline.decision = null;
      baseline.chat = { ...baseline.chat, open: false, nextSpeakAt: null };

      if (baseline.actOne) {
        baseline.actOne.decision = null;
        baseline.actOne.chat = { ...baseline.actOne.chat, open: false, nextSpeakAt: null };
      }
    }

    return {
      gameId: 'coding-finale',
      protocolVersion: '3',
      matchId: state.id,
      visibilityEpoch: metadata.visibilityEpoch,
      through,
      baseline,
    };
  }

  private applyAction(
    state: AnyMatchState,
    seat: number,
    generation: number,
    raw: TransportActionRequest,
  ): AnyMatchState {
    if (raw.action.type === 'chat' && raw.action.replyTo) {
      if (state.gameId !== 'coding-finale')
        throw new GameError('invalid-reply', 'Structured replies require Coding Finale.', 400);
      this.history.requirePublicReply(raw.action.replyTo);
    }

    if (state.gameId === 'coding-finale') {
      const request = Schema.decodeUnknownSync(ActionRequest3Schema)(raw);
      const fingerprint = createHash('sha256').update(stableJson(request)).digest('hex');

      const evolution = evolveCodingFinale(state, {
        type: 'act',
        seat,
        generation,
        house: state.seats[seat].houseProfile !== null,
        request,
        fingerprint,
        now: Date.now(),
      });

      if (request.action.type === 'submit-program') {
        const submission = evolution.state.finale?.submissions.find(
          (entry) => entry.seat === seat && entry.actionId === request.actionId,
        );

        if (!submission) throw new Error('Accepted coding action has no durable receipt.');
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO coding_programs (sequence,data) VALUES (?,?)',
          submission.sequence,
          JSON.stringify(request.action.program),
        );
      }

      this.saveCoding(evolution, state);

      return evolution.state;
    }

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

  async reclaim(
    principal: AgentPrincipal,
    request: ReclaimRequest,
    protocols = '',
  ): Promise<RpcResult<{ reclaimed: true; generation: number; observation: Current }>> {
    try {
      const state = this.reconcile();
      requireGameProtocol(state.gameId, protocols, state.id);

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match does not support controller recovery.');
      const seat = this.seatFor(state, principal);
      const receiptKey = `reclaim:${principal.agentId}:${request.requestId}`;
      const fingerprint = JSON.stringify({ expectedGeneration: request.expectedGeneration });

      const receipt = this.ctx.storage.sql
        .exec<{ fingerprint: string }>('SELECT fingerprint FROM receipts WHERE id=?', receiptKey)
        .toArray()[0];

      if (receipt && receipt.fingerprint !== fingerprint)
        throw new GameError('action-id-conflict', 'This reclaim request ID was reused with different input.');

      if (!receipt) {
        if (state.status !== 'active')
          throw new GameError('match-ended', 'A terminal match cannot hand off controller authority.', 409);

        if (state.seats[seat].generation !== request.expectedGeneration)
          throw new GameError(
            'controller-generation-changed',
            'The seat generation changed; observe before reclaiming.',
          );
        const evolution = evolveCodingFinale(state, { type: 'reclaim', seat, now: Date.now() });

        this.ctx.storage.transactionSync(() => {
          this.saveCoding(evolution, state);
          this.ctx.storage.sql.exec(
            'INSERT INTO receipts(id,fingerprint) VALUES (?,?)',
            receiptKey,
            fingerprint,
          );
        });
        this.broadcast(evolution.state);
      }

      await this.arm();
      const current = this.load();

      return {
        ok: true,
        value: {
          reclaimed: true,
          generation: request.expectedGeneration + 1,
          observation: this.current(current, seat),
        },
      };
    } catch (error) {
      await this.arm();

      return { ok: false, error: fault(error) };
    }
  }

  private codingController(state: CodingFinaleState, principal: AgentPrincipal) {
    const seat = this.seatFor(state, principal);
    const entry = state.seats[seat];

    if (entry.forfeited || entry.houseProfile !== null)
      throw new GameError('controller-replaced', 'This installation no longer controls the finalist.');

    return { seat, generation: entry.generation, house: false };
  }

  async codingChallenge(tier: Tier, protocols = '') {
    try {
      const state = this.reconcile();
      requireGameProtocol(state.gameId, protocols, state.id);

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match has no coding challenge.');

      return {
        ok: true as const,
        value: Schema.decodeUnknownSync(PublicCodingChallengeSchema)({
          ...publicCodingFinaleChallenge(state, tier),
          challengeId: state.finale!.challengeId,
          limits: FINALE_RULES,
        }),
      };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  async codingSource(principal: AgentPrincipal | null, sequence: number, protocols = '') {
    try {
      const state = this.reconcile();
      requireGameProtocol(state.gameId, protocols, state.id);

      if (principal) this.seatFor(state, principal);

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match has no coding sources.');

      if (state.status === 'active')
        throw new GameError('archive-locked', 'Programs are private until the match ends.');

      const row = this.ctx.storage.sql
        .exec<{ data: string }>('SELECT data FROM coding_programs WHERE sequence=?', sequence)
        .toArray()[0];

      if (!row) throw new GameError('not-found', 'No such submission.', 404);

      return { ok: true as const, value: Schema.decodeUnknownSync(ProgramSchema)(JSON.parse(row.data)) };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  async codingSubmission(sequence: number, protocols = '') {
    try {
      const state = this.reconcile();
      requireGameProtocol(state.gameId, protocols, state.id);

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match has no coding submissions.');

      if (state.status === 'active')
        throw new GameError('archive-locked', 'Submission reports are private until the match ends.');

      const submission = state.finale?.submissions.find((entry) => entry.sequence === sequence);

      const row = this.ctx.storage.sql
        .exec<{ data: string }>('SELECT data FROM coding_programs WHERE sequence=?', sequence)
        .toArray()[0];

      if (!submission || !row) throw new GameError('not-found', 'No such submission.', 404);

      const recorded = this.ctx.storage.sql
        .exec<{ data: string }>('SELECT data FROM coding_judge_evidence WHERE sequence=?', sequence)
        .toArray()[0];

      return {
        ok: true as const,
        value: Schema.decodeUnknownSync(CodingSubmissionReportSchema)({
          gameId: 'coding-finale',
          protocolVersion: '3',
          matchId: state.id,
          challengeId: state.finale!.challengeId,
          sequence: submission.sequence,
          seat: submission.seat,
          generation: submission.generation,
          tier: submission.tier,
          receivedAt: submission.receivedAt,
          status: submission.status,
          verdict: submission.verdict,
          program: JSON.parse(row.data),
          evidence:
            submission.status === 'judged' && recorded
              ? JSON.parse(recorded.data)
              : {
                  status: 'unavailable',
                  reason: submission.status === 'judged' ? 'not-recorded' : 'not-judged',
                },
        }),
      };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  private async codingPracticeFor(
    state: CodingFinaleState,
    seat: number,
    program: Program,
    inputs: CodingInput[],
  ) {
    if (
      state.finale?.status !== 'racing' ||
      state.finale.deadline === null ||
      Date.now() >= state.finale.deadline
    )
      throw new GameError('race-closed', 'Hosted practice is available during the race.');

    if (!state.finale.finalists.some((entry) => entry.seat === seat))
      throw new GameError('not-finalist', 'Only finalists can run programs.');

    if (new TextEncoder().encode(program.source).byteLength > FINALE_RULES.maxSourceBytes)
      throw new GameError('source-too-large', 'Program source exceeds the byte limit.', 413);

    if (inputs.length < 1 || inputs.length > 8)
      throw new GameError('practice-limit', 'Use one to eight practice inputs.', 400);
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO coding_practice (seat) VALUES (?)', seat);

    const usage = this.ctx.storage.sql
      .exec<{ runs: number; lease_until: number }>(
        'SELECT runs,lease_until FROM coding_practice WHERE seat=?',
        seat,
      )
      .one();

    if (usage.runs >= 50)
      throw new GameError('practice-limit', 'All fifty practice executions have been used.');

    if (usage.lease_until > Date.now())
      throw new GameError('practice-pending', 'A practice execution is already running.');
    const run = usage.runs + 1;
    this.ctx.storage.sql.exec(
      'UPDATE coding_practice SET runs=?,lease_until=? WHERE seat=?',
      run,
      Date.now() + 30_000,
      seat,
    );

    try {
      return await practiceCodingProgram(this.env, state.id, seat, run, program, inputs);
    } finally {
      this.ctx.storage.sql.exec(
        'UPDATE coding_practice SET lease_until=0 WHERE seat=? AND runs=?',
        seat,
        run,
      );
    }
  }

  async codingPractice(principal: AgentPrincipal, program: Program, inputs: CodingInput[], protocols = '') {
    try {
      const state = this.reconcile();
      requireGameProtocol(state.gameId, protocols, state.id);

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match has no coding practice.');
      const controller = this.codingController(state, principal);
      const value = await this.codingPracticeFor(state, controller.seat, program, inputs);
      const current = this.load();

      if (current.gameId !== 'coding-finale') throw new Error('Match identity changed.');
      const active = this.codingController(current, principal);

      if (active.generation !== controller.generation || Date.now() >= principal.expiresAt)
        throw new GameError('controller-replaced', 'This execution belongs to a previous controller.');

      return { ok: true as const, value };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  async houseCodingPractice(job: HouseJob, program: Program, inputs: CodingInput[]) {
    try {
      const state = this.reconcile();

      if (state.gameId !== 'coding-finale')
        throw new GameError('game-mismatch', 'This match has no coding practice.');
      const seat = state.seats[job.seat];

      if (
        !seat?.houseProfile ||
        seat.generation !== job.generation ||
        state.phase.id !== job.phaseId ||
        Date.now() >= job.deadline
      )
        throw new GameError('obsolete-job', 'This coding activation is no longer current.');

      if (!seat.entrant.house)
        throw new GameError(
          'covered-finalist-idle',
          'House coverage cannot practice for an externally entered finalist.',
        );
      const value = await this.codingPracticeFor(state, seat.number, program, inputs);
      const current = this.load();

      if (current.seats[job.seat].generation !== job.generation || current.phase.id !== job.phaseId)
        throw new GameError('obsolete-job', 'This coding activation is no longer current.');

      return { ok: true as const, value };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  async houseObservation(seat: number, generation: number, phaseId: string) {
    this.reconcile();
    await this.arm();
    const state = this.load();
    const entry = state.seats[seat];

    if (
      !entry?.alive ||
      !entry.houseProfile ||
      entry.generation !== generation ||
      state.phase.id !== phaseId ||
      inspectGame(state).status !== 'active'
    )
      return null;

    const coding =
      state.gameId === 'coding-finale' &&
      state.finale?.status === 'racing' &&
      state.finale.finalists.some((entry) => entry.seat === seat) &&
      state.seats[seat].entrant.house
        ? this.codingHouseInput(state, seat, generation)
        : null;

    return {
      observation: this.current(state, seat, 0, true),
      coding,
      lastChat: inspectGame(state).lastChat,
      recent:
        state.gameId !== 'secret-overlord' ? this.history.recent({ seat, house: true, terminal: false }) : [],
      persona:
        entry.houseProfile !== null && !entry.entrant.house
          ? state.gameId === 'succession'
            ? 'A composed substitute. Use entitled history and current capability evidence to pursue sole overall seat victory.'
            : 'A composed substitute. Reconstruct the permitted game history and pursue your assigned team’s victory.'
          : (entry.entrant.persona ?? 'A careful, concise strategist.'),
    };
  }

  private codingHouseInput(state: CodingFinaleState, seat: number, generation: number) {
    const finalist = state.finale!.finalists.find((entry) => entry.seat === seat)!;
    const own = state.finale!.submissions.filter((entry) => entry.seat === seat);
    const latest = own.at(-1);

    const row = latest
      ? this.ctx.storage.sql
          .exec<{ data: string }>('SELECT data FROM coding_programs WHERE sequence=?', latest.sequence)
          .toArray()[0]
      : null;

    return {
      challenge: {
        ...authorizeCodingFinaleChallenge(
          state,
          { seat, generation, house: true },
          finalist.tierOne === null ? 1 : 2,
        ),
        challengeId: state.finale!.challengeId,
        limits: FINALE_RULES,
      },
      priorProgram: row ? Schema.decodeUnknownSync(ProgramSchema)(JSON.parse(row.data)) : null,
      feedback: own,
    };
  }

  /** Private completion acknowledgement: silence does not mutate the game or public history. */
  async completeHouseSilence(
    job: HouseJob,
    observedChat: SilentChatCompletion['observedChat'],
  ): Promise<RpcResult<{ accepted: true }>> {
    try {
      const state = this.reconcile();
      const seat = state.seats[job.seat];

      const row = this.ctx.storage.sql
        .exec<{ data: string; silent_completion: string | null }>(
          'SELECT data,silent_completion FROM outbox WHERE id=?',
          job.id,
        )
        .toArray()[0];

      if (!row || job.kind !== 'chat' || !job.id.endsWith(':chat:0') || row.data !== JSON.stringify(job))
        throw new GameError('obsolete-job', 'This optional activation is not scheduled.');

      if (row.silent_completion) {
        const existing: SilentChatCompletion = JSON.parse(row.silent_completion);

        if (
          existing.observedChat?.seat !== observedChat?.seat ||
          existing.observedChat?.at !== observedChat?.at
        )
          throw new GameError('action-id-conflict', 'House completion input changed.');
      } else {
        if (
          !seat?.alive ||
          !seat.houseProfile ||
          seat.generation !== job.generation ||
          state.phase.id !== job.phaseId ||
          Date.now() >= job.deadline ||
          inspectGame(state).status !== 'active'
        )
          throw new GameError('obsolete-job', 'This house activation is no longer current.');
        this.ctx.storage.sql.exec(
          'UPDATE outbox SET silent_completion=? WHERE id=?',
          JSON.stringify({ at: Date.now(), observedChat } satisfies SilentChatCompletion),
          job.id,
        );
      }

      this.enqueueWork(state);
      await this.arm();

      return { ok: true, value: { accepted: true } };
    } catch (error) {
      await this.arm();

      return { ok: false, error: fault(error) };
    }
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

    if (state.gameId === 'secret-overlord')
      throw new GameError('history-protocol', 'Secret Overlord uses protocol-1 inline history.', 400);

    return { seat, house: false, terminal: state.status !== 'active' };
  }

  async historyPage(
    principal: AgentPrincipal | null,
    query: HistoryQuery,
    protocols: string,
  ): Promise<RpcResult<HistoryPage2 | CodingHistoryPage>> {
    try {
      const state = this.reconcile();
      const audience = this.historyAudience(state, principal, protocols);
      const page = this.history.page(state.id, audience, query);

      const value =
        state.gameId === 'coding-finale'
          ? { ...page, protocolVersion: '3' as const, gameId: 'coding-finale' as const }
          : page;

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
  ): Promise<RpcResult<HistoryAnchor2 | HistoryPage2 | CodingHistoryAnchor | CodingHistoryPage>> {
    try {
      const state = this.reconcile();
      const audience = this.historyAudience(state, principal, protocols);
      const metadata = this.history.metadata(audience);

      if (state.gameId === 'coding-finale') {
        if (epoch !== metadata.visibilityEpoch)
          return {
            ok: true,
            value: {
              ...this.history.page(state.id, audience, { epoch }),
              protocolVersion: '3',
              gameId: 'coding-finale',
            },
          };

        return {
          ok: true,
          value: {
            protocolVersion: '3',
            gameId: 'coding-finale',
            matchId: state.id,
            visibilityEpoch: metadata.visibilityEpoch,
            cursor: this.history.anchor(audience, eventKey),
          },
        };
      }

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

  async checkpoint(
    principal: AgentPrincipal | null,
    epoch: string | undefined,
    through: number,
    protocols: string,
  ): Promise<RpcResult<HistoryCheckpoint2 | HistoryPage2 | CodingCheckpoint | CodingHistoryPage>> {
    try {
      let state = this.load();
      let audience = this.historyAudience(state, principal, protocols);

      if (state.gameId === 'coding-finale')
        return { ok: true, value: this.codingCheckpoint(state, audience, epoch, through) };

      if (state.gameId !== 'succession') throw new Error('Invalid checkpoint game');

      if (audience.terminal) {
        await gameRegistry.succession.verifyReplayArchive(state);
        // Archive verification awaits crypto. Recheck grant revocation and current entitlement afterward.
        state = this.load();
        audience = this.historyAudience(state, principal, protocols);
      }

      const metadata = this.history.metadata(audience);

      if (epoch !== metadata.visibilityEpoch)
        return { ok: true, value: this.history.page(state.id, audience, { epoch }) };
      const position = this.history.checkpointPosition(audience, through);

      const row = this.ctx.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM replay_frames WHERE id <= ? ORDER BY id DESC LIMIT 1',
          position.eventId,
        )
        .toArray()[0];

      let baseline: HistoryCheckpoint2['baseline'] = null;

      if (row) {
        const saved = decodeReplayCheckpoint(JSON.parse(row.data));

        if (audience.terminal) baseline = replayFrameSuccession(saved, through, metadata.visibilityEpoch);
        else {
          const observation = observeSuccession(saved, audience.seat, {
            visibilityEpoch: metadata.visibilityEpoch,
            streamHead: through,
          });

          observation.decision = null;
          observation.chat = { ...observation.chat, open: false, nextSpeakAt: null };

          if (!position.privateEntitled) observation.private = null;
          baseline = observation;
        }
      }

      const value: HistoryCheckpoint2 = {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: state.id,
        visibilityEpoch: metadata.visibilityEpoch,
        through,
        baseline,
      };

      if (jsonBytes(value) > 34_816) throw new Error('Historical checkpoint exceeds its bounded envelope');

      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: fault(error) };
    }
  }

  async replay(
    principal: AgentPrincipal | null,
    epoch: string | undefined,
    through: number,
    protocols: string,
  ): Promise<RpcResult<ReplayFrame2 | HistoryPage2 | CodingCheckpoint | CodingHistoryPage>> {
    try {
      const state = this.load();
      const audience = this.historyAudience(state, principal, protocols);

      if (!audience.terminal)
        throw new GameError(
          'replay-not-ready',
          'Replay is available after overall completion or interruption.',
        );

      if (state.gameId === 'coding-finale')
        return { ok: true, value: this.codingCheckpoint(state, audience, epoch, through) };

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
  ): RpcResult<RoundIndex2 | HistoryPage2 | CodingRoundIndex | CodingHistoryPage> {
    try {
      const state = this.load();
      const audience = this.historyAudience(state, principal, protocols);

      const metadata = this.history.metadata(audience);

      if (epoch !== metadata.visibilityEpoch) {
        const page = this.history.page(state.id, audience, { epoch });

        return {
          ok: true,
          value:
            state.gameId === 'coding-finale'
              ? { ...page, gameId: 'coding-finale', protocolVersion: '3' }
              : page,
        };
      }

      const rows = this.ctx.storage.sql
        .exec<{ act: number; round: number; through_id: number; event_key: string }>(
          'SELECT act, round, through_id, event_key FROM history_rounds ORDER BY act, round LIMIT 43',
        )
        .toArray();

      if (rows.length > 42) throw new Error('Round index exceeds the rules bound');

      const rounds = rows.flatMap((row): RoundIndex2['rounds'] => {
        if (row.act !== 1 && row.act !== 2) throw new Error('Invalid indexed act');
        const through = audience.terminal ? row.through_id : this.history.anchor(audience, row.event_key);

        if (through === null) return [];

        return [
          {
            key: `act-${row.act}:${row.act === 1 ? 'election' : 'table'}-${row.round}`,
            act: row.act,
            round: row.round,
            through,
            eventKey: row.event_key,
          },
        ];
      });

      return {
        ok: true,
        value: {
          ...(state.gameId === 'coding-finale'
            ? { protocolVersion: '3' as const, gameId: 'coding-finale' as const }
            : { protocolVersion: '2' as const, gameId: 'succession' as const }),
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
      const requestedProtocol = url.searchParams.get('protocol');
      const protocol = requestedProtocol === '3' || requestedProtocol === '2' ? requestedProtocol : '1';

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

    if (view.protocolVersion !== '1') {
      const maxBytes = view.protocolVersion === '3' ? 32_768 : 16_384;

      if (new TextEncoder().encode(packet).byteLength > maxBytes)
        throw new Error('Socket envelope exceeds its bounded size');
      const signature = createHash('sha256').update(packet).digest('hex');

      if (!explicit && signature === attachment.signature) return;
      socket.send(packet);
      socket.serializeAttachment({ ...attachment, protocol: view.protocolVersion, signature });
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
    const ringSize = runtime.participants.length;
    const anchor = runtime.discussion?.anchor ?? 0;

    // Compact living-participant order keeps dead holes and absolute seat numbers
    // out of pacing. The initial pass fits inside the first second at normal speed.
    const speakers = [...(runtime.discussion?.seats ?? [])].sort(
      (a, b) => ((a - anchor + ringSize) % ringSize) - ((b - anchor + ringSize) % ringSize),
    );

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
        const deadline = runtime.phase.deadline - Math.min(500, runtime.timing.nomination / 10);
        const chatBase = { ...base, kind: 'chat' as const, deadline };
        const lastChatAt = state.seats[seat.number].lastChatAt;
        const initialId = `${state.gameId}:${runtime.phaseId}:${seat.number}:${seat.generation}:chat:0`;

        const completion = this.ctx.storage.sql
          .exec<{ silent_completion: string | null }>(
            'SELECT silent_completion FROM outbox WHERE id=?',
            initialId,
          )
          .toArray()[0]?.silent_completion;

        const silent: SilentChatCompletion | null = completion ? JSON.parse(completion) : null;
        jobs.push({
          ...chatBase,
          id: initialId,
          dueAt: Math.max(
            now,
            runtime.phase.startedAt +
              speakers.indexOf(seat.number) * Math.min(100, runtime.timing.nomination / 200),
            lastChatAt === null ? 0 : lastChatAt + runtime.timing.chatCooldown,
          ),
        });

        const peer = runtime.lastChat;

        const spokeThenPeer =
          lastChatAt !== null &&
          lastChatAt >= runtime.phase.startedAt &&
          peer &&
          peer.seat !== seat.number &&
          peer.at >= lastChatAt;

        const silentThenPeer =
          silent &&
          peer &&
          peer.seat !== seat.number &&
          peer.at >= runtime.phase.startedAt &&
          (peer.at !== silent.observedChat?.at || peer.seat !== silent.observedChat?.seat);

        if (spokeThenPeer || silentThenPeer)
          jobs.push({
            ...chatBase,
            id: `${state.gameId}:${runtime.phaseId}:${seat.number}:${seat.generation}:chat:1`,
            dueAt: Math.max(
              now,
              (lastChatAt ?? 0) + runtime.timing.chatCooldown,
              silent ? silent.at + runtime.timing.chatCooldown : 0,
            ),
          });
      }

      for (const job of jobs)
        if (job.kind === 'chat' || job.dueAt < job.deadline)
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

    if (state.gameId === 'coding-finale' && state.finale) {
      if (state.status !== 'active') {
        if (this.getMeta('coding-cleaned') !== '1' && !this.codingCleaning)
          this.ctx.waitUntil(this.cleanupCoding(state));
      } else if (state.finale.status === 'preparing') {
        if (!this.codingPreparing) this.ctx.waitUntil(this.prepareCoding(state));
      } else {
        for (const entry of state.finale.submissions)
          if (entry.status === 'pending' && !this.codingJudging.has(entry.sequence))
            this.ctx.waitUntil(this.judgeCoding(state, entry.sequence));
      }
    }

    const pending =
      this.getMeta('index-dirty') === '1' ||
      this.ctx.storage.sql.exec('SELECT id FROM outbox WHERE delivered = 0 LIMIT 1').toArray().length > 0 ||
      (runtime.status !== 'active' && this.getMeta('released') !== '1');

    let due = pending ? Math.min(runtime.nextDeadline ?? Infinity, Date.now() + 1) : runtime.nextDeadline;

    if (state.gameId === 'coding-finale' && state.finale) {
      const codingDue =
        state.status !== 'active'
          ? this.getMeta('coding-cleaned') === '1'
            ? Infinity
            : Date.now() + 1000
          : state.finale.status === 'preparing'
            ? state.phase.startedAt + 120_000
            : Math.min(
                ...state.finale.submissions
                  .filter((entry) => entry.status === 'pending')
                  .map((entry) => entry.receivedAt + FINALE_RULES.judgingGraceMs),
              );

      if (Number.isFinite(codingDue)) due = Math.min(due ?? Infinity, codingDue);
    }

    if (due !== null && Number.isFinite(due)) {
      const at = Math.max(Date.now() + 1, due);
      this.setMeta('alarm-due', String(at));
      await this.ctx.storage.setAlarm(at);
    } else {
      this.setMeta('alarm-due', '0');
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async prepareCoding(initial: CodingFinaleState) {
    if (this.codingPreparing || !initial.finale) return;
    this.codingPreparing = true;

    try {
      const ready = await Promise.allSettled(
        initial.finale.finalists.map((seat) => prepareCodingEnvironment(this.env, initial.id, seat.seat)),
      );

      const state = this.load();

      if (
        state.gameId !== 'coding-finale' ||
        state.status !== 'active' ||
        state.finale?.status !== 'preparing'
      )
        return;

      if (ready.some((result) => result.status === 'rejected')) {
        const next = this.evolveClock(
          state,
          'interrupt',
          Date.now(),
          'The shared coding environments could not be prepared.',
        );

        this.broadcast(next);
      } else {
        const evolution = evolveCodingFinale(state, { type: 'prepare-ready', now: Date.now() });
        this.saveCoding(evolution, state);
        this.broadcast(evolution.state);
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'coding_preparation_failed',
          matchId: initial.id,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      const state = this.load();
      this.broadcast(
        this.evolveClock(state, 'interrupt', Date.now(), 'Coding environment preparation failed.'),
      );
    } finally {
      this.codingPreparing = false;
      await this.arm();
    }
  }

  private async judgeCoding(initial: CodingFinaleState, sequence: number) {
    const submission = initial.finale?.submissions.find((entry) => entry.sequence === sequence);

    if (!submission || submission.status !== 'pending' || this.codingJudging.has(sequence)) return;

    const row = this.ctx.storage.sql
      .exec<{ data: string; started_at: number | null }>(
        'SELECT data,started_at FROM coding_programs WHERE sequence=?',
        sequence,
      )
      .toArray()[0];

    if (!row) throw new Error('Accepted submission source is missing.');

    // An interrupted invocation can still own a process. Its recovery deadline fences lost results.
    if (row.started_at !== null) return;
    this.ctx.storage.sql.exec(
      'UPDATE coding_programs SET started_at=? WHERE sequence=?',
      Date.now(),
      sequence,
    );
    this.codingJudging.add(sequence);

    try {
      const program = Schema.decodeUnknownSync(ProgramSchema)(JSON.parse(row.data));

      const judged = await judgeCodingSubmission(
        this.env,
        initial.id,
        submission.seat,
        sequence,
        program,
        initial.seed,
        submission.tier,
        initial.challengeFamily ?? 'scheduled-network-1',
      );

      const state = this.load();

      if (state.gameId !== 'coding-finale') throw new Error('Match identity changed.');

      const evolution = evolveCodingFinale(state, {
        type: 'judge-result',
        sequence,
        verdict: judged.verdict,
        now: Date.now(),
      });

      this.ctx.storage.transactionSync(() => {
        const accepted = evolution.state.finale?.submissions.find((entry) => entry.sequence === sequence);

        if (accepted?.status === 'judged' && accepted.verdict === judged.verdict)
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO coding_judge_evidence (sequence,data) VALUES (?,?)',
            sequence,
            JSON.stringify(Schema.decodeUnknownSync(CodingJudgeEvidenceSchema)(judged.evidence)),
          );
        this.saveCoding(evolution, state);
      });
      this.broadcast(evolution.state);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'coding_judge_failed',
          matchId: initial.id,
          sequence,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      const state = this.load();
      this.broadcast(
        this.evolveClock(state, 'interrupt', Date.now(), 'An accepted program could not be reliably judged.'),
      );
    } finally {
      this.codingJudging.delete(sequence);
      await this.arm();
    }
  }

  private async cleanupCoding(state: CodingFinaleState) {
    if (this.codingCleaning || !state.finale) return;
    this.codingCleaning = true;

    try {
      const results = await Promise.allSettled(
        state.finale.finalists.map((seat) => closeCodingEnvironment(this.env, state.id, seat.seat)),
      );

      if (results.every((result) => result.status === 'fulfilled')) this.setMeta('coding-cleaned', '1');
    } finally {
      this.codingCleaning = false;
      // Alarm retries cleanup after a failed teardown; terminal state and source archive remain durable.
    }
  }

  private indexed(state: SuccessionState | CodingFinaleState): IndexedMatch {
    const summary = summaryGame(state);

    if (summary.gameId === 'secret-overlord') throw new Error('Incorrect game summary');

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
        await indexMatch(
          this.env,
          state.gameId !== 'secret-overlord' ? this.indexed(state) : state,
          revision,
        );

        if (this.revision() === revision) this.setMeta('index-dirty', '0');
      }

      const current = this.load();

      if (inspectGame(current).status !== 'active') {
        if (this.getMeta('released') !== '1') {
          if (current.gameId !== 'secret-overlord') {
            const settlement =
              current.gameId === 'coding-finale'
                ? settleCodingFinale(current)
                : gameRegistry.succession.settle(current);

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

            // Optional jobs must reach the runner even when late: it records a bounded
            // skip instead of silently dropping a seat's opportunity in the outbox.
            if (job.kind === 'chat' || (job.deadline > Date.now() && job.phaseId === this.load().phase.id))
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
