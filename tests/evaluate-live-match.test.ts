import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { Schema } from 'effect';
import { afterEach, expect, it } from 'vitest';

const directories: string[] = [];

const model = '@cf/qwen/qwen3-30b-a3b-fp8';

const script = new URL('../scripts/evaluate-live-match.mjs', import.meta.url).pathname;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function evaluate(
  houseModel: { model: string; provider?: string; policyVersion?: string },
  requestedModel?: string,
) {
  const directory = await mkdtemp('/tmp/opencode/live-evaluation-test-');
  directories.push(directory);
  await mkdir(`${directory}/docs/evaluation`, { recursive: true });
  let replayRequests = 0;

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');

    if (request.url === '/api/dev/exhibition') response.end(JSON.stringify({ matchId: 'match_test' }));
    else if (request.url === '/api/dev/evaluation/match_test')
      response.end(JSON.stringify({ houseModel, accountedUsd: 0.01, calls: 1 }));
    else if (request.url === '/api/matches/match_test') {
      replayRequests++;
      response.end(JSON.stringify({ status: 'finished', events: [], round: 1 }));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());

  const env = {
    ...process.env,
    LIVE_EVALUATION_URL: `http://127.0.0.1:${address.port}`,
    HOUSE_MODEL: requestedModel ?? '',
    LIVE_EVALUATION_RESERVATION_USD: '2',
  };

  let error = '';

  try {
    await promisify(execFile)(process.execPath, [script], { cwd: directory, env });
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const files = await readdir(`${directory}/docs/evaluation`);
  expect(files).toHaveLength(1);

  return {
    error,
    replayRequests,
    artifact: JSON.parse(await readFile(`${directory}/docs/evaluation/${files[0]}`, 'utf8')),
  };
}

it('records the server model and policy version when HOUSE_MODEL is omitted', async () => {
  const result = await evaluate({ provider: 'workers-ai', model, policyVersion: 'house-5' });
  expect(result.error).toBe('');
  expect(result.artifact).toMatchObject({
    model,
    provider: 'workers-ai',
    policyVersion: 'house-5',
    status: 'finished',
  });
});

it('rejects mismatched HOUSE_MODEL and retains evidence and the full reservation', async () => {
  const requested = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const result = await evaluate({ provider: 'workers-ai', model, policyVersion: 'house-4' }, requested);
  expect(result.error).toContain(`Requested HOUSE_MODEL ${requested}`);
  expect(result.error).toContain(`uses ${model}`);
  expect(result.replayRequests).toBe(0);
  expect(result.artifact).toMatchObject({
    status: 'model-verification-failed',
    requestedModel: requested,
    houseModel: { model },
    matchId: 'match_test',
    accountedUsd: 2,
  });
  expect(result.artifact.model).toBeUndefined();
});

it('fails without inventing a model label when server evidence is malformed', async () => {
  const result = await evaluate({ model });
  expect(result.error).toContain('did not provide a persisted house-model configuration');
  expect(result.replayRequests).toBe(0);
  expect(result.artifact.accountedUsd).toBe(2);
  expect(result.artifact.model).toBeUndefined();
});
