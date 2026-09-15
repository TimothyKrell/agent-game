import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { AgentProfileSchema } from '../src/shared/api';
import { version } from '../package.json';
import { picturePort, png } from '../.tim30/picture-fixture';

const run = promisify(execFile);

it('pairs the installed CLI with the real TIM-28 Worker and uploads PNG/JPEG, fetches actual bytes, and removes the picture', async () => {
  const directory = await mkdtemp('/tmp/opencode/tim30-worker-');
  let worker: Awaited<ReturnType<typeof unstable_dev>> | undefined;

  try {
    await run('npx', [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'tim28',
      '--local',
      '--config',
      '.tim28/wrangler.jsonc',
      '--persist-to',
      `${directory}/storage`,
    ]);
    await run(process.execPath, ['scripts/package-cli.mjs']);
    await run('npm', [
      'install',
      '--prefix',
      directory,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      resolve(`public/downloads/agent-game-cli-${version}.tgz`),
    ]);
    worker = await unstable_dev('.tim28/worker.ts', {
      config: '.tim28/wrangler.jsonc',
      local: true,
      persist: true,
      persistTo: `${directory}/storage`,
      port: picturePort + 2,
      inspectorPort: 0,
      logLevel: 'error',
      experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
    });
    const origin = `http://${worker.address}:${worker.port}`;
    const env = { ...process.env, HOME: directory, XDG_CONFIG_HOME: `${directory}/config` };
    const bin = `${directory}/node_modules/.bin/agent-game`;
    const config = `${directory}/connection.json`;

    const cli = async (...args: string[]) =>
      JSON.parse(
        (await run(process.execPath, [bin, ...args, '--config', config], { cwd: directory, env })).stdout,
      );

    const browser = (path: string, body: Record<string, string>, cookie = '') =>
      fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { cookie, origin: 'http://127.0.0.1:8828', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const login = await browser('/api/dev/login', { name: 'TIM-30 local owner' });
    expect(login.status).toBe(200);

    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    const created = await browser('/api/owner/agents', { name: 'TIM-30 competitor' }, cookie);
    const agent = Schema.decodeUnknownSync(AgentProfileSchema)(await created.json());
    await cli('setup', '--harness', 'opencode', '--server', origin, '--game', 'succession');
    const pending = await cli('connect');

    const approval = await browser(
      '/api/owner/pairing/approve',
      { code: pending.code, agentId: agent.id },
      cookie,
    );

    expect(approval.status).toBe(200);
    expect(await cli('connect')).toMatchObject({
      status: 'ready',
      agentId: agent.id,
      picture: { state: 'missing', revision: 0, askOwner: true },
    });
    const file = `${directory}/owner.png`;
    await writeFile(file, png);
    const uploaded = await cli('picture-upload', '--file', file, '--request-id', 'worker-owner-0001');
    expect(uploaded).toMatchObject({
      status: 'received',
      picture: { state: 'present', contentType: 'image/png', bytes: png.length },
    });
    const binary = await fetch(`${origin}${uploaded.picture.url}`);
    expect(Buffer.from(await binary.arrayBuffer())).toEqual(png);
    const jpeg = await readFile('.tim28/fixture.jpg');
    const toolFile = `${directory}/external-tool-local.jpeg`;
    await writeFile(toolFile, jpeg);
    const replaced = await cli('picture-upload', '--file', toolFile, '--request-id', 'worker-tool-0002');
    expect(replaced).toMatchObject({
      status: 'received',
      picture: { revision: 2, contentType: 'image/jpeg', width: 8, height: 8, bytes: jpeg.length },
    });
    expect(await cli('picture-retry', '--request-id', 'worker-owner-0001')).toMatchObject({
      receipt: { revision: 1 },
      picture: { revision: 2 },
    });
    expect((await fetch(`${origin}${uploaded.picture.url}`)).status).toBe(404);
    expect(await cli('picture-remove')).toMatchObject({
      status: 'received',
      picture: { state: 'missing', revision: 3 },
    });
    expect(await cli('connect')).toMatchObject({
      status: 'ready',
      picture: { state: 'missing', askOwner: false },
    });
    const listing = await cli('connections', '--harness', 'opencode');
    expect(listing.connections[0]).toMatchObject({ agentId: agent.id, server: origin });
  } finally {
    await worker?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
