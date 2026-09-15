import { spawn, spawnSync } from 'node:child_process';

const config = ['--config', 'tests/fixtures/agent-summaries/summary-wrangler.jsonc'];

const persistence = ['--persist-to', 'test-results/agent-summaries/summaries'];

const migrations = spawnSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'apply', 'tim29-summaries', '--local', ...config, ...persistence],
  { stdio: 'inherit' },
);

if (migrations.status !== 0) process.exit(migrations.status ?? 1);

const child = spawn(
  'npx',
  ['wrangler', 'dev', '--local', ...config, ...persistence, '--port', '6372', '--inspector-port', '6373'],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => process.exit(code ?? 0));
