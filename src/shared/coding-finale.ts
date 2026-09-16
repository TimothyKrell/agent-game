import { Schema } from 'effect';
import type { GameAction, Observation, PublicSeat, Team } from '../game/types';
import { ProgramSchema, TierSchema, VerdictSchema } from '../game/coding-finale/types';
import type { Program, Tier } from '../game/coding-finale/types';
import type { observeFinale } from '../game/coding-finale/engine';
import { ObservationSchema } from './api';

export type Action3 =
  GameAction | { type: 'submit-program'; tier: Tier; challengeId: string; program: Program };

export interface ActionRequest3 {
  gameId: 'coding-finale';
  phaseId: string;
  decisionId?: string;
  actionId: string;
  action: Action3;
}

export const Action3Schema = Schema.Union([
  Schema.Struct({ type: Schema.Literal('chat'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('nominate'), target: Schema.Int }),
  Schema.Struct({ type: Schema.Literal('vote'), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal('discard'), cardId: Schema.String }),
  Schema.Struct({ type: Schema.Literal('enact'), cardId: Schema.String }),
  Schema.Struct({ type: Schema.Literal('request-veto') }),
  Schema.Struct({ type: Schema.Literal('veto'), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal('investigate'), target: Schema.Int }),
  Schema.Struct({ type: Schema.Literal('special-election'), target: Schema.Int }),
  Schema.Struct({ type: Schema.Literal('execute'), target: Schema.Int }),
  Schema.Struct({
    type: Schema.Literal('submit-program'),
    tier: TierSchema,
    challengeId: Schema.String,
    program: ProgramSchema,
  }),
]);

export const ActionRequest3Schema = Schema.Struct({
  gameId: Schema.Literal('coding-finale'),
  phaseId: Schema.String,
  decisionId: Schema.optional(Schema.String),
  actionId: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,80}$/)),
  action: Action3Schema,
});

export interface IndividualResult3 {
  kind: 'individual';
  winnerSeat: number;
  credited: boolean;
  reason: 'tier-two' | 'tier-one' | 'priority';
  submission: number | null;
  act1: { team: Team; reason: string };
}

export interface Observation3 {
  gameId: 'coding-finale';
  protocolVersion: '3';
  rulesVersion: 'coding-finale-1';
  matchId: string;
  mode: Observation['mode'];
  createdAt: number;
  finishedAt: number | null;
  serverNow: number;
  status: 'active' | 'finished' | 'interrupted';
  act: 1 | 2;
  round: number;
  phase: { id: string; kind: string; startedAt: number; deadline: number | null; graceUntil: number | null };
  seats: (PublicSeat & {
    generation: number;
    qualification: 'pending' | 'finalist' | 'executed' | 'losing-faction';
  })[];
  actOne: Observation | null;
  finale:
    | (ReturnType<typeof observeFinale> & {
        provisionalResult: { winnerSeat: number; submission: number } | null;
      })
    | null;
  act1Result: { team: Team; reason: string } | null;
  result: IndividualResult3 | null;
  interruptionReason: string | null;
  you: Observation['you'];
  chat: Observation['chat'];
  decision: {
    id: string;
    deadline: number;
    graceUntil: number;
    actions: { action: Action3; label: string }[];
  } | null;
  commitment: { digest: string; reveal: { priority: number[]; saltBase64url: string } | null };
  history: { visibilityEpoch: string; streamHead: number };
}

const NullableNumber = Schema.NullOr(Schema.Number);

const Act1ResultSchema = Schema.Struct({
  team: Schema.Literals(['cooperative', 'rogue']),
  reason: Schema.String,
});

const RaceResultSchema = Schema.Struct({
  winnerSeat: Schema.Int,
  credited: Schema.Boolean,
  reason: Schema.Literals(['tier-two', 'tier-one', 'priority']),
  submission: NullableNumber,
});

export const IndividualResult3Schema = Schema.Struct({
  ...RaceResultSchema.fields,
  kind: Schema.Literal('individual'),
  act1: Act1ResultSchema,
});

const RevealSchema = Schema.Struct({
  priority: Schema.mutable(Schema.Array(Schema.Int)),
  saltBase64url: Schema.String,
});

export const Observation3Schema = Schema.Struct({
  gameId: Schema.Literal('coding-finale'),
  protocolVersion: Schema.Literal('3'),
  rulesVersion: Schema.Literal('coding-finale-1'),
  matchId: Schema.String,
  mode: Schema.Literals(['preview', 'ranked', 'evaluation']),
  createdAt: Schema.Number,
  finishedAt: NullableNumber,
  serverNow: Schema.Number,
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  act: Schema.Literals([1, 2]),
  round: Schema.Number,
  phase: Schema.Struct({
    id: Schema.String,
    kind: Schema.String,
    startedAt: Schema.Number,
    deadline: NullableNumber,
    graceUntil: NullableNumber,
  }),
  seats: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        number: Schema.Int,
        agentId: Schema.String,
        ownerId: Schema.NullOr(Schema.String),
        name: Schema.String,
        house: Schema.Boolean,
        originalHouse: Schema.Boolean,
        alive: Schema.Boolean,
        forfeited: Schema.Boolean,
        rating: Schema.Number,
        role: Schema.optional(Schema.Literals(['cooperative', 'rogue', 'overlord'])),
        vote: Schema.optional(Schema.Boolean),
        generation: Schema.Int,
        qualification: Schema.Literals(['pending', 'finalist', 'executed', 'losing-faction']),
      }),
    ),
  ),
  actOne: Schema.NullOr(Schema.suspend(() => ObservationSchema)),
  finale: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      rulesVersion: Schema.Literal('coding-finale-1'),
      challengeId: Schema.String,
      status: Schema.Literals(['preparing', 'racing', 'judging', 'finished', 'interrupted']),
      startedAt: NullableNumber,
      deadline: NullableNumber,
      result: Schema.NullOr(RaceResultSchema),
      interruptionReason: Schema.NullOr(Schema.String),
      commitment: Schema.String,
      priorityReveal: Schema.NullOr(RevealSchema),
      finalists: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            seat: Schema.Int,
            forfeited: Schema.Boolean,
            completedTier: Schema.Number,
            attempts: Schema.Int,
          }),
        ),
      ),
      submissions: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            sequence: Schema.Int,
            seat: Schema.Int,
            tier: TierSchema,
            receivedAt: Schema.Number,
            status: Schema.Literals(['pending', 'judged', 'superseded']),
            verdict: Schema.NullOr(VerdictSchema),
          }),
        ),
      ),
      you: Schema.NullOr(
        Schema.Struct({ seat: Schema.Int, generation: Schema.Int, unlockedTier: Schema.Number }),
      ),
      provisionalResult: Schema.NullOr(Schema.Struct({ winnerSeat: Schema.Int, submission: Schema.Int })),
    }),
  ),
  act1Result: Schema.NullOr(Act1ResultSchema),
  result: Schema.NullOr(IndividualResult3Schema),
  interruptionReason: Schema.NullOr(Schema.String),
  you: Schema.NullOr(
    Schema.Struct({
      seat: Schema.Int,
      agentId: Schema.String,
      alive: Schema.Boolean,
      forfeited: Schema.Boolean,
      generation: Schema.Int,
    }),
  ),
  chat: Schema.Struct({
    open: Schema.Boolean,
    maxCharacters: Schema.Number,
    cooldownMs: Schema.Number,
    nextSpeakAt: NullableNumber,
  }),
  decision: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      deadline: Schema.Number,
      graceUntil: Schema.Number,
      actions: Schema.mutable(Schema.Array(Schema.Struct({ action: Action3Schema, label: Schema.String }))),
    }),
  ),
  commitment: Schema.Struct({ digest: Schema.String, reveal: Schema.NullOr(RevealSchema) }),
  history: Schema.Struct({ visibilityEpoch: Schema.String, streamHead: Schema.Int }),
}) satisfies Schema.Codec<Observation3>;

export const ObservationPacket3Schema = Schema.Struct({
  type: Schema.Literal('observation'),
  observation: Observation3Schema,
});

export const ActionReceipt3Schema = Schema.Struct({
  accepted: Schema.Literal(true),
  actionId: Schema.String,
  observation: Observation3Schema,
});
