import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { ObservationSchema, QueueStatusSchema } from '../src/shared/api';
import { Observation2Schema, HistoryPage2Schema } from '../src/shared/succession';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { previewAction } from '../src/game/preview';
import { version } from '../package.json';

const run = promisify(execFile);

const View = Schema.Union([ObservationSchema, Observation2Schema]);

const Receipt = Schema.Struct({ accepted: Schema.Literal(true), actionId: Schema.String, observation: View });

const Controllers = Schema.Array(
  Schema.Struct({
    agentId: Schema.String,
    ownerId: Schema.String,
    grantId: Schema.String,
    token: Schema.String,
    expiresAt: Schema.Number,
  }),
);

let worker: Awaited<ReturnType<typeof unstable_dev>>;

let directory: string;

let bin: string;

let oldBin: string;

beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/installed-cli-worker-');
  await run('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'succession-worker-test',
    '--config',
    'tests/succession-worker.wrangler.jsonc',
    '--local',
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
  await run('npm', [
    'install',
    '--prefix',
    `${directory}/legacy`,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve('public/downloads/agent-game-cli-0.1.1.tgz'),
  ]);
  bin = `${directory}/node_modules/.bin/agent-game`;
  oldBin = `${directory}/legacy/node_modules/.bin/agent-game`;
  worker = await unstable_dev('tests/fixtures/succession-worker.ts', {
    config: 'tests/succession-worker.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: `${directory}/storage`,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}, 60000);

afterAll(async () => {
  await worker?.stop();

  if (directory) await rm(directory, { recursive: true, force: true });
});

it('installs outside checkout, finishes both games against the real Worker, pages its archive, and rejects a same-installation downgrade', async () => {
  const response = await worker.fetch('/__fixture/controllers?count=1');
  const [controller] = Schema.decodeUnknownSync(Controllers)(await response.json());
  const config = `${directory}/connection.json`;
  const server = `http://${worker.address}:${worker.port}`;
  const env = { ...process.env, HOME: directory, XDG_CONFIG_HOME: `${directory}/config` };

  const cli = async (...args: string[]) =>
    (await run(process.execPath, [bin, ...args, '--config', config], { cwd: directory, env })).stdout;

  await cli('setup', '--server', server, '--harness', 'opencode', '--game', 'succession');
  const saved = JSON.parse(await readFile(config, 'utf8'));
  await writeFile(
    config,
    JSON.stringify({
      ...saved,
      token: controller.token,
      agentId: controller.agentId,
      agentName: 'Installed competitor',
    }),
  );
  const matches: string[] = [];

  for (const gameId of ['succession', 'secret-overlord']) {
    const joined = Schema.decodeUnknownSync(QueueStatusSchema)(
      JSON.parse(await cli('join', '--game', gameId)),
    );

    expect(joined.gameId).toBe(gameId);
    expect((await worker.fetch('/__fixture/fill')).ok).toBe(true);
    let queue = Schema.decodeUnknownSync(QueueStatusSchema)(JSON.parse(await cli('status')));
    const allocationDeadline = Date.now() + 10000;

    while (!queue.matchId && Date.now() < allocationDeadline) {
      await sleep(30);
      queue = Schema.decodeUnknownSync(QueueStatusSchema)(JSON.parse(await cli('status')));
    }

    expect(queue.matchId).toBeTruthy();
    const matchId = queue.matchId!;
    matches.push(matchId);

    if (gameId === 'succession') {
      for (const command of ['status', 'observe'])
        await expect(
          run(process.execPath, [oldBin, command, '--config', config], { cwd: directory, env }),
        ).rejects.toMatchObject({ stdout: expect.stringContaining('protocol-upgrade-required') });
    }

    let view = Schema.decodeUnknownSync(View)(JSON.parse(await cli('observe')));
    const acts = new Set<number>();
    const deadline = Date.now() + 180000;
    let choices = 0;

    while (view.status === 'active' && Date.now() < deadline) {
      if (view.protocolVersion === '2') acts.add(view.act);

      if (view.decision) {
        const action =
          view.protocolVersion === '2' ? previewSuccessionAction(view, () => 0) : previewAction(view);

        const choice = view.decision.actions.findIndex(
          (entry) => JSON.stringify(entry.action) === JSON.stringify(action),
        );

        expect(choice).toBeGreaterThanOrEqual(0);

        const receipt = Schema.decodeUnknownSync(Receipt)(
          JSON.parse(await cli('act', '--choice', String(choice))),
        );

        view = receipt.observation;
        choices++;
      } else if (view.phase.kind.includes('discussion')) {
        const clock = await worker.fetch(
          `/__fixture/matches/${matchId}/clock?kind=discussion&phaseId=${encodeURIComponent(view.phase.id)}`,
        );

        expect(clock.ok).toBe(true);
        view = Schema.decodeUnknownSync(View)(JSON.parse(await cli('observe')));
      } else {
        view = Schema.decodeUnknownSync(View)(JSON.parse(await cli('wait', '--timeout', '1')));
      }
    }

    expect(view.status).toBe('finished');
    expect(view.you?.forfeited).toBe(false);
    expect(choices).toBeGreaterThan(0);

    if (view.protocolVersion === '2') {
      acts.add(view.act);
      expect(acts).toEqual(new Set([1, 2]));
      expect(view.result?.kind).toBe('individual');
      const epoch = view.history.visibilityEpoch;
      const through = view.history.streamHead;
      let cursor = 0;
      const historyActs = new Set<number>();
      const keys = new Set<string>();

      do {
        const raw = await cli(
          'history',
          '--epoch',
          epoch,
          '--after',
          String(cursor),
          '--through',
          String(through),
          '--limit',
          '64',
          '--max-bytes',
          '12288',
        );

        expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(12289);
        const page = Schema.decodeUnknownSync(HistoryPage2Schema)(JSON.parse(raw));
        expect(page.reset).toBe(false);
        expect(page.after).toBe(cursor);

        for (const event of page.events) {
          expect(event.id).toBe(++cursor);
          expect(keys.has(event.eventKey)).toBe(false);
          keys.add(event.eventKey);
          historyActs.add(event.act);
        }

        expect(page.cursor).toBe(cursor);
        expect(page.hasMore).toBe(cursor < through);
      } while (cursor < through);

      expect(historyActs).toEqual(new Set([1, 2]));
      expect(keys.size).toBe(through);
    }

    const releaseDeadline = Date.now() + 10000;

    do {
      queue = Schema.decodeUnknownSync(QueueStatusSchema)(JSON.parse(await cli('status')));

      if (queue.status === 'idle') break;
      await sleep(30);
    } while (Date.now() < releaseDeadline);

    expect(queue.status).toBe('idle');
  }

  expect(matches[0]).not.toBe(matches[1]);
  const final = JSON.parse(await readFile(config, 'utf8'));
  expect(final.agentId).toBe(controller.agentId);
  expect(final.token).toBe(controller.token);
  expect(final.participation.gameId).toBe('secret-overlord');
}, 400000);
