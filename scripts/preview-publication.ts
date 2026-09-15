import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { requireCondition, sha256, validateArtifact } from './preview-artifact.ts';
import { branchContentForTarget } from './preview-content.ts';
import { previewTarget } from './preview-controller.ts';
import { boundedResponse, verifyManifestIdentity } from './preview-github.ts';
import type { VerifiedRun } from './preview-github.ts';

const SourceExecutable = Schema.Struct({
  url: Schema.String,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2 * 1024 * 1024 })),
  version: Schema.String.check(Schema.isPattern(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/)),
  protocols: Schema.Tuple([Schema.Literal(1), Schema.Literal(2)]),
});

export type SourceExecutable = typeof SourceExecutable.Type;

function sourceRelease(sourceOrigin: string, executable: SourceExecutable) {
  const source = new URL(sourceOrigin);
  requireCondition(
    source.protocol === 'https:' && source.origin === sourceOrigin,
    'Invalid trusted source origin',
  );
  const release = Schema.decodeUnknownSync(SourceExecutable)(executable);
  requireCondition(
    release.url === `${sourceOrigin}/downloads/agent-game-cli-${release.version}.tgz`,
    'Executable must be the exact source release URL',
  );

  return release;
}

// Caller supplies the independently pinned RELEASED source descriptor from
// trusted deployment/release state. A PR artifact or current package version
// cannot establish this input. Read-only source download verifies actual bytes.
export async function verifySourceExecutable(
  sourceOrigin: string,
  executable: SourceExecutable,
  fetcher: typeof fetch = fetch,
) {
  const release = sourceRelease(sourceOrigin, executable);
  const response = await fetcher(release.url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  requireCondition(response.ok, 'Source executable unavailable');
  const bytes = await boundedResponse(response, release.bytes);
  requireCondition(
    bytes.length === release.bytes && sha256(bytes) === release.sha256,
    'Source executable bytes differ from trusted release',
  );

  return release;
}

// Metadata mapping for the accepted default-branch registerPreviewArtifacts
// function. The caller must reverify GitHub and source lifecycle state under the
// per-PR lock before invoking it through the trusted D1 control-plane adapter.
export function previewArtifactPublication(
  verified: VerifiedRun,
  artifact: Awaited<ReturnType<typeof validateArtifact>>,
  trusted: { subdomain: string; sourceOrigin: string; incarnation: string; executable: SourceExecutable },
) {
  verifyManifestIdentity(artifact.manifest, verified);
  const targetOrigin = previewTarget(verified.prNumber, trusted.subdomain).origin;
  const executable = sourceRelease(trusted.sourceOrigin, trusted.executable);
  requireCondition(
    targetOrigin !== trusted.sourceOrigin && /^[A-Za-z0-9_-]{8,100}$/.test(trusted.incarnation),
    'Invalid trusted artifact lifecycle',
  );

  return {
    version: 1,
    sourceOrigin: trusted.sourceOrigin,
    targetOrigin,
    incarnation: trusted.incarnation,
    commit: verified.builtCommit,
    executable,
    ...branchContentForTarget(artifact.branchContent, targetOrigin),
  };
}

export async function verifySourcePublicationReadback(
  publication: ReturnType<typeof previewArtifactPublication>,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL('/api/preview/artifacts', publication.sourceOrigin);
  url.search = new URLSearchParams({
    origin: publication.targetOrigin,
    commit: publication.commit,
  }).toString();

  const response = await fetcher(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });

  requireCondition(
    response.ok &&
      response.headers
        .get('cache-control')
        ?.split(',')
        .map((part) => part.trim())
        .includes('no-store') === true,
    'Current source artifact publication unavailable',
  );
  const actual: unknown = JSON.parse((await boundedResponse(response, 16 * 1024)).toString('utf8'));
  requireCondition(
    isDeepStrictEqual(actual, publication),
    'Source artifact readback differs from verified publication',
  );
}

/** Discovery's livePlay bit describes source configuration, never capacity. */
export async function verifySourceArenaReadback(
  publication: ReturnType<typeof previewArtifactPublication>,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(`${publication.sourceOrigin}/api/preview/arenas`, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });

  requireCondition(
    response.ok &&
      response.headers
        .get('cache-control')
        ?.split(',')
        .map((value) => value.trim())
        .includes('no-store') === true,
    'Source arena readback unavailable',
  );

  const arenas = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        origin: Schema.String,
        incarnation: Schema.String,
        commit: Schema.String,
        identityVersion: Schema.Literal(1),
        ownerEntryUrl: Schema.String,
        livePlay: Schema.Boolean,
      }),
    ),
  )(JSON.parse((await boundedResponse(response, 64 * 1024)).toString('utf8')));

  const matches = arenas.filter((arena) => arena.origin === publication.targetOrigin);
  requireCondition(
    matches.length === 1 &&
      matches[0].incarnation === publication.incarnation &&
      matches[0].commit === publication.commit &&
      matches[0].ownerEntryUrl === `${publication.targetOrigin}/preview`,
    'Source arena tuple differs from registered artifacts',
  );

  return matches[0].livePlay;
}
