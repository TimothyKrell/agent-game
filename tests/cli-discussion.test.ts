import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Schema } from 'effect';
import { expect, it } from 'vitest';

it('delivers unread addressed discussion without replay, drains backlog before sleeping, and fences authority changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cli-discussion-'));
  const config = join(directory, 'connection.json');

  const view = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'match_discussion',
    status: 'active',
    act: 1,
    serverNow: 100,
    phase: { id: 'phase', kind: 'government-discussion' },
    seats: [],
    actOne: null,
    finale: null,
    you: { seat: 0, generation: 0 },
    history: { visibilityEpoch: 'epoch-0', streamHead: 3 },
    decision: decision(false),
  };

  let requests = 0;
  let handoff = false;
  let historyFails = false;
  let submitted: unknown;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    response.setHeader('content-type', 'application/json');

    if (url.pathname.endsWith('/history')) {
      if (historyFails) {
        response.writeHead(403);
        response.end(JSON.stringify({ error: { code: 'fixture-unavailable', message: 'Unavailable' } }));

        return;
      }

      requests++;
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const cursor = Math.min(after + 10, through);

      const events = Array.from({ length: cursor - after }, (_, offset) => ({
        id: after + offset + 1,
        at: 90,
        eventKey: `match_discussion:${after + offset + 1}`,
        type: 'chat',
        seat: 1,
        text: 'What did you draw?',
        data: { to: [0], replyTo: { eventKey: 'match_discussion:earlier', seat: 0 } },
      }));

      const page = {
        gameId: view.gameId,
        protocolVersion: '3',
        matchId: view.matchId,
        visibilityEpoch: view.history.visibilityEpoch,
        after,
        cursor,
        through,
        streamHead: through,
        events,
        hasMore: cursor < through,
        reset: false,
      };

      if (handoff) {
        view.you.generation++;
        view.history.visibilityEpoch = `epoch-${view.you.generation}`;
      }

      response.end(JSON.stringify(page));
    } else if (url.pathname.endsWith('/actions')) {
      let body = '';

      for await (const chunk of request) body += chunk;
      submitted = JSON.parse(body);
      response.end(JSON.stringify({ accepted: true, observation: view }));
    } else response.end(JSON.stringify(view));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${port}`, token: 'fixture', matchId: view.matchId }),
  );

  const cli = async (...args: string[]) =>
    JSON.parse(
      (
        await promisify(execFile)(
          process.execPath,
          ['cli/agent-game.mjs', ...args, '--compact', '--discussion', '--config', config],
          { timeout: 4000 },
        ).catch((error) => {
          throw new Error(error.stdout || error.message);
        })
      ).stdout,
    );

  try {
    const first = await cli('observe');
    expect(first.discussion.events).toHaveLength(3);
    expect(first.discussion.events[0].addressedToYou).toBe(true);
    expect(first.discussion.awaitingReply).toHaveLength(3);
    expect((await cli('observe')).discussion.events).toEqual([]);
    expect(requests).toBe(1);
    view.history.streamHead = 25;
    const next = await cli('wait', '--timeout', '60');
    expect(next.discussion.cursor).toBe(13);
    expect(next.discussion.events[0].id).toBe(4);
    expect(next.discussion.hasMore).toBe(true);
    const before = requests;
    view.decision = { id: 'vote', actions: [{ action: { type: 'vote', approve: true } }] };
    expect((await cli('observe')).discussion.deferred).toBe('required-action');
    expect(requests).toBe(before);
    view.decision = null;
    const resumed = await cli('observe');
    expect(resumed.discussion.awaitingReply).toHaveLength(3);
    expect(resumed.discussion.awaitingReply[2].eventKey).toBe('match_discussion:23');
    handoff = true;
    const stale = await cli('observe');
    expect(stale.you.generation).toBe(1);
    expect(stale.discussion).toEqual({ reset: true, events: [] });
    expect(JSON.parse(await readFile(config, 'utf8')).discussionWalk.cursor).toBe(23);
    handoff = false;
    expect((await cli('observe')).discussion.events).toHaveLength(10);
    expect((await cli('observe', '--discussion-reset')).discussion.events).toHaveLength(10);
    await cli(
      'say',
      '--text',
      'Explain the contradiction.',
      '--to',
      '1,2',
      '--reply-to',
      'match_discussion:22',
      '--reply-seat',
      '1',
    );
    expect(submitted).toMatchObject({
      action: { type: 'chat', to: [1, 2], replyTo: { eventKey: 'match_discussion:22', seat: 1 } },
    });
    historyFails = true;
    view.history.streamHead++;
    const accepted = await cli('say', '--text', 'Another statement.');
    expect(accepted.accepted).toBe(true);
    expect(accepted.observation.discussion.error).toContain('unavailable');
    expect(JSON.parse(await readFile(config, 'utf8')).discussionWalk.cursor).toBe(25);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});

function decision(
  pending: boolean,
): { id: string; actions: { action: { type: string; approve: boolean } }[] } | null {
  return pending ? { id: 'vote', actions: [{ action: { type: 'vote', approve: true } }] } : null;
}
