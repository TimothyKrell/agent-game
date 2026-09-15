import { afterEach, expect, it } from 'vitest';
import { Effect, Redacted } from 'effect';
import { rm } from 'node:fs/promises';
import { runnerFixture } from './fixtures/preview-runner';
import { retainedIdentity } from '../scripts/preview-lifecycle-state';
import { verifySourcePublicationReadback } from '../scripts/preview-publication';
import { readPreviewGeneration } from '../src/server/preview-generation';
import { previewD1 } from '../scripts/preview-d1';
import {
  lifecycleAccount,
  lifecycleSourceId,
  lifecycleTargetId,
  lifecycleTargetOrigin,
} from './fixtures/preview-lifecycle';

let fixture: Awaited<ReturnType<typeof runnerFixture>>;

afterEach(async () => {
  await fixture?.dispose();
});

it('runs the production resource graph through upload failure, cold retry, public readback and artifact-independent source-first nonempty R2 cleanup', async () => {
  fixture = await runnerFixture();
  fixture.failUpload = true;
  await expect(fixture.run(fixture.delivery())).rejects.toThrow('upload failure');
  const pending = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
  expect(pending.retired).toBe(false);
  await fixture.restart();
  fixture.failUpload = false;
  const publication = await fixture.run(fixture.delivery());
  expect(publication?.incarnation).toBe(pending.incarnation);
  expect(Redacted.value((await retainedIdentity(fixture.state, 'pr-27'))!.identity.encryptedKey)).toBe(
    Redacted.value(pending.encryptedKey),
  );
  await verifySourcePublicationReadback(publication!, fixture.worker.fetcher);
  const r2 = await fixture.worker.target.getR2Bucket('AGENT_PICTURES');
  await r2.put('portrait.png', 'nonempty preview-owned object');
  await rm(fixture.worker.artifactDirectory, { recursive: true, force: true });
  fixture.env.PREVIEW_IDENTITY_ENABLED = 'false';
  delete fixture.env.PREVIEW_SOURCE_RELEASE;
  delete fixture.env.PREVIEW_ARTIFACT_DIR;
  await fixture.restart();
  const closure = { operation: 'destroy' as const, authority: { number: 27, recheck: async () => {} } };
  await expect(
    fixture.run(closure, async () => {
      throw new Error('Synthetic source outage');
    }),
  ).rejects.toThrow('acknowledgement unavailable');
  expect(fixture.deleted).toEqual([]);
  expect((await retainedIdentity(fixture.state, 'pr-27'))!.identity.retired).toBe(false);
  await fixture.run(closure);
  expect(fixture.deleted.sort()).toEqual(['bucket', 'database', 'worker']);
  expect((await r2.list()).objects).toHaveLength(0);
  expect(await retainedIdentity(fixture.state, 'pr-27')).toBeUndefined();
  expect(await Effect.runPromise(fixture.state.list({ stack: 'agent-game', stage: 'pr-27' }))).toEqual([]);
  expect(
    await Effect.runPromise(fixture.state.getOutput({ stack: 'agent-game', stage: 'prod' })),
  ).toMatchObject({ sourceCommit: 'e'.repeat(40) });
}, 120_000);

it('uses the runner finalizer to preserve pending delivery and retire only its exact retained run before same-proof recreation', async () => {
  fixture = await runnerFixture();
  await fixture.run(fixture.delivery());
  const first = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
  await fixture.run({
    operation: 'retire',
    authority: { number: 27, runId: 99, runAttempt: 2, shouldRetire: async () => true },
  });
  expect((await retainedIdentity(fixture.state, 'pr-27'))!.identity.retired).toBe(false);
  await fixture.run({
    operation: 'retire',
    authority: { number: 27, runId: 100, runAttempt: 2, shouldRetire: async () => false },
  });
  expect((await retainedIdentity(fixture.state, 'pr-27'))!.identity.retired).toBe(false);
  await fixture.run({
    operation: 'retire',
    authority: { number: 27, runId: 100, runAttempt: 2, shouldRetire: async () => true },
  });
  expect((await retainedIdentity(fixture.state, 'pr-27'))!.identity.retired).toBe(true);
  expect(fixture.deleted).toEqual([]);
  await fixture.restart();
  const recreated = await fixture.run(fixture.delivery());
  expect(recreated?.incarnation).not.toBe(first.incarnation);
  await verifySourcePublicationReadback(recreated!, fixture.worker.fetcher);
}, 120_000);

it.each(['target-configure', 'source-register', 'source-publish'])(
  'resumes a cold fixed runner after lost %s acknowledgement with exactly the retained operations',
  async (kind) => {
    fixture = await runnerFixture();

    const lost: typeof fetch = async (url, init) => {
      const response = await fixture.worker.fetcher(url, init);

      if (
        String(init?.body ?? '').includes('INSERT INTO preview_generation_operations') &&
        String(init?.body ?? '').includes(kind)
      )
        throw new Error('Synthetic lost operation acknowledgement');

      return response;
    };

    await expect(fixture.run(fixture.delivery(), lost)).rejects.toThrow('acknowledgement');
    const pending = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
    expect(pending.delivery).toBeDefined();
    expect(pending.retired).toBe(false);
    await fixture.restart();
    const publication = await fixture.run(fixture.delivery());
    const recovered = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
    expect(recovered.delivery).toEqual(pending.delivery);
    expect(recovered.incarnation).toBe(pending.incarnation);
    expect(Redacted.value(recovered.encryptedKey)).toBe(Redacted.value(pending.encryptedKey));

    const source = await readPreviewGeneration(
      previewD1(lifecycleAccount, lifecycleSourceId, 'synthetic', fixture.worker.fetcher),
      lifecycleTargetOrigin,
    );

    const target = await readPreviewGeneration(
      previewD1(lifecycleAccount, lifecycleTargetId, 'synthetic', fixture.worker.fetcher),
      lifecycleTargetOrigin,
    );

    expect(source).toMatchObject({
      generation: 2,
      operationId: recovered.delivery!.publish.operationId,
      intent: {
        kind: 'source-publish',
        incarnation: recovered.incarnation,
        commit: recovered.builtCommit,
        publicKey: recovered.publicKey,
      },
    });
    expect(target).toMatchObject({
      generation: 1,
      operationId: recovered.delivery!.target.operationId,
      intent: {
        kind: 'target-configure',
        incarnation: recovered.incarnation,
        commit: recovered.builtCommit,
        publicKey: recovered.publicKey,
      },
    });
    await verifySourcePublicationReadback(publication!, fixture.worker.fetcher);
  },
  120_000,
);

it.each(['source-retire', 'target-retire'])(
  'keeps the exact %s fence through a lost acknowledgement, cold cleanup and missing artifacts',
  async (kind) => {
    fixture = await runnerFixture();
    await fixture.run(fixture.delivery());
    await rm(fixture.worker.artifactDirectory, { recursive: true });
    const closure = { operation: 'destroy' as const, authority: { number: 27, recheck: async () => {} } };

    const lost: typeof fetch = async (url, init) => {
      const response = await fixture.worker.fetcher(url, init);

      if (
        String(init?.body ?? '').includes('INSERT INTO preview_generation_operations') &&
        String(init?.body ?? '').includes(kind)
      )
        throw new Error('Synthetic lost close acknowledgement');

      return response;
    };

    await expect(fixture.run(closure, lost)).rejects.toThrow('acknowledgement');
    const pending = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
    expect(pending.retirement).toBeDefined();
    expect(fixture.deleted).toEqual([]);
    await fixture.restart();
    fixture.env.PREVIEW_IDENTITY_ENABLED = 'false';
    delete fixture.env.PREVIEW_SOURCE_RELEASE;
    await fixture.run(closure);
    expect(fixture.deleted.sort()).toEqual(['bucket', 'database', 'worker']);

    const source = await readPreviewGeneration(
      previewD1(lifecycleAccount, lifecycleSourceId, 'synthetic', fixture.worker.fetcher),
      lifecycleTargetOrigin,
    );

    expect(source.operationId).toBe(pending.retirement!.source.operationId);

    const target = await readPreviewGeneration(
      previewD1(lifecycleAccount, lifecycleTargetId, 'synthetic', fixture.worker.fetcher),
      lifecycleTargetOrigin,
    );

    expect(target.operationId).toBe(pending.retirement!.target!.operationId);
  },
  120_000,
);

it('refuses destructive apply if the latest retained owner changes during destroy planning', async () => {
  fixture = await runnerFixture();
  await fixture.run(fixture.delivery());
  let checks = 0;
  await expect(
    fixture.run({
      operation: 'destroy',
      authority: {
        number: 27,
        recheck: async () => {
          if (++checks !== 4) return;
          const current = (await retainedIdentity(fixture.state, 'pr-27'))!;
          await Effect.runPromise(
            fixture.state.set({
              stack: 'agent-game',
              stage: 'pr-27',
              fqn: current.record.fqn,
              value: { ...current.record, attr: { ...current.identity, runId: 101 } },
            }),
          );
        },
      },
    }),
  ).rejects.toThrow('Cleanup owner changed before destruction');
  expect(checks).toBe(4);
  expect(fixture.deleted).toEqual([]);
}, 120_000);

it('keeps a stale unapplied retirement fence on cold retry and lets manual closed-PR recovery reserve a distinct owned operation', async () => {
  fixture = await runnerFixture();
  let release!: () => void;
  let captured!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const waiting = new Promise<void>((resolve) => {
    captured = resolve;
  });

  const held: typeof fetch = async (url, init) => {
    if (
      String(init?.body ?? '').includes('INSERT INTO preview_generation_operations') &&
      String(init?.body ?? '').includes('source-publish')
    ) {
      captured();
      await gate;
    }

    return fixture.worker.fetcher(url, init);
  };

  const deploying = fixture.run(fixture.delivery(), held);

  try {
    await waiting;
    await expect(
      fixture.run({
        operation: 'destroy',
        authority: {
          number: 27,
          recheck: async () => {
            throw new Error('Synthetic interruption after reservation');
          },
        },
      }),
    ).rejects.toThrow('interruption');
  } finally {
    release();
  }

  await deploying;
  const pending = (await retainedIdentity(fixture.state, 'pr-27'))!.identity;
  expect(pending.retirement).toBeDefined();
  await fixture.restart();
  const closure = { operation: 'destroy' as const, authority: { number: 27, recheck: async () => {} } };
  await expect(fixture.run(closure)).rejects.toThrow('predecessor is no longer current');
  expect((await retainedIdentity(fixture.state, 'pr-27'))!.identity.retirement).toEqual(pending.retirement);
  expect(fixture.deleted).toEqual([]);
  fixture.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
  let recovered = pending.retirement;
  await fixture.run({
    ...closure,
    authority: {
      ...closure.authority,
      recheck: async () => {
        recovered = (await retainedIdentity(fixture.state, 'pr-27'))!.identity.retirement;
      },
    },
  });
  expect(recovered?.source.operationId).not.toBe(pending.retirement!.source.operationId);
  expect(recovered?.source.expectedGeneration).toBe(pending.delivery!.publish.generation);
  expect(recovered?.target).toEqual(pending.retirement!.target);
  expect(recovered?.superseded).toEqual([pending.retirement!.source]);
  expect(fixture.deleted.sort()).toEqual(['bucket', 'database', 'worker']);
}, 120_000);
