import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Schema } from 'effect';
import { supervise } from '../cli/supervisor.mjs';

it('does not mistake a previous match result for completion of a newly queued participation', async () => {
  let invoked = false;

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/api/queue'
          ? invoked
            ? { status: 'matched', matchId: 'match_new' }
            : { status: 'queued', matchId: null }
          : {
              status: 'finished',
              matchId: request.url?.endsWith('match_old') ? 'match_old' : 'match_new',
              winner: 'rogue',
              you: { forfeited: false },
            },
      ),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    const directory = await mkdtemp('/tmp/opencode/agent-next-game-');
    const configPath = `${directory}/connection.json`;
    await writeFile(
      configPath,
      JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: 'match_old' }),
    );

    const result = await supervise({ configPath, harness: 'claude' }, async () => {
      invoked = true;

      return { exitCode: 0, sessionId: 'continued', costUsd: 0 };
    });

    expect(invoked).toBe(true);
    expect(result.matchId).toBe('match_new');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
