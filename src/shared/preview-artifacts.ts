import { Schema } from 'effect';

export const PREVIEW_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;

export const PREVIEW_TEXT_MAX_BYTES = 128 * 1024;

const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));

const Commit = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/));

const Origin = Schema.String.check(Schema.isMaxLength(256));

const Version = Schema.String.check(Schema.isPattern(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/));

const Archive = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(2048)),
  sha256: Digest,
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: PREVIEW_ARCHIVE_MAX_BYTES })),
});

const TextFile = Schema.Struct({
  path: Schema.String.check(Schema.isMaxLength(160)),
  sha256: Digest,
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: PREVIEW_TEXT_MAX_BYTES })),
});

const Rules = {
  rulesVersion: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)),
  archive: Archive,
  rules: TextFile,
  skill: TextFile,
  protocolFile: TextFile,
};

/** Source-published byte identities; target archives supply text, never a trusted executable. */
export const PreviewArtifactManifestSchema = Schema.Struct({
  version: Schema.Literal(1),
  sourceOrigin: Origin,
  targetOrigin: Origin,
  incarnation: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,100}$/)),
  commit: Commit,
  executable: Schema.Struct({
    ...Archive.fields,
    version: Version,
    protocols: Schema.Tuple([Schema.Literal(1), Schema.Literal(2)]),
  }),
  games: Schema.Tuple([
    Schema.Struct({ ...Rules, gameId: Schema.Literal('secret-overlord'), protocol: Schema.Literal(1) }),
    Schema.Struct({ ...Rules, gameId: Schema.Literal('succession'), protocol: Schema.Literal(2) }),
  ]),
});

export type PreviewArtifactManifest = typeof PreviewArtifactManifestSchema.Type;
