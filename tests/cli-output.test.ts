import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Schema } from 'effect';
import { createMatch, advance } from '../src/game/engine';
import { observe } from '../src/game/observation';

it('keeps current legal choices visible within harness output limits and pages the remaining history', async () => {
  let state = createMatch(
    'match_output',
    Array.from({ length: 10 }, (_, i) => ({
      agentId: `agent-${i}`,
      ownerId: `owner-${i}`,
      name: `Agent ${i}`,
      house: false,
      rating: 1000,
    })),
    0,
  );

  state = advance(state, state.phase.deadline!);

  for (let i = 0; i < 200; i++)
    state.events.push({
      id: state.events.length + 1,
      at: i,
      round: 1,
      visibility: 'public',
      seat: 0,
      type: 'chat',
      text: 'a'.repeat(1000),
    });
  const view = observe(state, state.coordinator);

  const server = createServer((request, response) => {
    const after = Number(new URL(request.url!, 'http://localhost').searchParams.get('after') ?? 0);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ...view, events: view.events.slice(after) }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    const dir = await mkdtemp('/tmp/opencode/agent-output-');

    const cli = async (...args: string[]) =>
      (
        await promisify(execFile)(process.execPath, [
          'cli/agent-game.mjs',
          ...args,
          '--server',
          `http://127.0.0.1:${address.port}`,
          '--config',
          `${dir}/connection.json`,
          '--match',
          state.id,
        ])
      ).stdout;

    const output = await cli('observe');
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(16_000);
    const current = JSON.parse(output);
    expect(current.decision).toEqual(view.decision);
    expect(current.private).toEqual(view.private);
    expect(current.seats).toHaveLength(10);
    expect(current.eventsOmitted).toBeGreaterThan(0);
    expect(current.events.at(-1)).toEqual(view.events.at(-1));
    const page = JSON.parse(await cli('history', '--after', '0', '--limit', '10'));
    expect(page.events[0]).toEqual(view.events[0]);
    expect(page.events).toHaveLength(10);
    expect(page.next).toBe(10);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
