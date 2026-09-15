import { Option, Schema } from 'effect';
import { GameError } from '../game/types';
import { PreviewArtifactManifestSchema, type PreviewArtifactManifest } from '../shared/preview-artifacts';
import { previewEnabled, previewOrigin } from './preview-config';
import type { PreviewSourceEnvironment } from './preview-config';

function artifactOrigin(value: string, env: Pick<Env, 'ENVIRONMENT'>): string {
  try {
    return previewOrigin(value, env);
  } catch {
    throw new GameError('preview-artifacts', 'Use an exact source or target origin.', 400);
  }
}

export function parsePreviewArtifactManifest(
  env: Omit<PreviewSourceEnvironment, 'DB'>,
  payload: string,
): PreviewArtifactManifest {
  if (new TextEncoder().encode(payload).byteLength > 16384)
    throw new GameError('preview-artifacts', 'Preview artifact metadata is too large.', 400);
  let decoded: Option.Option<PreviewArtifactManifest>;

  try {
    decoded = Schema.decodeUnknownOption(PreviewArtifactManifestSchema)(JSON.parse(payload));
  } catch {
    throw new GameError('preview-artifacts', 'Invalid preview artifact JSON.', 400);
  }

  if (Option.isNone(decoded))
    throw new GameError('preview-artifacts', 'Invalid preview artifact manifest.', 400);
  const manifest = decoded.value;
  const source = artifactOrigin(manifest.sourceOrigin, env);
  const target = artifactOrigin(manifest.targetOrigin, env);

  if (previewEnabled(env) || source !== env.APP_URL || target === source)
    throw new GameError('preview-artifacts', 'Artifact authority must be the source arena.', 400);

  if (manifest.executable.url !== `${source}/downloads/agent-game-cli-${manifest.executable.version}.tgz`)
    throw new GameError('preview-artifacts', 'The executable must come from the source release.', 400);

  for (const game of manifest.games) {
    const directory = game.gameId === 'succession' ? 'package/public/games/succession' : 'package/public';

    if (
      game.archive.url !== `${target}/downloads/previews/${manifest.commit}/${game.archive.sha256}.tgz` ||
      game.rules.path !== `${directory}/rules.md` ||
      game.protocolFile.path !== `${directory}/protocol.md` ||
      game.skill.path !== 'package/skills/agent-game/SKILL.md'
    )
      throw new GameError('preview-artifacts', 'Branch artifacts must name the pinned game text files.', 400);
  }

  const [first, second] = manifest.games;

  if (
    first.archive.sha256 === second.archive.sha256 &&
    (first.archive.bytes !== second.archive.bytes ||
      first.skill.sha256 !== second.skill.sha256 ||
      first.skill.bytes !== second.skill.bytes)
  )
    throw new GameError('preview-artifacts', 'One archive cannot describe different shared file bytes.', 400);

  return manifest;
}

const currentManifest = `SELECT p.manifest_json FROM preview_artifacts p
  JOIN preview_arenas a ON a.origin=p.origin AND a.incarnation=p.incarnation AND a.commit_id=p.commit_id
  WHERE p.origin=? AND p.commit_id=? AND a.closed_at IS NULL`;

/** Trusted controller entry point only. There is deliberately no HTTP publication route. */
export async function registerPreviewArtifacts(
  env: PreviewSourceEnvironment,
  input: PreviewArtifactManifest,
): Promise<PreviewArtifactManifest> {
  const manifest = parsePreviewArtifactManifest(env, JSON.stringify(input));
  const encoded = JSON.stringify(manifest);

  const [, selected] = await env.DB.batch<{ manifest_json: string }>([
    env.DB.prepare(
      `INSERT OR IGNORE INTO preview_artifacts (origin,incarnation,commit_id,manifest_json)
      SELECT origin,incarnation,commit_id,? FROM preview_arenas
      WHERE origin=? AND incarnation=? AND commit_id=? AND closed_at IS NULL`,
    ).bind(encoded, manifest.targetOrigin, manifest.incarnation, manifest.commit),
    env.DB.prepare(currentManifest).bind(manifest.targetOrigin, manifest.commit),
  ]);

  const row = selected.results[0];

  if (!row) throw new GameError('preview-target', 'The artifact target revision is not registered.', 409);

  if (
    !Schema.toEquivalence(PreviewArtifactManifestSchema)(
      parsePreviewArtifactManifest(env, row.manifest_json),
      manifest,
    )
  )
    throw new GameError(
      'preview-artifact-conflict',
      'This target revision already has different artifact identities.',
      409,
    );

  return manifest;
}

/** Only current registered artifacts are discoverable; a retired incarnation cannot be revived by a cached manifest. */
export async function readPreviewArtifacts(
  env: PreviewSourceEnvironment,
  origin: string,
  commit: string,
): Promise<PreviewArtifactManifest> {
  artifactOrigin(origin, env);

  if (previewEnabled(env) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))
    throw new GameError('not-found', 'Preview artifacts are unavailable.', 404);
  const row = await env.DB.prepare(currentManifest).bind(origin, commit).first<{ manifest_json: string }>();

  if (!row)
    throw new GameError(
      'preview-artifacts-pending',
      'No current source-registered artifacts are available.',
      503,
    );

  return parsePreviewArtifactManifest(env, row.manifest_json);
}
