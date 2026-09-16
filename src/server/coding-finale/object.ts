import { DurableObject } from 'cloudflare:workers';
import { getSandbox, Sandbox } from '@cloudflare/sandbox';
import { Schema } from 'effect';
import type { LegacyBoard } from '../../game/engine';
import type { GameEvent } from '../../game/types';
import { GameError } from '../../game/types';
import {
  admitSubmission,
  advanceFinale,
  createFinale,
  finalistFor,
  interruptFinale,
  observeFinale,
  recordVerdict,
  startFinale,
} from '../../game/coding-finale/engine';
import { createFinaleCommitment } from '../../game/coding-finale/commitment';
import { FINALE_RULES, FinaleStateSchema, ProgramSchema } from '../../game/coding-finale/types';
import type {
  FinaleController,
  FinaleState,
  Program,
  SubmissionRequest,
  Tier,
} from '../../game/coding-finale/types';
import { routingCases, routingChallenge } from '../../game/coding-finale/routing';
import type { RoutingInput } from '../../game/coding-finale/routing';
import { fault, hashSecret, randomSecret } from '../http';
import { judgeProgram, runProgram } from './judge';

export type FinaleCommand =
  | { type: 'create'; board: LegacyBoard; events: GameEvent[] }
  | { type: 'current'; tokenHash: string | null }
  | { type: 'challenge'; tokenHash: string; tier: Tier }
  | { type: 'submit'; tokenHash: string; request: SubmissionRequest }
  | { type: 'practice'; tokenHash: string; program: Program; inputs: RoutingInput[] }
  | { type: 'say'; tokenHash: string; text: string }
  | { type: 'history'; after: number }
  | { type: 'source'; sequence: number };

export class FinaleSandbox extends Sandbox<FinaleEnv> {
  override enableInternet = false;
  override sleepAfter = '2m';
}

export class FinaleObject extends DurableObject<FinaleEnv> {
  private preparing = false;
  private judging = new Set<number>();

  constructor(ctx: DurableObjectState, env: FinaleEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS finale (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), data TEXT NOT NULL,
        seed INTEGER NOT NULL, created_at INTEGER NOT NULL, cleaned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS programs (
        sequence INTEGER PRIMARY KEY, data TEXT NOT NULL, started_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS controllers (
        token_hash TEXT PRIMARY KEY, seat INTEGER NOT NULL, generation INTEGER NOT NULL,
        house INTEGER NOT NULL, practice_runs INTEGER NOT NULL DEFAULT 0,
        practice_until INTEGER NOT NULL DEFAULT 0, last_chat INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY, seat INTEGER NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS act_one (singleton INTEGER PRIMARY KEY, data TEXT NOT NULL);
    `);
  }

  async request(command: FinaleCommand) {
    try {
      return { ok: true as const, value: await this.dispatch(command) };
    } catch (error) {
      return { ok: false as const, error: fault(error) };
    }
  }

  private dispatch(command: FinaleCommand) {
    switch (command.type) {
      case 'create':
        return this.initialize(command.board, command.events);
      case 'current':
        return this.current(command.tokenHash);
      case 'challenge':
        return this.challenge(command.tokenHash, command.tier);
      case 'submit':
        return this.submit(command.tokenHash, command.request);
      case 'practice':
        return this.practice(command.tokenHash, command.program, command.inputs);
      case 'say':
        return this.say(command.tokenHash, command.text);
      case 'history':
        return this.history(command.after);
      case 'source':
        return this.source(command.sequence);
    }
  }

  async initialize(board: LegacyBoard, events: GameEvent[]) {
    if (this.exists()) throw new GameError('already-initialized', 'This finale already exists.');
    const commitment = await createFinaleCommitment(board.id);
    const state = createFinale(board, crypto.randomUUID(), commitment);

    const credentials = await Promise.all(
      state.finalists.map(async (seat) => {
        const token = randomSecret();

        return { ...seat, token, hash: await hashSecret(token) };
      }),
    );

    this.ctx.storage.transactionSync(() => {
      if (this.exists()) throw new GameError('already-initialized', 'This finale already exists.');
      this.ctx.storage.sql.exec(
        'INSERT INTO finale (singleton,data,seed,created_at) VALUES (1,?,?,?)',
        JSON.stringify(state),
        crypto.getRandomValues(new Uint32Array(1))[0],
        Date.now(),
      );

      for (const seat of credentials)
        this.ctx.storage.sql.exec(
          'INSERT INTO controllers (token_hash,seat,generation,house) VALUES (?,?,?,?)',
          seat.hash,
          seat.seat,
          seat.generation,
          Number(seat.houseProfile !== null),
        );
      this.ctx.storage.sql.exec(
        'INSERT INTO act_one VALUES (1,?)',
        JSON.stringify({
          winner: board.winner,
          reason: board.winReason,
          seats: board.seats.map((seat) => ({
            seat: seat.number,
            name: seat.entrant.name,
            role: seat.role,
            alive: seat.alive,
          })),
          events,
        }),
      );
    });
    await this.arm();
    this.ctx.waitUntil(this.prepare());

    return {
      current: observeFinale(state),
      actOne: {
        winner: board.winner,
        reason: board.winReason,
        rounds: board.round,
        executed: board.seats.flatMap((seat) => (seat.alive ? [] : [seat.number])),
      },
      credentials: credentials.map((seat) => ({ seat: seat.seat, token: seat.token })),
    };
  }

  private exists() {
    return this.ctx.storage.sql.exec('SELECT singleton FROM finale WHERE singleton=1').toArray().length > 0;
  }

  private load(): FinaleState {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM finale WHERE singleton=1')
      .toArray()[0];

    if (!row) throw new GameError('not-found', 'No such finale.', 404);

    return Schema.decodeUnknownSync(FinaleStateSchema)(JSON.parse(row.data));
  }

  private save(state: FinaleState) {
    this.ctx.storage.sql.exec('UPDATE finale SET data=? WHERE singleton=1', JSON.stringify(state));
  }

  private controller(tokenHash: string): FinaleController {
    const row = this.ctx.storage.sql
      .exec<{ seat: number; generation: number; house: number }>(
        'SELECT seat,generation,house FROM controllers WHERE token_hash=?',
        tokenHash,
      )
      .toArray()[0];

    if (!row) throw new GameError('unauthorized', 'A finalist credential is required.', 401);
    const controller = { seat: row.seat, generation: row.generation, house: row.house === 1 };
    finalistFor(this.load(), controller);

    return controller;
  }

  private sandbox(state: FinaleState, seat: number, purpose: 'practice' | 'judge') {
    return getSandbox(this.env.SANDBOXES, `${state.id}-${seat}-${purpose}`, { keepAlive: true });
  }

  async current(tokenHash: string | null = null) {
    const controller = tokenHash === null ? null : this.controller(tokenHash);
    const state = advanceFinale(this.load(), Date.now());
    this.save(state);
    await this.arm();

    return observeFinale(state, controller);
  }

  challenge(tokenHash: string, tier: Tier) {
    const controller = this.controller(tokenHash);
    const state = this.load();
    const finalist = finalistFor(state, controller);

    if (state.status === 'preparing') throw new GameError('preparing', 'The shared race has not started.');

    if (tier === 2 && finalist.tierOne === null)
      throw new GameError('tier-locked', 'Pass Tier 1 to receive Tier 2.');

    return { challengeId: state.challengeId, ...routingChallenge(tier), limits: FINALE_RULES };
  }

  async submit(tokenHash: string, request: SubmissionRequest) {
    // Re-read authority/state after hashing; no stale board is held over this await.
    const fingerprint = await hashSecret(
      JSON.stringify([request.challengeId, request.tier, request.program.language, request.program.source]),
    );

    const accepted = this.ctx.storage.transactionSync(() => {
      const controller = this.controller(tokenHash);
      const admission = admitSubmission(this.load(), controller, request, fingerprint, Date.now());

      if (!admission.duplicate) {
        this.save(admission.state);
        this.ctx.storage.sql.exec(
          'INSERT INTO programs (sequence,data) VALUES (?,?)',
          admission.sequence,
          JSON.stringify(request.program),
        );
      }

      return { accepted: true, sequence: admission.sequence, duplicate: admission.duplicate };
    });

    await this.arm();
    this.ctx.waitUntil(this.judgePending());

    return accepted;
  }

  async practice(tokenHash: string, program: Program, inputs: RoutingInput[]) {
    const controller = this.controller(tokenHash);
    const state = advanceFinale(this.load(), Date.now());
    this.save(state);

    if (state.status !== 'racing')
      throw new GameError('race-closed', 'Practice is available during the race.');

    if (new TextEncoder().encode(program.source).byteLength > FINALE_RULES.maxSourceBytes)
      throw new GameError('source-too-large', 'Program source exceeds the byte limit.', 413);

    const usage = this.ctx.storage.sql
      .exec<{ practice_runs: number; practice_until: number }>(
        'SELECT practice_runs,practice_until FROM controllers WHERE token_hash=?',
        tokenHash,
      )
      .one();

    if (usage.practice_runs >= 50)
      throw new GameError('practice-limit', 'The 50-run practice allowance is exhausted.');

    if (usage.practice_until > Date.now())
      throw new GameError('practice-pending', 'A practice execution is already running.');
    this.ctx.storage.sql.exec(
      'UPDATE controllers SET practice_runs=practice_runs+1,practice_until=? WHERE token_hash=?',
      Date.now() + 30_000,
      tokenHash,
    );

    try {
      return await runProgram(
        this.sandbox(state, controller.seat, 'practice'),
        `practice-${usage.practice_runs + 1}`,
        program,
        inputs,
      );
    } finally {
      this.ctx.storage.sql.exec('UPDATE controllers SET practice_until=0 WHERE token_hash=?', tokenHash);
    }
  }

  say(tokenHash: string, text: string) {
    const controller = this.controller(tokenHash);
    const state = advanceFinale(this.load(), Date.now());
    this.save(state);

    if (state.status !== 'racing') throw new GameError('race-closed', 'Finalist discussion has ended.');

    if ([...text].length > 1000 || !text.trim())
      throw new GameError('invalid-chat', 'Use 1–1000 characters.');

    const last = this.ctx.storage.sql
      .exec<{ last_chat: number }>('SELECT last_chat FROM controllers WHERE token_hash=?', tokenHash)
      .one().last_chat;

    if (Date.now() < last + 5000) throw new GameError('chat-cooldown', 'Wait five seconds between messages.');
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO chat (seat,at,text) VALUES (?,?,?)',
        controller.seat,
        Date.now(),
        text,
      );
      this.ctx.storage.sql.exec(
        'UPDATE controllers SET last_chat=? WHERE token_hash=?',
        Date.now(),
        tokenHash,
      );
    });

    return { accepted: true };
  }

  history(after: number) {
    this.load();

    return this.ctx.storage.sql
      .exec<{ id: number; seat: number; at: number; text: string }>(
        'SELECT id,seat,at,text FROM chat WHERE id>? ORDER BY id LIMIT 32',
        after,
      )
      .toArray();
  }

  source(sequence: number) {
    const state = this.load();

    if (state.status !== 'finished' && state.status !== 'interrupted')
      throw new GameError('archive-locked', 'Submitted programs are private until the finale ends.');

    const row = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM programs WHERE sequence=?', sequence)
      .toArray()[0];

    if (!row) throw new GameError('not-found', 'No such submission.', 404);

    return Schema.decodeUnknownSync(ProgramSchema)(JSON.parse(row.data));
  }

  private async prepare() {
    if (this.preparing || this.load().status !== 'preparing') return;
    this.preparing = true;
    const state = this.load();

    try {
      await Promise.all(
        state.finalists.flatMap((seat) =>
          (['practice', 'judge'] as const).map(async (purpose) => {
            const sandbox = this.sandbox(state, seat.seat, purpose);

            const process = await sandbox.exec(['/usr/local/bin/finale-node', '--version'], {
              timeout: 2000,
            });

            const output = await process.output({ encoding: 'utf8', maxBytes: 128, timeout: 15_000 });

            if (output.exitCode !== 0 || output.stdout.trim() !== 'v24.14.0')
              throw new Error('The pinned coding runtime is unavailable.');
          }),
        ),
      );
      this.save(startFinale(this.load(), Date.now()));
    } catch {
      this.save(interruptFinale(this.load(), 'The shared coding environments could not be prepared.'));
    } finally {
      this.preparing = false;
      await this.arm();
    }
  }

  private async judgePending() {
    const state = this.load();

    if (state.status !== 'racing' && state.status !== 'judging') return;

    const seed = this.ctx.storage.sql
      .exec<{ seed: number }>('SELECT seed FROM finale WHERE singleton=1')
      .one().seed;

    const jobs = state.submissions.filter(
      (entry) => entry.status === 'pending' && !this.judging.has(entry.sequence),
    );

    await Promise.all(
      jobs.map(async (entry) => {
        const row = this.ctx.storage.sql
          .exec<{ data: string; started_at: number | null }>(
            'SELECT data,started_at FROM programs WHERE sequence=?',
            entry.sequence,
          )
          .one();

        // An interrupted invocation may still own a running process. Never double-launch it.
        if (row.started_at !== null) return;
        this.ctx.storage.sql.exec(
          'UPDATE programs SET started_at=? WHERE sequence=?',
          Date.now(),
          entry.sequence,
        );
        this.judging.add(entry.sequence);

        try {
          const program = Schema.decodeUnknownSync(ProgramSchema)(JSON.parse(row.data));

          const verdict = await judgeProgram(
            this.sandbox(state, entry.seat, 'judge'),
            `submission-${entry.sequence}`,
            program,
            routingCases(seed, entry.tier),
          );

          this.ctx.storage.transactionSync(() => {
            this.save(recordVerdict(this.load(), entry.sequence, verdict, Date.now()));
          });
        } catch {
          this.save(
            interruptFinale(this.load(), 'The judge could not reliably evaluate an accepted submission.'),
          );
        } finally {
          this.judging.delete(entry.sequence);
          await this.arm();
        }
      }),
    );
  }

  private async arm() {
    const state = this.load();
    const pending = state.submissions.filter((entry) => entry.status === 'pending');

    if (state.status === 'preparing') {
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (state.status === 'finished' || state.status === 'interrupted') {
      const cleaned = this.ctx.storage.sql
        .exec<{ cleaned: number }>('SELECT cleaned FROM finale WHERE singleton=1')
        .one().cleaned;

      if (!cleaned) await this.ctx.storage.setAlarm(Date.now() + 100);
      else await this.ctx.storage.deleteAlarm();
    } else {
      const next = Math.min(
        state.status === 'racing' ? state.deadline! : state.deadline! + FINALE_RULES.judgingGraceMs,
        ...pending.map((entry) => entry.receivedAt + FINALE_RULES.judgingGraceMs),
      );

      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    }
  }

  async alarm() {
    let state = advanceFinale(this.load(), Date.now());

    const createdAt = this.ctx.storage.sql
      .exec<{ created_at: number }>('SELECT created_at FROM finale WHERE singleton=1')
      .one().created_at;

    if (state.status === 'preparing' && Date.now() >= createdAt + 120_000)
      state = interruptFinale(state, 'Coding environment preparation exceeded its deadline.');

    if (
      state.submissions.some(
        (entry) => entry.status === 'pending' && Date.now() >= entry.receivedAt + FINALE_RULES.judgingGraceMs,
      )
    )
      state = interruptFinale(state, 'A judge result was lost or exceeded its recovery deadline.');
    this.save(state);

    if (state.status === 'preparing') await this.prepare();
    else if (state.status === 'racing' || state.status === 'judging') await this.judgePending();
    else {
      const cleanup = await Promise.allSettled(
        state.finalists.flatMap((seat) =>
          (['practice', 'judge'] as const).map((purpose) =>
            this.sandbox(state, seat.seat, purpose).destroy(),
          ),
        ),
      );

      if (cleanup.every((result) => result.status === 'fulfilled'))
        this.ctx.storage.sql.exec('UPDATE finale SET cleaned=1 WHERE singleton=1');
    }

    await this.arm();
  }
}
