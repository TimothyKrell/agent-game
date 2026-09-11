import { DurableObject } from 'cloudflare:workers';
import { Effect } from 'effect';
import { previewAction, previewSpeech } from '../game/preview';
import type { ActionRequest, GameAction } from '../game/types';
import type { HouseJob } from './house-contract';
import { generateHouse, housePrompt, inferenceCost, HOUSE_SYSTEM } from './house-model';

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
  request: ActionRequest | null;
  notes: string;
  usageId: string | null;
  cost: number | null;
}

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
  }

  async enqueue(job: HouseJob): Promise<void> {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO jobs (id, data, status, due_at, deadline) VALUES (?, ?, ?, ?, ?)',
      job.id,
      JSON.stringify(job),
      'pending',
      job.dueAt,
      job.deadline,
    );
    await this.arm();
  }
  private async arm(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ due: number | null }>("SELECT min(due_at) AS due FROM jobs WHERE status != 'done'")
      .one().due;

    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  private done(id: string): void {
    this.ctx.storage.sql.exec("UPDATE jobs SET status = 'done' WHERE id = ?", id);
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
        this.done(row.id);

        return;
      }

      const match = this.env.MATCHES.getByName(job.matchId);
      let response: SavedResponse | null = row.response ? JSON.parse(row.response) : null;

      if (!response) {
        const input = await match.houseObservation(job.seat, job.generation, job.phaseId);

        if (!input) {
          this.done(row.id);

          return;
        }

        const view = input.observation;

        if (job.kind === 'action' && !view.decision) {
          this.done(row.id);

          return;
        }

        if (job.kind === 'chat' && !view.chat.open) {
          this.done(row.id);

          return;
        }

        const notes =
          this.ctx.storage.sql
            .exec<{ text: string }>('SELECT text FROM notes WHERE generation = ?', job.generation)
            .toArray()[0]?.text ?? '';

        let action: GameAction | null;
        let nextNotes = notes;
        let cost: number | null = 0;

        if (job.model.provider === 'preview') {
          if (this.env.ENVIRONMENT !== 'development' && this.env.ENVIRONMENT !== 'preview')
            throw new Error('Preview agents cannot run in production');
          action =
            job.kind === 'action'
              ? previewAction(view)
              : { type: 'chat', text: previewSpeech(view, input.persona) };
        } else {
          const prompt = housePrompt(view, input.persona, notes, job.kind);

          const estimate = inferenceCost(
            job.model.model,
            new TextEncoder().encode(HOUSE_SYSTEM + prompt).byteLength,
            512,
          );

          usageId = `${job.id}:attempt:${row.attempts + 1}`;

          const reserved = await this.env.MATCHMAKING.getByName('secret-overlord').reserveInference({
            id: usageId,
            matchId: job.matchId,
            estimate,
            deadline: job.deadline,
            mandatory: job.kind === 'action',
          });

          if (!reserved.allowed) {
            if (reserved.retryAt < job.deadline - 500)
              this.ctx.storage.sql.exec('UPDATE jobs SET due_at = ? WHERE id = ?', reserved.retryAt, row.id);
            else this.done(row.id);

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

        response = {
          request: action
            ? { actionId: job.id, phaseId: job.phaseId, decisionId: view.decision?.id, action }
            : null,
          notes: nextNotes,
          usageId,
          cost,
        };
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET response = ?, status = 'result' WHERE id = ?",
          JSON.stringify(response),
          row.id,
        );
      }

      if (response.usageId)
        await this.env.MATCHMAKING.getByName('secret-overlord').recordInference(
          response.usageId,
          response.cost,
        );
      const accepted = response.request ? await match.submitHouse(job, response.request) : { ok: true };

      if (accepted.ok)
        this.ctx.storage.sql.exec(
          'INSERT INTO notes (generation, text) VALUES (?, ?) ON CONFLICT(generation) DO UPDATE SET text = excluded.text',
          job.generation,
          response.notes,
        );
      this.done(row.id);
    } catch (error) {
      if (usageId) await this.env.MATCHMAKING.getByName('secret-overlord').recordInference(usageId, null);

      const current = this.ctx.storage.sql
        .exec<{ attempts: number }>('SELECT attempts FROM jobs WHERE id = ?', row.id)
        .one();

      if (current.attempts < 2 && Date.now() + 1500 < job.deadline)
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'pending', due_at = ? WHERE id = ?",
          Date.now() + 250,
          row.id,
        );
      else this.done(row.id);
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
