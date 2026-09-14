import { DurableObject } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { previewAction, previewSpeech } from '../game/preview';
import { previewSuccessionAction, previewSuccessionSpeech } from '../game/succession/preview';
import { ObservationSchema } from '../shared/api';
import type { TransportActionRequest } from '../shared/api';
import { Observation2Schema } from '../shared/succession';
import type { Action2 } from '../shared/succession';
import type { HouseJob } from './house-contract';
import { houseChatBudget } from './house-contract';
import { generateHouse, housePrompt, houseSystem, inferenceCost } from './house-model';
import { platformCoordinator } from './coordinator';

type JobRow = {
  id: string;
  data: string;
  status: string;
  due_at: number;
  deadline: number;
  attempts: number;
  response: string | null;
};

interface SavedResponse {
  request: TransportActionRequest | null;
  notes: string;
  usageId: string | null;
  cost: number | null;
  observedChat?: { seat: number; at: number } | null;
}

type JobOutcome =
  | 'accepted'
  | 'silent'
  | 'expired'
  | 'insufficient-time'
  | 'obsolete'
  | 'decision-complete'
  | 'chat-closed'
  | 'admission-denied'
  | 'rejected'
  | 'provider-error';

/** Per-match, per-seat runner: slow inference never owns the authoritative match alarm. */
export class HouseSeatObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, due_at INTEGER NOT NULL, deadline INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, response TEXT)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS notes (generation INTEGER PRIMARY KEY, text TEXT NOT NULL)',
    );
    const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(jobs)').toArray();

    if (!columns.some((column) => column.name === 'outcome'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN outcome TEXT');

    if (!columns.some((column) => column.name === 'completed_at'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN completed_at INTEGER');

    if (!columns.some((column) => column.name === 'admission_reason'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN admission_reason TEXT');
  }

  async enqueue(job: HouseJob): Promise<void> {
    const skip =
      job.kind === 'chat' && Math.max(Date.now(), job.dueAt) + houseChatBudget(job.model) > job.deadline;

    const inserted = this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO jobs (id, data, status, due_at, deadline, outcome, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      job.id,
      JSON.stringify(job),
      skip ? 'done' : 'pending',
      job.dueAt,
      job.deadline,
      skip ? 'insufficient-time' : null,
      skip ? Date.now() : null,
    );

    if (skip && inserted.rowsWritten) this.logSkip(job, 'insufficient-time');
    await this.arm();
  }
  private async arm(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ due: number | null }>("SELECT min(due_at) AS due FROM jobs WHERE status != 'done'")
      .one().due;

    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  private logSkip(job: HouseJob, outcome: JobOutcome): void {
    if (job.kind === 'chat')
      console.log(
        JSON.stringify({
          event: 'house_chat_skip',
          job: job.id,
          outcome,
          at: Date.now(),
          deadline: job.deadline,
        }),
      );
  }

  private done(id: string, outcome: JobOutcome): void {
    this.ctx.storage.sql.exec(
      "UPDATE jobs SET status = 'done', outcome = ?, completed_at = ? WHERE id = ?",
      outcome,
      Date.now(),
      id,
    );

    if (outcome !== 'accepted' && outcome !== 'silent') {
      const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM jobs WHERE id = ?', id).one();
      const job: HouseJob = JSON.parse(row.data);
      this.logSkip(job, outcome);
    }
  }

  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<JobRow>(
        "SELECT * FROM jobs WHERE status != 'done' AND due_at <= ? ORDER BY CASE WHEN id LIKE '%:action' THEN 0 ELSE 1 END, due_at LIMIT 1",
        Date.now(),
      )
      .toArray()[0];

    if (!row) {
      await this.arm();

      return;
    }

    const job: HouseJob = JSON.parse(row.data);
    let usageId: string | null = null;

    try {
      if (Date.now() >= job.deadline) {
        this.done(row.id, 'expired');

        return;
      }

      const match = this.env.MATCHES.getByName(job.matchId);
      let response: SavedResponse | null = row.response ? JSON.parse(row.response) : null;

      if (!response) {
        if (job.kind === 'chat' && Date.now() + houseChatBudget(job.model) > job.deadline) {
          this.done(row.id, 'insufficient-time');

          return;
        }

        const input = await match.houseObservation(job.seat, job.generation, job.phaseId);

        if (!input) {
          this.done(row.id, 'obsolete');

          return;
        }

        const view =
          input.observation.protocolVersion === '2'
            ? Schema.decodeUnknownSync(Observation2Schema)(input.observation)
            : Schema.decodeUnknownSync(ObservationSchema)(input.observation);

        if (job.kind === 'action' && !view.decision) {
          this.done(row.id, 'decision-complete');

          return;
        }

        if (job.kind === 'chat' && !view.chat.open) {
          this.done(row.id, 'chat-closed');

          return;
        }

        if (job.kind === 'chat' && view.chat.nextSpeakAt !== null && view.chat.nextSpeakAt > Date.now()) {
          this.ctx.storage.sql.exec('UPDATE jobs SET due_at = ? WHERE id = ?', view.chat.nextSpeakAt, row.id);

          if (view.chat.nextSpeakAt + houseChatBudget(job.model) > job.deadline)
            this.done(row.id, 'insufficient-time');

          return;
        }

        const notes =
          this.ctx.storage.sql
            .exec<{ text: string }>('SELECT text FROM notes WHERE generation = ?', job.generation)
            .toArray()[0]?.text ?? '';

        let action: Action2 | null;
        let nextNotes = notes;
        let cost: number | null = 0;

        if (job.model.provider === 'preview') {
          if (this.env.ENVIRONMENT !== 'development' && this.env.ENVIRONMENT !== 'preview')
            throw new Error('Preview agents cannot run in production');
          action =
            job.kind === 'action'
              ? view.protocolVersion === '2'
                ? previewSuccessionAction(view)
                : previewAction(view)
              : {
                  type: 'chat',
                  text:
                    view.protocolVersion === '2'
                      ? previewSuccessionSpeech(view)
                      : previewSpeech(view, input.persona),
                };
        } else {
          const prompt = housePrompt(view, input.persona, notes, job.kind, input.recent);
          const system = houseSystem(view);

          const estimate = inferenceCost(
            job.model.model,
            new TextEncoder().encode(system + prompt).byteLength,
            512,
          );

          usageId = `${job.id}:attempt:${row.attempts + 1}`;

          const reserved = await platformCoordinator(this.env).reserveInference({
            id: usageId,
            matchId: job.matchId,
            estimate,
            deadline: job.deadline,
            mandatory: job.kind === 'action',
            optionalKind: job.id.endsWith(':chat:1') ? 'followup' : 'initial',
          });

          if (!reserved.allowed) {
            this.ctx.storage.sql.exec(
              'UPDATE jobs SET admission_reason=? WHERE id=?',
              reserved.reason,
              row.id,
            );
            console.log(
              JSON.stringify({
                event: 'house_admission_denied',
                job: job.id,
                reason: reserved.reason,
                retryable: reserved.retryable,
                retryAt: reserved.retryAt,
                deadline: job.deadline,
              }),
            );
            const budget = job.kind === 'chat' ? houseChatBudget(job.model) : 500;

            if (reserved.retryable && reserved.retryAt + budget < job.deadline)
              this.ctx.storage.sql.exec('UPDATE jobs SET due_at = ? WHERE id = ?', reserved.retryAt, row.id);
            else this.done(row.id, 'admission-denied');

            return;
          }

          if (job.kind === 'chat' && Date.now() + houseChatBudget(job.model) > job.deadline) {
            await platformCoordinator(this.env).recordInference(usageId, 0);
            this.done(row.id, 'insufficient-time');

            return;
          }

          this.ctx.storage.sql.exec(
            "UPDATE jobs SET attempts = attempts + 1, status = 'running' WHERE id = ?",
            row.id,
          );
          const startedAt = Date.now();

          const generated = await Effect.runPromise(
            generateHouse(
              this.env,
              job.model,
              prompt,
              job.deadline,
              job.kind === 'action' ? view.decision!.actions.length : 0,
              system,
            ),
          );

          cost =
            generated.inputTokens !== null && generated.outputTokens !== null
              ? inferenceCost(job.model.model, generated.inputTokens, generated.outputTokens)
              : null;
          nextNotes = generated.value.notes.slice(0, 1200);

          if (job.kind === 'action') {
            if (
              !Number.isInteger(generated.value.choice) ||
              generated.value.choice < 0 ||
              !view.decision?.actions[generated.value.choice]
            )
              throw new Error('Invalid model choice');
            action = view.decision.actions[generated.value.choice].action;
          } else {
            const message = generated.value.message?.trim();

            if (message && [...message].length > 1000)
              throw new Error('Model message exceeds the speaking limit');
            action = message ? { type: 'chat', text: message } : null;
          }

          console.log(
            JSON.stringify({
              event: 'house_inference',
              job: job.id,
              model: job.model.model,
              latencyMs: Date.now() - startedAt,
              inputTokens: generated.inputTokens,
              outputTokens: generated.outputTokens,
              costUsd: cost,
            }),
          );
        }

        const request: TransportActionRequest | null = action
          ? {
              gameId: view.protocolVersion === '2' ? view.gameId : undefined,
              actionId: job.id,
              phaseId: job.phaseId,
              decisionId: view.decision?.id,
              action,
            }
          : null;

        response = {
          request,
          notes: nextNotes,
          usageId,
          cost,
          observedChat: job.kind === 'chat' ? input.lastChat : undefined,
        };
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET response = ?, status = 'result' WHERE id = ?",
          JSON.stringify(response),
          row.id,
        );
      }

      if (response.usageId)
        await platformCoordinator(this.env).recordInference(response.usageId, response.cost);
      let accepted = response.request ? await match.submitHouse(job, response.request) : { ok: true };

      if (
        !response.request &&
        job.kind === 'chat' &&
        job.id.endsWith(':chat:0') &&
        response.observedChat !== undefined
      )
        accepted = await match.completeHouseSilence(job, response.observedChat);

      if (accepted.ok)
        this.ctx.storage.sql.exec(
          'INSERT INTO notes (generation, text) VALUES (?, ?) ON CONFLICT(generation) DO UPDATE SET text = excluded.text',
          job.generation,
          response.notes,
        );
      this.done(row.id, accepted.ok ? (response.request ? 'accepted' : 'silent') : 'rejected');
    } catch (error) {
      if (usageId) await platformCoordinator(this.env).recordInference(usageId, null);

      const current = this.ctx.storage.sql
        .exec<{ attempts: number }>('SELECT attempts FROM jobs WHERE id = ?', row.id)
        .one();

      if (current.attempts < 2 && Date.now() + 1500 < job.deadline)
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'pending', due_at = ? WHERE id = ?",
          Date.now() + 250,
          row.id,
        );
      else this.done(row.id, 'provider-error');
      console.warn(
        JSON.stringify({
          event: 'house_retry',
          job: job.id,
          errorType: error instanceof Error ? error.name : 'unknown',
          failure:
            error instanceof Error && error.name.startsWith('effect/ai/')
              ? error.message.split('\n')[0].slice(0, 180)
              : 'House activation failed',
        }),
      );
    } finally {
      await this.arm();
    }
  }
}
