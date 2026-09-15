import { beforeAll, afterAll, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { decodeGameState, inspectGame } from '../src/game/registry';
import {
  initialize,
  shutdown,
  connection,
  accelerateQueued,
  cli,
  native,
  target,
  post,
  events,
  waitFor,
  evidence,
  discussion,
  observe,
  matchQuery,
} from './harness';

beforeAll(initialize, 120000);

afterAll(shutdown, 30000);

it('retains a pending native mandatory HTTP action before an explicit grace advance', async () => {
  const f = await connection('opencode', 'secret-overlord');
  await accelerateQueued(f.selected.configPath);
  const assigned = await cli(f.selected.configPath, ['status']);
  expect(assigned.status).toBe('matched');
  await post(target, '/fixture/action-hold', { action: 'required' });
  const child = await native(f.selected.configPath, 'opencode', 'held-required');
  let held: { phaseId: string; type: string }[] = [];

  try {
    await waitFor(async () => {
      held = await (await post(target, '/fixture/held-actions', {})).json();

      if (held.length) return true;
      const view = await observe(assigned.matchId, f.state.token);

      if (view.phase.kind.includes('discussion')) await discussion(assigned.matchId, view.phase.id, child);

      return false;
    });
    const before = await observe(assigned.matchId, f.state.token);
    await waitFor(async () => {
      const data = JSON.parse(String((await matchQuery(assigned.matchId, 'SELECT data FROM game'))[0].data));

      const events = (await matchQuery(assigned.matchId, 'SELECT data FROM events ORDER BY id')).map((row) =>
        JSON.parse(String(row.data)),
      );

      const pending = inspectGame(decodeGameState({ ...data, events })).pendingSeats;

      return data.phase.id === held[0].phaseId && pending.length === 1 && pending[0] === before.you.seat;
    });

    const transition = await (
      await post(target, '/fixture/clock', {
        matchId: assigned.matchId,
        phaseId: held[0].phaseId,
        kind: 'grace',
      })
    ).json();

    await post(target, '/fixture/action-hold', { action: null });
    await waitFor(async () =>
      (await events(child.log)).some((event) => event.type === 'failure' || event.command?.[0] === 'act'),
    );
    const journal = await events(child.log);
    const after = await observe(assigned.matchId, f.state.token);
    const failures = journal.filter((event) => event.type === 'failure');
    await writeFile(
      `${evidence}/held-required-control.json`,
      JSON.stringify(
        {
          held,
          transition,
          before: before.you,
          after: after.you,
          failures,
          commands: journal.filter((event) => event.type === 'cli'),
        },
        null,
        2,
      ) + '\n',
    );
    expect(transition).toMatchObject({ advanced: false, reason: 'native-http-pending' });
    expect(failures).toEqual([]);
    expect(after.you.forfeited).toBe(false);
    expect(journal.some((event) => event.command?.[0] === 'act' && event.accepted)).toBe(true);
  } finally {
    await post(target, '/fixture/action-hold', { action: null });
  }
}, 30000);
