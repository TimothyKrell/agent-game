import { mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

await mkdir('.tim28/runs/browser', { recursive: true });

const migration = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'tim28',
    '--local',
    '--config',
    '.tim28/wrangler.jsonc',
    '--persist-to',
    '.tim28/runs/browser',
  ],
  { stdio: 'inherit' },
);

if (migration.status !== 0) process.exit(migration.status ?? 1);

const child = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--local',
    '--config',
    '.tim28/wrangler.jsonc',
    '--port',
    '8828',
    '--inspector-port',
    '9228',
    '--persist-to',
    '.tim28/runs/browser',
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => process.exit(code ?? 0));
