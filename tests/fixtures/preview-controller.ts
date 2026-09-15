import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema } from 'effect';
import { runnerFixture } from './preview-runner';
import { records, expected, base, merge } from './preview-github';
import { canonical } from '../../scripts/preview-artifact';
import { verifyRecords } from '../../scripts/preview-github';
import { deliveryProof } from '../../scripts/preview-controller';
import { retainedIdentity } from '../../scripts/preview-lifecycle-state';
import { lifecycleSourceOrigin, lifecycleTargetOrigin } from './preview-lifecycle';

type FailureMode =
  | 'healthy'
  | 'github-503'
  | 'comment-503'
  | 'source-503'
  | 'source-malformed'
  | 'source-shape'
  | 'source-invalid'
  | 'smoke-invalid'
  | 'smoke-503'
  | 'pr-closed'
  | 'new-run';

/** Actual CLI controller/smoke/comment/finalizer processes. Only HTTP and gh
 * transport terminate locally; retirement runs the real Alchemy/D1 engine. */
export async function controllerFixture() {
  const runner = await runnerFixture();
  const publication = await runner.run(runner.delivery());
  const directory = await mkdtemp(resolve('.tim27-lifecycle/runs/controller-'));
  await mkdir(resolve(directory, '.agent-game'));
  await mkdir(resolve(directory, 'bin'));
  await symlink(resolve('scripts'), resolve(directory, 'scripts'));
  let mode: FailureMode = 'healthy';
  let githubReads = 0;
  let commentCalls = 0;
  let disposed = false;
  const record = records();
  record.mergeCommit = runner.worker.artifact.manifest.builtCommit;
  record.jobs = record.jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step) => ({
      ...step,
      name: step.name.replace(`merge=${merge}`, `merge=${record.mergeCommit}`),
    })),
  }));
  const verified = verifyRecords(record, expected);

  const proof = deliveryProof(
    verified,
    runner.worker.artifact.manifestSha256,
    base,
    'test',
    runner.worker.artifact.branchContent,
  );

  const resetProof = async () => {
    await writeFile(resolve(directory, '.agent-game/preview-delivery.json'), canonical(proof));
    await writeFile(resolve(directory, '.agent-game/preview-manifest.json'), runner.worker.artifact.raw);
    await writeFile(resolve(directory, '.agent-game/preview-registration.json'), canonical(publication));
  };

  await resetProof();
  const eventPath = resolve(directory, 'event.json');
  await writeFile(
    eventPath,
    JSON.stringify({
      action: 'completed',
      repository: record.repository,
      workflow_run: { id: verified.runId, run_attempt: verified.runAttempt },
    }),
  );

  const requestSchema = Schema.Struct({
    url: Schema.String,
    method: Schema.String,
    headers: Schema.Record(Schema.String, Schema.String),
    body: Schema.NullOr(Schema.String),
  });

  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/comment') {
        commentCalls++;
        response.writeHead(mode === 'comment-503' ? 503 : 200).end('{}');

        return;
      }

      const chunks: Buffer[] = [];

      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = Schema.decodeUnknownSync(requestSchema)(JSON.parse(Buffer.concat(chunks).toString()));
      const url = new URL(input.url);
      let result: Response;

      if (url.origin === 'https://api.github.com') {
        githubReads++;

        if (mode === 'github-503') result = new Response('temporarily unavailable', { status: 503 });
        else {
          const path = url.pathname.replace(`/repos/${expected.repository}`, '');

          const values = new Map<string, object>([
            ['', record.repository],
            ['/actions/workflows/ci.yml', record.workflow],
            ['/actions/runs/100', record.run],
            ['/pulls/27', mode === 'pr-closed' ? { ...record.pr, state: 'closed' } : record.pr],
            [`/git/commits/${record.mergeCommit}`, { parents: record.parents.map((sha) => ({ sha })) }],
            ['/actions/runs/100/attempts/2/jobs', { total_count: record.jobs.length, jobs: record.jobs }],
            [
              '/actions/runs/100/artifacts',
              { total_count: record.artifacts.length, artifacts: record.artifacts },
            ],
            [
              '/actions/workflows/9/runs',
              {
                total_count: mode === 'new-run' ? 2 : 1,
                workflow_runs: mode === 'new-run' ? [record.run, { ...record.run, id: 101 }] : [record.run],
              },
            ],
          ]);

          if (path.startsWith('/contents/')) result = Response.json({ sha: base, type: 'file' });
          else {
            if (!values.has(path)) throw new Error(`Unexpected GitHub fixture path: ${path}`);
            result = Response.json(values.get(path));
          }
        }
      } else if ([lifecycleSourceOrigin, lifecycleTargetOrigin].includes(url.origin)) {
        result = await runner.worker.fetcher(input.url, {
          method: input.method,
          headers: input.headers,
          body: input.body === null ? undefined : Buffer.from(input.body, 'base64').toString(),
        });

        if (url.pathname === '/api/preview/artifacts') {
          if (mode === 'source-503') result = new Response('temporarily unavailable', { status: 503 });

          if (mode === 'source-malformed')
            result = new Response('{broken', { headers: { 'cache-control': 'no-store' } });

          if (mode === 'source-shape')
            result = Response.json({}, { headers: { 'cache-control': 'no-store' } });

          if (mode === 'source-invalid')
            result = Response.json(
              { ...publication, incarnation: 'different-incarnation' },
              { headers: { 'cache-control': 'no-store' } },
            );
        }

        if (url.pathname === '/api/bootstrap' && mode === 'smoke-invalid') {
          const body = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
            await result.json(),
          );

          result = Response.json({ ...body, mode: 'production' });
        }

        if (url.pathname === '/api/bootstrap' && mode === 'smoke-503')
          result = Response.json({ error: 'unavailable' }, { status: 503 });
      } else throw new Error('Unexpected controller fixture egress');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          status: result.status,
          headers: Object.fromEntries(result.headers),
          body: Buffer.from(await result.arrayBuffer()).toString('base64'),
        }),
      );
    } catch {
      response.writeHead(500).end('Fixture transport rejected request');
    }
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Int }))(server.address());
  const origin = `http://127.0.0.1:${address.port}`;
  const preload = resolve(directory, 'transport.mjs');
  await writeFile(
    preload,
    `const network=globalThis.fetch;
globalThis.fetch=async (url,init)=>{
  const request=new Request(url,init);
  const response=await network(${JSON.stringify(origin)}, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:request.url,method:request.method,headers:Object.fromEntries(request.headers),body:request.method==='GET'?null:Buffer.from(await request.arrayBuffer()).toString('base64')})});
  if(!response.ok) throw new Error('Local transport unavailable');
  const result=await response.json();
  return new Response(Buffer.from(result.body,'base64'),{status:result.status,headers:result.headers});
};
`,
  );
  await writeFile(
    resolve(directory, 'bin/gh'),
    `#!${process.execPath}
const response=await fetch(${JSON.stringify(origin + '/comment')});
if(!response.ok) { console.error('Comment API HTTP 503'); process.exit(1); }
console.log(process.argv.includes('--paginate')?'[[]]':'{}');
`,
    { mode: 0o700 },
  );

  const env = {
    ...runner.env,
    CLOUDFLARE_API_TOKEN: undefined,
    PREVIEW_DEPLOY_TOKEN: undefined,
    GITHUB_WORKSPACE: directory,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_REPOSITORY: expected.repository,
    GITHUB_SHA: base,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: `${expected.repository}/.github/workflows/preview-deploy.yml@refs/heads/main`,
    GITHUB_RUN_ID: '200',
    GITHUB_RUN_ATTEMPT: '1',
    PREVIEW_DELIVERY_COMPLETED: 'true',
    PREVIEW_DEPLOY_ENABLED: 'true',
    PR_NUMBER: '27',
    PREVIEW_URL: lifecycleTargetOrigin,
    GH_TOKEN: 'synthetic-github-token',
    PATH: `${directory}/bin:${process.env.PATH}`,
  };

  const child = async (args: string[]) => {
    try {
      const output = await promisify(execFile)(process.execPath, ['--import', preload, ...args], {
        cwd: directory,
        env,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });

      return { status: 0, stdout: output.stdout, stderr: output.stderr };
    } catch (error) {
      const failure = Schema.decodeUnknownSync(
        Schema.Struct({ stdout: Schema.String, stderr: Schema.String }),
      )(error);

      return { status: 1, ...failure };
    }
  };

  const finalize = async (runId = verified.runId) => {
    const identity = (await retainedIdentity(runner.state, 'pr-27'))!.identity;

    const publicIdentity = {
      incarnation: identity.incarnation,
      builtCommit: identity.builtCommit,
      prHeadSha: identity.prHeadSha,
    };

    await runner.run({
      operation: 'retire',
      authority: {
        number: 27,
        runId,
        runAttempt: verified.runAttempt,
        shouldRetire: async () => {
          const result = await child([
            '--input-type=module',
            '-e',
            `import {controllerRetirement} from ${JSON.stringify(resolve('scripts/preview-controller.ts'))}; const authority=await controllerRetirement(process.env); console.log(JSON.stringify({retire:await authority.shouldRetire(${JSON.stringify(publicIdentity)})}));`,
          ]);

          if (result.status !== 0) throw new Error(`Finalizer could not confirm authority: ${result.stderr}`);

          return Schema.decodeUnknownSync(Schema.Struct({ retire: Schema.Boolean }))(
            JSON.parse(result.stdout),
          ).retire;
        },
      },
    });
  };

  return {
    runner,
    publication,
    env,
    directory,
    resetProof,
    finalize,
    set mode(value: FailureMode) {
      mode = value;
    },
    get githubReads() {
      return githubReads;
    },
    get commentCalls() {
      return commentCalls;
    },
    publish: () => child([resolve('scripts/preview-controller.ts'), 'publish']),
    smoke: () => child([resolve('scripts/verify-preview.mjs'), lifecycleTargetOrigin]),
    failure: () => readFile(resolve(directory, '.agent-game/preview-failure.json'), 'utf8'),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await new Promise<void>((done) => server.close(() => done()));
      await runner.dispose();
    },
  };
}
