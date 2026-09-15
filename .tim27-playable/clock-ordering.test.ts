import { beforeEach, afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
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
  providerMode,
  providerCalls,
  discussion,
  observe,
} from './harness';

beforeEach(initialize, 120000);

afterEach(shutdown, 30000);

it('does not advance a discussion past a received native HTTP action', async () => {
  const f = await connection('opencode', 'secret-overlord');
  await accelerateQueued(f.selected.configPath);
  const assigned = await cli(f.selected.configPath, ['status']);
  expect(assigned.status).toBe('matched');
  await post(target, '/fixture/action-hold', { action: 'chat' });
  const child = await native(f.selected.configPath, 'opencode', 'held-chat');
  let held: { phaseId: string; type: string }[] = [];

  try {
    await waitFor(async () => {
      held = await (await post(target, '/fixture/held-actions', {})).json();

      return held.length > 0;
    });

    const transition = await (
      await post(target, '/fixture/clock', {
        matchId: assigned.matchId,
        phaseId: held[0].phaseId,
        kind: 'discussion',
      })
    ).json();

    await post(target, '/fixture/action-hold', { action: null });
    await waitFor(async () =>
      (await events(child.log)).some((event) => event.type === 'failure' || event.command?.[0] === 'say'),
    );
    const journal = await events(child.log);
    const failures = journal.filter((event) => event.type === 'failure');
    await writeFile(
      `${evidence}/held-chat-control.json`,
      JSON.stringify(
        { held, transition, failures, commands: journal.filter((event) => event.type === 'cli') },
        null,
        2,
      ) + '\n',
    );
    expect(transition).toMatchObject({ advanced: false });
    expect(failures).toEqual([]);
    expect(journal.some((event) => event.command?.[0] === 'say' && event.accepted)).toBe(true);
  } finally {
    await post(target, '/fixture/action-hold', { action: null });
  }
}, 30000);

it('waits for actual house HTTP completion before its explicit discussion expiry', async () => {
  const f = await connection('opencode', 'secret-overlord');
  providerMode.hold = true;
  await accelerateQueued(f.selected.configPath);
  const assigned = await cli(f.selected.configPath, ['status']);
  const child = await native(f.selected.configPath, 'opencode', 'held-house');
  let view = await observe(assigned.matchId, f.state.token);

  try {
    await waitFor(async () => {
      view = await observe(assigned.matchId, f.state.token);

      return (
        providerCalls.some((call) => !call.finished) &&
        (await events(child.log)).some(
          (event) => event.type === 'phase-ready' && event.phase === view.phase.id,
        )
      );
    });
    const blocked = await discussion(assigned.matchId, view.phase.id, child);
    expect(blocked).toMatchObject({ advanced: false, reason: 'house-pending' });
    providerMode.hold = false;
    let released;
    await waitFor(async () => {
      released = await discussion(assigned.matchId, view.phase.id, child);

      return released.advanced;
    });
    await writeFile(
      `${evidence}/held-house-control.json`,
      JSON.stringify({ blocked, released, providerCalls }, null, 2) + '\n',
    );
    expect(providerCalls.some((call) => call.finished)).toBe(true);
    expect((await observe(assigned.matchId, f.state.token)).you.forfeited).toBe(false);
  } finally {
    providerMode.hold = false;
  }
}, 30000);
