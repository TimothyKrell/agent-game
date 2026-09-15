import { beforeAll, afterAll, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  initialize,
  shutdown,
  connection,
  accelerateQueued,
  cli,
  native,
  source,
  query,
  matchQuery,
  waitFor,
  providerMode,
  providerCalls,
  discussion,
  observe,
  evidence,
  events,
  pause,
} from './harness';

beforeAll(initialize, 120000);

afterAll(shutdown, 30000);

it('does not confuse an old optional denial with live admitted source inference', async () => {
  const f = await connection('opencode', 'secret-overlord');
  // Reviewer counterprobe: only a short-lived priority waiter is seeded. Admission itself denies,
  // naturally expires the waiter, retries the unchanged jobs and dispatches actual loopback HTTP.
  const expiresAt = Date.now() + 4000;
  await query(
    source,
    'INSERT INTO inference_waiters(id,match_id,kind,expires_at) VALUES (?,?,?,?)',
    ['review-required-priority', 'review-priority-sentinel', 'required', expiresAt],
    true,
  );
  providerMode.hold = true;
  await accelerateQueued(f.selected.configPath);
  const assignment = await cli(f.selected.configPath, ['status']);
  expect(assignment.status).toBe('matched');
  const child = await native(f.selected.configPath, 'opencode', 'retry-after-denial');
  const view = await observe(assignment.matchId, f.state.token);

  const outbox = await matchQuery(
    assignment.matchId,
    "SELECT id,data FROM outbox WHERE json_extract(data,'$.phaseId')=? AND id LIKE '%:chat:0'",
    [view.phase.id],
  );

  expect(outbox.length).toBeGreaterThan(0);
  const callsBeforeExpiry = providerCalls.length;
  expect(Date.now()).toBeLessThan(expiresAt);
  expect(callsBeforeExpiry).toBe(0);
  const initialOutcomes = await query(source, 'SELECT * FROM playable_inference_observations', [], true);
  expect(
    initialOutcomes.some((row) => {
      const rpc = JSON.parse(String(row.result));

      return rpc.ok && rpc.value.result.state === 'denied' && rpc.value.result.reason === 'required-priority';
    }),
  ).toBe(true);
  await waitFor(
    async () =>
      providerCalls.length >= outbox.length &&
      (await events(child.log)).some(
        (event) => event.type === 'phase-ready' && event.phase === view.phase.id,
      ),
    10000,
  );
  await pause(30);
  const nativeJournal = await events(child.log);
  const calls = await query(source, 'SELECT * FROM preview_broker_calls', [], true);
  const usage = await query(source, 'SELECT * FROM usage', [], true);
  const waiters = await query(source, 'SELECT * FROM inference_waiters', [], true);
  const providersBefore = providerCalls.map((call) => ({ ...call }));
  let transition = await discussion(assignment.matchId, view.phase.id, child);

  for (let n = 0; !transition.advanced && n < 3; n++) {
    await pause(100);
    transition = await discussion(assignment.matchId, view.phase.id, child);
  }

  const after = await observe(assignment.matchId, f.state.token);

  const record = {
    assignment,
    expiresAt,
    phaseBefore: view.phase.id,
    phaseAfter: after.phase.id,
    outbox,
    callsBeforeExpiry,
    initialOutcomes,
    nativeJournal,
    calls,
    usage,
    waiters,
    providersBefore,
    transition,
    providersAfter: providerCalls.map((call) => ({ ...call })),
  };

  await writeFile(`${evidence}/denied-then-admitted-control.json`, JSON.stringify(record, null, 2) + '\n');
  expect(providersBefore.length).toBe(outbox.length);
  expect(providersBefore.every((call) => !call.finished)).toBe(true);
  expect(calls.every((call) => call.state === 'dispatched' && call.result === null)).toBe(true);
  expect(transition.advanced, 'Already admitted source HTTP must block simulated discussion expiry').toBe(
    false,
  );
  expect(after.phase.id).toBe(view.phase.id);
  expect(transition.house.jobs).toEqual(
    expect.arrayContaining(
      outbox.map((row) =>
        expect.objectContaining({
          id: row.id,
          complete: false,
          deferred: false,
          source: expect.objectContaining({ dispatched: true }),
        }),
      ),
    ),
  );
  providerMode.hold = false;
  let completed = calls;
  await waitFor(async () => {
    completed = (await query(source, 'SELECT * FROM preview_broker_calls', [], true)).filter((row) =>
      calls.some((original) => original.id === row.id),
    );

    return (
      completed.length === calls.length &&
      completed.every((row) => row.state === 'completed' && row.result !== null)
    );
  });

  const accounted = (await query(source, 'SELECT * FROM usage', [], true)).filter((row) =>
    calls.some((original) => original.id === row.id),
  );

  expect(accounted).toHaveLength(calls.length);
  expect(accounted.every((row) => row.done === 1 && row.actual === 0.000072)).toBe(true);
  let released = transition;
  await waitFor(async () => {
    released = await discussion(assignment.matchId, view.phase.id, child);

    return released.advanced;
  });
  const advanced = await observe(assignment.matchId, f.state.token);
  expect(advanced.phase.id).not.toBe(view.phase.id);
  expect(advanced.you.forfeited).toBe(false);
  await writeFile(
    `${evidence}/denied-then-completed-control.json`,
    JSON.stringify(
      {
        phaseBefore: view.phase.id,
        phaseAfter: advanced.phase.id,
        completed,
        accounted,
        released,
        providerCalls: providerCalls.map((call) => ({ ...call })),
      },
      null,
      2,
    ) + '\n',
  );
}, 30000);
