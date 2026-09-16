import { Schema, type Types } from 'effect';

export const FINALE_RULES = {
  version: 'coding-finale-1',
  durationMs: 300_000,
  judgingGraceMs: 30_000,
  maxSubmissions: 10,
  maxSourceBytes: 32_768,
  executionMs: 2_000,
  maxOutputBytes: 8_192,
} as const;

export const TierSchema = Schema.Literals([1, 2]);

export type Tier = typeof TierSchema.Type;

export const ProgramSchema = Schema.Struct({
  language: Schema.Literals(['javascript', 'typescript']),
  source: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(FINALE_RULES.maxSourceBytes)),
});

export type Program = typeof ProgramSchema.Type;

export const SubmissionRequestSchema = Schema.Struct({
  actionId: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,80}$/)),
  challengeId: Schema.String,
  tier: TierSchema,
  program: ProgramSchema,
});

export type SubmissionRequest = typeof SubmissionRequestSchema.Type;

export const VerdictSchema = Schema.Literals([
  'passed',
  'wrong-answer',
  'runtime-error',
  'time-limit',
  'output-limit',
]);

export type Verdict = typeof VerdictSchema.Type;

const FinalistSchema = Schema.Struct({
  seat: Schema.Int,
  generation: Schema.Int,
  forfeited: Schema.Boolean,
  houseProfile: Schema.NullOr(Schema.String),
  tierOne: Schema.NullOr(Schema.Int),
  tierTwo: Schema.NullOr(Schema.Int),
});

const SubmissionSchema = Schema.Struct({
  sequence: Schema.Int,
  actionId: Schema.String,
  seat: Schema.Int,
  generation: Schema.Int,
  tier: TierSchema,
  fingerprint: Schema.String,
  receivedAt: Schema.Number,
  status: Schema.Literals(['pending', 'judged', 'superseded']),
  verdict: Schema.NullOr(VerdictSchema),
});

export type FinaleSubmission = Types.DeepMutable<typeof SubmissionSchema.Type>;

export const FinaleStateSchema = Schema.Struct({
  rulesVersion: Schema.Literal('coding-finale-1'),
  id: Schema.String,
  challengeId: Schema.String,
  status: Schema.Literals(['preparing', 'racing', 'judging', 'finished', 'interrupted']),
  finalists: Schema.mutable(Schema.Array(FinalistSchema)).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(10),
  ),
  submissions: Schema.mutable(Schema.Array(SubmissionSchema)).check(Schema.isMaxLength(100)),
  startedAt: Schema.NullOr(Schema.Number),
  deadline: Schema.NullOr(Schema.Number),
  priority: Schema.mutable(Schema.Array(Schema.Int)),
  commitment: Schema.String,
  commitmentSalt: Schema.String,
  result: Schema.NullOr(
    Schema.Struct({
      winnerSeat: Schema.Int,
      credited: Schema.Boolean,
      reason: Schema.Literals(['tier-two', 'tier-one', 'priority']),
      submission: Schema.NullOr(Schema.Int),
    }),
  ),
  interruptionReason: Schema.NullOr(Schema.String),
});

export type FinaleState = Types.DeepMutable<typeof FinaleStateSchema.Type>;

export interface FinaleController {
  seat: number;
  generation: number;
  house: boolean;
}
