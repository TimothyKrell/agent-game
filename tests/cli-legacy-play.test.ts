import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema } from 'effect';
import { expect, it } from 'vitest';
import { act, advance, createMatch, pendingSeats } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { previewAction } from '../src/game/preview';
import { ActionRequestSchema, ObservationSchema } from '../src/shared/api';
import { version } from '../package.json';

const run = promisify(execFile);

it.each(['0.1.1', version])(
  'completes original-game play through installed CLI %s with its original envelopes',
  async (release) => {
    const directory = await mkdtemp('/tmp/opencode/cli-legacy-play-');
    await run(process.execPath, ['scripts/package-cli.mjs']);
    await run('npm', [
      'install',
      '--prefix',
      directory,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      resolve(`public/downloads/agent-game-cli-${release}.tgz`),
    ]);
    let serial = 0;
    let seed = 56;

    const context = {
      random(size: number) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

        return Math.floor((seed / 4294967296) * size);
      },
      id: () => `legacy-${serial++}`,
    };

    let state = createMatch(
      'match_packaged_legacy',
      Array.from({ length: 10 }, (_, seat) => ({
        agentId: `agent-${seat}`,
        ownerId: `owner-${seat}`,
        name: `Seat ${seat}`,
        house: seat !== 0,
        rating: 1000,
      })),
      0,
      context,
    );

    const externalSeat = state.seats.findIndex((seat) => seat.entrant.agentId === 'agent-0');
    const ended = () => ['finished', 'interrupted'].includes(state.phase.kind);

    const pump = () => {
      for (let steps = 0; !ended(); steps++) {
        if (steps > 1000) throw new Error('Legacy fixture did not progress');
        const pending = pendingSeats(state);

        if (pending.includes(externalSeat)) return;
        const seat = pending[0];

        if (seat !== undefined) {
          const view = observe(state, seat, 0, true);
          const action = previewAction(view);

          if (!action || !view.decision) throw new Error('Missing house decision');
          state = act(
            state,
            seat,
            state.seats[seat].generation,
            { actionId: context.id(), phaseId: view.phase.id, decisionId: view.decision.id, action },
            state.phase.startedAt + 1,
            context,
          );
        } else {
          if (state.phase.deadline === null) throw new Error('Missing deadline');
          state = advance(state, state.phase.deadline, context);
        }
      }
    };

    const server = createServer(async (request, response) => {
      try {
        let actionId: string | undefined;

        if (request.url?.endsWith('/actions')) {
          let body = '';

          for await (const chunk of request) body += chunk;
          expect(JSON.parse(body).gameId).toBeUndefined();
          const input = Schema.decodeUnknownSync(ActionRequestSchema)(JSON.parse(body));
          actionId = input.actionId;
          state = act(
            state,
            externalSeat,
            state.seats[externalSeat].generation,
            input,
            state.phase.startedAt + 1,
            context,
          );
        }

        pump();
        const after = Number(new URL(request.url!, 'http://localhost').searchParams.get('after') ?? 0);
        const view = observe(state, externalSeat, after);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(actionId ? { accepted: true, actionId, observation: view } : view));
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: { message: String(error) } }));
      }
    });

    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    const config = `${directory}/connection.json`;
    await writeFile(
      config,
      JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: state.id, agentId: 'agent-0' }),
    );

    const cli = async (...args: string[]) =>
      JSON.parse(
        (
          await run(
            process.execPath,
            [`${directory}/node_modules/.bin/agent-game`, ...args, '--config', config],
            { cwd: directory },
          )
        ).stdout,
      );

    try {
      let view = Schema.decodeUnknownSync(ObservationSchema)(await cli('observe'));
      let choices = 0;

      while (view.status === 'active') {
        if (++choices > 200 || !view.decision) throw new Error('Missing external decision');
        const action = previewAction(view);

        const choice = view.decision.actions.findIndex(
          (entry) => JSON.stringify(entry.action) === JSON.stringify(action),
        );

        expect(choice).toBeGreaterThanOrEqual(0);
        view = Schema.decodeUnknownSync(ObservationSchema)(
          (await cli('act', '--choice', String(choice))).observation,
        );
      }

      expect(view.status).toBe('finished');
      expect(view.winner).not.toBeNull();
      expect(view.you?.forfeited).toBe(false);
      expect(choices).toBeGreaterThan(1);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
