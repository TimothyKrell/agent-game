import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { expect } from 'vitest';
import { artifacts, hash } from '../.tim27-cli/artifacts';

const run = promisify(execFile);

export const evidence = resolve(
  process.env.TIM27_PLAYABLE_EVIDENCE_DIR ?? `.tim27-playable/runs/run-${randomUUID()}`,
);

export const base = Number(process.env.TIM27_PLAYABLE_PORT_BASE ?? 6431);

if (!Number.isInteger(base) || base < 1 || base > 65532)
  throw new Error('Invalid playable fixture port range');

export const source = `http://127.0.0.1:${base}`;

export const target = `http://127.0.0.1:${base + 1}`;

export const saved = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

export const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export const providerCalls: {
  at: number;
  task: string;
  phase: string;
  choice: number;
  input: number;
  output: number;
  usage: boolean;
  finished: boolean;
}[] = [];

export const providerMode = { delay: 0, missingUsage: false, hold: false };

export const captures: object[] = [];

export let directory: string;

export let bin: string;

export let upstream: string;

export let commit: string;

export let incarnation = 'playable-incarnation-1';

export let archive: Buffer;

let providerUrl: string;

let cookie: string;

let agentId: string;

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const workers: (Awaited<ReturnType<typeof unstable_dev>> | undefined)[] = [];

const nativeProcesses: ChildProcess[] = [];

const provider = createServer((request, response) => {
  void (async () => {
    expect(request.url).toBe('/v1/responses');
    expect(request.headers.authorization).toBe('Bearer playable-local-fake-key');
    let raw = '';

    for await (const part of request) raw += part;
    const body = JSON.parse(raw);
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.max_output_tokens).toBe(512);

    const input = JSON.parse(
      body.input.find((item: { role: string }) => item.role === 'user').content[0].text,
    );

    const row = {
      at: Date.now(),
      task: input.task,
      phase: input.phase,
      choice: input.task === 'chat' ? -1 : 0,
      input: 100,
      output: 20,
      usage: !providerMode.missingUsage,
      finished: false,
    };

    providerCalls.push(row);

    if (providerMode.delay) await pause(providerMode.delay);

    while (providerMode.hold && !response.destroyed) await pause(20);

    if (response.destroyed) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: `resp_${randomUUID()}`,
        object: 'response',
        model: body.model,
        created_at: Math.floor(Date.now() / 1000),
        output: [
          {
            id: 'msg_playable',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                annotations: [],
                text: JSON.stringify({
                  choice: row.choice,
                  message: null,
                  notes: 'Deterministic local provider fixture',
                }),
              },
            ],
          },
        ],
        usage: row.usage
          ? {
              input_tokens: row.input,
              output_tokens: row.output,
              total_tokens: row.input + row.output,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            }
          : undefined,
      }),
    );
    row.finished = true;
  })().catch((error) => {
    response.writeHead(500);
    response.end(String(error));
  });
});

type FixtureInput = Schema.Json | Awaited<ReturnType<typeof artifacts>>['manifest'];

export async function post(origin: string, path: string, body: FixtureInput, owner = false) {
  const headers = new Headers({ 'content-type': 'application/json', origin });

  if (owner) headers.set('cookie', cookie);
  const response = await fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body) });
  expect(response.ok, `${path}: ${await response.clone().text()}`).toBe(true);

  return response;
}

const Rows = Schema.Array(
  Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Null])),
);

export async function query(
  origin: string,
  sql: string,
  values: (string | number | null)[] = [],
  coordinator = false,
) {
  return Schema.decodeUnknownSync(Rows)(
    await (await post(origin, coordinator ? '/fixture/coordinator' : '/fixture/db', { sql, values })).json(),
  );
}

export async function matchQuery(matchId: string, sql: string, values: (string | number | null)[] = []) {
  return Schema.decodeUnknownSync(Rows)(
    await (await post(target, '/fixture/match', { matchId, sql, values })).json(),
  );
}

export async function waitFor(check: () => Promise<boolean>, timeout = 10000) {
  const until = Date.now() + timeout;

  while (Date.now() < until) {
    if (await check()) return;
    await pause(100);
  }

  throw new Error('Timed out waiting for actual playable boundary');
}

export function cli(config: string, args: string[], extra: Partial<NodeJS.ProcessEnv> = {}) {
  const command = run(process.execPath, [bin, ...args, '--config', config], {
    cwd: directory,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      HOME: directory,
      XDG_CONFIG_HOME: `${directory}/config`,
      CLAUDE_CONFIG_DIR: `${directory}/claude`,
      ...extra,
    },
  });

  if (args[0] === 'play') nativeProcesses.push(command.child);

  return command.then((output) => JSON.parse(output.stdout));
}

export async function startWorker(index: number) {
  const origin = index ? target : source;
  workers[index] = await unstable_dev('.tim27-playable/worker.ts', {
    config: '.tim27-playable/wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: `${directory}/storage-${index}`,
    port: base + index,
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      APP_URL: origin,
      PREVIEW_SOURCE_URL: index ? source : '',
      BETTER_AUTH_SECRET: `playable-fixture-${index}-at-least-32-characters`,
      HOUSE_PROVIDER: index ? 'preview' : 'openai',
      HOUSE_MODEL: index ? 'scripted' : 'gpt-4.1-mini',
      OPENAI_BASE_URL: index ? '' : providerUrl,
      OPENAI_API_KEY: index ? '' : 'playable-local-fake-key',
      TIME_SCALE: index ? '0.1' : '1',
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}

export async function restartTarget() {
  await workers[1]?.stop();
  await startWorker(1);
}

export async function accelerateQueued(config: string) {
  const joined = await cli(config, ['start']);
  expect(joined.status).toBe('queued');
  const state = await saved(config);
  // Explicit virtual queue age for fault interleavings only; normal native cases never call this.
  await query(
    target,
    'UPDATE tickets SET joined_at=? WHERE agent_id=?',
    [Date.now() - 31000, state.agentId],
    true,
  );
  await post(target, '/fixture/queue-alarm', {});

  return state;
}

export async function targetIntent(requestId: string) {
  const rows = await query(
    target,
    "SELECT * FROM preview_target_allocations WHERE json_extract(intent,'$.tickets[0].queueRequestId')=?",
    [requestId],
    true,
  );

  expect(rows.length).toBeLessThanOrEqual(1);

  return rows[0];
}

export async function events(path: string) {
  try {
    return (await readFile(path, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function publish(revision = commit, marker = 'PLAYABLE_BRANCH_A', epoch = incarnation) {
  commit = revision;
  incarnation = epoch;
  await post(source, '/fixture/register', {
    origin: target,
    incarnation,
    commit,
    publicKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  });
  await post(target, '/fixture/configure', {
    incarnation,
    commit,
    privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  });
  await post(target, '/fixture/broker-config', { enabled: true, revision: commit });

  const bundle = await artifacts(source, target, incarnation, commit, archive, marker, [
    {
      path: 'package/cli/untrusted.mjs',
      content: Buffer.from('throw new Error("Target executable must never run");'),
    },
  ]);

  const response = await fetch(
    `${target}/fixture/archive?path=${new URL(bundle.manifest.games[0].archive.url).pathname}`,
    { method: 'POST', body: new Uint8Array(bundle.tar) },
  );

  expect(response.ok).toBe(true);
  await post(source, '/fixture/manifest', bundle.manifest);
}

export async function connection(harness: 'opencode' | 'claude', game: 'secret-overlord' | 'succession') {
  const config = `${directory}/${harness}-${randomUUID()}-source.json`;
  await cli(config, ['setup', '--harness', harness, '--server', source]);
  const pair = await cli(config, ['connect']);
  await post(source, '/api/owner/pairing/approve', { code: pair.code, agentId }, true);
  await cli(config, ['connect']);
  const sourceBytes = await readFile(config);
  const label = randomUUID();

  const selected = await cli(config, [
    'preview-select',
    '--server',
    target,
    '--game',
    game,
    '--renew',
    label,
  ]);

  expect(await readFile(config)).toEqual(sourceBytes);

  return { config, label, selected, sourceBytes, state: await saved(selected.configPath) };
}

export async function native(config: string, harness: 'opencode' | 'claude', name: string, mode = 'play') {
  const nativeDir = `${directory}/native-${name}`;
  await mkdir(nativeDir);
  await writeFile(
    `${nativeDir}/${harness === 'opencode' ? 'opencode2' : 'claude'}`,
    `#!${process.execPath}\n${await readFile('.tim27-playable/native.cjs', 'utf8')}`,
    { mode: 0o700 },
  );
  const log = `${evidence}/${name}.jsonl`;

  const promise = cli(config, ['play', '--harness', harness, '--runtime', '6', '--child-slice', '5'], {
    PATH: `${nativeDir}:${process.env.PATH}`,
    PLAYABLE_NATIVE_LOG: log,
    PLAYABLE_TARGET_CONFIG: config,
    PLAYABLE_NATIVE_MODE: mode,
  });

  // Attach rejection immediately while the test independently drives explicit logical windows.
  const result = promise.then(
    (value) => ({ value, error: null }),
    (error: Error) => ({ value: null, error: error.message }),
  );

  return { log, result };
}

export async function initialize() {
  await mkdir(evidence, { recursive: true });
  expect(
    (await readdir(evidence)).filter((name) => /\.(json|jsonl)$/.test(name)),
    'Use a fresh evidence directory',
  ).toEqual([]);
  directory = await mkdtemp('/tmp/opencode/tim27-playable-');
  upstream = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
  commit = upstream;
  await new Promise<void>((done) => provider.listen(base + 3, '127.0.0.1', done));
  providerUrl = `http://127.0.0.1:${base + 3}/v1`;
  await run(process.execPath, ['scripts/package-cli.mjs']);
  archive = await readFile('public/downloads/agent-game-cli-0.3.0.tgz');
  await run('npm', [
    'install',
    '--prefix',
    directory,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve('public/downloads/agent-game-cli-0.3.0.tgz'),
  ]);
  bin = `${directory}/node_modules/agent-game-cli/cli/agent-game.mjs`;

  for (let index = 0; index < 2; index++) {
    await run(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'migrations',
      'apply',
      'playable-test',
      '--config',
      '.tim27-playable/wrangler.jsonc',
      '--env-file',
      '/dev/null',
      '--local',
      '--persist-to',
      `${directory}/storage-${index}`,
    ]);
    await startWorker(index);
  }

  await post(source, '/fixture/broker-config', { enabled: true, revision: upstream });
  expect(
    (
      await fetch(`${source}/fixture/archive?path=/downloads/agent-game-cli-0.3.0.tgz`, {
        method: 'POST',
        body: new Uint8Array(archive),
      })
    ).ok,
  ).toBe(true);
  await publish();
  const login = await post(source, '/api/dev/login', { name: 'Playable local owner' });
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  agentId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
    await (await post(source, '/api/owner/agents', { name: 'Stable playable competitor' }, true)).json(),
  ).id;
}

export async function shutdown() {
  providerMode.hold = false;

  for (const child of nativeProcesses) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise<void>((done) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('close', () => {
        clearTimeout(timer);
        done();
      });
    });
  }

  await Promise.all(workers.map((worker) => worker?.stop()));
  provider.closeAllConnections();
  await new Promise<void>((done) => provider.close(() => done()));
  await writeFile(
    `${evidence}/results.json`,
    JSON.stringify(
      {
        upstream,
        sourceArchiveSha256: archive && hash(archive),
        fixtureDirectory: directory,
        providerUrl,
        providerCalls,
        captures,
        paidCalls: 0,
      },
      null,
      2,
    ) + '\n',
  );
}
