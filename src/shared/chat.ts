import { Schema } from 'effect';

const Seat = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 }));

/** Explicit addressing stays separate from untrusted prose; all discussion remains public. */
export const ChatAddressFields = {
  to: Schema.optional(Schema.mutable(Schema.Array(Seat).check(Schema.isMaxLength(3)))),
  replyTo: Schema.optional(
    Schema.Struct({ eventKey: Schema.String.check(Schema.isMaxLength(200)), seat: Seat }),
  ),
};

export const ChatAddressSchema = Schema.Struct(ChatAddressFields);

export type ChatAddress = typeof ChatAddressSchema.Type;

export const ChatActionSchema = Schema.Struct({
  type: Schema.Literal('chat'),
  text: Schema.String.check(Schema.makeFilter((text) => [...text].length <= 1000)),
  ...ChatAddressFields,
});
