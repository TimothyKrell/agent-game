import { afterEach, expect, it } from 'vitest';
import { Effect, Redacted } from 'effect';
import { rm } from 'node:fs/promises';
import { runnerFixture } from './fixtures/preview-runner';
import { retainedIdentity } from '../scripts/preview-lifecycle-state';
import { verifySourcePublicationReadback } from '../scripts/preview-publication';

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
