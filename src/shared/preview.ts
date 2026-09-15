import { Schema } from 'effect';

const Id = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,100}$/));

const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));

const Proof = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));

const Revision = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/));

export const PreviewIntentSchema = Schema.Struct({
  requestId: Id,
  targetOrigin: Schema.String,
  incarnation: Id,
  commit: Revision,
  challenge: Proof,
  tokenHash: Schema.optional(Hash),
});

export type PreviewIntent = typeof PreviewIntentSchema.Type;

export const PreviewSignedSchema = Schema.Struct({
  origin: Schema.String,
  incarnation: Id,
  at: Schema.Number,
  nonce: Id,
  payload: Schema.String,
  signature: Schema.String,
});

export const PreviewRedeemSchema = Schema.Struct({
  requestId: Id,
  code: Proof,
  verifier: Proof,
  commit: Revision,
});

export const PreviewReferenceSchema = Schema.Struct({ requestId: Id, after: Schema.optional(Schema.String) });

export const PreviewIntrospectionSchema = Schema.Struct({
  requestId: Id,
  agentId: Schema.optional(Schema.String),
});

export const PreviewStartSchema = Schema.Struct({ requestId: Id, browserProof: Proof });

export const PreviewOwnerCompleteSchema = Schema.Struct({ requestId: Id, code: Proof });

export const PreviewAgentExchangeSchema = Schema.Struct({ requestId: Id, code: Proof, verifier: Proof });

export const PreviewOwnerSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  handle: Schema.String,
});

export const PreviewAgentSchema = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  name: Schema.String,
  description: Schema.String,
  retiredAt: Schema.NullOr(Schema.Number),
});

export const PreviewReceiptSchema = Schema.Struct({
  version: Schema.Literal(1),
  requestId: Id,
  scope: Schema.Literals(['owner', 'agent']),
  owner: PreviewOwnerSchema,
  agentId: Schema.NullOr(Schema.String),
  expiresAt: Schema.Number,
});

export type PreviewReceipt = typeof PreviewReceiptSchema.Type;

export const PreviewRedemptionSchema = Schema.Struct({
  ...PreviewReceiptSchema.fields,
  tokenHash: Schema.NullOr(Hash),
});

export const PreviewMetadataSchema = Schema.Struct({
  version: Schema.Literal(1),
  agents: Schema.Array(PreviewAgentSchema),
  next: Schema.NullOr(Schema.String),
});

export const PreviewActiveSchema = Schema.Struct({ active: Schema.Literal(true), expiresAt: Schema.Number });

export const PreviewCodeSchema = Schema.Struct({ requestId: Id, code: Proof });

export const PreviewArenaSchema = Schema.Struct({
  origin: Schema.String,
  incarnation: Id,
  commit: Revision,
  identityVersion: Schema.Literal(1),
  ownerEntryUrl: Schema.String,
  livePlay: Schema.Literal(false),
});

/** Immutable input persisted by the future CLI BEFORE contacting either origin. */
export interface PreviewInstallationIntent {
  sourceConfigPath: string;
  sourceConnectionId: string;
  intent: PreviewIntent;
  verifier: string;
  targetToken: string;
  artifacts: PreviewArtifacts;
}

/** Rule artifacts can change while the executable remains source-trusted. */
export interface PreviewArtifacts {
  executablePath: string;
  executableDigest: string;
  rulesPath: string;
  skillPath: string;
  archiveDigest: string;
  rulesDigest: string;
  skillDigest: string;
  commit: string;
  gameId: 'secret-overlord' | 'succession';
  rulesVersion: string;
}

/** Copied into the active participation; reconnects cannot silently adopt another connection's rules. */
export interface PreviewParticipation {
  connectionId: string;
  targetOrigin: string;
  incarnation: string;
  queueRequestId: string;
  matchId: string | null;
  artifacts: PreviewArtifacts;
  supervisorLedgerPath: string;
}

/** Future allocation implementation persists this entire intent BEFORE contacting the source broker. */
export interface PreviewAllocationIntent {
  requestId: string;
  targetMatchId: string;
  targetOrigin: string;
  incarnation: string;
  commit: string;
  gameId: 'secret-overlord' | 'succession';
  tickets: readonly {
    agentId: string;
    ownerId: string;
    grantId: string;
    handoffId: string;
    queueRequestId: string;
    joinedAt: number;
    expiresAt: number;
  }[];
}
