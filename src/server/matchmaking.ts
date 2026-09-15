import { DurableObject } from 'cloudflare:workers';
import type { GameId } from '../game/contracts';
import type { AgentPrincipal } from './auth';
import { PlatformQueue } from './coordinator';
import type { InferenceRequest } from './coordinator';

export type { MatchInitialization, PlatformQueueStatus } from './coordinator';

/** RPC/storage host. PlatformQueue owns the two logical queues and their shared invariants. */
export class MatchmakingObject extends DurableObject<Env> {
  private readonly queue: PlatformQueue;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.queue = new PlatformQueue(ctx, env);
  }

  join(principal: AgentPrincipal, requestId: string, gameId: GameId = 'secret-overlord') {
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

  exhibition(gameId: GameId = 'secret-overlord') {
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

  alarm() {
    return this.queue.alarm();
  }
}
