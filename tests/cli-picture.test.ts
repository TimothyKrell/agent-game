import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Schema } from 'effect';
import { version } from '../package.json';
import { pictureFixture, picturePort, png } from './fixtures/cli-onboarding/picture-fixture';
import { AgentPictureSchema } from '../src/shared/agent-picture';
import { validatePicture } from '../cli/picture.mjs';
import { advance, createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { observeSuccession } from '../src/game/succession/observation';

const run = promisify(execFile);

let installation: string;

let bin: string;

beforeAll(async () => {
  installation = await mkdtemp('/tmp/opencode/tim30-installed-');
  await run(process.execPath, ['scripts/package-cli.mjs']);
  await run('npm', [
    'install',
    '--prefix',
    installation,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve(`public/downloads/agent-game-cli-${version}.tgz`),
  ]);
  bin = `${installation}/node_modules/.bin/agent-game`;
});

afterAll(async () => {
  await rm(installation, { recursive: true, force: true });
});

async function fixture(harness = 'opencode', game = 'secret-overlord') {
  const arena = await pictureFixture();
  const home = await mkdtemp('/tmp/opencode/tim30-home-');

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: `${home}/config`,
    CLAUDE_CONFIG_DIR: `${home}/claude`,
  };

  const cli = async (...args: string[]) =>
    JSON.parse((await run(process.execPath, [bin, ...args], { env, cwd: home })).stdout);

  const setup = await cli('setup', '--server', arena.origin, '--harness', harness, '--game', game);
  const config = setup.configPath;
  const connected = (...args: string[]) => cli(...args, '--config', config);

  return {
    ...arena,
    home,
    env,
    cli,
    config,
    setup,
    connected,
    async approve() {
      expect((await connected('connect')).status).toBe('pending');

      return connected('connect');
    },
    async close() {
      await arena.close();
      await rm(home, { recursive: true, force: true });
    },
  };
}

it.each([
  ['opencode', 'secret-overlord'],
  ['claude', 'secret-overlord'],
  ['opencode', 'succession'],
  ['claude', 'succession'],
])(
  'installed %s/%s connects, offers once, remembers skip, and joins without picture tools',
  async (harness, game) => {
    const f = await fixture(harness, game);

    try {
      const ready = await f.approve();
      expect(ready).toMatchObject({
        status: 'ready',
        agentId: f.agentId,
        picture: { state: 'missing', revision: 0, askOwner: true },
      });
      expect(f.state.joins).toBe(0);
      expect(f.state.pairs).toBe(1);
      expect(f.setup.connectCommand).toContain('connect --config');
      expect(f.setup.startCommand).toContain('start --config');
      expect((await f.connected('connect')).picture.askOwner).toBe(false);
      expect((await f.connected('picture-skip')).status).toBe('skipped');
      expect((await f.connected('connect')).picture).toMatchObject({
        state: 'missing',
        askOwner: false,
        choice: 'skipped',
      });
      const help = await f.connected('picture-help');
      expect(help.tools).toContain('tools already available');
      expect(help.timing).toContain('without waiting');
      expect((await f.connected('start')).status).toBe('queued');
      expect(f.state.joins).toBe(1);
      const reads = f.state.reads;
      expect(await f.connected('connect')).toEqual({ status: 'queued' });
      expect(await f.connected('status')).toEqual({ status: 'queued' });
      expect(f.state.reads).toBe(reads);
      const skill = await readFile(f.setup.skillPath, 'utf8');
      expect(skill).toContain('go directly to the gameplay loop');
      expect(skill).toContain('Required actions take priority over history and discussion');
      expect(skill).toContain('Before optional speech, read **Recent context**');
      expect(skill).toContain('Re-read this window on a fresh model session');
      expect(skill.slice(skill.indexOf('## Play until'), skill.indexOf('## Recovery'))).not.toContain(
        'picture',
      );
      expect(JSON.stringify([ready, help, await f.cli('connections', '--harness', harness)])).not.toContain(
        f.state.token,
      );
    } finally {
      await f.close();
    }
  },
);

it.each([401, 404, 503])(
  'picture HTTP %s is nonblocking on an otherwise approved connection',
  async (status) => {
    const f = await fixture();

    try {
      f.state.pictureFailure = status;
      expect(await f.approve()).toMatchObject({
        status: 'ready',
        picture: { state: 'unavailable', askOwner: false },
      });
      expect(await f.connected('picture-status')).toMatchObject({ picture: { state: 'unavailable' } });
      expect(await f.connected('start')).toMatchObject({ status: 'queued' });
    } finally {
      await f.close();
    }
  },
);

it('an existing picture, malformed response, and failed choice storage never produce repeated offers or block joining', async () => {
  const f = await fixture();

  try {
    f.state.picture = f.present();
    expect(await f.approve()).toMatchObject({
      status: 'ready',
      picture: { state: 'present', askOwner: false },
    });
    f.state.picture = { state: 'missing', revision: 2 };
    expect((await f.connected('connect')).picture.askOwner).toBe(false);

    for (const malformed of [
      '<html>old server</html>',
      'x'.repeat(8193),
      JSON.stringify({ state: 'missing', revision: -1 }),
    ]) {
      f.state.malformed = malformed;
      expect((await f.connected('connect')).picture).toMatchObject({ state: 'unavailable', askOwner: false });
    }

    f.state.malformed = '';
    f.state.etag = '"999"';
    expect((await f.connected('connect')).picture.state).toBe('unavailable');
    f.state.etag = '';
    await rm(`${f.home}/.agent-game/picture-choices`, { recursive: true });
    await writeFile(`${f.home}/.agent-game/picture-choices`, 'unavailable directory');
    expect(await f.connected('connect')).toMatchObject({
      status: 'ready',
      picture: { state: 'missing', askOwner: false },
    });
    expect((await f.connected('picture-skip')).status).toBe('unavailable');
    expect((await f.connected('start')).status).toBe('queued');
  } finally {
    await f.close();
  }
});

it.each(['connection-expired', 'connection-revoked'])(
  'propagates authoritative queue recheck %s after optional picture metadata',
  async (code) => {
    const f = await fixture();

    try {
      f.state.endAuthorityDuringRead = code;
      await expect(f.approve()).rejects.toMatchObject({
        code: 1,
        stdout: `${JSON.stringify({ error: { code, message: 'Connection authority ended.', status: 401 } })}\n`,
      });
      expect(f.state.reads).toBe(1);
      expect(f.state.queueReads).toBe(2);
      expect(f.state.joins).toBe(0);
      expect(await readdir(`${f.home}/.agent-game`)).not.toContain('picture-choices');
    } finally {
      await f.close();
    }
  },
);

it.each(['picture-upload', 'picture-retry'])(
  'repairs an orphaned pending journal before %s and preserves default cold retry after a lost receipt',
  async (command) => {
    const f = await fixture();

    try {
      await f.approve();
      const file = `${f.home}/original.png`;
      const id = 'orphaned-file-0001';
      const pointer = `${f.config}.pictures/pending.json`;
      await writeFile(file, png);
      // The CLI has already read an absent pointer. Fail its later atomic pointer publication,
      // after the real journal write, by occupying that destination with a directory.
      f.state.beforePictureRead = () => mkdir(pointer, { recursive: true }).then(() => {});
      expect(await f.connected('picture-upload', '--file', file, '--request-id', id)).toMatchObject({
        status: 'unavailable',
        code: 'picture-local-unavailable',
      });
      const original = JSON.parse(await readFile(`${f.config}.pictures/${id}.json`, 'utf8'));
      expect(original).toMatchObject({
        status: 'pending',
        revision: 0,
        requestId: id,
        payload: png.toString('base64'),
      });
      expect(f.state.requests).toHaveLength(0);
      await rm(pointer, { recursive: true });
      f.state.loseReceipt = true;
      const retryArgs = command === 'picture-upload' ? ['--file', file] : [];
      expect(await f.connected(command, '--request-id', id, ...retryArgs)).toMatchObject({
        status: 'uncertain',
        requestId: id,
      });

      const repaired = await readFile(pointer, 'utf8')
        .then(JSON.parse)
        .catch(() => null);

      expect.soft(repaired).toEqual({ requestId: id });
      expect
        .soft(await f.connected('picture-upload', '--file', file))
        .toMatchObject({ code: 'picture-pending' });
      expect
        .soft(await f.connected('picture-retry'))
        .toMatchObject({ status: 'received', requestId: id, picture: { revision: 1 } });
      expect.soft(f.state.requests.map((request) => [request.id, request.revision])).toEqual([
        [id, '"0"'],
        [id, '"0"'],
      ]);
      expect.soft(f.state.writes).toBe(1);
    } finally {
      await f.close();
    }
  },
);

it.each(['picture-upload', 'picture-retry'])(
  'fences orphaned saved-pending %s behind another unresolved operation',
  async (command) => {
    const f = await fixture();

    try {
      await f.approve();
      const file = `${f.home}/original.png`;
      const pointer = `${f.config}.pictures/pending.json`;
      await writeFile(file, png);
      f.state.beforePictureRead = () => mkdir(pointer, { recursive: true }).then(() => {});
      await f.connected('picture-upload', '--file', file, '--request-id', 'orphaned-file-0001');
      expect(f.state.requests).toHaveLength(0);
      await rm(pointer, { recursive: true });
      f.state.loseReceipt = true;
      expect(
        await f.connected('picture-upload', '--file', file, '--request-id', 'other-file-0002'),
      ).toMatchObject({ status: 'uncertain' });
      const retryArgs = command === 'picture-upload' ? ['--file', file] : [];
      expect(await f.connected(command, '--request-id', 'orphaned-file-0001', ...retryArgs)).toMatchObject({
        code: 'picture-pending',
      });
      expect(f.state.requests).toHaveLength(1);
      expect(JSON.parse(await readFile(pointer, 'utf8'))).toEqual({ requestId: 'other-file-0002' });
      expect(await f.connected('picture-retry')).toMatchObject({
        status: 'received',
        requestId: 'other-file-0002',
      });
    } finally {
      await f.close();
    }
  },
);

it('uses one raw authenticated path for owner files and externally-created files, and retries exact bytes across cold restarts', async () => {
  const f = await fixture();

  try {
    await f.approve();
    const owner = `${f.home}/owner '; touch SHOULD_NOT_EXIST;.png`;
    const external = `${f.home}/existing-tool-output.bin`;
    await writeFile(owner, png);
    await writeFile(external, png);
    const first = await f.connected('picture-upload', '--file', owner, '--request-id', 'owner-file-0001');
    expect(first).toMatchObject({
      status: 'received',
      receipt: { state: 'present', revision: 1 },
      picture: { state: 'present', revision: 1 },
    });
    expect(Schema.decodeUnknownSync(AgentPictureSchema)(first.picture)).toEqual(
      validatePicture(first.picture, f.agentId),
    );
    expect(f.state.requests[0]).toMatchObject({
      method: 'PUT',
      revision: '"0"',
      id: 'owner-file-0001',
      type: 'image/png',
      bytes: png,
      protocol: undefined,
    });
    expect(await readdir(f.home)).not.toContain('SHOULD_NOT_EXIST');
    f.state.loseReceipt = true;

    const lost = await f.connected(
      'picture-upload',
      '--file',
      external,
      '--request-id',
      'generated-file-0002',
    );

    expect(lost).toMatchObject({ status: 'uncertain', requestId: 'generated-file-0002' });
    const proof = f.state.requests.at(-1);
    const journalPath = `${f.config}.pictures/generated-file-0002.json`;
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    expect(journal).toMatchObject({
      version: 1,
      server: f.origin,
      agentId: f.agentId,
      revision: 1,
      requestId: lost.requestId,
      payload: png.toString('base64'),
    });
    expect(JSON.stringify(journal)).not.toContain(f.state.token);
    expect((await stat(journalPath)).mode & 0o777).toBe(0o600);
    expect((await stat(`${f.config}.pictures`)).mode & 0o777).toBe(0o700);
    await writeFile(external, Buffer.concat([png, Buffer.from('changed')]));
    expect(
      await f.connected('picture-upload', '--file', external, '--request-id', lost.requestId),
    ).toMatchObject({ status: 'unavailable', code: 'picture-file-changed' });
    expect(await f.connected('picture-upload', '--file', owner)).toMatchObject({
      status: 'unavailable',
      code: 'picture-pending',
    });
    // Another owner write wins after the receipt was lost. Retrying the old receipt must not republish it.
    f.state.picture = f.present();
    const newer = f.state.picture;
    await rm(external);
    const retried = await f.connected('picture-retry');
    expect(retried).toMatchObject({ status: 'received', receipt: { revision: 2 }, picture: newer });
    expect(f.state.requests.at(-1)).toEqual(proof);
    expect(f.state.writes).toBe(2);
    const removed = await f.connected('picture-remove', '--request-id', 'remove-file-0003');
    expect(removed.picture).toEqual({ state: 'missing', revision: 4 });
    expect(f.state.requests.at(-1)).toMatchObject({
      method: 'DELETE',
      revision: '"3"',
      bytes: Buffer.alloc(0),
      type: '',
    });
    expect((await f.connected('connect')).picture).toMatchObject({ state: 'missing', askOwner: false });
    // Explicit retry of a much older receipt follows the current tombstone.
    expect(await f.connected('picture-retry', '--request-id', 'owner-file-0001')).toMatchObject({
      receipt: { revision: 1 },
      picture: { state: 'missing', revision: 4 },
    });
    expect(await f.connected('picture-upload', '--file', owner)).toMatchObject({
      status: 'received',
      picture: { state: 'present', revision: 5 },
    });
  } finally {
    await f.close();
  }
});

it('bounds local files, refuses URL and invalid metadata, and leaves play ready after upload failures', async () => {
  const f = await fixture();

  try {
    await f.approve();
    const file = `${f.home}/file`;

    for (const bytes of [Buffer.alloc(0), Buffer.from('<svg/>'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
      await writeFile(file, bytes);
      expect((await f.connected('picture-upload', '--file', file)).status).toBe('unavailable');
    }

    expect(
      (await f.connected('picture-upload', '--file', 'https://untrusted.example/picture.png')).status,
    ).toBe('unavailable');
    await writeFile(file, png);
    f.state.malformed = JSON.stringify({ ...f.present(), url: 'https://untrusted.example/redirect' });
    expect((await f.connected('picture-upload', '--file', file)).status).toBe('unavailable');
    f.state.malformed = '';
    f.state.pictureFailure = 415;
    expect((await f.connected('picture-upload', '--file', file)).status).toBe('unavailable');
    expect(f.state.writes).toBe(0);
    expect((await f.connected('start')).status).toBe('queued');
  } finally {
    await f.close();
  }
});

it('a lost uncommitted upload conflicts honestly after a newer image, and rejected IDs never silently overwrite it', async () => {
  const f = await fixture();

  try {
    await f.approve();
    const file = `${f.home}/image.png`;
    await writeFile(file, png);
    f.state.dropBeforeWrite = true;
    expect(
      await f.connected('picture-upload', '--file', file, '--request-id', 'stale-file-0001'),
    ).toMatchObject({ status: 'uncertain' });
    expect(f.state.writes).toBe(0);
    f.state.picture = f.present();
    const newer = f.state.picture;
    expect(await f.connected('picture-retry')).toMatchObject({
      status: 'unavailable',
      code: 'picture-http-412',
    });
    expect(f.state.picture).toEqual(newer);
    expect(await f.connected('picture-retry', '--request-id', 'stale-file-0001')).toMatchObject({
      code: 'picture-rejected',
    });
    f.state.writeFailure = 409;
    expect(
      await f.connected('picture-upload', '--file', file, '--request-id', 'reused-file-0001'),
    ).toMatchObject({ code: 'picture-http-409' });
    expect(f.state.picture).toEqual(newer);
    f.state.writeFailure = 0;
    expect(await f.connected('picture-upload', '--file', file)).toMatchObject({
      status: 'received',
      picture: { revision: 2 },
    });
    expect(f.state.requests.map((request) => request.revision)).toEqual(['"0"', '"0"', '"1"', '"1"']);
  } finally {
    await f.close();
  }
});

it('keeps a malformed successful receipt uncertain until the original operation can be reconciled', async () => {
  const f = await fixture();

  try {
    await f.approve();
    const file = `${f.home}/image.png`;
    await writeFile(file, png);
    f.state.wrongReceipt = true;
    expect(await f.connected('picture-upload', '--file', file)).toMatchObject({ status: 'uncertain' });
    expect(f.state.writes).toBe(1);
    f.state.wrongReceipt = false;
    expect(await f.connected('picture-retry')).toMatchObject({
      status: 'received',
      picture: { state: 'present', revision: 1 },
    });
    expect(f.state.writes).toBe(1);
  } finally {
    await f.close();
  }
});

it('refuses corrupt or cross-connection journal proof before any retry network request', async () => {
  const f = await fixture();

  try {
    await f.approve();
    const file = `${f.home}/image.png`;
    await writeFile(file, png);
    f.state.loseReceipt = true;
    await f.connected('picture-upload', '--file', file, '--request-id', 'proof-file-0001');
    const path = `${f.config}.pictures/proof-file-0001.json`;
    const original = JSON.parse(await readFile(path, 'utf8'));
    const requests = f.state.requests.length;
    await writeFile(
      path,
      JSON.stringify({
        ...original,
        payload: Buffer.concat([png, Buffer.from('changed')]).toString('base64'),
      }),
    );
    expect(await f.connected('picture-retry')).toMatchObject({ code: 'picture-journal' });
    await writeFile(path, JSON.stringify({ ...original, agentId: 'other-agent' }));
    expect(await f.connected('picture-retry')).toMatchObject({ code: 'picture-journal' });
    await writeFile(path, JSON.stringify({ ...original, server: 'https://untrusted.example' }));
    expect(await f.connected('picture-retry')).toMatchObject({ code: 'picture-journal' });
    expect(f.state.requests).toHaveLength(requests);
    await writeFile(path, JSON.stringify(original));
    expect(await f.connected('picture-retry')).toMatchObject({ status: 'received' });
  } finally {
    await f.close();
  }
});

it('reuses explicit source lineage across preview/harness configs while isolating upload authority and returning to source', async () => {
  const f = await fixture();
  const preview = await pictureFixture(picturePort + 1);

  try {
    await f.approve();
    await f.connected('picture-skip');
    const sourceConfig = await readFile(f.config, 'utf8');

    const setup = await f.cli(
      'setup',
      '--server',
      preview.origin,
      '--harness',
      'claude',
      '--picture-source-server',
      f.origin,
      '--picture-source-agent',
      f.agentId,
    );

    const cli = (...args: string[]) => f.cli(...args, '--config', setup.configPath);
    await cli('connect');
    expect(await cli('connect')).toMatchObject({
      status: 'ready',
      picture: { state: 'missing', choice: 'skipped', askOwner: false },
    });
    const file = `${f.home}/preview.png`;
    await writeFile(file, png);
    expect((await cli('picture-upload', '--file', file)).picture.state).toBe('present');
    expect(preview.state.writes).toBe(1);
    expect(f.state.writes).toBe(0);
    expect(await readFile(f.config, 'utf8')).toBe(sourceConfig);
    expect((await f.connected('connect')).picture).toMatchObject({ state: 'missing', askOwner: false });
    expect(preview.state.token).not.toBe(f.state.token);
    await expect(f.connected('picture-status', '--server', preview.origin)).rejects.toThrow();
    await expect(
      f.cli('setup', '--server', preview.origin, '--harness', 'opencode', '--config', f.config),
    ).rejects.toThrow();
    expect(f.state.pairs).toBe(1);
    const listings = await f.cli('connections', '--harness', 'opencode');
    expect(listings.connections[0].server).toBe(f.origin);
  } finally {
    await preview.close();
    await f.close();
  }
});

it('suppresses an offer when queue admission races the optional metadata read', async () => {
  const f = await fixture();

  try {
    f.state.queueDuringRead = true;
    expect((await f.approve()).picture.askOwner).toBe(false);
    expect(f.state.queue.status).toBe('queued');
    expect(await readdir(`${f.home}/.agent-game`)).not.toContain('picture-choices');
  } finally {
    await f.close();
  }
});

it.each(['secret-overlord', 'succession'])(
  'keeps %s required observation/wait and resumed match free of picture offers',
  async (game) => {
    const f = await fixture('opencode', game);

    try {
      await f.approve();

      const entrants = Array.from({ length: 10 }, (_, seat) => ({
        agentId: `agent-${seat}`,
        ownerId: `owner-${seat}`,
        name: `Seat ${seat}`,
        house: false,
        rating: 1000,
      }));

      let view;

      if (game === 'secret-overlord') {
        let state = createMatch('match_tim30', entrants, 0);
        state = advance(state, state.phase.deadline!);
        view = observe(state, state.coordinator);
      } else {
        const initial = await createSuccession('match_tim30', entrants, 0);

        const state = evolveSuccession(initial.state, {
          type: 'advance',
          now: initial.state.phase.deadline!,
        }).state;

        if (state.stage.act !== 1) throw new Error('Expected Act 1 fixture');
        view = observeSuccession(state, state.stage.board.coordinator, {
          visibilityEpoch: 'live',
          streamHead: 0,
        });
      }

      f.state.view = view;
      Object.assign(f.state.queue, {
        status: 'matched',
        gameId: game,
        protocolVersion: game === 'succession' ? '2' : '1',
        rulesVersion: game === 'succession' ? 'succession-1' : '1',
        matchId: 'match_tim30',
      });
      const reads = f.state.reads;

      for (const command of ['connect', 'status', 'observe', 'wait']) {
        const result = await f.connected(command);
        expect(result.picture).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain('picture-help');

        if (command === 'observe' || command === 'wait') expect(result.decision).toEqual(view.decision);
      }

      expect(f.state.reads).toBe(reads);
      expect(view.decision).not.toBeNull();
    } finally {
      await f.close();
    }
  },
);
