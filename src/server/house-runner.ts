import { createHash } from 'node:crypto';
import { GameError } from '../game/types';
import { Effect, Match, Schema } from 'effect';
import { previewAction, previewSpeech } from '../game/preview';
import { previewSuccessionAction, previewSuccessionSpeech } from '../game/succession/preview';
import { ObservationSchema } from '../shared/api';
import type { TransportActionRequest } from '../shared/api';
import { Observation2Schema } from '../shared/succession';
import type { Action2 } from '../shared/succession';
import { Observation3Schema, type Action3, type Observation3 } from '../shared/coding-finale';
import type {
  HouseCodingCandidate,
  HouseCodingContext,
  HouseCodingPractice,
  HouseJob,
} from './house-contract';
import { houseChatBudget } from './house-contract';
import { generateHouse, housePrompt, houseSystem, inferenceCost } from './house-model';
import { platformCoordinator } from './coordinator';
import { previewEnabled } from './preview-config';
import { previewInference, retirePreviewInference } from './preview-broker-client';
import type { PreviewInference } from '../shared/preview-broker';
import {
  CODING_HOUSE_SYSTEM,
  codingHousePrompt,
  codingModelLimits,
  generateCodingHouse,
  previewCodingProgram,
} from './coding-house';

type JobRow = {
  id: string;
  data: string;
  status: string;
  due_at: number;
  deadline: number;
  attempts: number;
  response: string | null;
  broker_input: string | null;
  coding_data: string | null;
};

interface CodingWork {
  stage: 'practice' | 'revise' | 'submit';
  candidate: HouseCodingCandidate;
  practice: HouseCodingPractice | null;
  practiceAttempts: number;
  usageId: string | null;
  cost: number | null;
}

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
export class HouseSeatRunner {
  private cleanupRunning = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, due_at INTEGER NOT NULL, deadline INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, response TEXT)',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS notes (generation INTEGER PRIMARY KEY, text TEXT NOT NULL)',
    );
    const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(jobs)').toArray();

    if (!columns.some((column) => column.name === 'broker_input'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN broker_input TEXT');

    if (!columns.some((column) => column.name === 'coding_data'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN coding_data TEXT');

    if (!columns.some((column) => column.name === 'outcome'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN outcome TEXT');

    if (!columns.some((column) => column.name === 'completed_at'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN completed_at INTEGER');

    if (!columns.some((column) => column.name === 'admission_reason'))
      ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN admission_reason TEXT');

    if (!columns.some((column) => column.name === 'waiter_id')) {
      // Recover pre-migration admission waits, including already-obsolete jobs.
      // A started attempt has already removed its waiter; its successor is a safe no-op.
      const migrated = ctx.storage.transactionSync(() => {
        ctx.storage.sql.exec('ALTER TABLE jobs ADD COLUMN waiter_id TEXT');

        return ctx.storage.sql.exec(
          "UPDATE jobs SET waiter_id=id || ':attempt:' || (attempts+1) WHERE response IS NULL",
        ).rowsWritten;
      });

      if (migrated) ctx.waitUntil(this.arm());
    }
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
      .exec<{ due: number | null }>(
        "SELECT min(CASE WHEN status='done' THEN max(due_at,?) ELSE due_at END) AS due FROM jobs WHERE status != 'done' OR waiter_id IS NOT NULL",
        this.cleanupRunning ? Date.now() + 1000 : 0,
      )
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
      "UPDATE jobs SET status = 'done', outcome = ?, completed_at = ?, due_at = CASE WHEN waiter_id IS NOT NULL THEN ? ELSE due_at END WHERE id = ?",
      outcome,
      Date.now(),
      Date.now(),
      id,
    );

    if (outcome !== 'accepted' && outcome !== 'silent') {
      const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM jobs WHERE id = ?', id).one();
      const job: HouseJob = JSON.parse(row.data);
      this.logSkip(job, outcome);
    }
  }

  private async finishAlarm(): Promise<void> {
    const row = this.cleanupRunning
      ? undefined
      : this.ctx.storage.sql
          .exec<{ id: string; data: string; waiter_id: string; broker_input: string | null }>(
            "SELECT id,data,waiter_id,broker_input FROM jobs WHERE status='done' AND waiter_id IS NOT NULL AND due_at<=? ORDER BY due_at,id LIMIT 1",
            Date.now(),
          )
          .toArray()[0];

    if (row) {
      // Persist a retry before dispatch. The in-memory guard only bounds concurrent RPCs.
      this.ctx.storage.sql.exec(
        'UPDATE jobs SET due_at=? WHERE id=? AND waiter_id=?',
        Date.now() + 1000,
        row.id,
        row.waiter_id,
      );
      this.cleanupRunning = true;
    }

    try {
      await this.arm();
    } catch (error) {
      if (row) this.cleanupRunning = false;
      throw error;
    }

    // DO waitUntil does not delay alarm completion. Never await housekeeping from an alarm.
    if (row)
      this.ctx.waitUntil(
        this.retireTerminalWaiter(row).catch(() => {
          console.warn(JSON.stringify({ event: 'house_waiter_cleanup_storage_retry', job: row.id }));
        }),
      );
  }

  private async retireTerminalWaiter(row: {
    id: string;
    data: string;
    waiter_id: string;
    broker_input: string | null;
  }): Promise<void> {
    try {
      const job: HouseJob = JSON.parse(row.data);

      if (row.broker_input) {
        const input: PreviewInference = JSON.parse(row.broker_input);
        await retirePreviewInference(this.env, input);
      } else
        await platformCoordinator(this.env).retireInferenceWaiter({
          id: row.waiter_id,
          matchId: job.matchId,
        });
      this.ctx.storage.sql.exec(
        "UPDATE jobs SET waiter_id=NULL WHERE id=? AND status='done' AND waiter_id=?",
        row.id,
        row.waiter_id,
      );
    } catch {
      // This is durable cleanup, never a reason to reopen a terminal inference job.
      this.ctx.storage.sql.exec(
        "UPDATE jobs SET due_at=? WHERE id=? AND status='done' AND waiter_id=?",
        Date.now() + 1000,
        row.id,
        row.waiter_id,
      );
      console.warn(
        JSON.stringify({ event: 'house_waiter_cleanup_retry', job: row.id, waiter: row.waiter_id }),
      );
    } finally {
      // The alarm is already armed. A late acknowledgement must not overwrite a newer wakeup.
      this.cleanupRunning = false;
    }
  }

  private async brokerGeneration(
    job: HouseJob,
    row: JobRow,
    prompt: string,
    system: string,
    choices: string[],
  ) {
    let input: PreviewInference;

    if (row.broker_input) {
      input = JSON.parse(row.broker_input);

      if (JSON.stringify(input.choices) !== JSON.stringify(choices)) {
        this.done(row.id, 'obsolete');

        return null;
      }

      if (row.attempts >= input.attempt) {
        if (input.attempt === 2) {
          this.done(row.id, 'provider-error');

          return null;
        }

        input = { ...input, attempt: 2 };
      }
    } else {
      const saved = await platformCoordinator(this.env).targetPreviewReceipt(job.matchId);

      if (!saved.ok) {
        if (saved.error.status >= 500) throw new Error(saved.error.message);
        this.done(row.id, 'admission-denied');

        return null;
      }

      const receipt = saved.value;
      input = {
        allocationId: receipt.allocationId,
        commit: receipt.intent.commit,
        jobId: job.id,
        attempt: 1,
        phaseId: job.phaseId,
        seat: job.seat,
        generation: job.generation,
        deadline: job.deadline,
        kind: job.kind === 'action' ? 'required' : job.id.endsWith(':chat:1') ? 'followup' : 'initial',
        policyVersion: receipt.intent.policyVersion,
        system,
        prompt,
        choices,
      };
    }

    // A retry after an uncertain HTTP response uses exactly this input/attempt, never a new billed attempt.
    this.ctx.storage.sql.exec(
      'UPDATE jobs SET broker_input=?,waiter_id=? WHERE id=?',
      JSON.stringify(input),
      `${job.id}:attempt:${input.attempt}`,
      row.id,
    );
    let result;

    try {
      result = await previewInference(this.env, input);
    } catch (error) {
      if (error instanceof GameError && error.status < 500) {
        this.done(row.id, 'admission-denied');

        return null;
      }

      throw error;
    }

    if (result.state === 'pending') {
      this.ctx.storage.sql.exec(
        'UPDATE jobs SET due_at=? WHERE id=?',
        Math.max(Date.now() + 250, result.retryAt),
        row.id,
      );

      return null;
    }

    if (result.state === 'denied') {
      this.ctx.storage.sql.exec('UPDATE jobs SET admission_reason=? WHERE id=?', result.reason, row.id);

      if (!result.retryable) this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=NULL WHERE id=?', row.id);

      if (
        result.retryable &&
        result.retryAt + (job.kind === 'chat' ? houseChatBudget(job.model) : 500) < job.deadline
      )
        this.ctx.storage.sql.exec('UPDATE jobs SET due_at=? WHERE id=?', result.retryAt, row.id);
      else this.done(row.id, 'admission-denied');

      return null;
    }

    if (result.state !== 'completed') {
      this.ctx.storage.sql.exec(
        'UPDATE jobs SET attempts=?,waiter_id=NULL WHERE id=?',
        input.attempt,
        row.id,
      );
      throw new Error('Source provider attempt failed or has unknown usage');
    }

    this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=NULL WHERE id=?', row.id);

    return { value: result.value, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<JobRow>(
        "SELECT * FROM jobs WHERE status != 'done' AND due_at <= ? ORDER BY CASE WHEN id LIKE '%:action' THEN 0 ELSE 1 END, due_at LIMIT 1",
        Date.now(),
      )
      .toArray()[0];

    if (!row) {
      await this.finishAlarm();

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

        const view = Match.value(input.observation).pipe(
          Match.when({ protocolVersion: '3' }, (value) =>
            Schema.decodeUnknownSync(Observation3Schema)(value),
          ),
          Match.when({ protocolVersion: '2' }, (value) =>
            Schema.decodeUnknownSync(Observation2Schema)(value),
          ),
          Match.orElse((value) => Schema.decodeUnknownSync(ObservationSchema)(value)),
        );

        if (job.kind === 'action' && !view.decision) {
          this.done(row.id, 'decision-complete');

          return;
        }

        if (job.kind === 'action' && job.decisionId && view.decision?.id !== job.decisionId) {
          this.done(row.id, 'obsolete');

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

        if (view.protocolVersion === '3' && view.act === 2 && job.kind === 'action') {
          if (!input.coding) throw new Error('Missing private coding challenge');
          await this.codingActivation(job, row, view, input.coding);

          return;
        }

        const notes =
          this.ctx.storage.sql
            .exec<{ text: string }>('SELECT text FROM notes WHERE generation = ?', job.generation)
            .toArray()[0]?.text ?? '';

        let action: Action2 | Action3 | null;
        let nextNotes = notes;
        let cost: number | null = 0;

        if (job.model.provider === 'preview') {
          if (this.env.ENVIRONMENT !== 'development' && this.env.ENVIRONMENT !== 'preview')
            throw new Error('Preview agents cannot run in production');
          action =
            job.kind === 'action'
              ? view.protocolVersion === '2'
                ? previewSuccessionAction(view)
                : previewAction(view.protocolVersion === '3' ? view.actOne! : view)
              : {
                  type: 'chat',
                  text: Match.value(view).pipe(
                    Match.when({ protocolVersion: '2' }, previewSuccessionSpeech),
                    Match.when({ protocolVersion: '3' }, (value) =>
                      value.actOne
                        ? previewSpeech(value.actOne, input.persona)
                        : 'Working through the current tier.',
                    ),
                    Match.orElse((value) => previewSpeech(value, input.persona)),
                  ),
                };
        } else {
          const prompt = housePrompt(view, input.persona, notes, job.kind, input.recent);
          const system = houseSystem(view);
          const startedAt = Date.now();
          let generated;

          if (previewEnabled(this.env)) {
            generated = await this.brokerGeneration(
              job,
              row,
              prompt,
              system,
              job.kind === 'action'
                ? view.decision!.actions.map((option) => JSON.stringify(option.action))
                : [],
            );

            if (!generated) return;
          } else {
            const estimate = inferenceCost(
              job.model.model,
              new TextEncoder().encode(system + prompt).byteLength,
              512,
            );

            usageId = `${job.id}:attempt:${row.attempts + 1}`;
            // Persist before RPC so an uncertain admission acknowledgement can be retired too.
            this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=? WHERE id=?', usageId, row.id);

            const reserved = await platformCoordinator(this.env).reserveInference({
              id: usageId,
              matchId: job.matchId,
              estimate,
              deadline: job.deadline,
              mandatory: job.kind === 'action',
              optionalKind: job.id.endsWith(':chat:1') ? 'followup' : 'initial',
            });

            if (reserved.allowed || !reserved.retryable)
              this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=NULL WHERE id=?', row.id);

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
                this.ctx.storage.sql.exec(
                  'UPDATE jobs SET due_at = ? WHERE id = ?',
                  reserved.retryAt,
                  row.id,
                );
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
            generated = await Effect.runPromise(
              generateHouse(
                this.env,
                job.model,
                prompt,
                job.deadline,
                job.kind === 'action' ? view.decision!.actions.length : 0,
                system,
              ),
            );
          }

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
              gameId: view.protocolVersion !== '1' ? view.gameId : undefined,
              actionId:
                view.protocolVersion === '3' ? createHash('sha256').update(job.id).digest('hex') : job.id,
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
          "UPDATE jobs SET response = ?, status = 'result', attempts=CASE WHEN broker_input IS NOT NULL THEN json_extract(broker_input,'$.attempt') ELSE attempts END WHERE id = ?",
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

      if (
        (current.attempts < (job.gameId === 'coding-finale' ? 4 : 2) ||
          (job.gameId === 'coding-finale' && (row.response || row.coding_data))) &&
        Date.now() + 1500 < job.deadline
      )
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
      await this.finishAlarm();
    }
  }

  private saveCoding(job: HouseJob, work: CodingWork): void {
    this.ctx.storage.sql.exec(
      "UPDATE jobs SET coding_data=?,status='pending',due_at=? WHERE id=?",
      JSON.stringify(work),
      Date.now() + 1,
      job.id,
    );
  }

  /** One durable step per alarm. Every model invocation uses the original match's admission ledger. */
  private async codingActivation(
    job: HouseJob,
    row: JobRow,
    view: Observation3,
    context: HouseCodingContext,
  ): Promise<void> {
    const match = this.env.MATCHES.getByName(job.matchId);
    let work: CodingWork | null = row.coding_data ? JSON.parse(row.coding_data) : null;

    if (work?.usageId) {
      await platformCoordinator(this.env).recordInference(work.usageId, work.cost);
      work.usageId = null;
      this.saveCoding(job, work);
    }

    if (!work || work.stage === 'revise') {
      if (!work && row.attempts >= 4) {
        this.done(job.id, 'provider-error');

        return;
      }

      if (job.model.provider === 'preview') {
        if (this.env.ENVIRONMENT !== 'development' && this.env.ENVIRONMENT !== 'preview')
          throw new Error('Preview agents cannot run in production');
        work = {
          stage: 'practice',
          candidate: {
            program: previewCodingProgram(),
            inputs: [],
            notes: 'Deterministic preview fixture; not a model experiment.',
          },
          practice: null,
          practiceAttempts: 0,
          usageId: null,
          cost: 0,
        };
        this.saveCoding(job, work);
      } else if (work && (row.attempts >= 4 || Date.now() + 1500 >= job.deadline)) {
        work.stage = 'submit';
        this.saveCoding(job, work);
      } else {
        // The trusted preview broker only authorizes short legal choices, not executable code.
        if (previewEnabled(this.env)) {
          this.done(job.id, 'admission-denied');

          return;
        }

        const prompt = codingHousePrompt(
          context,
          job.model,
          job.deadline,
          work?.candidate ?? null,
          work?.practice ?? null,
        );

        const limits = codingModelLimits(job.model);
        const usageId = `${job.id}:attempt:${row.attempts + 1}`;
        this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=? WHERE id=?', usageId, job.id);

        const reserved = await platformCoordinator(this.env).reserveInference({
          id: usageId,
          matchId: job.matchId,
          estimate: inferenceCost(
            job.model.model,
            new TextEncoder().encode(CODING_HOUSE_SYSTEM + prompt).byteLength,
            limits.maxOutputTokens,
          ),
          deadline: job.deadline,
          mandatory: true,
          optionalKind: 'initial',
        });

        if (reserved.allowed || !reserved.retryable)
          this.ctx.storage.sql.exec('UPDATE jobs SET waiter_id=NULL WHERE id=?', job.id);

        if (!reserved.allowed) {
          this.ctx.storage.sql.exec('UPDATE jobs SET admission_reason=? WHERE id=?', reserved.reason, job.id);

          if (work && !reserved.retryable) {
            work.stage = 'submit';
            this.saveCoding(job, work);
          } else if (reserved.retryable && reserved.retryAt + 1500 < job.deadline)
            this.ctx.storage.sql.exec('UPDATE jobs SET due_at=? WHERE id=?', reserved.retryAt, job.id);
          else this.done(job.id, 'admission-denied');

          return;
        }

        this.ctx.storage.sql.exec("UPDATE jobs SET attempts=attempts+1,status='running' WHERE id=?", job.id);
        const startedAt = Date.now();
        let generated;

        try {
          generated = await Effect.runPromise(generateCodingHouse(this.env, job.model, prompt, job.deadline));
        } catch (error) {
          await platformCoordinator(this.env).recordInference(usageId, null);
          throw error;
        }

        const cost =
          generated.inputTokens !== null && generated.outputTokens !== null
            ? inferenceCost(job.model.model, generated.inputTokens, generated.outputTokens)
            : null;

        work = {
          stage: work ? 'submit' : 'practice',
          candidate: generated.value,
          practice: work?.practice ?? null,
          practiceAttempts: work?.practiceAttempts ?? 0,
          usageId,
          cost,
        };
        this.saveCoding(job, work);
        console.log(
          JSON.stringify({
            event: 'house_coding_inference',
            job: job.id,
            model: job.model.model,
            tier: context.challenge.tier,
            stage: work.stage,
            attempt: row.attempts + 1,
            language: work.candidate.program.language,
            latencyMs: Date.now() - startedAt,
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
            costUsd: cost,
            modelExperiment: true,
          }),
        );
      }

      return;
    }

    if (work.stage === 'practice') {
      if (work.practiceAttempts < 2) {
        work.practiceAttempts++;
        this.saveCoding(job, work);
        const startedAt = Date.now();
        const inputs = [context.challenge.example.input, ...work.candidate.inputs].slice(0, 8);
        work.practice = await match.houseCodingPractice(job, work.candidate.program, inputs);
        console.log(
          JSON.stringify({
            event: 'house_coding_practice',
            job: job.id,
            attempt: work.practiceAttempts,
            latencyMs: Date.now() - startedAt,
            modelExperiment: job.model.provider !== 'preview',
          }),
        );
      } else
        work.practice = {
          ok: false,
          error: {
            code: 'practice-unavailable',
            message: 'Practice result unavailable after bounded recovery attempts.',
            status: 503,
          },
        };
      work.stage = job.model.provider === 'preview' ? 'submit' : 'revise';
      this.saveCoding(job, work);

      return;
    }

    const response: SavedResponse = {
      request: {
        gameId: 'coding-finale',
        actionId: createHash('sha256').update(job.id).digest('hex'),
        phaseId: job.phaseId,
        decisionId: view.decision?.id,
        action: {
          type: 'submit-program',
          challengeId: context.challenge.challengeId,
          tier: context.challenge.tier,
          program: work.candidate.program,
        },
      },
      notes: work.candidate.notes,
      usageId: null,
      cost: 0,
    };

    // Submit on the next activation through the shared receipt-retry path.
    this.ctx.storage.sql.exec(
      "UPDATE jobs SET response=?,status='result',due_at=? WHERE id=?",
      JSON.stringify(response),
      Date.now() + 1,
      job.id,
    );
  }
}
