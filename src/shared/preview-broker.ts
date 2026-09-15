import { Schema } from 'effect';
import type { MatchSnapshot } from '../game/contracts';
import type { PreviewAllocationIntent } from './preview';

const Id = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,100}$/));

const Revision = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/));

const Integer = Schema.Number.check(Schema.isInt());

const Text = Schema.String.check(Schema.isMaxLength(240));

const AllocationId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,128}$/));

export const PreviewAllocationSchema = Schema.Struct({
  requestId: Id,
  targetMatchId: Id,
  targetOrigin: Schema.String,
  incarnation: Id,
  commit: Revision,
  gameId: Schema.Literals(['secret-overlord', 'succession']),
  tickets: Schema.Array(
    Schema.Struct({
      agentId: Id,
      ownerId: Id,
      grantId: AllocationId,
      handoffId: Id,
      queueRequestId: Id,
      joinedAt: Integer,
      expiresAt: Integer,
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(10)),
  rulesVersion: Text,
  policyVersion: Text,
});

export type PreviewBrokerIntent = PreviewAllocationIntent & {
  rulesVersion: string;
  policyVersion: string;
};

/** Exact tuple identity independent of JSON object property order at RPC/codec boundaries. */
export function previewAllocationIdentity(intent: PreviewBrokerIntent): string {
  return JSON.stringify([
    intent.requestId,
    intent.targetMatchId,
    intent.targetOrigin,
    intent.incarnation,
    intent.commit,
    intent.gameId,
    intent.rulesVersion,
    intent.policyVersion,
    intent.tickets.map((ticket) => [
      ticket.agentId,
      ticket.ownerId,
      ticket.grantId,
      ticket.handoffId,
      ticket.queueRequestId,
      ticket.joinedAt,
      ticket.expiresAt,
    ]),
  ]);
}

export const PreviewBrokerReferenceSchema = Schema.Struct({ allocationId: AllocationId, commit: Revision });

export const PreviewBrokerStatusRequestSchema = Schema.Struct({ commit: Revision });

export const PreviewInferenceSchema = Schema.Struct({
  allocationId: AllocationId,
  commit: Revision,
  jobId: Text,
  attempt: Schema.Literals([1, 2]),
  phaseId: Text,
  seat: Integer.check(Schema.isBetween({ minimum: 0, maximum: 9 })),
  generation: Integer.check(Schema.isGreaterThanOrEqualTo(0)),
  deadline: Integer,
  kind: Schema.Literals(['required', 'initial', 'followup']),
  policyVersion: Text,
  system: Schema.String.check(Schema.isMaxLength(12000)),
  prompt: Schema.String.check(Schema.isMaxLength(19000)),
  choices: Schema.Array(Schema.String.check(Schema.isMaxLength(1000))).check(Schema.isMaxLength(100)),
});

export type PreviewInference = typeof PreviewInferenceSchema.Type;

export const PreviewRetireInferenceSchema = Schema.Struct({
  allocationId: AllocationId,
  commit: Revision,
  jobId: Text,
  attempt: Schema.Literals([1, 2]),
});

export interface PreviewBrokerReceipt {
  closed: boolean;
  allocationId: string;
  intent: PreviewBrokerIntent;
  sourceRevision: string;
  sourcePolicyVersion: 'preview-broker-1';
  pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number };
  maxOutputTokens: 512;
  maxAttempts: 2;
  reservationUsd: number;
  snapshot: MatchSnapshot;
}

export const PreviewInferenceResultSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal('pending'), retryAt: Schema.Number }),
  Schema.Struct({
    state: Schema.Literal('denied'),
    reason: Schema.String,
    retryable: Schema.Boolean,
    retryAt: Schema.Number,
  }),
  Schema.Struct({ state: Schema.Literals(['failed', 'unknown']) }),
  Schema.Struct({
    state: Schema.Literal('completed'),
    value: Schema.Struct({
      choice: Integer,
      message: Schema.NullOr(Schema.String),
      notes: Schema.String,
    }),
    inputTokens: Schema.NullOr(Schema.Number),
    outputTokens: Schema.NullOr(Schema.Number),
    accountedUsd: Schema.Number,
  }),
]);

export type PreviewInferenceResult = typeof PreviewInferenceResultSchema.Type;

const GameId = Schema.Literals(['secret-overlord', 'succession']);

const RulesVersion = Schema.Literals(['secret-overlord-1', 'succession-1']);

const Timing = Schema.Struct({
  nomination: Schema.Number,
  debate: Schema.Number,
  executive: Schema.Number,
  action: Schema.Number,
  grace: Schema.Number,
  chatCooldown: Schema.Number,
});

export const PreviewBrokerReceiptSchema = Schema.Struct({
  closed: Schema.Boolean,
  allocationId: AllocationId,
  intent: PreviewAllocationSchema,
  sourceRevision: Revision,
  sourcePolicyVersion: Schema.Literal('preview-broker-1'),
  reservationUsd: Schema.Number,
  pricing: Schema.Struct({ inputUsdPerMillion: Schema.Number, outputUsdPerMillion: Schema.Number }),
  maxOutputTokens: Schema.Literal(512),
  maxAttempts: Schema.Literal(2),
  snapshot: Schema.Struct({
    gameId: GameId,
    displayName: Schema.String,
    rulesVersion: RulesVersion,
    ratingPoolId: RulesVersion,
    ratingVersion: Schema.Literals(['team-elo-1', 'winner-softmax-1']),
    protocolVersion: Schema.Literals(['1', '2']),
    playerCount: Schema.Literal(10),
    rulesUrl: Schema.String,
    ratingUrl: Schema.String,
    timing: Timing,
    housePolicyVersion: Schema.String,
    mode: Schema.Literal('preview'),
    houseModel: Schema.Struct({
      provider: Schema.Literals(['workers-ai', 'openai']),
      model: Schema.String,
      policyVersion: Schema.String,
    }),
  }),
});

const Budget = Schema.Struct({
  day: Schema.String,
  accountedUsd: Schema.Number,
  activeReservedUsd: Schema.Number,
  activeAllocations: Schema.Number,
  livePreviewAllocations: Schema.Number,
  maxConcurrent: Schema.Number,
  dailyTargetUsd: Schema.Number,
  reservationUsd: Schema.Number,
  remainingAdmissionUsd: Schema.Number,
  capacity: Schema.Literals(['available', 'busy', 'budget']),
});

export const PreviewBrokerStatusSchema = Schema.Struct({
  version: Schema.Literal(1),
  sourceRevision: Revision,
  sourcePolicyVersion: Schema.Literal('preview-broker-1'),
  provider: Schema.Literals(['workers-ai', 'openai']),
  model: Schema.String,
  profiles: Schema.Array(Schema.Literals(['smoke', 'live'])),
  secretOverlord: Budget,
  succession: Budget,
});

export type PreviewBrokerStatus = typeof PreviewBrokerStatusSchema.Type;
