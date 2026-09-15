import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema } from 'effect';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { canonical } from '../scripts/preview-artifact.ts';
import { deliveryProof } from '../scripts/preview-controller.ts';
import { verifyRecords } from '../scripts/preview-github.ts';
import { records, expected, base, head, merge } from './fixtures/preview-github';

const Step = Schema.Struct({
  run: Schema.optional(Schema.String),
  uses: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  with: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
  ),
});

const Job = Schema.Struct({
  steps: Schema.Array(Step),
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
  expect(Object.keys(ci.jobs).sort()).toEqual(['api', 'browser', 'production', 'provider', 'unit', 'verify']);
  expect(ciText).toContain('shard: [1, 2, 3]');
  expect(deployText).toContain('workflow_run:');
  expect(deployText).toContain('types: [completed]');
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

        if (step.env?.CLOUDFLARE_API_TOKEN)
          expect(step.run).toMatch(/^node scripts\/preview-controller\.ts (deploy|cleanup)$/);
      }
    }
  }

  expect(deploy.jobs.deploy.concurrency).toEqual({
    group: 'preview-${{ needs.identify.outputs.pr-number }}',
    'cancel-in-progress': false,
    queue: 'max',
  });
  expect(cleanup.jobs.cleanup.concurrency).toEqual({
    group: 'preview-${{ github.event.number }}',
    'cancel-in-progress': false,
    queue: 'max',
  });

  const prepared = deploy.jobs.deploy.steps.findIndex(
    (step) => step.run === 'node scripts/preview-controller.ts prepare',
  );

  const privileged = deploy.jobs.deploy.steps.findIndex((step) => step.env?.CLOUDFLARE_API_TOKEN);
  expect(prepared).toBeGreaterThan(-1);
  expect(privileged).toBeGreaterThan(prepared);
  const stack = await readFile('alchemy.run.ts', 'utf8');
  expect(stack.indexOf("PREVIEW_OPERATION === 'destroy'")).toBeLessThan(
    stack.indexOf('validateArtifact(artifactDirectory)'),
  );
  expect(stack).toContain('forceDestroy: preview ? true : undefined');
  expect(stack).toContain('bundle: artifact ? false : undefined');
});

it('executes the trusted command wrapper with hostile PR scripts present without selecting their config or command', async () => {
  await mkdir('.tim27-deploy/runs', { recursive: true });
  const trusted = await mkdtemp(resolve('.tim27-deploy/runs/command-'));
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
        CLOUDFLARE_API_TOKEN: 'synthetic-canary',
      },
    },
  );
  expect(JSON.parse(await readFile(recorded, 'utf8'))).toEqual({
    argv: [
      resolve(trusted, 'node_modules/alchemy/bin/alchemy.ts'),
      'deploy',
      resolve(trusted, 'alchemy.run.ts'),
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
  await mkdir('.tim27-deploy/runs', { recursive: true });
  const scratch = await mkdtemp(resolve('.tim27-deploy/runs/comment-'));
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
  execFileSync(process.execPath, ['scripts/preview-comment.mjs', 'removed'], { env });
  expect(await readFile(output, 'utf8')).toContain('R2 picture bucket');
});
