import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Schema } from 'effect';
import { localEgress } from './local-egress.mjs';

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: process.env.HOUSE_PROVIDER ?? 'preview' },
    model: { type: 'string', default: process.env.HOUSE_MODEL },
    persist: { type: 'string', default: '.agent-game/finale-production' },
    'time-scale': { type: 'string' },
    port: { type: 'string', default: '8797' },
    'inspector-port': { type: 'string', default: '9297' },
  },
});

if (!['preview', 'openai', 'workers-ai'].includes(values.provider))
  throw new Error('Unknown house provider.');

const directory = resolve(values.persist);

const port = Number(values.port);

const inspectorPort = Number(values['inspector-port']);

for (const value of [port, inspectorPort]) {
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error('Ports must be integers between 1 and 65535.');
}

const origin = `http://127.0.0.1:${port}`;

const models = {
  preview: 'integration-scripted',
  openai: 'gpt-4.1-mini',
  'workers-ai': '@cf/zai-org/glm-4.7-flash',
};

const model = values.model ?? models[values.provider];

const vars = {
  ENVIRONMENT: 'development',
  APP_URL: origin,
  PREVIEW_SOURCE_URL: '',
  HOUSE_PROVIDER: values.provider,
  HOUSE_MODEL: model,
  TIME_SCALE: values['time-scale'] ?? (values.provider === 'preview' ? '0.05' : '1'),
  QUEUE_WAIT_SECONDS: '30',
  MAX_CONCURRENT_MATCHES: '1',
  CODING_MAX_CONCURRENT_MATCHES: '1',
  HOUSE_DAILY_BUDGET_USD: '2.5',
  HOUSE_MATCH_RESERVATION_USD: '2.5',
  HOUSE_CODING_MATCH_RESERVATION_USD: '2.5',
};

await mkdir(directory, { recursive: true, mode: 0o700 });

const egress = await localEgress(directory);

const env = { ...process.env, ...egress, WRANGLER_SEND_METRICS: 'false' };

const migration = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'migrations',
    'apply',
    'agent-game',
    '--config',
    'wrangler.jsonc',
    '--local',
    '--persist-to',
    directory,
  ],
  { stdio: 'inherit', env },
);

const [migrationCode] = await once(migration, 'exit');

if (migrationCode !== 0) throw new Error('Could not migrate the isolated production-path database.');

await writeFile(
  `${directory}/connection.json`,
  JSON.stringify({ origin, provider: values.provider, model, directory }),
  { mode: 0o600 },
);

console.log(`Production-path Coding Finale: ${origin} (${values.provider}, ${model})`);

console.log(`Persistence: ${directory}. No match is created automatically.`);

// The CLI has no supported --no-watch switch. Use Wrangler's direct dev API,
// whose dev.watch flag also disables configuration and asset file watchers.
// This prevents a UI build from aborting paid inference mid-match.
Object.assign(process.env, egress, { WRANGLER_SEND_METRICS: 'false' });

const { unstable_startWorker, unstable_getVarsForDev } = await import('wrangler');

const configuredSecret =
  process.env.BETTER_AUTH_SECRET ??
  unstable_getVarsForDev(resolve('wrangler.jsonc'), undefined, {}, undefined, true).BETTER_AUTH_SECRET;

let authSecret = configuredSecret;

if (authSecret === undefined) {
  const secretPath = `${directory}/dev-auth-secret`;

  try {
    await writeFile(secretPath, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  await chmod(secretPath, 0o600);
  authSecret = await readFile(secretPath, 'utf8');
}

if (!Schema.is(Schema.String.check(Schema.isMinLength(32)))(authSecret))
  throw new Error('Development authentication requires a secret of at least 32 characters.');

const worker = await unstable_startWorker({
  config: resolve('wrangler.jsonc'),
  bindings: {
    ...Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, { type: 'plain_text', value }])),
    BETTER_AUTH_SECRET: { type: 'secret_text', value: authSecret },
  },
  dev: {
    server: { hostname: '127.0.0.1', port },
    inspector: { port: inspectorPort },
    persist: directory,
    remote: values.provider === 'workers-ai' ? undefined : false,
    watch: false,
    enableContainers: true,
    containerBuildId: randomBytes(4).toString('hex'),
    dockerPath: egress.WRANGLER_DOCKER_BIN,
    logLevel: 'info',
  },
});

await worker.ready;

const ready = await worker.fetch(new URL('/api/games', origin));

if (!ready.ok) throw new Error('The production-path Worker did not become ready.');

if (worker.config.dev.watch !== false) throw new Error('Evaluation file watching must be disabled.');

worker.raw.on('reloadComplete', () => {
  console.log(JSON.stringify({ event: 'production-runtime-reload', at: Date.now() }));
});

console.log(`Ready on ${await worker.url}; file watching disabled.`);

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void worker.dispose());

await once(worker.raw, 'teardown');
