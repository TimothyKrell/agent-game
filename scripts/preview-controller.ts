import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Schema } from 'effect';
import {
  canonical,
  commitPattern,
  readStable,
  requireCondition,
  sha256,
  snapshotArtifact,
  validateArtifact,
} from './preview-artifact.ts';
import { GitHub, PullRequest, verifyManifestIdentity } from './preview-github.ts';
import type { VerifiedRun } from './preview-github.ts';

export function previewTarget(prNumber: number, subdomain: string) {
  requireCondition(
    Number.isSafeInteger(prNumber) && prNumber > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain),
    'Invalid trusted preview target',
  );
  const stage = `pr-${prNumber}`;
  const workerName = `agent-game-${stage}`;

  return {
    stage,
    workerName,
    origin: `https://${workerName}.${subdomain}.workers.dev`,
    policy: 'scripted-zero-budget-unranked' as const,
  };
}

export function deliveryProof(
  verified: VerifiedRun,
  manifestSha256: string,
  controllerCommit: string,
  subdomain: string,
) {
  return {
    version: 1,
    ...verified,
    controllerCommit,
    manifestSha256,
    target: previewTarget(verified.prNumber, subdomain),
    sourceRegistration: { status: 'not-configured' },
  };
}

// The privileged command is fixed default-branch code, never artifact metadata,
// npm scripts, PR config, dynamic imports, or an executable from the quarantine.
export function runAlchemy(operation: 'deploy' | 'destroy', prNumber: number, env: NodeJS.ProcessEnv) {
  requireCondition(Number.isSafeInteger(prNumber) && prNumber > 0, 'Invalid PR stage');
  execFileSync(
    'bun',
    [
      resolve('node_modules/alchemy/bin/alchemy.ts'),
      operation,
      resolve('alchemy.run.ts'),
      '--stage',
      `pr-${prNumber}`,
      '--profile',
      'agent-game',
      '--yes',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...env, PREVIEW_OPERATION: operation },
    },
  );
}

async function main() {
  const operation = process.argv[2];
  requireCondition(
    ['discover', 'prepare', 'deploy', 'publish', 'cleanup', 'removed'].includes(operation),
    'Choose a controller operation',
  );

  const {
    GITHUB_REPOSITORY: repository = '',
    GH_TOKEN: token = '',
    GITHUB_SHA: controllerCommit = '',
    WORKERS_SUBDOMAIN: subdomain = '',
  } = process.env;

  requireCondition(commitPattern.test(controllerCommit), 'Invalid default-branch controller commit');
  const github = new GitHub(repository, token);
  const eventBytes = await readStable(process.env.GITHUB_EVENT_PATH ?? '', 8 * 1024 * 1024);

  const event = Schema.decodeUnknownSync(
    Schema.Struct({
      repository: Schema.Struct({
        id: Schema.Number,
        full_name: Schema.String,
        default_branch: Schema.String,
      }),
    }),
  )(JSON.parse(eventBytes.toString('utf8')));

  requireCondition(
    event.repository.full_name === repository &&
      process.env.GITHUB_REF === `refs/heads/${event.repository.default_branch}`,
    'Controller must run from default branch',
  );

  if (operation === 'cleanup' || operation === 'removed') {
    requireCondition(process.env.GITHUB_EVENT_NAME === 'pull_request_target', 'Wrong cleanup event');

    const close = Schema.decodeUnknownSync(
      Schema.Struct({ action: Schema.Literal('closed'), number: Schema.Number }),
    )(JSON.parse(eventBytes.toString('utf8')));

    const pr = Schema.decodeUnknownSync(PullRequest)(
      await github.json(`repos/${repository}/pulls/${close.number}`),
    );

    requireCondition(
      pr.number === close.number &&
        pr.state === 'closed' &&
        pr.head.repo.id === event.repository.id &&
        pr.base.repo.id === event.repository.id &&
        pr.base.ref === event.repository.default_branch,
      'PR reopened, fork, or wrong base; cleanup refused',
    );
    const target = previewTarget(pr.number, subdomain);

    if (operation === 'cleanup') runAlchemy('destroy', pr.number, process.env);
    else
      execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'removed'], {
        stdio: 'inherit',
        env: { ...process.env, PR_NUMBER: String(pr.number), PREVIEW_URL: target.origin },
      });

    return;
  }

  requireCondition(process.env.GITHUB_EVENT_NAME === 'workflow_run', 'Wrong deployment event');

  const trigger = Schema.decodeUnknownSync(
    Schema.Struct({
      action: Schema.Literal('completed'),
      workflow_run: Schema.Struct({ id: Schema.Number, run_attempt: Schema.Number }),
    }),
  )(JSON.parse(eventBytes.toString('utf8')));

  requireCondition(
    [trigger.workflow_run.id, trigger.workflow_run.run_attempt].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ),
    'Invalid triggering run',
  );

  const expected = {
    repository,
    repositoryId: event.repository.id,
    runId: trigger.workflow_run.id,
    attempt: trigger.workflow_run.run_attempt,
  };

  const verified = await github.verify(expected, controllerCommit);

  if (operation === 'discover') {
    await appendFile(process.env.GITHUB_OUTPUT ?? '', `pr-number=${verified.prNumber}\n`);

    return;
  }

  requireCondition(String(verified.prNumber) === process.env.PR_NUMBER, 'PR differs from concurrency lock');
  const target = previewTarget(verified.prNumber, subdomain);

  if (operation === 'prepare') {
    requireCondition(
      !process.env.CLOUDFLARE_API_TOKEN,
      'Quarantine must be prepared without deployer credentials',
    );
    const temporary = resolve(process.env.RUNNER_TEMP ?? '');
    requireCondition(
      temporary !== process.cwd() && !temporary.startsWith(process.cwd() + sep),
      'Quarantine must be outside trusted checkout',
    );
    const work = await mkdtemp(resolve(temporary, 'preview-delivery-'));
    const archive = await github.download(verified);
    requireCondition(
      `sha256:${sha256(archive)}` === verified.artifactDigest,
      'GitHub artifact digest mismatch',
    );
    await writeFile(resolve(work, 'artifact.zip'), archive, { flag: 'wx', mode: 0o400 });
    execFileSync(
      'python3',
      [
        'scripts/preview-extract.py',
        resolve(work, 'artifact.zip'),
        resolve(work, 'quarantine'),
        verified.artifactDigest.slice(7),
      ],
      { stdio: 'inherit' },
    );
    const artifact = await snapshotArtifact(resolve(work, 'quarantine'), resolve(work, 'verified'));
    verifyManifestIdentity(artifact.manifest, verified);
    const proof = deliveryProof(verified, artifact.manifestSha256, controllerCommit, subdomain);
    await mkdir('.agent-game', { recursive: true });
    await writeFile('.agent-game/preview-delivery.json', canonical(proof));
    await writeFile('.agent-game/preview-manifest.json', artifact.raw);
    await appendFile(
      process.env.GITHUB_ENV ?? '',
      `PREVIEW_ARTIFACT_DIR=${resolve(work, 'verified')}\nPREVIEW_MANIFEST_SHA256=${artifact.manifestSha256}\nPREVIEW_URL=${target.origin}\nPR_HEAD_SHA=${verified.prHeadSha}\nPREVIEW_BUILT_COMMIT=${verified.builtCommit}\n`,
    );

    return;
  }

  const artifact = await validateArtifact(process.env.PREVIEW_ARTIFACT_DIR ?? '');
  verifyManifestIdentity(artifact.manifest, verified);
  const proof = deliveryProof(verified, artifact.manifestSha256, controllerCommit, subdomain);
  const recorded = await readStable('.agent-game/preview-delivery.json', 512 * 1024);
  requireCondition(recorded.toString('utf8') === canonical(proof), 'Delivery proof changed since quarantine');
  requireCondition(
    (await readStable('.agent-game/preview-manifest.json', 512 * 1024)).equals(artifact.raw),
    'Retained manifest differs from upload',
  );
  // Re-query under the per-PR lock immediately before the write/publication.
  requireCondition(
    canonical(await github.verify(expected, controllerCommit)) === canonical(verified),
    'PR/run changed before write',
  );

  if (operation === 'deploy') runAlchemy('deploy', verified.prNumber, process.env);
  else
    execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'deployed'], {
      stdio: 'inherit',
      env: { ...process.env, PREVIEW_PROOF_PATH: resolve('.agent-game/preview-delivery.json') },
    });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
