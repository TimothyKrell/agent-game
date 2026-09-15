import { GameError } from '../game/types';
import { gameDescriptor } from '../game/descriptors';
import type { GameId, MatchSnapshot } from '../game/contracts';
import type {
  PreviewBrokerIntent,
  PreviewBrokerReceipt,
  PreviewInference,
  PreviewInferenceResult,
} from '../shared/preview-broker';
import type { InferenceRequest, InferenceReservation } from './coordinator';
import { inferenceCost } from './house-model';
import { HOUSE_CHAT_MIN_REMAINING_MS } from './house-contract';

interface SharedLedger {
  capacity(reservation: number): 'available' | 'busy' | 'budget';
  reservation(game: GameId): number;
  reserve(input: InferenceRequest): InferenceReservation;
  record(id: string, actual: number | null): void;
  retire(input: { id: string; matchId: string }): void;
}

type AllocationRow = { id: string; fingerprint: string; receipt: string; closed: number };

type CallRow = {
  id: string;
  allocation_id: string;
  fingerprint: string;
  state: string;
  deadline: number;
  result: string | null;
};

/** Additional records inside the EXISTING production coordinator. Its allocations/usage remain authoritative. */
export class PreviewBrokerLedger {
  private reconciling = false;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
    private readonly shared: SharedLedger,
  ) {
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS preview_broker_allocations (
      id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS preview_broker_jobs (
      id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL, fingerprint TEXT NOT NULL)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS preview_broker_calls (
      id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL, fingerprint TEXT NOT NULL, state TEXT NOT NULL,
      deadline INTEGER NOT NULL, result TEXT)`);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS preview_broker_closures (id TEXT NOT NULL,origin TEXT NOT NULL,incarnation TEXT NOT NULL,PRIMARY KEY(id,origin,incarnation))',
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS preview_broker_retired (origin TEXT NOT NULL,incarnation TEXT NOT NULL,PRIMARY KEY(origin,incarnation))',
    );
  }

  status(game: GameId = 'secret-overlord') {
    const day = new Date().toISOString().slice(0, 10);

    const accountedUsd = this.ctx.storage.sql
      .exec<{ total: number }>(
        'SELECT coalesce(sum(coalesce(actual,reserved)),0) AS total FROM usage WHERE day=?',
        day,
      )
      .one().total;

    const active = this.ctx.storage.sql
      .exec<{ count: number; total: number }>(
        "SELECT count(*) AS count,coalesce(sum(reservation),0) AS total FROM allocations WHERE state!='settled'",
      )
      .one();

    const previews = this.ctx.storage.sql
      .exec<{ count: number }>(
        "SELECT count(*) AS count FROM preview_broker_allocations p JOIN allocations a ON a.id=p.id WHERE a.state!='settled'",
      )
      .one().count;

    const reservationUsd = this.shared.reservation(game);

    return {
      day,
      accountedUsd,
      activeReservedUsd: active.total,
      activeAllocations: active.count,
      livePreviewAllocations: previews,
      maxConcurrent: Number(this.env.MAX_CONCURRENT_MATCHES),
      dailyTargetUsd: Number(this.env.HOUSE_DAILY_BUDGET_USD),
      reservationUsd,
      remainingAdmissionUsd: Math.max(
        0,
        Number(this.env.HOUSE_DAILY_BUDGET_USD) - accountedUsd - active.total,
      ),
      capacity: previews ? ('busy' as const) : this.shared.capacity(reservationUsd),
    };
  }

  allocate(intent: PreviewBrokerIntent, fingerprint: string, sourceRevision: string): PreviewBrokerReceipt {
    const id = `preview_${intent.requestId}`;

    return this.ctx.storage.transactionSync(() => {
      if (
        this.ctx.storage.sql
          .exec(
            'SELECT origin FROM preview_broker_retired WHERE origin=? AND incarnation=?',
            intent.targetOrigin,
            intent.incarnation,
          )
          .toArray().length ||
        this.ctx.storage.sql
          .exec(
            'SELECT id FROM preview_broker_closures WHERE id=? AND origin=? AND incarnation=?',
            id,
            intent.targetOrigin,
            intent.incarnation,
          )
          .toArray().length
      )
        throw new GameError('preview-allocation-closed', 'Allocation or target is closed.', 409);
      const existing = this.row(id);

      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new GameError('preview-conflict', 'Allocation intent changed.', 409);

        if (existing.closed) throw new GameError('preview-allocation-closed', 'Allocation is closed.', 409);

        return JSON.parse(existing.receipt);
      }

      const status = this.status(intent.gameId);

      if (status.capacity !== 'available')
        throw new GameError('preview-capacity', `Shared source allocation is ${status.capacity}.`, 503);

      if (this.env.HOUSE_PROVIDER !== 'workers-ai' && this.env.HOUSE_PROVIDER !== 'openai')
        throw new GameError('preview-allocation-pending', 'A real source provider is required.', 503);
      const descriptor = gameDescriptor(intent.gameId);

      const snapshot: MatchSnapshot = {
        ...descriptor,
        rulesVersion: descriptor.rulesVersion,
        housePolicyVersion: intent.policyVersion,
        mode: 'preview',
        houseModel: {
          provider: this.env.HOUSE_PROVIDER,
          model: this.env.HOUSE_MODEL,
          policyVersion: intent.policyVersion,
        },
      };

      const receipt: PreviewBrokerReceipt = {
        closed: false,
        allocationId: id,
        intent,
        sourceRevision,
        sourcePolicyVersion: 'preview-broker-1',
        reservationUsd: status.reservationUsd,
        snapshot,
        pricing: {
          inputUsdPerMillion: inferenceCost(this.env.HOUSE_MODEL, 1000000, 0),
          outputUsdPerMillion: inferenceCost(this.env.HOUSE_MODEL, 0, 1000000),
        },
        maxOutputTokens: 512,
        maxAttempts: 2,
      };

      this.ctx.storage.sql.exec(
        'INSERT INTO preview_broker_allocations(id,fingerprint,receipt) VALUES (?,?,?)',
        id,
        fingerprint,
        JSON.stringify(receipt),
      );
      // Full active reservations are held across midnight by the ordinary capacity calculation.
      this.ctx.storage.sql.exec(
        `INSERT INTO allocations(id,state,entries,grants,created_at,reservation,game_id,snapshot)
        VALUES (?,'active','[]',?,?,?,?,?)`,
        id,
        JSON.stringify(Object.fromEntries(intent.tickets.map((ticket) => [ticket.agentId, ticket.grantId]))),
        Date.now(),
        status.reservationUsd,
        intent.gameId,
        JSON.stringify(snapshot),
      );

      return receipt;
    });
  }

  private row(id: string): AllocationRow | undefined {
    return this.ctx.storage.sql
      .exec<AllocationRow>('SELECT * FROM preview_broker_allocations WHERE id=?', id)
      .toArray()[0];
  }

  receipt(id: string): PreviewBrokerReceipt | null {
    const row = this.row(id);

    if (!row) return null;

    return { ...JSON.parse(row.receipt), closed: !!row.closed };
  }

  private usageId(allocationId: string, jobId: string, attempt: number): string {
    return JSON.stringify([allocationId, jobId, attempt]);
  }

  begin(input: PreviewInference, fingerprint: string): { dispatch: boolean; result: PreviewInferenceResult } {
    return this.ctx.storage.transactionSync(() => {
      const allocation = this.row(input.allocationId);

      if (!allocation || allocation.closed)
        throw new GameError('preview-allocation-closed', 'Allocation is closed.', 409);
      const receipt: PreviewBrokerReceipt = JSON.parse(allocation.receipt);
      const jobId = JSON.stringify([input.allocationId, input.jobId]);

      const job = this.ctx.storage.sql
        .exec<{ fingerprint: string }>('SELECT fingerprint FROM preview_broker_jobs WHERE id=?', jobId)
        .toArray()[0];

      if (job && job.fingerprint !== fingerprint)
        throw new GameError('preview-conflict', 'Logical inference input changed.', 409);
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO preview_broker_jobs VALUES (?,?,?)',
        jobId,
        input.allocationId,
        fingerprint,
      );
      const id = this.usageId(input.allocationId, input.jobId, input.attempt);

      const existing = this.ctx.storage.sql
        .exec<CallRow>('SELECT * FROM preview_broker_calls WHERE id=?', id)
        .toArray()[0];

      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new GameError('preview-conflict', 'Billed attempt changed.', 409);

        return {
          dispatch: false,
          result: existing.result
            ? JSON.parse(existing.result)
            : existing.deadline <= Date.now()
              ? { state: 'unknown' }
              : { state: 'pending', retryAt: Date.now() + 250 },
        };
      }

      if (input.deadline <= Date.now() + (input.kind === 'required' ? 500 : HOUSE_CHAT_MIN_REMAINING_MS))
        return {
          dispatch: false,
          result: { state: 'denied', reason: 'expired', retryable: false, retryAt: input.deadline },
        };

      if (input.attempt === 2) {
        const prior = this.ctx.storage.sql
          .exec<CallRow>(
            'SELECT * FROM preview_broker_calls WHERE id=?',
            this.usageId(input.allocationId, input.jobId, 1),
          )
          .toArray()[0];

        if (
          !prior ||
          (prior.state === 'dispatched' && prior.deadline > Date.now()) ||
          prior.state === 'completed'
        )
          throw new GameError('preview-attempt', 'Previous attempt has not failed.', 409);
      }

      const estimate = previewInferenceCost(
        receipt,
        new TextEncoder().encode(input.system + input.prompt).byteLength,
        receipt.maxOutputTokens,
      );

      const reservation = this.shared.reserve({
        id,
        matchId: input.allocationId,
        estimate,
        deadline: input.deadline,
        mandatory: input.kind === 'required',
        optionalKind: input.kind === 'followup' ? 'followup' : 'initial',
      });

      if (!reservation.allowed)
        return {
          dispatch: false,
          result: {
            state: 'denied',
            reason: reservation.reason,
            retryable: reservation.retryable,
            retryAt: reservation.retryAt,
          },
        };
      this.ctx.storage.sql.exec(
        "INSERT INTO preview_broker_calls VALUES (?,?,?,'dispatched',?,NULL)",
        id,
        input.allocationId,
        fingerprint,
        Math.min(input.deadline, Date.now() + 26000),
      );

      return { dispatch: true, result: { state: 'pending', retryAt: Date.now() + 250 } };
    });
  }

  finish(
    input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>,
    fingerprint: string,
    result: Extract<PreviewInferenceResult, { state: 'completed' }> | { state: 'failed' },
    actual: number | null,
  ): void {
    const id = this.usageId(input.allocationId, input.jobId, input.attempt);
    this.ctx.storage.transactionSync(() => {
      const call = this.ctx.storage.sql
        .exec<CallRow>('SELECT * FROM preview_broker_calls WHERE id=?', id)
        .toArray()[0];

      if (!call || call.fingerprint !== fingerprint) throw new Error('Unknown broker dispatch');

      if (call.result) return;
      this.shared.record(id, actual);
      this.ctx.storage.sql.exec(
        'UPDATE preview_broker_calls SET state=?,result=? WHERE id=?',
        result.state,
        JSON.stringify(result),
        id,
      );
      this.releaseClosed(input.allocationId);
    });
  }

  retire(input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>): void {
    this.shared.retire({
      id: this.usageId(input.allocationId, input.jobId, input.attempt),
      matchId: input.allocationId,
    });
  }

  close(id: string, target?: { origin: string; incarnation: string }): void {
    this.ctx.storage.transactionSync(() => {
      if (target)
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO preview_broker_closures VALUES (?,?,?)',
          id,
          target.origin,
          target.incarnation,
        );
      this.ctx.storage.sql.exec('UPDATE preview_broker_allocations SET closed=1 WHERE id=?', id);
      this.ctx.storage.sql.exec('DELETE FROM inference_waiters WHERE match_id=?', id);
      this.releaseClosed(id);
    });
  }

  private closeTarget(origin: string, incarnation: string): void {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO preview_broker_retired VALUES (?,?)',
      origin,
      incarnation,
    );

    const rows = this.ctx.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM preview_broker_allocations WHERE json_extract(receipt,'$.intent.targetOrigin')=? AND json_extract(receipt,'$.intent.incarnation')=?",
        origin,
        incarnation,
      )
      .toArray();

    for (const row of rows) this.close(row.id);
  }

  needsReconciliation(): boolean {
    return (
      this.ctx.storage.sql.exec('SELECT id FROM preview_broker_allocations WHERE closed=0 LIMIT 1').toArray()
        .length > 0
    );
  }

  dispatchReconciliation(): void {
    if (this.reconciling || !this.needsReconciliation()) return;

    this.reconciling = true;
    this.ctx.waitUntil(
      this.reconcileTargets()
        .catch(() => {
          console.warn(JSON.stringify({ event: 'preview_registry_reconciliation_retry' }));
        })
        .finally(() => {
          this.reconciling = false;
        }),
    );
  }

  /** Registry retirement is a durable D1 intent, including when the controller uses its REST adapter. */
  async reconcileTargets(): Promise<void> {
    const rows = this.ctx.storage.sql
      .exec<{ receipt: string }>('SELECT receipt FROM preview_broker_allocations WHERE closed=0')
      .toArray();

    for (const row of rows) {
      const { intent }: PreviewBrokerReceipt = JSON.parse(row.receipt);

      const current = await this.env.DB.prepare(
        'SELECT incarnation,closed_at FROM preview_arenas WHERE origin=?',
      )
        .bind(intent.targetOrigin)
        .first<{ incarnation: string; closed_at: number | null }>();

      if (!current || current.closed_at !== null || current.incarnation !== intent.incarnation)
        this.closeTarget(intent.targetOrigin, intent.incarnation);
    }
  }

  private releaseClosed(id: string): void {
    // A lost dispatch acknowledgement is NOT proof that the provider did no work. Hold its slot and full allocation.
    this.ctx.storage.sql.exec(
      `UPDATE allocations SET state='settled' WHERE id=?
      AND EXISTS(SELECT 1 FROM preview_broker_allocations WHERE id=? AND closed=1)
      AND NOT EXISTS(SELECT 1 FROM preview_broker_calls WHERE allocation_id=? AND state='dispatched')`,
      id,
      id,
      id,
    );
  }
}

/** An allocation retains its source-selected pricing even if the source is redeployed. */
export function previewInferenceCost(receipt: PreviewBrokerReceipt, input: number, output: number): number {
  return (
    (input * receipt.pricing.inputUsdPerMillion + output * receipt.pricing.outputUsdPerMillion) / 1000000
  );
}
