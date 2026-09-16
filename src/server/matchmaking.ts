import { DurableObject } from 'cloudflare:workers';
import type { GameId } from '../game/contracts';
import type { AgentPrincipal } from './auth';
import { PlatformQueue } from './coordinator';
import type { InferenceRequest } from './coordinator';
import type { RpcResult } from '../shared/api';
import { fault } from './http';
import type { PreviewBrokerIntent, PreviewInference, PreviewInferenceResult } from '../shared/preview-broker';

function brokerResult<T>(fn: () => T): RpcResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: fault(error) };
  }
}

export type { MatchInitialization, PlatformQueueStatus } from './coordinator';

/** RPC/storage host. PlatformQueue owns game queues and their shared invariants. */
export class MatchmakingObject extends DurableObject<Env> {
  private readonly queue: PlatformQueue;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.queue = new PlatformQueue(ctx, env);
  }

  join(principal: AgentPrincipal, requestId: string, gameId: GameId = 'coding-finale') {
    return this.queue.join(principal, requestId, gameId);
  }

  status(agentId: string) {
    return this.queue.status(agentId);
  }

  count(gameId: GameId = 'secret-overlord') {
    return this.queue.count(gameId);
  }

  cancel(
    agentId: string,
    grantId?: string,
    expected?: { gameId: GameId; requestId: string; joinedAt?: number },
  ) {
    return this.queue.cancel(agentId, grantId, expected);
  }

  complete(matchId: string) {
    return this.queue.complete(matchId);
  }

  retire(agentId: string, ownerId: string) {
    return this.queue.retire(agentId, ownerId);
  }

  revokeGrant(grantId: string) {
    return this.queue.revokeGrant(grantId);
  }

  exhibition(gameId: GameId = 'coding-finale') {
    return this.queue.exhibition(gameId);
  }

  reserveInference(input: InferenceRequest) {
    return this.queue.reserveInference(input);
  }

  recordInference(id: string, actual: number | null) {
    return this.queue.recordInference(id, actual);
  }

  retireInferenceWaiter(input: Pick<InferenceRequest, 'id' | 'matchId'>) {
    return this.queue.retireInferenceWaiter(input);
  }

  inferenceSummary(matchId: string) {
    return this.queue.inferenceSummary(matchId);
  }

  previewBudget(gameId: GameId = 'secret-overlord') {
    return this.queue.preview.status(gameId);
  }

  async allocatePreview(intent: PreviewBrokerIntent, fingerprint: string, sourceRevision: string) {
    const result = brokerResult(() => this.queue.preview.allocate(intent, fingerprint, sourceRevision));

    if (result.ok) await this.queue.schedule();

    return result;
  }

  previewAllocation(id: string) {
    return this.queue.preview.receipt(id);
  }

  beginPreviewInference(input: PreviewInference, fingerprint: string) {
    return brokerResult(() => this.queue.preview.begin(input, fingerprint));
  }

  finishPreviewInference(
    input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>,
    fingerprint: string,
    result: Extract<PreviewInferenceResult, { state: 'completed' }> | { state: 'failed' },
    actual: number | null,
  ) {
    return this.queue.preview.finish(input, fingerprint, result, actual);
  }

  retirePreviewInference(input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>) {
    return this.queue.preview.retire(input);
  }

  completePreview(id: string, target: { origin: string; incarnation: string }) {
    return brokerResult(() => this.queue.preview.close(id, target));
  }

  reconcilePreviewTargets() {
    return this.queue.preview.reconcileTargets();
  }

  targetPreviewReceipt(matchId: string) {
    return brokerResult(() => this.queue.previewTarget.receipt(matchId));
  }

  alarm() {
    return this.queue.alarm();
  }
}
