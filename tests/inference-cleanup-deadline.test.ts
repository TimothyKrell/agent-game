import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { DialogueMatch } from './fixtures/dialogue-baseline-worker';

for (const timing of ['ready', 'future', 'arriving'] as const)
  for (const fail of [false, true]) {
    it(`serves ${timing} saved required work while cleanup has a late ${fail ? 'failure' : 'success'}`, async () => {
      const result = await scenario(timing, fail);
      verify(result);
      expect(result.held.cleanup).toHaveLength(1);
      expect(result.ledger.cleanup).toHaveLength(fail ? 2 : 1);
    });
  }

it('recovers the durable cleanup retry after a cold restart during slow housekeeping', async () => {
  const result = await scenario('future', true, true);
  verify(result);
  expect(result.ledger.cleanup).toHaveLength(2);
});

function verify(result: Awaited<ReturnType<DialogueMatch['slowCleanup']>>) {
  expect(result.entry.running, 'Cleanup must not retain the only alarm handler').toBe(false);
  expect(result.rearmed.due, 'Future required work must be armed before its deadline').toBeLessThanOrEqual(
    result.job.dueAt > result.origin ? result.job.dueAt : result.origin + 1000,
  );
  expect(result.servedWhileHeld.running).toBe(false);
  expect(result.servedWhileHeld.jobs.find((row) => row.id === result.job.id)).toMatchObject({
    status: 'done',
    outcome: 'accepted',
    attempts: 1,
  });
  expect(result.held.heldCleanup).toBe(1);
  expect(result.extraReads, 'Saved response must not generate again').toBe(0);
  expect(result.paid).toEqual([expect.objectContaining({ actual: 0.001, done: 1 })]);
  expect(result.recordings).toHaveLength(1);
  expect(result.recordings[0].at).toBeLessThan(result.job.deadline);
  expect(result.submissions).toEqual([expect.objectContaining({ ok: true })]);
  expect(result.submissions[0].at).toBeLessThan(result.job.deadline);
  expect(result.receipts).toBe(1);
  expect(result.final.jobs.find((row) => row.id === result.old.id)).toMatchObject({
    status: 'done',
    outcome: 'obsolete',
    attempts: 0,
    waiter_id: null,
  });
  expect(result.ledger.waiters).toEqual([expect.objectContaining({ id: `${result.live.id}:attempt:1` })]);
}

async function scenario(timing: 'ready' | 'future' | 'arriving', fail: boolean, cold = false) {
  const worker = await unstable_dev('tests/fixtures/dialogue-baseline-worker.ts', {
    config: 'tests/dialogue-baseline.wrangler.jsonc',
    local: true,
    persist: false,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });

  try {
    const response = await worker.fetch(
      `/slow-cleanup?timing=${timing}${fail ? '&fail=1' : ''}${cold ? '&cold=1' : ''}`,
    );

    const body = await response.text();
    const directory = `.tim7/${process.env.TIM26_CLEANUP_NAME ?? 'cleanup-deadline'}`;
    await mkdir(directory, { recursive: true });
    await writeFile(
      `${directory}/${timing}-${fail ? 'failure' : 'success'}${cold ? '-cold' : ''}.json`,
      body,
    );
    expect(response.ok, body).toBe(true);
    const result: Awaited<ReturnType<DialogueMatch['slowCleanup']>> = JSON.parse(body);

    return result;
  } finally {
    await worker.stop();
  }
}
