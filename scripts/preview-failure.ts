import { Schema } from 'effect';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, readStable } from './preview-artifact.ts';

/** Only valid, affirmative readback evidence uses this class. Network errors,
 * missing data and malformed responses remain unavailable, not invalidated. */
export class PreviewReadbackInvalid extends Error {}

const Failure = Schema.Struct({
  version: Schema.Literal(1),
  reason: Schema.Literals(['smoke-invalid', 'source-readback-invalid', 'eligibility-changed']),
  repository: Schema.String,
  prNumber: Schema.Int,
  runId: Schema.Int,
  runAttempt: Schema.Int,
  builtCommit: Schema.String,
  prHeadSha: Schema.String,
  incarnation: Schema.String,
  controllerRun: Schema.String,
  controllerAttempt: Schema.String,
});

const directory = (env: NodeJS.ProcessEnv) => resolve(env.GITHUB_WORKSPACE ?? process.cwd(), '.agent-game');

/** Written only by fixed trusted smoke/publication commands, from their retained
 * proof and public registration. No success/outcome flag is destructive authority. */
export async function recordPreviewFailure(reason: typeof Failure.Type.reason, env: NodeJS.ProcessEnv) {
  if (
    env.PREVIEW_IDENTITY_ENABLED !== 'true' ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
  )
    return;
  const root = directory(env);

  const proof = Schema.decodeUnknownSync(
    Schema.Struct({
      repository: Schema.String,
      prNumber: Schema.Int,
      runId: Schema.Int,
      runAttempt: Schema.Int,
      builtCommit: Schema.String,
      prHeadSha: Schema.String,
      target: Schema.Struct({ origin: Schema.String }),
    }),
  )(JSON.parse((await readStable(resolve(root, 'preview-delivery.json'), 512 * 1024)).toString()));

  const registration = Schema.decodeUnknownSync(
    Schema.Struct({ incarnation: Schema.String, commit: Schema.String, targetOrigin: Schema.String }),
  )(JSON.parse((await readStable(resolve(root, 'preview-registration.json'), 16 * 1024)).toString()));

  if (
    proof.repository !== env.GITHUB_REPOSITORY ||
    String(proof.prNumber) !== env.PR_NUMBER ||
    proof.target.origin !== env.PREVIEW_URL ||
    registration.targetOrigin !== proof.target.origin ||
    registration.commit !== proof.builtCommit
  )
    throw new Error('Failure evidence does not match the retained delivery');
  await mkdir(root, { recursive: true });
  await writeFile(
    resolve(root, 'preview-failure.json'),
    canonical({
      version: 1,
      reason,
      repository: proof.repository,
      prNumber: proof.prNumber,
      runId: proof.runId,
      runAttempt: proof.runAttempt,
      builtCommit: proof.builtCommit,
      prHeadSha: proof.prHeadSha,
      incarnation: registration.incarnation,
      controllerRun: env.GITHUB_RUN_ID,
      controllerAttempt: env.GITHUB_RUN_ATTEMPT,
    }),
    { mode: 0o600 },
  );
}

export async function previewFailureEvidence(env: NodeJS.ProcessEnv) {
  try {
    return Schema.decodeUnknownSync(Failure)(
      JSON.parse((await readStable(resolve(directory(env), 'preview-failure.json'), 4096)).toString()),
      { onExcessProperty: 'error' },
    );
  } catch {
    // An absent, truncated or malformed marker cannot grant destructive authority.
    return undefined;
  }
}
