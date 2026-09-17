import { Schema } from 'effect';
import { ProgramSchema, TierSchema, VerdictSchema, FINALE_RULES } from '../game/coding-finale/types';
import { CodingInputSchema } from '../game/coding-finale/puzzle-input';

export const PublicCodingChallengeSchema = Schema.Struct({
  challengeId: Schema.String,
  family: Schema.String,
  tier: TierSchema,
  title: Schema.String,
  statement: Schema.String,
  example: Schema.Struct({ input: CodingInputSchema, expected: Schema.Int }),
  starter: Schema.String,
  limits: Schema.Struct({
    version: Schema.Literal(FINALE_RULES.version),
    durationMs: Schema.Int,
    judgingGraceMs: Schema.Int,
    maxSubmissions: Schema.Int,
    maxSourceBytes: Schema.Int,
    executionMs: Schema.Int,
    maxOutputBytes: Schema.Int,
  }),
});

export type PublicCodingChallenge = typeof PublicCodingChallengeSchema.Type;

export const CodingJudgeEvidenceSchema = Schema.Struct({
  status: Schema.Literal('recorded'),
  totalCases: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 24 })),
  passedCases: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 }))),
  cases: Schema.Array(
    Schema.Struct({
      index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 23 })),
      input: CodingInputSchema,
      expected: Schema.Int,
      actual: Schema.NullOr(Schema.Int),
      status: Schema.Literals(['passed', 'failed', 'unavailable']),
    }),
  ).check(Schema.isMaxLength(6)),
  execution: Schema.Struct({
    exitCode: Schema.NullOr(Schema.Int),
    timedOut: Schema.Boolean,
    truncated: Schema.Boolean,
    outputFormat: Schema.Literals(['integer-array', 'invalid', 'unavailable']),
  }),
});

export type CodingJudgeEvidence = typeof CodingJudgeEvidenceSchema.Type;

export const CodingSubmissionReportSchema = Schema.Struct({
  gameId: Schema.Literal('coding-finale'),
  protocolVersion: Schema.Literal('3'),
  matchId: Schema.String,
  challengeId: Schema.String,
  sequence: Schema.Int,
  seat: Schema.Int,
  generation: Schema.Int,
  tier: TierSchema,
  receivedAt: Schema.Number,
  status: Schema.Literals(['pending', 'judged', 'superseded']),
  verdict: Schema.NullOr(VerdictSchema),
  program: ProgramSchema,
  evidence: Schema.Union([
    CodingJudgeEvidenceSchema,
    Schema.Struct({
      status: Schema.Literal('unavailable'),
      reason: Schema.Literals(['not-recorded', 'not-judged']),
    }),
  ]),
});

export type CodingSubmissionReport = typeof CodingSubmissionReportSchema.Type;
