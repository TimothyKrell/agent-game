import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localEgress } from './local-egress.mjs';

const directory = resolve('.agent-game/finale-lab');

const variables = resolve('dev/coding-finale/.dev.vars');

let token;

try {
  const existing = await readFile(variables, 'utf8');
  token = /^LAB_TOKEN=([A-Za-z0-9_-]{43})$/m.exec(existing)?.[1];

  if (!token)
    throw new Error(`Expected a generated LAB_TOKEN in ${variables}; preserve and review that file.`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  token = randomBytes(32).toString('base64url');
  await writeFile(variables, `# Generated local lab credential.\nLAB_TOKEN=${token}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
}

await mkdir(directory, { recursive: true, mode: 0o700 });

const egress = await localEgress(directory);

await writeFile(`${directory}/operator.json`, JSON.stringify({ origin: 'http://127.0.0.1:8788', token }), {
  mode: 0o600,
});

console.log('Coding finale lab: http://127.0.0.1:8788');

console.log('Create a race in another terminal: node dev/coding-finale/client.mjs start');

const child = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'dev/coding-finale/wrangler.jsonc',
    '--ip',
    '127.0.0.1',
    '--port',
    '8788',
    '--inspector-port',
    '9288',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      ...egress,
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
