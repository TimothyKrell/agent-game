import { mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

await mkdir('test-results/agent-pictures/browser', { recursive: true });

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
    'tests/fixtures/agent-pictures/wrangler.jsonc',
    '--persist-to',
    'test-results/agent-pictures/browser',
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
    'tests/fixtures/agent-pictures/wrangler.jsonc',
    '--port',
    '8828',
    '--inspector-port',
    '9228',
    '--persist-to',
    'test-results/agent-pictures/browser',
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => process.exit(code ?? 0));
