import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { Observation } from '../src/game/types';
import type { DialogueTrace } from './fixtures/dialogue-baseline-worker';

it('rechecks current cooldown before spending an optional activation', async () => {
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
    const response = await worker.fetch('/legacy-opening?cooldown=1');

    const result: {
      beforeCooldown: number;
      submissions: DialogueTrace['submissions'];
      firstAt: number;
      cooldownMs: number;
    } = JSON.parse(await response.text());

    expect(response.ok).toBe(true);
    expect(result.beforeCooldown).toBe(1);
    expect(result.submissions).toHaveLength(2);
    expect(result.submissions[1]).toMatchObject({ ok: true, at: result.firstAt + result.cooldownMs });
  } finally {
    await worker.stop();
  }
});

it('gives every original-game house seat a first and peer-triggered second utterance', async () => {
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
    const response = await worker.fetch('/legacy-opening');

    const result: { initial: Observation; submissions: DialogueTrace['submissions'] } = JSON.parse(
      await response.text(),
    );

    expect(response.ok).toBe(true);
    const chats = result.submissions.filter((entry) => entry.type === 'chat');
    expect(chats.every((entry) => entry.ok)).toBe(true);
    expect(chats[0].job.seat).toBe(result.initial.coordinator);

    for (const seat of result.initial.seats)
      expect(chats.filter((entry) => entry.job.seat === seat.number)).toHaveLength(2);
  } finally {
    await worker.stop();
  }
});
