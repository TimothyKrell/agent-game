import { Schema } from 'effect';

export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;

export const PICTURE_MAX_DIMENSION = 2048;

export const PICTURE_BATCH_LIMIT = 50;

export const PictureContentTypeSchema = Schema.Literals(['image/png', 'image/jpeg']);

export const AgentPictureSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal('missing'), revision: Schema.Number }),
  Schema.Struct({
    state: Schema.Literal('present'),
    revision: Schema.Number,
    version: Schema.String,
    url: Schema.String,
    contentType: PictureContentTypeSchema,
    width: Schema.Number,
    height: Schema.Number,
    bytes: Schema.Number,
  }),
]);

export type AgentPicture = typeof AgentPictureSchema.Type;

export const AgentPicturesSchema = Schema.Array(
  Schema.Struct({ agentId: Schema.String, picture: AgentPictureSchema }),
);

/** Older API responses omit picture; an absent picture never prevents participation. */
export const missingAgentPicture: AgentPicture = { state: 'missing', revision: 0 };
