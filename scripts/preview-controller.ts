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
import { GitHub, PullRequest, PreviewEligibilityChanged, verifyManifestIdentity } from './preview-github.ts';
import type { VerifiedRun } from './preview-github.ts';
import { branchContentForTarget } from './preview-content.ts';
import type { ValidatedBranchContent } from './preview-content.ts';

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
  branchContent?: ValidatedBranchContent,
) {
  return {
    version: 1,
    ...verified,
    controllerCommit,
    manifestSha256,
    target: previewTarget(verified.prNumber, subdomain),
    branchContent: branchContent
      ? branchContentForTarget(branchContent, previewTarget(verified.prNumber, subdomain).origin)
      : undefined,
    sourceRegistration: { status: 'not-configured' },
  };
}

/** Revalidation inside the privileged process; no artifact field selects authority. */
export async function controllerDelivery(env: NodeJS.ProcessEnv) {
  const repository = env.GITHUB_REPOSITORY ?? '';
  const controllerCommit = env.GITHUB_SHA ?? '';
  requireCondition(
    commitPattern.test(controllerCommit) &&
      env.PREVIEW_DEPLOY_ENABLED === 'true' &&
      env.GITHUB_EVENT_NAME === 'workflow_run',
    'Invalid trusted delivery invocation',
  );

  const event = Schema.decodeUnknownSync(
    Schema.Struct({
      action: Schema.Literal('completed'),
      repository: Schema.Struct({
        id: Schema.Number,
        full_name: Schema.String,
        default_branch: Schema.String,
      }),
      workflow_run: Schema.Struct({ id: Schema.Number, run_attempt: Schema.Number }),
    }),
  )(JSON.parse((await readStable(env.GITHUB_EVENT_PATH ?? '', 8 * 1024 * 1024)).toString('utf8')));

  requireCondition(
    event.repository.full_name === repository &&
      env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` &&
      env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/preview-deploy.yml@refs/heads/${event.repository.default_branch}`,
    'Controller must run from default branch',
  );
  const github = new GitHub(repository, env.GH_TOKEN ?? '');

  const expected = {
    repository,
    repositoryId: event.repository.id,
    runId: event.workflow_run.id,
    attempt: event.workflow_run.run_attempt,
  };

  const verified = await github.verify(expected, controllerCommit);
  requireCondition(String(verified.prNumber) === env.PR_NUMBER, 'PR differs from concurrency lock');
  const artifact = await validateArtifact(env.PREVIEW_ARTIFACT_DIR ?? '');
  verifyManifestIdentity(artifact.manifest, verified);

  const proof = deliveryProof(
    verified,
    artifact.manifestSha256,
    controllerCommit,
    env.WORKERS_SUBDOMAIN ?? '',
    artifact.branchContent,
  );

  requireCondition(
    (await readStable('.agent-game/preview-delivery.json', 512 * 1024)).toString('utf8') ===
      canonical(proof) &&
      (await readStable('.agent-game/preview-manifest.json', 512 * 1024)).equals(artifact.raw),
    'Retained delivery differs from verified run',
  );

  return {
    verified,
    artifact,
    proof,
    recheck: async () => {
      if (canonical(await github.verify(expected, controllerCommit)) !== canonical(verified))
        throw new PreviewEligibilityChanged('PR/run changed before lifecycle write');
    },
  };
}

export async function controllerClosure(env: NodeJS.ProcessEnv) {
  const repository = env.GITHUB_REPOSITORY ?? '';

  const event = Schema.decodeUnknownSync(
    Schema.Struct({
      repository: Schema.Struct({
        id: Schema.Number,
        full_name: Schema.String,
        default_branch: Schema.String,
      }),
    }),
  )(JSON.parse((await readStable(env.GITHUB_EVENT_PATH ?? '', 8 * 1024 * 1024)).toString('utf8')));

  const payload = JSON.parse(
    (await readStable(env.GITHUB_EVENT_PATH ?? '', 8 * 1024 * 1024)).toString('utf8'),
  );

  const input =
    env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      ? Schema.decodeUnknownSync(Schema.Struct({ inputs: Schema.Struct({ 'pr-number': Schema.String }) }))(
          payload,
        ).inputs['pr-number']
      : String(
          Schema.decodeUnknownSync(
            Schema.Struct({ action: Schema.Literal('closed'), number: Schema.Number }),
          )(payload).number,
        );

  requireCondition(
    ['workflow_dispatch', 'pull_request_target'].includes(env.GITHUB_EVENT_NAME ?? '') &&
      /^[1-9]\d*$/.test(input) &&
      input === env.PR_NUMBER &&
      Number.isSafeInteger(Number(input)),
    'Invalid cleanup identity',
  );
  requireCondition(
    event.repository.full_name === repository &&
      env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` &&
      env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/preview-cleanup.yml@refs/heads/${event.repository.default_branch}` &&
      commitPattern.test(env.GITHUB_SHA ?? ''),
    'Controller must run from default branch',
  );
  const github = new GitHub(repository, env.GH_TOKEN ?? '');

  const recheck = async () => {
    const pr = Schema.decodeUnknownSync(PullRequest)(await github.json(`repos/${repository}/pulls/${input}`));
    requireCondition(
      pr.number === Number(input) &&
        pr.state === 'closed' &&
        pr.head.repo.id === event.repository.id &&
        pr.base.repo.id === event.repository.id &&
        pr.head.repo.full_name === repository &&
        pr.base.repo.full_name === repository &&
        pr.base.ref === event.repository.default_branch,
      'PR reopened, fork, or wrong base; cleanup refused',
    );
  };

  await recheck();

  return { number: Number(input), recheck };
}

/** Failure finalizer is tied to a retained verified run, not to current-head
 * eligibility (which may be precisely why publication failed). */
export async function controllerRetirement(env: NodeJS.ProcessEnv) {
  const repository = env.GITHUB_REPOSITORY ?? '';

  const event = Schema.decodeUnknownSync(
    Schema.Struct({
      action: Schema.Literal('completed'),
      repository: Schema.Struct({ full_name: Schema.String, default_branch: Schema.String }),
      workflow_run: Schema.Struct({ id: Schema.Int, run_attempt: Schema.Int }),
    }),
  )(JSON.parse((await readStable(env.GITHUB_EVENT_PATH ?? '', 8 * 1024 * 1024)).toString('utf8')));

  requireCondition(
    env.GITHUB_EVENT_NAME === 'workflow_run' &&
      event.repository.full_name === repository &&
      env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` &&
      env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/preview-deploy.yml@refs/heads/${event.repository.default_branch}` &&
      commitPattern.test(env.GITHUB_SHA ?? '') &&
      /^[1-9]\d*$/.test(env.PR_NUMBER ?? '') &&
      Number.isSafeInteger(Number(env.PR_NUMBER)) &&
      event.workflow_run.id > 0 &&
      event.workflow_run.run_attempt > 0,
    'Invalid failure-retirement authority',
  );

  return {
    number: Number(env.PR_NUMBER),
    runId: event.workflow_run.id,
    runAttempt: event.workflow_run.run_attempt,
    shouldRetire: async (prHeadSha: string) => {
      if (env.PREVIEW_DELIVERY_COMPLETED === 'true') return true;
      const github = new GitHub(repository, env.GH_TOKEN ?? '');

      const pr = Schema.decodeUnknownSync(PullRequest)(
        await github.json(`repos/${repository}/pulls/${env.PR_NUMBER}`),
      );

      requireCondition(
        pr.number === Number(env.PR_NUMBER) &&
          pr.head.repo.full_name === repository &&
          pr.base.repo.full_name === repository &&
          pr.base.ref === event.repository.default_branch,
        'Failure retirement PR identity changed',
      );

      // Transient delivery/GitHub failures retain the same pending key. Only an
      // observed invalidation (or failed smoke/readback after completed deploy)
      // retires it. A failed read itself grants no destructive authority.
      return pr.state === 'closed' || pr.head.sha !== prHeadSha;
    },
  };
}

// The privileged command is fixed default-branch code, never artifact metadata,
// npm scripts, PR config, dynamic imports, or an executable from the quarantine.
export function runAlchemy(
  operation: 'deploy' | 'destroy' | 'retire',
  prNumber: number,
  env: NodeJS.ProcessEnv,
) {
  requireCondition(Number.isSafeInteger(prNumber) && prNumber > 0, 'Invalid PR stage');

  if (operation === 'deploy')
    requireCondition(env.PREVIEW_DEPLOY_ENABLED === 'true', 'Trusted preview activation is disabled');
  requireCondition(!!env.PREVIEW_DEPLOY_TOKEN?.trim(), 'Missing trusted preview environment credential');
  // Alchemy's conventional variable is set only here from the distinct cutover
  // secret. Neither a legacy repository token nor cached CLI auth is a fallback.
  execFileSync(
    'bun',
    [
      resolve('scripts/preview-alchemy.ts'),
      operation,
      '--stage',
      `pr-${prNumber}`,
      '--profile',
      'agent-game',
      '--yes',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...env,
        PREVIEW_DEPLOY_TOKEN: undefined,
        CLOUDFLARE_API_TOKEN: env.PREVIEW_DEPLOY_TOKEN,
        PREVIEW_OPERATION: operation,
      },
    },
  );
}

async function main() {
  const operation = process.argv[2];
  requireCondition(
    ['discover', 'prepare', 'deploy', 'publish', 'cleanup', 'removed', 'retire'].includes(operation),
    'Choose a controller operation',
  );

  if (operation === 'retire') {
    const authority = await controllerRetirement(process.env);
    runAlchemy('retire', authority.number, process.env);

    return;
  }

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
      process.env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` &&
      process.env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/preview-${operation === 'cleanup' || operation === 'removed' ? 'cleanup' : 'deploy'}.yml@refs/heads/${event.repository.default_branch}`,
    'Controller must run from default branch',
  );

  if (operation === 'cleanup' || operation === 'removed') {
    const payload = JSON.parse(eventBytes.toString('utf8'));
    let number: number;

    if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      const input = Schema.decodeUnknownSync(
        Schema.Struct({ inputs: Schema.Struct({ 'pr-number': Schema.String }) }),
      )(payload).inputs['pr-number'];

      requireCondition(/^[1-9]\d*$/.test(input), 'Invalid manual cleanup PR');
      number = Number(input);
    } else {
      requireCondition(process.env.GITHUB_EVENT_NAME === 'pull_request_target', 'Wrong cleanup event');
      number = Schema.decodeUnknownSync(
        Schema.Struct({ action: Schema.Literal('closed'), number: Schema.Number }),
      )(payload).number;
    }

    requireCondition(
      Number.isSafeInteger(number) && number > 0 && String(number) === process.env.PR_NUMBER,
      'Cleanup PR differs from concurrency lock',
    );

    const pr = Schema.decodeUnknownSync(PullRequest)(
      await github.json(`repos/${repository}/pulls/${number}`),
    );

    requireCondition(
      pr.number === number &&
        pr.state === 'closed' &&
        pr.head.repo.id === event.repository.id &&
        pr.base.repo.id === event.repository.id &&
        pr.head.repo.full_name === repository &&
        pr.base.repo.full_name === repository &&
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
  requireCondition(process.env.PREVIEW_DEPLOY_ENABLED === 'true', 'Trusted preview activation is disabled');

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
      !process.env.CLOUDFLARE_API_TOKEN && !process.env.PREVIEW_DEPLOY_TOKEN,
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

    const proof = deliveryProof(
      verified,
      artifact.manifestSha256,
      controllerCommit,
      subdomain,
      artifact.branchContent,
    );

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

  const proof = deliveryProof(
    verified,
    artifact.manifestSha256,
    controllerCommit,
    subdomain,
    artifact.branchContent,
  );

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
  else {
    if (process.env.PREVIEW_IDENTITY_ENABLED === 'true') {
      requireCondition(
        !process.env.CLOUDFLARE_API_TOKEN && !process.env.PREVIEW_DEPLOY_TOKEN,
        'Source readiness must be read back without deployer credentials',
      );
      const { bridgeSettings } = await import('./preview-lifecycle-state.ts');

      const { previewArtifactPublication, verifySourcePublicationReadback, verifySourceArenaReadback } =
        await import('./preview-publication.ts');

      const settings = bridgeSettings(process.env)!;
      const raw = await readStable('.agent-game/preview-registration.json', 16 * 1024);

      const receipt = Schema.decodeUnknownSync(Schema.Struct({ incarnation: Schema.String }))(
        JSON.parse(raw.toString('utf8')),
      );

      const publication = previewArtifactPublication(verified, artifact, {
        subdomain,
        sourceOrigin: settings.sourceOrigin,
        incarnation: receipt.incarnation,
        executable: settings.executable,
      });

      requireCondition(
        raw.toString('utf8') === canonical(publication),
        'Registration receipt differs from verified branch and trusted source release',
      );
      await verifySourcePublicationReadback(publication);
      const sourceConfigured = await verifySourceArenaReadback(publication);
      const targetConfigured = process.env.PREVIEW_BROKER_ENABLED === 'true';
      requireCondition(
        !targetConfigured || sourceConfigured,
        'Source broker/provider is not ready for the configured live target',
      );
      requireCondition(
        canonical(await github.verify(expected, controllerCommit)) === canonical(verified),
        'PR/run changed after source readback',
      );
      await writeFile(
        '.agent-game/preview-delivery.json',
        canonical({
          ...proof,
          sourceRegistration: {
            status: 'ready',
            sourceOrigin: publication.sourceOrigin,
            incarnation: publication.incarnation,
            commit: publication.commit,
            readback: 'verified',
            livePlay: { sourceConfigured, targetConfigured, capacityReserved: false },
          },
        }),
      );
    }

    execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'deployed'], {
      stdio: 'inherit',
      env: { ...process.env, PREVIEW_PROOF_PATH: resolve('.agent-game/preview-delivery.json') },
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
