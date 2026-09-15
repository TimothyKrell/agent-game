import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir('.tim27-protocol/runs', { recursive: true });

const directory = await mkdtemp(resolve('.tim27-protocol/runs/probe-'));

console.log(`Evidence: ${directory}`);

const source = '854eeae7e335b2d1423ec99440bfe0db87af34a3';

const current = '508bbef73cbe8726829752baea3aaab0d78b1905';

const corrected = 'f932a0e9a42400cef3ced5157bca542a4426ef6b';

const paths = [
  'cli',
  'skills/agent-game',
  'public/rules.md',
  'public/protocol.md',
  'public/rating-method.md',
  'public/games',
  'package.json',
];

const results = { source, current, probes: [], paidCalls: 0 };

async function snapshot(revision) {
  const root = `${directory}/${revision.slice(0, 7)}`;
  await mkdir(root);

  const { stdout } = await run('git', ['archive', revision, ...paths], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });

  const tar = `${root}/source.tar`;
  await writeFile(tar, stdout);
  await run('tar', ['-xf', tar, '-C', root]);

  return {
    root,
    revision,
    archiveSha256: hash(stdout),
    cliSha256: hash(await readFile(`${root}/cli/agent-game.mjs`)),
  };
}

async function release020() {
  const root = `${directory}/released-0.2.0`;
  await mkdir(root);

  const { stdout } = await run('git', ['show', `${current}:cli/releases/agent-game-cli-0.2.0.tgz`], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
  });

  await writeFile(`${root}/package.tgz`, stdout);
  await run('tar', ['-xzf', `${root}/package.tgz`, '-C', root]);

  return {
    root: `${root}/package`,
    revision: 'released-0.2.0',
    archiveSha256: hash(stdout),
    cliSha256: hash(await readFile(`${root}/package/cli/agent-game.mjs`)),
  };
}

// Reuse the precise data literals from the test whose assertion appears in the historical stack.
const testSource = (await run('git', ['show', `${source}:tests/cli-succession.test.ts`])).stdout;

const literals = testSource
  .slice(
    testSource.indexOf('const identity: Pick<Observation2'),
    testSource.indexOf("it('preserves selected game through first pairing"),
  )
  .replace(": Pick<Observation2, 'gameId' | 'rulesVersion' | 'protocolVersion'>", '')
  .replace(': Observation2', '');

const fixture = JSON.parse(
  runInNewContext(`${literals}; JSON.stringify({identity, current})`, {}, { timeout: 1000 }),
);

await writeFile(`${directory}/fixture-input.json`, JSON.stringify(fixture, null, 2));

async function serverFixture(options = {}) {
  const requests = [];
  const errors = [];
  let queued = options.matched ?? false;
  let view = structuredClone(fixture.current);

  if (options.finishOnAction) {
    view.createdAt = Date.now();
    view.phase.deadline = Date.now() + 5000;
    view.phase.graceUntil = Date.now() + 10000;
  }

  const server = createServer((request, response) => {
    void (async () => {
      const record = {
        method: request.method,
        path: request.url,
        protocols: request.headers['x-agent-game-protocols'] ?? null,
        headerNames: Object.keys(request.headers),
        userAgent: request.headers['user-agent'] ?? null,
        upgrade: request.headers.upgrade ?? null,
        authorization: request.headers.authorization ? '<REDACTED>' : null,
      };

      requests.push(record);

      try {
        assert.equal(request.headers['x-agent-game-protocols'], '1,2');
      } catch (error) {
        errors.push({
          name: error.name,
          code: error.code,
          actual: error.actual ?? null,
          expected: error.expected,
          request: record,
        });
      }

      let body = '';

      for await (const chunk of request) body += chunk;
      const input = body ? JSON.parse(body) : {};
      record.bodyKeys = Object.keys(input);

      if (request.url.startsWith('/api/') && options.responses?.length) {
        const next = options.responses.shift();
        response.statusCode = next.status;
        response.end(next.body);

        return;
      }

      let value;

      if (request.url === '/api/pairing')
        value = { expiresAt: Date.now() + 60000, verificationUrl: `${origin}/approval` };
      else if (request.url === '/api/pairing/status') value = { status: 'approved', agentId: 'agent_a' };
      else if (request.url === '/api/queue') {
        if (request.method === 'POST') queued = true;
        value = queued
          ? { ...fixture.identity, status: 'matched', matchId: 'match_two' }
          : { status: 'idle' };
      } else if (request.url?.endsWith('/actions')) {
        if (options.finishOnAction)
          view = {
            ...view,
            status: 'finished',
            decision: null,
            finishedAt: Date.now(),
            history: { visibilityEpoch: 'archive', streamHead: 151 },
          };
        value = { accepted: true, actionId: input.actionId, observation: view };
      } else value = view;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(value));
    })().catch((error) => {
      response.statusCode = 500;
      response.end(error.message);
    });
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;

  return {
    origin,
    requests,
    errors,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}

const mode = process.argv[2] ?? 'pairing';

try {
  if (mode === 'detector-control') {
    const server = await serverFixture();

    try {
      await fetch(`${server.origin}/api/queue`);
      results.probes.push({
        name: 'deliberately omitted header; detector control, not original incident reproduction',
        requests: server.requests,
        errors: server.errors,
      });
      assert.equal(server.errors.length, 0, 'Header detector rejects an omitted negotiation header');
    } finally {
      await server.close();
    }
  } else if (mode === 'pairing') {
    for (const revision of [source, current]) {
      const code = await snapshot(revision);
      const server = await serverFixture();
      const config = `${code.root}/connection.json`;
      const home = `${code.root}/home`;
      await mkdir(home);
      const commands = [];

      try {
        for (const args of [
          ['start', '--game', 'succession'],
          ['start'],
          ['observe'],
          ['act', '--choice', '0'],
          ['start', '--game', 'secret-overlord'],
        ]) {
          try {
            const output = await run(
              process.execPath,
              [`${code.root}/cli/agent-game.mjs`, ...args, '--server', server.origin, '--config', config],
              {
                cwd: code.root,
                env: { PATH: dirname(process.execPath), HOME: home, XDG_CONFIG_HOME: home },
                timeout: 15000,
              },
            );

            const value = JSON.parse(output.stdout);
            commands.push({ args, exitCode: 0, status: value.status, accepted: value.accepted });
          } catch (error) {
            commands.push({ args, exitCode: error.code, stderr: error.stderr });

            if (args.at(-1) !== 'secret-overlord') throw error;
          }
        }

        results.probes.push({
          name: 'original pairing/start/observe/action command sequence',
          ...code,
          commands,
          requests: server.requests,
          errors: server.errors,
        });
        assert.equal(server.errors.filter((error) => error.request.path.startsWith('/api/')).length, 0);
        assert.ok(server.requests.some((request) => request.path.endsWith('/actions')));
      } finally {
        await server.close();
      }
    }
  } else if (mode === 'websocket') {
    for (const revision of [source, current]) {
      const code = await snapshot(revision);
      const { GameClient } = await import(pathToFileURL(`${code.root}/cli/agent-game.mjs`));
      const server = await serverFixture();

      try {
        const client = new GameClient(server.origin);
        await client.observation('match_two');
        const socket = await client.connect('match_two', 0, '2');
        await new Promise((done, reject) => {
          const timer = setTimeout(() => {
            socket.close();
            reject(new Error('No loopback WebSocket handshake result'));
          }, 1500);

          socket.addEventListener(
            'error',
            () => {
              clearTimeout(timer);
              done();
            },
            { once: true },
          );
          socket.addEventListener(
            'open',
            () => {
              clearTimeout(timer);
              socket.close();
              done();
            },
            { once: true },
          );
        });
        results.probes.push({
          name: 'actual GameClient WebSocket delivered to original blanket request assertion',
          ...code,
          requests: server.requests,
          errors: server.errors,
        });
        assert.equal(server.requests[0].protocols, '1,2');
        const upgrades = server.errors.filter((error) => error.request.upgrade === 'websocket');
        assert.equal(upgrades.length, 1);
        assert.match(upgrades[0].request.path, /protocol=2/);
        assert.equal(
          server.errors.filter((error) => error.request.path.startsWith('/api/') && !error.request.upgrade)
            .length,
          0,
        );
      } finally {
        await server.close();
      }
    }
  } else if (mode === 'wire-matrix') {
    for (const code of [
      await release020(),
      await snapshot(source),
      await snapshot(corrected),
      await snapshot(current),
    ]) {
      const { GameClient } = await import(pathToFileURL(`${code.root}/cli/agent-game.mjs`));

      for (const scenario of [
        { name: 'success', responses: [] },
        {
          name: '503 retry',
          responses: [{ status: 503, body: '{"error":{"code":"unavailable","message":"synthetic"}}' }],
        },
        {
          name: 'JSON 401',
          responses: [{ status: 401, body: '{"error":{"code":"unauthorized","message":"synthetic"}}' }],
        },
        {
          name: 'malformed 401',
          responses: Array.from({ length: 3 }, () => ({ status: 401, body: 'not-json' })),
        },
      ]) {
        const server = await serverFixture({ responses: scenario.responses });
        let outcome;

        try {
          try {
            await new GameClient(server.origin, 'synthetic-protocol-diagnostic').request('/api/queue');
            outcome = { status: 'returned' };
          } catch (error) {
            outcome = {
              status: 'threw',
              name: error.name,
              httpStatus: error.status ?? null,
              code: error.code ?? null,
            };
          }

          results.probes.push({
            name: scenario.name,
            ...code,
            outcome,
            requests: server.requests,
            errors: server.errors,
          });
          assert.equal(server.errors.filter((error) => error.request.path.startsWith('/api/')).length, 0);
        } finally {
          await server.close();
        }
      }
    }
  } else if (mode === 'native') {
    for (const revision of [source, current]) {
      const code = await snapshot(revision);

      for (const harness of ['claude', 'opencode']) {
        const server = await serverFixture({ matched: true, finishOnAction: true });
        const home = `${code.root}/home-${harness}`;
        await mkdir(home);
        const config = `${home}/connection.json`;
        await writeFile(
          config,
          JSON.stringify({
            server: server.origin,
            agentId: 'agent_a',
            token: 'synthetic-protocol-diagnostic',
            installationId: 'synthetic-installation',
            matchId: 'match_two',
            selectedGame: 'succession',
            participation: { gameId: 'succession', matchId: 'match_two' },
          }),
        );
        await writeFile(
          `${home}/${harness === 'opencode' ? 'opencode2' : 'claude'}`,
          `#!${process.execPath}\n${await readFile('.tim27-protocol/native.mjs', 'utf8')}`,
          { mode: 0o700 },
        );

        try {
          const output = await run(
            process.execPath,
            [resolve('.tim27-protocol/native-driver.mjs'), code.root, config, harness],
            {
              cwd: home,
              env: {
                PATH: `${home}:${dirname(process.execPath)}`,
                HOME: home,
                XDG_CONFIG_HOME: home,
                PROTOCOL_NATIVE_CONFIG: config,
                PROTOCOL_NATIVE_LOG: `${home}/native.jsonl`,
              },
              timeout: 15000,
              maxBuffer: 1024 * 1024,
            },
          );

          const result = JSON.parse(output.stdout);
          assert.equal(result.status, 'finished', JSON.stringify(result));
          const journal = (await readFile(`${home}/native.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
          results.probes.push({
            name: 'ordinary native private HTTP with integral fixture clock',
            ...code,
            harness,
            result: { status: result.status, invocations: result.invocations },
            journal,
            requests: server.requests,
            errors: server.errors,
          });
          assert.equal(result.status, 'finished');
          assert.equal(result.invocations, 1);
          assert.equal(server.errors.filter((error) => error.request.path.startsWith('/api/')).length, 0);
          assert.ok(server.requests.some((request) => request.path.endsWith('/actions')));
        } finally {
          await server.close();
        }
      }
    }
  } else throw new Error(`Unknown probe: ${mode}`);
} finally {
  await writeFile(`${directory}/result.json`, JSON.stringify(results, null, 2) + '\n');
}
