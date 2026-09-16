import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { localEgress } from './local-egress.mjs';

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: process.env.HOUSE_PROVIDER ?? 'preview' },
    model: { type: 'string', default: process.env.HOUSE_MODEL },
    persist: { type: 'string', default: '.agent-game/finale-production' },
    'time-scale': { type: 'string' },
  },
});

if (!['preview', 'openai', 'workers-ai'].includes(values.provider))
  throw new Error('Unknown house provider.');

const directory = resolve(values.persist);

const origin = 'http://127.0.0.1:8797';

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

const { unstable_startWorker } = await import('wrangler');

const worker = await unstable_startWorker({
  config: resolve('wrangler.jsonc'),
  bindings: Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, { type: 'plain_text', value }]),
  ),
  dev: {
    server: { hostname: '127.0.0.1', port: 8797 },
    inspector: { port: 9297 },
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
