import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Schema } from 'effect';
import { expect, it } from 'vitest';
import { createCodingFinale, evolveCodingFinale, observeCodingFinale } from '../src/game/coding-finale/game';
import { gameDescriptor } from '../src/game/descriptors';

it('reduces repeated state while preserving private knowledge, choices, and the full durable action cache', async () => {
  const created = await createCodingFinale(
    'match_compact_cli',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `competitor-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Competitor ${seat}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
      },
    },
  );

  const state = evolveCodingFinale(created.state, {
    type: 'advance',
    now: created.state.phase.deadline!,
  }).state;

  const seat = state.actOne.coordinator;
  const view = observeCodingFinale(state, seat);
  let submitted: unknown;

  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');

    if (request.url?.endsWith('/actions')) {
      let body = '';

      for await (const chunk of request) body += chunk;
      submitted = JSON.parse(body);
      response.end(JSON.stringify({ accepted: true, observation: view }));
    } else response.end(JSON.stringify({ ...view, serverNow: Date.now() }));
  });

  const directory = await mkdtemp(join(tmpdir(), 'compact-cli-'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const config = join(directory, 'connection.json');
  await writeFile(
    config,
    JSON.stringify({ server: `http://127.0.0.1:${port}`, token: 'fixture', matchId: view.matchId }),
  );

  const cli = async (...args: string[]) =>
    (
      await promisify(execFile)(process.execPath, ['cli/agent-game.mjs', ...args, '--config', config]).catch(
        (error) => {
          throw new Error(error.stdout || error.message);
        },
      )
    ).stdout;

  try {
    const full = await cli('observe');
    const compact = await cli('observe', '--compact');
    const shown = JSON.parse(compact);
    expect(Buffer.byteLength(compact)).toBeLessThan(Buffer.byteLength(full) * 0.65);
    expect(shown.actOne.private).toEqual(view.actOne?.private);
    expect(shown.actOne.tracks).toEqual(view.actOne?.tracks);
    expect(shown.decision).toEqual(view.decision);
    expect(shown.you).toEqual(view.you);
    expect(shown.history).toEqual(view.history);
    expect(shown.seats.map((entry: { name: string }) => entry.name)).toEqual(
      view.seats.map((entry) => entry.name),
    );
    const cached = JSON.parse(await readFile(config, 'utf8')).observation;
    expect(cached.decision).toEqual(view.decision);
    expect(cached.actOne).toEqual(view.actOne);
    await cli('act', '--choice', '0', '--compact');
    expect(submitted).toMatchObject({
      gameId: 'coding-finale',
      phaseId: view.phase.id,
      decisionId: view.decision?.id,
      action: view.decision?.actions[0].action,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
