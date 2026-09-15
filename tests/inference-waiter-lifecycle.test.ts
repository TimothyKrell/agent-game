import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { DialogueMatch } from './fixtures/dialogue-baseline-worker';

for (const kind of ['required', 'initial'] as const) {
  it(`retires an obsolete ${kind} waiter after real phase recovery without releasing usage`, async () => {
    const result = await scenario(kind, false);
    expect(result.waiting.waiters.some((row) => row.id === `${result.old.id}:attempt:1`)).toBe(true);
    expect(result.active).toMatchObject({
      allowed: false,
      reason: kind === 'required' ? 'required-priority' : 'initial-priority',
    });
    expect(result.newPhase).not.toBe(result.oldPhase);
    expect(result.job).toMatchObject({ status: 'done', outcome: 'obsolete', attempts: 0 });
    expect(
      result.after.waiters.filter((row) => row.id === `${result.old.id}:attempt:1`),
      'Obsolete waiter must not survive the terminal job',
    ).toEqual([]);
    expect(result.result.allowed).toBe(true);
    expect(result.after.usage).toEqual(result.before.usage);
    expect(result.after.usage.find((row) => row.id.endsWith(':unknown'))).toMatchObject({
      done: 1,
      reserved: 0.1,
      actual: null,
    });
    expect(result.after.usage.find((row) => row.id.endsWith(':retained-live'))).toMatchObject({
      done: 0,
      reserved: 0.05,
      actual: null,
    });
  });
}

for (const loss of ['', 'after'])
  it(`settlement clears only that allocation’s waiters and preserves all usage (lost ack: ${!!loss})`, async () => {
    const result = await scenario('required', true, loss);
    expect(result.active).toMatchObject({ allowed: false, reason: 'required-priority' });
    expect(result.after.waiters.filter((row) => row.match_id === result.old.matchId)).toEqual([]);
    expect(result.result.allowed).toBe(true);
    expect(result.after.usage).toEqual(result.before.usage);
    expect(result.after.waiters).toEqual([
      expect.objectContaining({
        id: `${result.old.matchId}:foreign-waiter`,
        match_id: `${result.old.matchId}-other`,
        kind: 'initial',
      }),
    ]);
    expect(result.settledControl).toMatchObject({ allowed: false, reason: 'initial-priority' });
  });

for (const kind of ['required', 'initial'] as const)
  for (const loss of ['before', 'after', 'migration'])
    it(`replays ${kind} cleanup after ${loss}-delivery failure and cold restart without clearing replacement priority`, async () => {
      const result = await scenario(kind, false, loss);
      const oldId = `${result.old.id}:attempt:1`;
      const first = result.terminal.jobs.find((row) => row.id === result.old.id)!;
      expect(first).toMatchObject({ status: 'done', outcome: 'obsolete', attempts: 0, waiter_id: oldId });
      expect(result.terminal.due).toBe(first.completedAt! + 1000);
      expect(result.afterTerminal.waiters.some((row) => row.id === oldId)).toBe(loss !== 'after');
      expect(result.afterTerminal.usage).toEqual(result.before.usage);
      expect(result.replay).not.toBeNull();
      const replay = result.replay!;
      expect(replay.after.waiters.some((row) => row.id === oldId)).toBe(false);
      expect(replay.after.waiters).toEqual([
        expect.objectContaining({ id: `${replay.replacement.id}:attempt:1` }),
      ]);
      expect(replay.blocked).toMatchObject({
        allowed: false,
        reason: kind === 'required' ? 'required-priority' : 'initial-priority',
      });
      expect(replay.after.usage).toEqual(replay.before.usage);
      expect(replay.after.cleanup.filter((row) => row.id === oldId)).toHaveLength(2);
      expect(result.job).toMatchObject({
        status: 'done',
        outcome: 'obsolete',
        attempts: 0,
        waiter_id: null,
        completedAt: first.completedAt,
      });
      expect(result.result.allowed).toBe(true);
    });

async function scenario(kind: 'required' | 'initial', settlement: boolean, loss = '') {
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
      `/waiter-lifecycle?kind=${kind}${settlement ? '&settlement=1' : ''}&loss=${loss}`,
    );

    const text = await response.text();
    const directory = `test-results/inference/${process.env.TIM26_WAITER_NAME ?? 'waiter-lifecycle'}`;
    await mkdir(directory, { recursive: true });
    await writeFile(
      `${directory}/${kind}${settlement ? '-settlement' : ''}${loss ? `-${loss}` : ''}.json`,
      text,
    );
    expect(response.ok, text).toBe(true);
    const result: Awaited<ReturnType<DialogueMatch['waiterLifecycle']>> = JSON.parse(text);

    return result;
  } finally {
    await worker.stop();
  }
}
