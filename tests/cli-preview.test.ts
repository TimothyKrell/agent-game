import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { artifacts, hash } from '../.tim27-cli/artifacts';
import type { ArtifactPin } from '../cli/preview-artifacts.mjs';

const run = promisify(execFile);

const portBase = Number(process.env.TIM27_CLI_PORT_BASE ?? 6361);

if (!Number.isInteger(portBase) || portBase < 1 || portBase > 65532)
  throw new Error('TIM27_CLI_PORT_BASE must start a valid four-port range.');

const source = `http://127.0.0.1:${portBase}`;

const target = `http://127.0.0.1:${portBase + 1}`;

const other = `http://127.0.0.1:${portBase + 2}`;

const evidenceDirectory =
  process.env.TIM27_CLI_EVIDENCE_DIR ?? `.tim27-cli/runs/cli-${process.pid}-${randomUUID()}`;

const incarnation = 'cli-incarnation-1';

const commit = 'a'.repeat(40);

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const privateKey = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

let directory: string;

let bin: string;

let executable: Buffer;

let agentId: string;

let cookie: string;

const workers: Awaited<ReturnType<typeof unstable_dev>>[] = [];

const configs: Record<string, string> = {};

const completions: object[] = [];

type FixtureRequest =
  | string
  | Awaited<ReturnType<typeof artifacts>>['manifest']
  | { name: string }
  | { code: string; agentId: string }
  | { sql: string; values: (string | number | null)[] }
  | { origin: string; incarnation: string; commit?: string; publicKey?: string }
  | { incarnation: string; commit: string; privateKey: string }
  | { agentId: string; grantId: string; gameId: string; requestId: string }
  | Record<string, never>;

async function post(origin: string, path: string, body: FixtureRequest, owner = false) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: owner ? cookie : '' },
    body: JSON.stringify(body),
  });

  expect(response.ok, await response.clone().text()).toBe(true);

  return response;
}

async function sql(origin: string, statement: string, values: (string | number | null)[] = []) {
  return (await post(origin, '/fixture/db', { sql: statement, values })).json();
}

async function traffic(origin: string) {
  return Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        path: Schema.String,
        method: Schema.String,
        credentialHash: Schema.NullOr(Schema.String),
        body: Schema.optional(Schema.Unknown),
      }),
    ),
  )(await (await fetch(`${origin}/fixture/traffic`)).json());
}

async function cli(config: string, ...args: string[]) {
  try {
    const output = await run(process.execPath, [bin, ...args, '--config', config], {
      cwd: directory,
      env: {
        ...process.env,
        HOME: directory,
        XDG_CONFIG_HOME: `${directory}/config`,
        CLAUDE_CONFIG_DIR: `${directory}/claude`,
      },
    });

    return JSON.parse(output.stdout);
  } catch (error) {
    const failure = Schema.decodeUnknownSync(Schema.Struct({ stdout: Schema.String, code: Schema.Number }))(
      error,
    );

    return { ...JSON.parse(failure.stdout), exitCode: failure.code };
  }
}

async function register(origin: string, revision = commit, epoch = incarnation) {
  await post(source, '/fixture/register', { origin, incarnation: epoch, commit: revision, publicKey });
  await post(origin, '/fixture/configure', { incarnation: epoch, commit: revision, privateKey });
}

async function publish(
  origin: string,
  revision = commit,
  marker = 'TIM27_BRANCH_A',
  extra: Parameters<typeof artifacts>[6] = [],
) {
  const bundle = await artifacts(source, origin, incarnation, revision, executable, marker, extra);

  const response = await fetch(
    `${origin}/fixture/archive?${new URLSearchParams({ path: new URL(bundle.manifest.games[0].archive.url).pathname })}`,
    { method: 'POST', body: new Uint8Array(bundle.tar) },
  );

  expect(response.ok).toBe(true);
  await post(source, '/fixture/manifest', bundle.manifest);

  return bundle;
}

async function saved(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const match = async (response: Response) =>
  Schema.decodeUnknownSync(Schema.Struct({ matchId: Schema.String }))(await response.json());

async function startWorker(origin: string, index: number) {
  return unstable_dev('.tim27-cli/worker.ts', {
    config: '.tim27-cli/wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: `${directory}/storage-${index}`,
    port: Number(new URL(origin).port),
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      APP_URL: origin,
      PREVIEW_SOURCE_URL: index ? source : '',
      BETTER_AUTH_SECRET: `cli-fixture-${index}-secret-at-least-32-characters`,
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
}

async function select(harness = 'opencode', origin = target, game = 'secret-overlord', renew?: string) {
  return cli(
    configs[harness],
    'preview-select',
    '--server',
    origin,
    '--game',
    game,
    ...(renew ? ['--renew', renew] : []),
  );
}

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'tim27-cli-'));
  await run(process.execPath, ['scripts/package-cli.mjs']);
  executable = await readFile('public/downloads/agent-game-cli-0.3.0.tgz');
  await run('npm', [
    'install',
    '--prefix',
    directory,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve('public/downloads/agent-game-cli-0.3.0.tgz'),
  ]);
  bin = `${directory}/node_modules/agent-game-cli/cli/agent-game.mjs`;

  for (const [index, origin] of [source, target, other].entries()) {
    const store = `${directory}/storage-${index}`;
    await run('npx', [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'preview-cli-test',
      '--local',
      '--config',
      '.tim27-cli/wrangler.jsonc',
      '--persist-to',
      store,
    ]);
    workers.push(await startWorker(origin, index));
  }

  const login = await post(source, '/api/dev/login', { name: 'TIM27 CLI owner' });
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  agentId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
    await (await post(source, '/api/owner/agents', { name: 'Stable CLI competitor' }, true)).json(),
  ).id;

  for (const harness of ['opencode', 'claude']) {
    const config = `${directory}/${harness}-production.json`;
    configs[harness] = config;
    expect(await cli(config, 'setup', '--harness', harness, '--server', source)).toMatchObject({
      status: 'ready',
    });
    const pending = await cli(config, 'connect');
    await post(source, '/api/owner/pairing/approve', { code: pending.code, agentId }, true);
    expect(await cli(config, 'connect')).toMatchObject({ status: 'ready', agentId });
  }

  expect(
    (
      await fetch(`${source}/fixture/archive?path=/downloads/agent-game-cli-0.3.0.tgz`, {
        method: 'POST',
        body: new Uint8Array(executable),
      })
    ).ok,
  ).toBe(true);
  await register(target);
  await register(other);
  await publish(target);
  await publish(other);
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, 'scripted-results.json'),
    JSON.stringify(
      {
        scope: 'Local scripted fixture allocations; broker admission and hosted agents are not exercised.',
        completions,
      },
      null,
      2,
    ) + '\n',
  );
  await Promise.all(workers.map((worker) => worker.stop()));
  await rm(directory, { recursive: true, force: true });
});

it.each(['opencode', 'claude'])(
  'selects using an existing %s install and preserves exact source bytes, participation and picture choice',
  async (harness) => {
    const before = await readFile(configs[harness]);

    const skillPath =
      harness === 'opencode'
        ? `${directory}/config/opencode/skills/agent-game/SKILL.md`
        : `${directory}/claude/skills/agent-game/SKILL.md`;

    const skill = await readFile(skillPath);
    const game = harness === 'opencode' ? 'secret-overlord' : 'succession';
    const selected = await select(harness, target, game);
    expect(selected).toMatchObject({
      status: 'selected',
      agentId,
      server: target,
      sourceOrigin: source,
      livePlay: false,
      commit,
    });
    const state = await saved(selected.configPath);
    expect(state).toMatchObject({
      pictureSource: { server: source, agentId },
      eventAuthorization: 'public-wakeup',
      preview: {
        status: 'connected',
        installationIntent: { intent: { targetOrigin: target, incarnation, commit } },
      },
    });
    expect(state.token).not.toBe((await saved(configs[harness])).token);
    expect(await readFile(configs[harness])).toEqual(before);
    expect(await readFile(skillPath)).toEqual(skill);
    expect(await cli(selected.configPath, 'connect')).toMatchObject({
      status: 'ready',
      picture: { askOwner: false },
    });
    expect(await cli(selected.configPath, 'start')).toMatchObject({
      exitCode: 1,
      error: { code: 'preview-allocation-pending', status: 503 },
    });
    expect((await saved(selected.configPath)).previewParticipation.artifacts).toEqual(selected.artifacts);
    const listing = await cli(configs[harness], 'connections', '--harness', harness);
    expect(listing.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ configPath: configs[harness], server: source }),
        expect.objectContaining({ configPath: selected.configPath, sourceOrigin: source, commit }),
      ]),
    );
    const credentialHash = hash(`Bearer ${(await saved(configs[harness])).token}`);
    expect((await traffic(target)).some((request) => request.credentialHash === credentialHash)).toBe(false);
    expect(JSON.stringify(selected)).not.toContain(state.token);
  },
  30_000,
);

for (const firstGame of ['secret-overlord', 'succession']) {
  it.each(['normal', 'denied', 'lost'])(
    `returns next-game pins after confirmed ${firstGame} cancellation (%s receipt)`,
    async (mode) => {
      const label = randomUUID();
      const nextGame = firstGame === 'succession' ? 'secret-overlord' : 'succession';
      const selected = await select('opencode', target, firstGame, label);
      expect(selected.status).toBe('selected');
      expect(await cli(selected.configPath, 'start')).toMatchObject({
        error: { code: 'preview-allocation-pending' },
      });
      const pending = await saved(selected.configPath);
      const trafficBefore = (await traffic(target)).length;
      const ledger = 'existing allowance and accounting are retained\n';
      await writeFile(`${selected.configPath}.supervisor.json`, ledger);

      try {
        if (mode !== 'normal') {
          await post(target, '/fixture/cancel-mode', mode);
          expect(await cli(selected.configPath, 'leave')).toMatchObject({ exitCode: 1 });
          const unresolved = await saved(selected.configPath);
          expect(unresolved.pendingJoin).toEqual(pending.pendingJoin);
          expect(unresolved.previewParticipation).toEqual(pending.previewParticipation);
          const whileUnresolved = await select('opencode', target, nextGame, label);
          expect(whileUnresolved.artifacts).toEqual(pending.previewParticipation.artifacts);
          await post(target, '/fixture/cancel-mode', 'normal');
        }

        expect(await cli(selected.configPath, 'leave')).toMatchObject({ status: 'idle' });
        const next = await select('opencode', target, nextGame, label);
        expect(next.artifacts.gameId).toBe(nextGame);

        const cancellations = (await traffic(target))
          .slice(trafficBefore)
          .filter((request) => request.path === '/api/queue' && request.method === 'DELETE');

        expect(cancellations.length).toBeGreaterThan(0);

        for (const request of cancellations)
          expect(request.body).toEqual({ gameId: firstGame, requestId: pending.pendingJoin.requestId });
        const state = await saved(selected.configPath);
        expect(next.artifacts).toEqual(state.preview.artifacts);
        expect(next.cliPath).toBe(state.preview.artifacts.executablePath);
        const rules = nextGame === 'succession' ? 'public/games/succession/rules.md' : 'public/rules.md';
        expect(next.artifacts.rulesPath).toMatch(new RegExp(`/package/${rules}$`));
        expect(await readFile(next.artifacts.rulesPath, 'utf8')).toBe(
          `${await readFile(rules, 'utf8')}\nTIM27_BRANCH_A\n`,
        );
        expect(state.previewParticipation).toBeUndefined();
        expect(state.pendingJoin).toBeUndefined();
        expect(state.cancelledPreviewParticipations[pending.pendingJoin.requestId].artifacts).toEqual(
          pending.previewParticipation.artifacts,
        );
        expect(await readFile(`${selected.configPath}.supervisor.json`, 'utf8')).toBe(ledger);
        const canceled = await saved(selected.configPath);
        expect(await cli(selected.configPath, 'leave')).toMatchObject({ status: 'idle' });
        expect((await saved(selected.configPath)).cancelledPreviewParticipations).toEqual(
          canceled.cancelledPreviewParticipations,
        );
        expect(await cli(selected.configPath, 'start')).toMatchObject({
          error: { code: 'preview-allocation-pending' },
        });
        expect((await saved(selected.configPath)).previewParticipation.artifacts).toEqual(next.artifacts);
      } finally {
        await post(target, '/fixture/cancel-mode', 'normal');
      }
    },
    30_000,
  );
}

it.each(['secret-overlord', 'succession'])(
  'scopes independent previews to the same stable competitor and preserves an active source %s assignment',
  async (gameId) => {
    const sourceState = await saved(configs.opencode);

    const assignment = await match(
      await post(source, '/fixture/match', {
        agentId,
        grantId: sourceState.connectionId,
        gameId,
        requestId: `production-participation-${gameId}`,
      }),
    );

    expect(await cli(configs.opencode, 'start')).toMatchObject({ matchId: assignment.matchId });
    const before = await readFile(configs.opencode);
    await writeFile(`${configs.opencode}.supervisor.json`, 'source allowance sentinel\n');
    const selected = await select('opencode', other);
    expect(selected).toMatchObject({ status: 'selected', server: other, agentId });
    const first = await select();
    expect(selected.configPath).not.toBe(first.configPath);
    expect((await saved(selected.configPath)).token).not.toBe((await saved(first.configPath)).token);
    expect(await readFile(configs.opencode)).toEqual(before);
    expect(await readFile(`${configs.opencode}.supervisor.json`, 'utf8')).toBe('source allowance sentinel\n');
    expect(await cli(configs.opencode, 'start')).toMatchObject({ matchId: assignment.matchId });
  },
  30_000,
);

it.each(['/api/preview/agent-handoffs', '/api/preview/agent-exchange'])(
  'cold-retries the exact persisted proof after lost %s acknowledgement',
  async (path) => {
    const label = randomUUID();
    await post(path.endsWith('handoffs') ? source : target, '/fixture/lose', path);
    expect(await select('opencode', target, 'secret-overlord', label)).toMatchObject({
      exitCode: 1,
      error: { code: 'fixture-lost-ack' },
    });
    const pendingPath = `${directory}/.agent-game/connections/${(await readdir(`${directory}/.agent-game/connections`)).find((name) => name.endsWith(label))}/connection.json`;
    const pending = await saved(pendingPath);
    expect(pending.preview.status).toBe('pending');
    const before = structuredClone(pending.preview.installationIntent);
    const origin = path.endsWith('handoffs') ? source : target;
    const firstRequest = (await traffic(origin)).filter((item) => item.path === path).at(-1)!;

    if (path.endsWith('agent-exchange')) {
      await workers[1].stop();
      workers[1] = await startWorker(target, 1);
    }

    const result = await select('opencode', target, 'secret-overlord', label);
    expect(result).toMatchObject({ status: 'selected', configPath: pendingPath });
    expect((await saved(pendingPath)).preview.installationIntent).toEqual(before);
    const lastRequest = (await traffic(origin)).filter((item) => item.path === path).at(-1)!;
    expect(firstRequest.body).toEqual(lastRequest.body);
    expect(firstRequest.credentialHash).toBe(lastRequest.credentialHash);

    const rows = await sql(target, 'SELECT id FROM agent_grants WHERE id=?', [
      `preview_${before.intent.requestId}`,
    ]);

    expect(rows).toHaveLength(1);
    const completed = await saved(pendingPath);

    const proof = {
      requestId: before.intent.requestId,
      code: completed.preview.code,
      verifier: before.verifier,
    };

    const wrongToken = (await saved((await select('opencode', other)).configPath)).token;

    const rejected = await fetch(`${target}/api/preview/agent-exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${wrongToken}` },
      body: JSON.stringify(proof),
    });

    expect(rejected.status).toBe(401);

    const wrongOrigin = await fetch(`${other}/api/preview/agent-exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${completed.token}` },
      body: JSON.stringify(proof),
    });

    expect(wrongOrigin.ok).toBe(false);
  },
  30_000,
);

it('requires explicit fresh authorization after an expired handoff and rejects changed saved proof', async () => {
  const label = randomUUID();
  await post(source, '/fixture/lose', '/api/preview/agent-handoffs');
  expect((await select('opencode', target, 'secret-overlord', label)).exitCode).toBe(1);
  const path = `${directory}/.agent-game/connections/${(await readdir(`${directory}/.agent-game/connections`)).find((name) => name.endsWith(label))}/connection.json`;
  const state = await saved(path);
  await sql(source, 'UPDATE preview_handoffs SET expires_at=0 WHERE id=?', [
    state.preview.installationIntent.intent.requestId,
  ]);
  expect((await select('opencode', target, 'secret-overlord', label)).exitCode).toBe(1);
  expect((await saved(path)).preview.installationIntent).toEqual(state.preview.installationIntent);
  state.preview.installationIntent.verifier = 'A'.repeat(43);
  await writeFile(path, JSON.stringify(state));
  expect(await select('opencode', target, 'secret-overlord', label)).toMatchObject({
    error: { code: 'preview-proof' },
  });
  expect(await select('opencode', target, 'secret-overlord', randomUUID())).toMatchObject({
    status: 'selected',
  });
}, 30_000);

it.each(['provenance', 'hash', 'traversal', 'symlink', 'duplicate', 'executable'])(
  'rejects %s artifacts before handoff or execution',
  async (fault) => {
    const before = (await traffic(source)).filter((item) => item.path.endsWith('agent-handoffs')).length;

    const cases = {
      traversal: [{ path: 'package/public/../../escape.md', content: Buffer.from('escape') }],
      symlink: [{ path: 'package/public/link.md', content: Buffer.alloc(0), kind: '2' }],
      duplicate: [{ path: 'package/public/rules.md', content: Buffer.from('replacement') }],
      executable: [{ path: 'package/public/execute.md', content: Buffer.from('code'), mode: 0o755 }],
    };

    const extras = Object.entries(cases).find(([key]) => key === fault)?.[1] ?? [];
    const revision = hash(fault).slice(0, 40);
    await register(other, revision);
    const bundle = await publish(other, revision, 'TIM27_BAD', extras);

    if (fault === 'hash')
      await fetch(
        `${other}/fixture/archive?${new URLSearchParams({ path: new URL(bundle.manifest.games[0].archive.url).pathname })}`,
        { method: 'POST', body: new Uint8Array(Buffer.from('wrong bytes')) },
      );

    // Interrupt the actual source response with corrupt provenance; source D1 remains immutable.
    if (fault === 'provenance') await post(source, '/fixture/corrupt-manifest-response', {});
    const result = await select('opencode', other, 'secret-overlord', randomUUID());
    expect(result.exitCode, JSON.stringify(result)).toBe(1);
    expect((await traffic(source)).filter((item) => item.path.endsWith('agent-handoffs'))).toHaveLength(
      before,
    );
    await register(other);
  },
  30_000,
);

it('reports source manifest unavailability without target authorization', async () => {
  const nextCommit = 'b'.repeat(40);
  await register(other, nextCommit);
  expect(await select('opencode', other)).toMatchObject({
    error: { code: 'preview-artifacts-pending', status: 503 },
  });
  await register(other);
});

it.each(['secret-overlord', 'succession'])(
  'uses public wakeups and entitled HTTP required choices/history on the real %s match DO',
  async (game) => {
    const selected = await select('opencode', other, game, randomUUID());
    expect(selected.status).toBe('selected');
    const state = await saved(selected.configPath);

    const assignment = await match(
      await post(other, '/fixture/match', {
        agentId,
        grantId: state.connectionId,
        gameId: game,
        requestId: `scripted-${game}`,
      }),
    );

    // Scripted allocation is a fixture: real preview live admission remains blocked by the broker gate.
    expect(await cli(selected.configPath, 'status')).toMatchObject({ matchId: assignment.matchId });
    let view = await cli(selected.configPath, 'observe');
    expect(view.you).not.toBeNull();
    const installed: typeof import('../cli/agent-game.mjs') = await import(pathToFileURL(bin).href);

    const client = new installed.GameClient(other, state.token, {
      eventAuthorization: 'public-wakeup',
      artifacts: selected.artifacts,
    });

    const socket = await client.connect(assignment.matchId, 0, game === 'succession' ? '2' : '1');
    await new Promise<void>((done, reject) => {
      socket.onopen = () => done();
      socket.onerror = () => reject(new Error('Public socket failed'));
    });
    socket.close();

    const delaysBefore = Schema.decodeUnknownSync(Schema.Struct({ completed: Schema.Number }))(
      await (await fetch(`${other}/fixture/observation-delay`)).json(),
    );

    for (let step = 0; step < 30 && !view.decision; step++) {
      await post(
        other,
        `/fixture/clock/${assignment.matchId}?${new URLSearchParams({ phase: view.phase.id })}`,
        {},
      );
      // The clock RPC has completed. Read authoritative state rather than making a one-second
      // wait deadline double as an HTTP response budget. Exercise the slow-read CI boundary once.

      if (step === 0) await post(other, '/fixture/observation-delay', `/api/matches/${assignment.matchId}`);
      view = await cli(selected.configPath, 'observe');
      expect(view.error, JSON.stringify(view)).toBeUndefined();
    }

    expect(await (await fetch(`${other}/fixture/observation-delay`)).json()).toEqual({
      pending: '',
      completed: delaysBefore.completed + 1,
    });

    expect(view.decision, JSON.stringify(view)).not.toBeNull();
    expect(await cli(selected.configPath, 'act', '--choice', '0')).toMatchObject({ accepted: true });

    if (game === 'succession') {
      const current = await cli(selected.configPath, 'observe');

      const page = await cli(
        selected.configPath,
        'history',
        '--epoch',
        current.history.visibilityEpoch,
        '--through',
        String(current.history.streamHead),
        '--after',
        '0',
        '--limit',
        '10',
      );

      expect(page.events.length).toBeGreaterThan(0);
      expect(page.through).toBe(current.history.streamHead);
      expect((await cli(selected.configPath, 'observe')).you).not.toBeNull();
    }

    let spoken = false;
    let decisions = 1;
    view = await cli(selected.configPath, 'observe');

    for (let step = 0; step < 700 && view.status === 'active'; step++) {
      if (view.decision) {
        const receipt = await cli(selected.configPath, 'act', '--choice', '0');
        expect(receipt.accepted, JSON.stringify(receipt)).toBe(true);
        decisions++;
        view = receipt.observation;
        continue;
      }

      if (!spoken && view.chat.open && !view.you?.forfeited) {
        if (game === 'succession') {
          const epoch = view.history.visibilityEpoch;
          const through = view.history.streamHead;
          let after = Math.max(0, through - 10);

          for (;;) {
            const page = await cli(
              selected.configPath,
              'history',
              '--epoch',
              epoch,
              '--through',
              String(through),
              '--after',
              String(after),
              '--limit',
              '10',
              '--max-bytes',
              '12288',
            );

            expect(page.reset).toBe(false);
            after = page.cursor;
            view = await cli(selected.configPath, 'observe');

            if (view.decision || !page.hasMore) break;
          }
        }

        view = await cli(selected.configPath, 'observe');

        if (view.decision) continue;
        expect(
          await cli(
            selected.configPath,
            'say',
            '--text',
            'Scripted fixture: the delivered public context is read; required choices remain first.',
          ),
        ).toMatchObject({ accepted: true });
        spoken = true;
      }

      await post(
        other,
        `/fixture/clock/${assignment.matchId}?${new URLSearchParams({ phase: view.phase.id })}`,
        {},
      );
      view = await cli(selected.configPath, 'observe');
      expect(view.error, JSON.stringify(view)).toBeUndefined();
    }

    expect(spoken).toBe(true);
    expect(view.status, JSON.stringify(view)).toBe('finished');
    completions.push({
      game,
      status: view.status,
      decisions,
      result: view.result ?? view.winner,
      originalAgentForfeited: view.you.forfeited,
    });

    expect((await traffic(other)).filter((request) => request.path.endsWith('/ticket'))).toHaveLength(0);

    const requests = (await traffic(other)).filter((request) =>
      request.path.startsWith(`/api/matches/${assignment.matchId}`),
    );

    expect(
      requests
        .filter((request) => request.path.endsWith('/events'))
        .every((request) => request.credentialHash === null),
    ).toBe(true);
    expect(
      requests
        .filter((request) => !request.path.endsWith('/events'))
        .every((request) => request.credentialHash === hash(`Bearer ${state.token}`)),
    ).toBe(true);
    await sql(source, 'UPDATE preview_handoffs SET revoked_at=? WHERE id=?', [
      Date.now(),
      state.preview.installationIntent.intent.requestId,
    ]);
    expect(await cli(selected.configPath, 'observe')).toMatchObject({ exitCode: 1, error: { status: 401 } });
  },
  120_000,
);

it('consumes only verified text when the target publishes a full CLI archive', async () => {
  const revision = hash('full-target-cli-archive').slice(0, 40);
  await register(target, revision);
  const bundle = await artifacts(source, target, incarnation, revision, executable);

  for (const game of bundle.manifest.games) {
    game.archive = {
      url: `${target}/downloads/previews/${revision}/${hash(executable)}.tgz`,
      bytes: executable.length,
      sha256: hash(executable),
    };

    for (const descriptor of [game.rules, game.protocolFile, game.skill]) {
      const file = await readFile(
        `${directory}/node_modules/agent-game-cli/${descriptor.path.slice('package/'.length)}`,
      );

      descriptor.sha256 = hash(file);
      descriptor.bytes = file.length;
    }
  }

  expect(
    (
      await fetch(
        `${target}/fixture/archive?${new URLSearchParams({ path: new URL(bundle.manifest.games[0].archive.url).pathname })}`,
        { method: 'POST', body: new Uint8Array(executable) },
      )
    ).ok,
  ).toBe(true);
  await post(source, '/fixture/manifest', bundle.manifest);
  const selected = await select('opencode', target, 'secret-overlord', randomUUID());
  expect(selected.status, JSON.stringify(selected)).toBe('selected');
  expect(await readFile(selected.artifacts.rulesPath)).toEqual(await readFile('public/rules.md'));
  await expect(readdir(resolve(selected.artifacts.rulesPath, '../../cli'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await register(target);
}, 30_000);

it.each(['claude', 'opencode'])(
  'feeds unchanged-protocol branch pins into the actual %s native supervisor and retains them on reselection',
  async (harness) => {
    const selected = await select(harness, target, 'succession', randomUUID());
    expect(selected.status, JSON.stringify(selected)).toBe('selected');
    const state = await saved(selected.configPath);
    const requestId = randomUUID();

    const assignment = await match(
      await post(target, '/fixture/match', {
        agentId,
        grantId: state.connectionId,
        gameId: 'succession',
        requestId,
      }),
    );

    const pins: ArtifactPin = selected.artifacts;
    state.previewParticipation = {
      connectionId: state.connectionId,
      targetOrigin: target,
      incarnation,
      queueRequestId: requestId,
      matchId: assignment.matchId,
      artifacts: pins,
      supervisorLedgerPath: `${selected.configPath}.supervisor.json`,
    };
    await writeFile(selected.configPath, JSON.stringify(state));
    expect(await cli(selected.configPath, 'status')).toMatchObject({ matchId: assignment.matchId });
    const revision = hash(`rules-only-${harness}`).slice(0, 40);
    await register(target, revision);
    await publish(target, revision, 'TIM27_BRANCH_B');
    // The explicit authorization label identifies the same target connection on restart/reselection.
    const label = selected.configPath.match(/-([a-f0-9-]{36})\/connection\.json$/)![1];
    const next = await select(harness, target, 'succession', label);
    expect(next.artifacts).toEqual(pins);
    const changed = await saved(selected.configPath);
    expect(changed.preview.artifacts.commit).toBe(revision);
    expect(changed.preview.artifacts.executableDigest).toBe(pins.executableDigest);
    expect(changed.previewParticipation.artifacts).toEqual(pins);

    const native = `${directory}/native-${harness}`;
    await mkdir(native);
    const capture = `${native}/capture.json`;

    const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'api') {
  const data = args[1] === 'post' && args[2] === '/api/session'
    ? { id: 'ses_fixture', location: { directory: process.cwd() } }
    : { id: 'ses_fixture', cost: 0.01, time: { idle: Date.now() } };
  console.log(JSON.stringify({ data }));
} else {
  const prompt = args[1];
  const rulesPath = prompt.match(/; rules ([^;]+); protocol/)[1];
  fs.writeFileSync(process.env.TIM27_CAPTURE, JSON.stringify({ prompt, rulesPath, rules: fs.readFileSync(rulesPath, 'utf8'), wrapper: fs.readFileSync('agent-game.mjs', 'utf8') }));
  console.log(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'ses_fixture', total_cost_usd: 0.01 }));
}
`;

    await writeFile(`${native}/${harness === 'claude' ? 'claude' : 'opencode2'}`, script, { mode: 0o700 });
    vi.stubEnv('PATH', `${native}:${process.env.PATH}`);
    vi.stubEnv('TIM27_CAPTURE', capture);
    const controller = new AbortController();
    const nativeEvents: object[] = [];

    const installed: typeof import('../cli/supervisor.mjs') = await import(
      pathToFileURL(`${directory}/node_modules/agent-game-cli/cli/supervisor.mjs`).href
    );

    try {
      const result = await installed.supervise({
        configPath: selected.configPath,
        harness,
        signal: controller.signal,
        onEvent: (event) => {
          nativeEvents.push(event);

          if (event.type === 'harness-event') controller.abort();
        },
      });

      expect(result.status).toBe('client-stopped');
      const captured = await saved(capture);
      expect(captured.rulesPath).toBe(pins.rulesPath);
      expect(captured.rules).toContain('TIM27_BRANCH_A');
      expect(captured.prompt).toContain('TIM27_BRANCH_A');
      expect(captured.prompt).not.toContain('TIM27_BRANCH_B');
      expect(hash(captured.wrapper)).toBe(pins.executableDigest);
      const ledger = await saved(`${selected.configPath}.supervisor.json`);
      expect(ledger.artifacts).toEqual(pins);
      expect(ledger.accounting.known).toBe(0.01);
      expect(ledger.invocations, JSON.stringify(nativeEvents)).toBe(1);
      const stopped = await installed.supervise({ configPath: selected.configPath, harness });
      expect(stopped.status).toBe('client-stopped');
      expect((await saved(`${selected.configPath}.supervisor.json`)).invocations).toBe(1);
    } finally {
      vi.unstubAllEnvs();
      await register(target);
    }
  },
  30_000,
);

it('rejects a retired arena and an old target grant after incarnation replacement', async () => {
  const selected = await select('opencode', other, 'secret-overlord', randomUUID());
  expect(selected.status).toBe('selected');
  await register(other, commit, 'replacement-incarnation');
  expect(await cli(selected.configPath, 'status')).toMatchObject({ exitCode: 1, error: { status: 401 } });
  await post(source, '/fixture/close', { origin: other, incarnation: 'replacement-incarnation' });
  expect(await select('opencode', other)).toMatchObject({ error: { code: 'preview-target' } });
});

it('stops an active preview supervisor on hot source-grant revocation without refilling its allowance', async () => {
  const selected = await select('claude', target, 'succession', randomUUID());
  expect(selected.status, JSON.stringify(selected)).toBe('selected');
  const state = await saved(selected.configPath);
  const sourceState = await saved(configs.claude);
  await post(target, '/fixture/match', {
    agentId,
    grantId: state.connectionId,
    gameId: 'succession',
    requestId: randomUUID(),
  });

  const installed: typeof import('../cli/supervisor.mjs') = await import(
    pathToFileURL(`${directory}/node_modules/agent-game-cli/cli/supervisor.mjs`).href
  );

  const result = await installed.supervise(
    { configPath: selected.configPath, harness: 'claude' },
    async (input) => {
      const ended = new Promise<void>((done) =>
        input.signal.addEventListener('abort', () => done(), { once: true }),
      );

      await sql(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [
        Date.now(),
        sourceState.connectionId,
      ]);
      await ended;
      await input.onUsage({ scope: 'invocation', total: 0.01, final: true });

      return { exitCode: 0 };
    },
  );

  expect(result).toMatchObject({
    status: 'client-stopped',
    reason: 'authority-ended',
    invocations: 1,
    costUsd: 0.01,
  });
  const before = await readFile(`${selected.configPath}.supervisor.json`);
  await expect(
    installed.supervise({ configPath: selected.configPath, harness: 'claude' }),
  ).rejects.toMatchObject({ status: 401 });
  expect(await readFile(`${selected.configPath}.supervisor.json`)).toEqual(before);
  expect(await select('claude', target)).toMatchObject({ exitCode: 1, error: { status: 401 } });
}, 30_000);
