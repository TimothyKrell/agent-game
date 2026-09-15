import { spawn, spawnSync } from 'node:child_process';

const config = ['--config', '.tim29/worker-wrangler.jsonc'];

const persistence = ['--persist-to', '.tim29/runs/worker'];

const migrations = spawnSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'apply', 'tim29', '--local', ...config, ...persistence],
  { stdio: 'inherit' },
);

if (migrations.status !== 0) process.exit(migrations.status ?? 1);

const worker = spawn(
  'npx',
  ['wrangler', 'dev', '--local', ...config, ...persistence, '--port', '6372', '--inspector-port', '6373'],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => worker.kill(signal));

worker.on('exit', (code) => process.exit(code ?? 0));
