import { mkdtemp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

const config = 'tests/api/wrangler.jsonc';

const persistence = process.env.PERSIST_TO ?? (await mkdtemp('/tmp/opencode/agent-game-api-'));

const port = process.env.PORT ?? '8891';

const cli = 'node_modules/wrangler/bin/wrangler.js';

const migration = spawnSync(
  process.execPath,
  [
    cli,
    'd1',
    'migrations',
    'apply',
    'agent-game-api',
    '--config',
    config,
    '--local',
    '--persist-to',
    persistence,
  ],
  { stdio: 'inherit' },
);

if (migration.status !== 0) process.exit(migration.status ?? 1);

const child = spawn(
  process.execPath,
  [
    cli,
    'dev',
    '--config',
    config,
    '--local',
    '--port',
    port,
    '--inspector-port',
    '0',
    '--persist-to',
    persistence,
    '--var',
    `APP_URL:http://127.0.0.1:${port}`,
    '--var',
    `TIME_SCALE:${process.env.TIME_SCALE ?? '0.02'}`,
    '--var',
    `API_HOUSE_DELIVERY_DELAY_MS:${process.env.API_HOUSE_DELIVERY_DELAY_MS ?? '0'}`,
    '--var',
    `API_RECOVERY_CLOCK:${process.env.API_RECOVERY_CLOCK ?? 'false'}`,
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => process.exit(code ?? 0));
