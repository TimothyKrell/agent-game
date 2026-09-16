import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';

async function fixtureReady(url: string) {
  return fetch(`${url}/__fixture/legacy-health`)
    .then(async (response) => response.ok && (await response.text()) === '{"historicalAdmission":true}')
    .catch(() => false);
}

export default async function setup() {
  const url = process.env.TEST_URL ?? 'http://127.0.0.1:8891';

  if (await fixtureReady(url)) return;

  if (process.env.TEST_URL) throw new Error(`Test server unavailable: ${url}`);
  await mkdir('/tmp/opencode', { recursive: true });
  const log = await open('/tmp/opencode/agent-game-api-server.log', 'w');

  const child = spawn(process.execPath, ['tests/api/serve.mjs'], {
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: process.env,
  });

  const stop = () => {
    if (child.pid)
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
  };

  for (let i = 0; i < 120; i++) {
    if (await fixtureReady(url))
      return async () => {
        stop();
        await log.close();
      };

    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  stop();
  await log.close();
  throw new Error('Test Worker did not start. See /tmp/opencode/agent-game-api-server.log');
}
