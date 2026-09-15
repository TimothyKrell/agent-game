import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { Schema } from 'effect';
import { supervise } from '../cli/supervisor.mjs';

it.each([
  { status: 401, body: '' },
  { status: 401, body: '<html>expired</html>' },
  { status: 403, body: '<html>denied</html>' },
  { status: 403, body: 'null' },
  { status: 200, body: '<html>unreadable success</html>' },
])(
  'preserves HTTP $status authority independently of the native monitor response body $body',
  async ({ status, body }) => {
    const directory = await mkdtemp('/tmp/opencode/supervisor-http-');
    const configPath = `${directory}/connection.json`;
    const controller = new AbortController();
    const identity = { gameId: 'secret-overlord', protocolVersion: '1', rulesVersion: 'secret-overlord-1' };
    const createdAt = Date.now();
    let running = false;
    let denials = 0;

    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');

      if (running) {
        denials++;
        response.writeHead(status);
        response.end(body);

        if (status === 200) setTimeout(() => controller.abort(), 100);

        return;
      }

      response.end(
        JSON.stringify(
          request.url === '/api/queue'
            ? {
                ...identity,
                status: 'matched',
                matchId: 'match_denial',
                requestId: 'join_denial',
                joinedAt: createdAt,
              }
            : {
                ...identity,
                matchId: 'match_denial',
                status: 'active',
                createdAt,
                phase: { id: 'phase_one', kind: 'discussion' },
                decision: null,
                you: { forfeited: false },
                controller: { kind: 'external' },
              },
        ),
      );
    });

    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    await writeFile(
      configPath,
      JSON.stringify({
        server: `http://127.0.0.1:${port}`,
        token: 'local-fixture',
        agentId: 'agent_fixture',
        preview: {},
        selectedGame: 'secret-overlord',
      }),
    );
    await writeFile(
      `${directory}/claude`,
      `#!${process.execPath}
process.on('SIGTERM',()=>{console.log(JSON.stringify({type:'result',subtype:'success',session_id:'ses_http',total_cost_usd:0.25}));process.exit(0);});
console.log(JSON.stringify({type:'system',session_id:'ses_http'}));setInterval(()=>{},1000);
`,
      { mode: 0o700 },
    );
    vi.stubEnv('PATH', `${directory}:${process.env.PATH}`);

    try {
      const started = Date.now();

      const result = await supervise({
        configPath,
        harness: 'claude',
        signal: controller.signal,
        maxRuntimeMs: 5000,
        childSliceMs: 4000,
        onEvent: (event) => {
          if (event.type === 'harness-event') running = true;
        },
      });

      expect(result.reason).toBe(status === 200 ? 'user-stopped' : 'authority-ended');
      expect(result.invocations).toBe(1);
      expect(result.costUsd).toBe(0.25);
      expect(denials).toBeGreaterThan(0);
      expect(Date.now() - started).toBeLessThan(3500);
      const ledger = await readFile(`${configPath}.supervisor.json`);

      if (status !== 200) {
        await expect(supervise({ configPath, harness: 'claude' })).rejects.toMatchObject({ status });
        expect(await readFile(`${configPath}.supervisor.json`)).toEqual(ledger);
      }
    } finally {
      vi.unstubAllEnvs();
      controller.abort();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  10_000,
);
