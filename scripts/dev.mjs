import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { localEgress } from '../dev/coding-finale/local-egress.mjs';

const test = process.argv.includes('--test');

const port = Number(process.env.PORT ?? (test ? 8791 : 8790));

let variables = await readFile('.dev.vars', 'utf8').catch(() => '');

if (!/^BETTER_AUTH_SECRET=.{32,}$/m.test(variables)) {
  variables =
    variables.replace(/^BETTER_AUTH_SECRET=.*\n?/m, '') +
    `\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\n`;
  await writeFile('.dev.vars', variables, { mode: 0o600 });
}

const persistence =
  process.env.PERSIST_TO ?? (test ? await mkdtemp('/tmp/opencode/agent-game-test-') : '.wrangler/state');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build']);

run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'agent-game', '--local', '--persist-to', persistence]);

const egress = await localEgress(resolve('.agent-game/finale-egress'));

const child = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    ...(process.env.HOUSE_PROVIDER === 'workers-ai' ? [] : ['--local']),
    '--port',
    String(port),
    '--inspector-port',
    String(port + 400),
    '--persist-to',
    persistence,
    '--var',
    `APP_URL:http://127.0.0.1:${port}`,
    '--var',
    `TIME_SCALE:${process.env.TIME_SCALE ?? (test ? '0.02' : '1')}`,
    ...[
      'HOUSE_PROVIDER',
      'HOUSE_MODEL',
      'MAX_CONCURRENT_MATCHES',
      'HOUSE_MATCH_RESERVATION_USD',
      'HOUSE_CODING_MATCH_RESERVATION_USD',
      'CODING_MAX_CONCURRENT_MATCHES',
      'HOUSE_DAILY_BUDGET_USD',
    ].flatMap((key) => (process.env[key] ? ['--var', `${key}:${process.env[key]}`] : [])),
  ],
  { stdio: 'inherit', env: { ...process.env, ...egress } },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => process.exit(code ?? 0));
