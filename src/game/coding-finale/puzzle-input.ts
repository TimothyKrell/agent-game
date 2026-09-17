import { Schema, type Types } from 'effect';
import { RoutingInputSchema } from './routing';

const Integer = Schema.Int.check(Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 }));

const Numbers = Schema.mutable(Schema.Array(Integer)).check(Schema.isMaxLength(256));

export const PuzzleInputSchema = Schema.Struct({
  values: Schema.optional(Numbers),
  other: Schema.optional(Numbers),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  pattern: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  k: Schema.optional(Integer),
  n: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 64 }))),
  grid: Schema.optional(Schema.mutable(Schema.Array(Numbers)).check(Schema.isMaxLength(64))),
  edges: Schema.optional(Schema.mutable(Schema.Array(Numbers)).check(Schema.isMaxLength(256))),
});

export type PuzzleInput = Types.DeepMutable<typeof PuzzleInputSchema.Type>;

export const CodingInputSchema = Schema.Union([RoutingInputSchema, PuzzleInputSchema]);

export type CodingInput = Types.DeepMutable<typeof CodingInputSchema.Type>;

export interface CodingCase {
  input: CodingInput;
  expected: number;
}
