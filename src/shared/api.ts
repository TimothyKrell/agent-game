import { Schema } from 'effect';
import type { ActionRequest, Observation, Role } from '../game/types';

export const AuthProviderSchema = Schema.Literals(['github', 'google']);

export type AuthProvider = typeof AuthProviderSchema.Type;

export const GameActionSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal('chat'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('nominate'), target: Schema.Number }),
  Schema.Struct({ type: Schema.Literal('vote'), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal('discard'), cardId: Schema.String }),
  Schema.Struct({ type: Schema.Literal('enact'), cardId: Schema.String }),
  Schema.Struct({ type: Schema.Literal('request-veto') }),
  Schema.Struct({ type: Schema.Literal('veto'), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal('investigate'), target: Schema.Number }),
  Schema.Struct({ type: Schema.Literal('special-election'), target: Schema.Number }),
  Schema.Struct({ type: Schema.Literal('execute'), target: Schema.Number }),
]);

export const ActionRequestSchema = Schema.Struct({
  actionId: Schema.String,
  phaseId: Schema.String,
  decisionId: Schema.optional(Schema.String),
  action: GameActionSchema,
});

export const NameSchema = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String) });

export const PairStartSchema = Schema.Struct({ installation: Schema.String, tokenHash: Schema.String });

export const PairApproveSchema = Schema.Struct({ code: Schema.String, agentId: Schema.String });

export const QueueJoinSchema = Schema.Struct({ requestId: Schema.String });

export type ApiRequestBody =
  | ActionRequest
  | typeof NameSchema.Type
  | typeof PairStartSchema.Type
  | typeof PairApproveSchema.Type
  | typeof QueueJoinSchema.Type
  | Record<string, never>;

export interface OwnerProfile {
  id: string;
  handle: string;
  name: string;
}

export interface RoleStats {
  games: number;
  wins: number;
  losses: number;
}

export interface AgentProfile {
  id: string;
  ownerId: string | null;
  ownerHandle: string | null;
  name: string;
  description: string;
  house: boolean;
  retired: boolean;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  forfeits: number;
  placements: number;
  provisional: boolean;
  rank: number | null;
  roles: Partial<Record<Role, RoleStats>>;
  createdAt: number;
}

export interface ConnectionInfo {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface MatchSummary {
  id: string;
  status: 'active' | 'finished' | 'interrupted';
  mode: string;
  round: number;
  createdAt: number;
  finishedAt: number | null;
  safeguards: number;
  overrides: number;
  houseCount: number;
  winner: string | null;
  winReason: string | null;
  names: string[];
}

export interface QueueStatus {
  status: 'idle' | 'queued' | 'starting' | 'matched';
  matchId: string | null;
  joinedAt: number | null;
  fillAt: number | null;
  position: number | null;
  capacity: 'available' | 'busy' | 'budget';
}

export interface Bootstrap {
  name: string;
  mode: string;
  authProviders: AuthProvider[];
  localLogin: boolean;
  owner: OwnerProfile | null;
  live: MatchSummary[];
  recent: MatchSummary[];
  leaderboard: AgentProfile[];
  queueCount: number;
  houseAvailable: boolean;
}

export interface ApiFault {
  code: string;
  message: string;
  status: number;
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: ApiFault };

export const PhaseKindSchema = Schema.Literals([
  'nomination-discussion',
  'nomination',
  'government-discussion',
  'voting',
  'coordinator-discard',
  'executor-policy',
  'veto-response',
  'executive-discussion',
  'executive-action',
  'finished',
  'interrupted',
]);

const TeamSchema = Schema.Literals(['cooperative', 'rogue']);

const RoleSchema = Schema.Literals(['cooperative', 'rogue', 'overlord']);

const CardSchema = Schema.Struct({ id: Schema.String, policy: Schema.Literals(['safeguard', 'override']) });

const JsonScalarSchema = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]);

const EventValueSchema = Schema.Union([
  JsonScalarSchema,
  Schema.mutable(Schema.Array(JsonScalarSchema)),
  Schema.Record(Schema.String, JsonScalarSchema),
  Schema.mutable(Schema.Array(Schema.Record(Schema.String, JsonScalarSchema))),
]);

const RoleStatsSchema = Schema.Struct({ games: Schema.Number, wins: Schema.Number, losses: Schema.Number });

export const OwnerProfileSchema = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
  name: Schema.String,
});

export const AgentProfileSchema: Schema.Codec<AgentProfile> = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.NullOr(Schema.String),
  ownerHandle: Schema.NullOr(Schema.String),
  name: Schema.String,
  description: Schema.String,
  house: Schema.Boolean,
  retired: Schema.Boolean,
  rating: Schema.Number,
  games: Schema.Number,
  wins: Schema.Number,
  losses: Schema.Number,
  forfeits: Schema.Number,
  placements: Schema.Number,
  provisional: Schema.Boolean,
  rank: Schema.NullOr(Schema.Number),
  roles: Schema.Struct({
    cooperative: Schema.optional(RoleStatsSchema),
    rogue: Schema.optional(RoleStatsSchema),
    overlord: Schema.optional(RoleStatsSchema),
  }),
  createdAt: Schema.Number,
});

export const AgentListSchema = Schema.mutable(Schema.Array(AgentProfileSchema));

const MatchSummarySchema = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  mode: Schema.String,
  round: Schema.Number,
  createdAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  safeguards: Schema.Number,
  overrides: Schema.Number,
  houseCount: Schema.Number,
  winner: Schema.NullOr(Schema.String),
  winReason: Schema.NullOr(Schema.String),
  names: Schema.mutable(Schema.Array(Schema.String)),
});

export const QueueStatusSchema = Schema.Struct({
  status: Schema.Literals(['idle', 'queued', 'starting', 'matched']),
  matchId: Schema.NullOr(Schema.String),
  joinedAt: Schema.NullOr(Schema.Number),
  fillAt: Schema.NullOr(Schema.Number),
  position: Schema.NullOr(Schema.Number),
  capacity: Schema.Literals(['available', 'busy', 'budget']),
});

export const BootstrapSchema: Schema.Codec<Bootstrap> = Schema.Struct({
  name: Schema.String,
  mode: Schema.String,
  authProviders: Schema.mutable(Schema.Array(AuthProviderSchema)),
  localLogin: Schema.Boolean,
  owner: Schema.NullOr(OwnerProfileSchema),
  live: Schema.mutable(Schema.Array(MatchSummarySchema)),
  recent: Schema.mutable(Schema.Array(MatchSummarySchema)),
  leaderboard: AgentListSchema,
  queueCount: Schema.Number,
  houseAvailable: Schema.Boolean,
});

export const DashboardSchema = Schema.Struct({
  owner: OwnerProfileSchema,
  agents: AgentListSchema,
  connections: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        agentId: Schema.String,
        agentName: Schema.String,
        name: Schema.String,
        createdAt: Schema.Number,
        expiresAt: Schema.Number,
        revokedAt: Schema.NullOr(Schema.Number),
      }),
    ),
  ),
  queue: Schema.Record(Schema.String, QueueStatusSchema),
});

export const AgentHistorySchema = Schema.Struct({
  agent: AgentProfileSchema,
  history: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        ...MatchSummarySchema.fields,
        role: Schema.NullOr(RoleSchema),
        won: Schema.NullOr(Schema.Boolean),
        forfeited: Schema.Boolean,
        delta: Schema.NullOr(Schema.Number),
      }),
    ),
  ),
});

export const OwnerRosterSchema = Schema.Struct({ owner: OwnerProfileSchema, agents: AgentListSchema });

export const PairingDetailsSchema = Schema.Struct({
  installation: Schema.String,
  status: Schema.String,
  code: Schema.String,
  expiresAt: Schema.Number,
});

export const MatchAssignmentSchema = Schema.Struct({ matchId: Schema.String });

export const ErrorResponseSchema = Schema.Struct({
  error: Schema.Struct({ code: Schema.optional(Schema.String), message: Schema.optional(Schema.String) }),
});

export const ObservationSchema: Schema.Codec<Observation> = Schema.Struct({
  protocolVersion: Schema.Literal('1'),
  matchId: Schema.String,
  rulesVersion: Schema.String,
  mode: Schema.Literals(['preview', 'ranked', 'evaluation']),
  createdAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  phase: Schema.Struct({
    id: Schema.String,
    kind: PhaseKindSchema,
    deadline: Schema.NullOr(Schema.Number),
    graceUntil: Schema.NullOr(Schema.Number),
  }),
  round: Schema.Number,
  coordinator: Schema.Number,
  executor: Schema.NullOr(Schema.Number),
  power: Schema.NullOr(Schema.Literals(['investigate', 'special-election', 'execute'])),
  seats: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        number: Schema.Number,
        agentId: Schema.String,
        ownerId: Schema.NullOr(Schema.String),
        name: Schema.String,
        house: Schema.Boolean,
        originalHouse: Schema.Boolean,
        alive: Schema.Boolean,
        forfeited: Schema.Boolean,
        rating: Schema.Number,
        role: Schema.optional(RoleSchema),
        vote: Schema.optional(Schema.Boolean),
      }),
    ),
  ),
  tracks: Schema.Struct({
    safeguards: Schema.Number,
    overrides: Schema.Number,
    electionTracker: Schema.Number,
    drawCount: Schema.Number,
    discardCount: Schema.Number,
    vetoUnlocked: Schema.Boolean,
  }),
  lastGovernment: Schema.NullOr(Schema.Struct({ coordinator: Schema.Number, executor: Schema.Number })),
  winner: Schema.NullOr(TeamSchema),
  winReason: Schema.NullOr(Schema.String),
  chat: Schema.Struct({
    open: Schema.Boolean,
    maxCharacters: Schema.Number,
    cooldownMs: Schema.Number,
    nextSpeakAt: Schema.NullOr(Schema.Number),
  }),
  you: Schema.NullOr(
    Schema.Struct({
      seat: Schema.Number,
      agentId: Schema.String,
      alive: Schema.Boolean,
      forfeited: Schema.Boolean,
      generation: Schema.Number,
    }),
  ),
  private: Schema.NullOr(
    Schema.Struct({
      role: RoleSchema,
      knownRogues: Schema.mutable(Schema.Array(Schema.Number)),
      knownOverlord: Schema.NullOr(Schema.Number),
      hand: Schema.mutable(Schema.Array(CardSchema)),
    }),
  ),
  decision: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      deadline: Schema.Number,
      graceUntil: Schema.Number,
      actions: Schema.mutable(
        Schema.Array(Schema.Struct({ action: GameActionSchema, label: Schema.String })),
      ),
    }),
  ),
  cursor: Schema.Number,
  reset: Schema.Boolean,
  events: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        id: Schema.Number,
        at: Schema.Number,
        round: Schema.Number,
        type: Schema.String,
        text: Schema.String,
        seat: Schema.optional(Schema.Number),
        data: Schema.optional(Schema.Record(Schema.String, EventValueSchema)),
      }),
    ),
  ),
  reveal: Schema.optional(
    Schema.Struct({
      deck: Schema.mutable(Schema.Array(CardSchema)),
      discards: Schema.mutable(Schema.Array(CardSchema)),
      hand: Schema.mutable(Schema.Array(CardSchema)),
    }),
  ),
});

export const ObservationPacketSchema = Schema.Struct({
  type: Schema.Literal('observation'),
  observation: ObservationSchema,
});
