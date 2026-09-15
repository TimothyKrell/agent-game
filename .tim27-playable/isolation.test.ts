import { beforeEach, afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  initialize,
  shutdown,
  connection,
  accelerateQueued,
  cli,
  source,
  target,
  query,
  saved,
  evidence,
} from './harness';

beforeEach(initialize, 120000);

afterEach(shutdown, 30000);

it('captures the distinct errors caused by an active predecessor and its unconsumed fault', async () => {
  const predecessor = await connection('opencode', 'succession');
  await accelerateQueued(predecessor.selected.configPath);
  const assigned = await cli(predecessor.selected.configPath, ['status']);
  expect(assigned.status).toBe('matched');
  const recovery = await connection('opencode', 'succession');
  const resumed = await cli(recovery.selected.configPath, ['start']);
  expect(resumed.matchId).toBe(assigned.matchId);
  expect((await saved(recovery.selected.configPath)).pendingJoin).toBeUndefined();
  const different = await connection('claude', 'secret-overlord');
  const rejected = cli(different.selected.configPath, ['start']);
  await expect(rejected).rejects.toBeDefined();

  const problem = await rejected.then(
    () => null,
    (error) => JSON.parse(error.stdout).error,
  );

  await query(source, "INSERT INTO playable_faults VALUES ('allocation-ack','1')", [], true);
  await expect(
    query(source, "INSERT INTO playable_faults VALUES ('allocation-ack','1')", [], true),
  ).rejects.toThrow('UNIQUE constraint failed: playable_faults.key');
  await writeFile(
    `${evidence}/cascade-control.json`,
    JSON.stringify(
      {
        assigned: assigned.matchId,
        resumed: resumed.matchId,
        pendingJoinAbsent: true,
        differentGameError: problem,
        leftoverFault: await query(source, 'SELECT * FROM playable_faults', [], true),
      },
      null,
      2,
    ) + '\n',
  );
});

it('starts the next journey in fresh storage after preserving the failed-case ledger and clearing only controls', async () => {
  for (const origin of [source, target]) {
    expect(await query(origin, 'SELECT * FROM playable_faults', [], true)).toEqual([]);
    expect(await query(origin, 'SELECT * FROM allocations', [], true)).toEqual([]);
    expect(await query(origin, 'SELECT * FROM usage', [], true)).toEqual([]);
  }

  const f = await connection('claude', 'secret-overlord');
  expect((await cli(f.selected.configPath, ['start'])).status).toBe('queued');
  expect((await saved(f.selected.configPath)).pendingJoin.requestId).toBeDefined();
});
