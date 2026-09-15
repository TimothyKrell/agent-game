import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema } from 'effect';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { canonical } from '../scripts/preview-artifact.ts';
import { deliveryProof } from '../scripts/preview-controller.ts';
import { requiredJobs, verifyRecords } from '../scripts/preview-github.ts';
import { records, expected, base, head, merge } from './fixtures/preview-github';

const Step = Schema.Struct({
  name: Schema.optional(Schema.String),
  run: Schema.optional(Schema.String),
  uses: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  with: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
  ),
});

const Job = Schema.Struct({
  if: Schema.optional(Schema.String),
  steps: Schema.Array(Step),
  needs: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  'timeout-minutes': Schema.Number,
  concurrency: Schema.optional(
    Schema.Struct({
      group: Schema.String,
      'cancel-in-progress': Schema.Boolean,
      queue: Schema.optional(Schema.Literal('max')),
    }),
  ),
});

const Workflow = Schema.Struct({ jobs: Schema.Record(Schema.String, Job) });

it('validates YAML credential boundaries, pinned default checkout, complete CI jobs and shared noncancelling PR lock', async () => {
  const ciText = await readFile('.github/workflows/ci.yml', 'utf8');
  const deployText = await readFile('.github/workflows/preview-deploy.yml', 'utf8');
  const cleanupText = await readFile('.github/workflows/preview-cleanup.yml', 'utf8');

  const [ci, deploy, cleanup] = [ciText, deployText, cleanupText].map((text) =>
    Schema.decodeUnknownSync(Workflow)(parse(text)),
  );

  expect(ci.jobs.preview).toBeUndefined();
  expect(Object.keys(ci.jobs).sort()).toEqual([
    'api',
    'browser',
    'browser-full',
    'extended-unit',
    'preview-activation',
    'production',
    'provider',
    'unit',
    'verify',
  ]);
  expect(ci.jobs.production.needs).toEqual(['verify', 'unit', 'api', 'browser']);
  expect(requiredJobs).toContain('Preview activation tests');

  for (const name of ['extended-unit', 'browser-full', 'provider', 'preview-activation']) {
    expect(ci.jobs[name].if).toBe(
      "inputs.extended == true || contains(github.event.pull_request.labels.*.name, 'extended-ci')",
    );
  }

  expect(ciText).toContain('shard: [1, 2, 3]');
  expect(deployText).toContain('workflow_run:');
  expect(deployText).toContain('types: [completed]');
  expect(deploy.jobs.deploy.if).toContain("vars.TRUSTED_PREVIEW_DEPLOY_ENABLED == 'true'");
  expect(deployText).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  expect(cleanupText).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  expect(cleanupText).toContain('workflow_dispatch:');
  expect(ci.jobs.verify.steps[0]).toMatchObject({
    name: 'Preview identity v1 merge=${{ github.sha }} base=${{ github.event.pull_request.base.sha }} head=${{ github.event.pull_request.head.sha }}',
    run: ':',
  });
  expect(cleanupText).toContain('pull_request_target:');

  for (const workflow of [deploy, cleanup]) {
    for (const job of Object.values(workflow.jobs)) {
      expect(job['timeout-minutes']).toBe(15);

      for (const step of job.steps) {
        if (step.uses?.startsWith('actions/checkout@')) {
          expect(step.with).toMatchObject({ ref: '${{ github.sha }}', 'persist-credentials': false });
        }

        expect(step.run ?? '').not.toMatch(/npm run|npx|produce-preview|wrangler deploy|git checkout/);
        expect(step.uses ?? '').not.toMatch(/cache|download-artifact|\.\/\.github\/actions/);

        if (step.env?.PREVIEW_DEPLOY_TOKEN) {
          expect(step.run).toMatch(/^node scripts\/preview-controller\.ts (deploy|cleanup|retire)$/);
          expect(step.env.PREVIEW_DEPLOY_TOKEN).toBe('${{ secrets.TRUSTED_PREVIEW_CLOUDFLARE_API_TOKEN }}');
        }
      }
    }
  }

  expect(deploy.jobs.deploy.concurrency).toEqual({
    group: 'preview-${{ needs.identify.outputs.pr-number }}',
    'cancel-in-progress': false,
    queue: 'max',
  });
  expect(cleanup.jobs.cleanup.concurrency).toEqual({
    group: 'preview-${{ github.event.number || inputs.pr-number }}',
    'cancel-in-progress': false,
    queue: 'max',
  });

  const prepared = deploy.jobs.deploy.steps.findIndex(
    (step) => step.run === 'node scripts/preview-controller.ts prepare',
  );

  const privileged = deploy.jobs.deploy.steps.findIndex((step) => step.env?.PREVIEW_DEPLOY_TOKEN);
  expect(prepared).toBeGreaterThan(-1);
  expect(privileged).toBeGreaterThan(prepared);
  const stack = await readFile('alchemy.run.ts', 'utf8');
  expect(stack.indexOf("PREVIEW_OPERATION === 'destroy'")).toBeLessThan(
    stack.indexOf('validateArtifact(artifactDirectory)'),
  );
  expect(stack).toContain('forceDestroy: preview ? true : undefined');
  expect(stack).toContain('bundle: artifact ? false : undefined');
});

it('rejects preview delivery when core checks pass but extended verification is missing, skipped or failed', () => {
  for (const name of [
    'Preview activation tests',
    'Browser and motion tests',
    'Verify production provider transport',
    'Extended unit tests (1/3)',
    'Extended unit tests (2/3)',
    'Extended unit tests (3/3)',
  ]) {
    const missing = records();
    missing.jobs = missing.jobs.filter((job) => job.name !== name);
    expect(() => verifyRecords(missing, expected)).toThrow();

    for (const conclusion of ['skipped', 'failure']) {
      const incomplete = records();
      incomplete.jobs = incomplete.jobs.map((job) => (job.name === name ? { ...job, conclusion } : job));
      expect(() => verifyRecords(incomplete, expected)).toThrow();
    }
  }
});

it('executes the trusted command wrapper with hostile PR scripts present without selecting their config or command', async () => {
  await mkdir('test-results/preview-deploy', { recursive: true });
  const trusted = await mkdtemp(resolve('test-results/preview-deploy/command-'));
  const quarantine = resolve(trusted, 'quarantine');
  await mkdir(quarantine);
  await writeFile(
    resolve(quarantine, 'package.json'),
    canonical({ scripts: { deploy: 'touch STOLEN', preinstall: 'touch STOLEN' } }),
  );
  await writeFile(resolve(quarantine, '.npmrc'), 'script-shell=./attack.sh');
  await writeFile(resolve(quarantine, 'alchemy.run.ts'), 'throw new Error("PR Alchemy executed")');
  const recorded = resolve(trusted, 'invocation.json');
  // This executable terminates the infrastructure boundary locally; the actual
  // controller wrapper still chooses its executable, argv, cwd and environment.
  await writeFile(
    resolve(trusted, 'bun'),
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(recorded)}, JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),operation:process.env.PREVIEW_OPERATION}));`,
  );
  await chmod(resolve(trusted, 'bun'), 0o700);
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {runAlchemy} from ${JSON.stringify(resolve('scripts/preview-controller.ts'))}; runAlchemy('deploy', 27, process.env);`,
    ],
    {
      cwd: trusted,
      env: {
        ...process.env,
        PATH: trusted,
        PREVIEW_ARTIFACT_DIR: quarantine,
        PREVIEW_DEPLOY_ENABLED: 'true',
        PREVIEW_DEPLOY_TOKEN: 'synthetic-canary',
      },
    },
  );
  expect(JSON.parse(await readFile(recorded, 'utf8'))).toEqual({
    argv: [
      resolve(trusted, 'scripts/preview-alchemy.ts'),
      'deploy',
      '--stage',
      'pr-27',
      '--profile',
      'agent-game',
      '--yes',
    ],
    cwd: trusted,
    operation: 'deploy',
  });
  await expect(readFile(resolve(quarantine, 'STOLEN'))).rejects.toThrow();
});

it('posts honest tested-merge/artifact status and includes R2 in cleanup comments', async () => {
  await mkdir('test-results/preview-deploy', { recursive: true });
  const scratch = await mkdtemp(resolve('test-results/preview-deploy/comment-'));
  const output = resolve(scratch, 'comment.json');
  const proofPath = resolve(scratch, 'proof.json');
  await writeFile(
    proofPath,
    canonical(deliveryProof(verifyRecords(records(), expected), 'b'.repeat(64), base, 'tk-d86')),
  );
  await writeFile(
    resolve(scratch, 'gh'),
    `#!${process.execPath}\nimport {writeFileSync,readFileSync} from 'node:fs'; if(process.argv.includes('--paginate')) console.log(JSON.stringify([[{id:75,user:{login:'github-actions[bot]'},body:'<!-- agent-game-preview -->'}]])); else writeFileSync(${JSON.stringify(output)}, readFileSync(0));`,
  );
  await chmod(resolve(scratch, 'gh'), 0o700);

  const env = {
    ...process.env,
    PATH: scratch,
    GITHUB_REPOSITORY: expected.repository,
    PR_NUMBER: '27',
    PREVIEW_URL: 'https://agent-game-pr-27.tk-d86.workers.dev',
    PREVIEW_PROOF_PATH: proofPath,
  };

  execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'deployed'], { env });

  const { body } = Schema.decodeUnknownSync(Schema.Struct({ body: Schema.String }))(
    JSON.parse(await readFile(output, 'utf8')),
  );

  expect(body).toContain(`Verified current PR head: \`${head}\``);
  expect(body).toContain(`Actual build / tested merge commit: \`${merge}\``);
  expect(body).toContain('artifact `preview-bundle-100-2` (ID 700)');
  expect(body).toContain('**not configured**');

  const ready = {
    ...deliveryProof(verifyRecords(records(), expected), 'b'.repeat(64), base, 'tk-d86'),
    sourceRegistration: {
      status: 'ready',
      sourceOrigin: 'https://source.example.test',
      incarnation: 'registered-incarnation',
      commit: merge,
      readback: 'verified',
      livePlay: { sourceConfigured: true, targetConfigured: false, capacityReserved: false },
    },
  };

  await writeFile(proofPath, canonical(ready));
  execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'deployed'], { env });
  const readyComment = await readFile(output, 'utf8');
  expect(readyComment).toContain('Source-account registration is **ready**');
  expect(readyComment).toContain('Source discovery livePlay: true');
  expect(readyComment).toContain('Live queue admission on this target is **not configured**');
  await writeFile(
    proofPath,
    canonical({ ...ready, sourceRegistration: { ...ready.sourceRegistration, readback: 'pending' } }),
  );
  expect(spawnSync(process.execPath, ['scripts/preview-comment.mjs', 'deployed'], { env }).status).not.toBe(
    0,
  );
  execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'removed'], { env });
  expect(await readFile(output, 'utf8')).toContain('R2 picture bucket');
});

it.each([
  ['missing activation', '', 'synthetic-new-token'],
  ['disabled activation', 'false', 'synthetic-new-token'],
  ['missing new secret despite legacy token', 'true', ''],
])('refuses a privileged subprocess with %s', async (_label, enabled, token) => {
  await mkdir('test-results/preview-deploy', { recursive: true });
  const scratch = await mkdtemp(resolve('test-results/preview-deploy/gate-'));
  const capture = resolve(scratch, 'CALLED');
  await writeFile(
    resolve(scratch, 'bun'),
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(capture)}, 'called');`,
  );
  await chmod(resolve(scratch, 'bun'), 0o700);

  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {runAlchemy} from ${JSON.stringify(resolve('scripts/preview-controller.ts'))}; runAlchemy('deploy', 27, process.env);`,
    ],
    {
      cwd: scratch,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: scratch,
        PREVIEW_DEPLOY_ENABLED: enabled,
        PREVIEW_DEPLOY_TOKEN: token,
        CLOUDFLARE_API_TOKEN: 'synthetic-legacy-token',
      },
    },
  );

  expect(child.status).not.toBe(0);
  expect(child.stderr).toMatch(/activation|credential/);
  await expect(readFile(capture)).rejects.toThrow();
});

it.each([
  ['manual closed PR with deployment disabled', 'workflow_dispatch', '27', 'closed', 'main', true, true],
  ['automatic close with deployment disabled', 'pull_request_target', '27', 'closed', 'main', true, true],
  ['manual open PR', 'workflow_dispatch', '27', 'open', 'main', true, false],
  ['manual fork', 'workflow_dispatch', '27', 'closed', 'main', false, false],
  ['manual branch override', 'workflow_dispatch', '27', 'closed', 'feature', true, false],
  ['noncanonical lock identity', 'workflow_dispatch', '027', 'closed', 'main', true, false],
  ['shell-injection input', 'workflow_dispatch', '27;touch CALLED', 'closed', 'main', true, false],
] as const)(
  'validates live state before cleanup: %s',
  async (_name, eventName, number, state, branch, sameRepo, accepted) => {
    await mkdir('test-results/preview-deploy', { recursive: true });
    const scratch = await mkdtemp(resolve('test-results/preview-deploy/manual-cleanup-'));
    const capture = resolve(scratch, 'invocation.json');
    const eventPath = resolve(scratch, 'event.json');
    const controller = resolve('scripts/preview-controller.ts');
    const fixture = records();
    await writeFile(
      eventPath,
      canonical({
        repository: fixture.repository,
        ...(eventName === 'workflow_dispatch'
          ? { inputs: { 'pr-number': number } }
          : { action: 'closed', number: 27 }),
      }),
    );

    const pr = {
      ...fixture.pr,
      state,
      head: {
        ...fixture.pr.head,
        repo: sameRepo ? fixture.pr.head.repo : { id: 99, full_name: 'attacker/fork' },
      },
    };

    await writeFile(
      resolve(scratch, 'bun'),
      `#!${process.execPath}\nimport {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(capture)}, JSON.stringify({argv:process.argv.slice(2),tokenCorrect:process.env.CLOUDFLARE_API_TOKEN === 'synthetic-new-token',inputTokenRemoved:!process.env.PREVIEW_DEPLOY_TOKEN}));`,
    );
    await chmod(resolve(scratch, 'bun'), 0o700);
    const script = `globalThis.fetch = async (url) => { if (String(url) !== 'https://api.github.com/repos/${expected.repository}/pulls/27') throw new Error('Unexpected API call'); return Response.json(${JSON.stringify(pr)}); }; process.argv = [process.execPath, ${JSON.stringify(controller)}, 'cleanup']; await import(${JSON.stringify(controller)});`;

    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: scratch,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: scratch,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_SHA: base,
        GITHUB_REF: `refs/heads/${branch}`,
        GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/preview-cleanup.yml@refs/heads/${branch}`,
        GITHUB_REPOSITORY: expected.repository,
        GH_TOKEN: 'synthetic-github-token',
        WORKERS_SUBDOMAIN: 'tk-d86',
        PR_NUMBER: number,
        PREVIEW_DEPLOY_ENABLED: 'false',
        PREVIEW_DEPLOY_TOKEN: 'synthetic-new-token',
        CLOUDFLARE_API_TOKEN: 'synthetic-legacy-token',
      },
    });

    if (accepted) {
      expect(child.status, child.stderr).toBe(0);
      expect(JSON.parse(await readFile(capture, 'utf8'))).toEqual({
        argv: [
          resolve(scratch, 'scripts/preview-alchemy.ts'),
          'destroy',
          '--stage',
          'pr-27',
          '--profile',
          'agent-game',
          '--yes',
        ],
        tokenCorrect: true,
        inputTokenRemoved: true,
      });
    } else {
      expect(child.status).not.toBe(0);
      await expect(readFile(capture)).rejects.toThrow();
    }
  },
);
