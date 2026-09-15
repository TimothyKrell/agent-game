import { afterEach, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  lifecycleFixture,
  lifecycleAuth,
  lifecycleAccount,
  lifecycleTargetId,
  lifecycleSourceId,
  lifecycleSourceOrigin,
  lifecycleTargetOrigin,
} from '../tests/fixtures/preview-lifecycle';
import { configurePreviewTarget, registerPreviewTarget } from '../src/server/preview-config';
import { previewD1 } from '../scripts/preview-d1';
import {
  previewTransaction,
  sourceGuard,
  sourceRevision,
  targetGuard,
  targetRevision,
} from '../scripts/preview-transaction';

let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

afterEach(async () => {
  await fixture?.dispose();
});

it.each(['source', 'target'] as const)(
  'rejects delayed %s write after the predecessor cycles A→B→A',
  async (phase) => {
    fixture = await lifecycleFixture();
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const databaseId = phase === 'source' ? lifecycleSourceId : lifecycleTargetId;
    const db = previewD1(lifecycleAccount, databaseId, 'synthetic', fixture.fetcher);
    const incarnation = 'generation-gap-incarnation';

    const write = (DB: ReturnType<typeof previewD1>, commit: string) =>
      phase === 'source'
        ? registerPreviewTarget(
            { DB, ENVIRONMENT: 'production' },
            { origin: lifecycleTargetOrigin, incarnation, commit, publicKey },
          )
        : configurePreviewTarget(
            {
              DB,
              ENVIRONMENT: 'preview',
              APP_URL: lifecycleTargetOrigin,
              PREVIEW_SOURCE_URL: lifecycleSourceOrigin,
              BETTER_AUTH_SECRET: lifecycleAuth,
            },
            incarnation,
            commit,
            privateKey,
          );

    await write(db, 'a'.repeat(40));
    const source = await sourceRevision(db, lifecycleTargetOrigin);
    const target = await targetRevision(db);
    const desired = { incarnation, commit_id: 'c'.repeat(40), public_key: publicKey, closed_at: null };
    let release!: () => void;
    let captured!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const waiting = new Promise<void>((resolve) => {
      captured = resolve;
    });

    const old = previewD1(lifecycleAccount, databaseId, 'synthetic', async (url, init) => {
      captured();
      await gate;

      return fixture.fetcher(url, init);
    });

    const pending = previewTransaction(
      old,
      [
        phase === 'source'
          ? sourceGuard(old, lifecycleTargetOrigin, source, desired)
          : targetGuard(old, target, desired),
      ],
      [(DB) => write(DB, desired.commit_id)],
    ).then(
      () => 'accepted',
      () => 'rejected',
    );

    await waiting;

    try {
      for (const commit of ['b'.repeat(40), 'a'.repeat(40)]) {
        const next = { ...desired, commit_id: commit };

        const guard =
          phase === 'source'
            ? sourceGuard(db, lifecycleTargetOrigin, await sourceRevision(db, lifecycleTargetOrigin), next)
            : targetGuard(db, await targetRevision(db), next);

        await previewTransaction(db, [guard], [(DB) => write(DB, commit)]);
      }
    } finally {
      release();
    }

    const outcome = await pending;

    const current =
      phase === 'source' ? await sourceRevision(db, lifecycleTargetOrigin) : await targetRevision(db);

    expect({ outcome, commit: current?.commit_id }).toEqual({ outcome: 'rejected', commit: 'a'.repeat(40) });
  },
  120_000,
);
