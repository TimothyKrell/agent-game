import { afterEach, expect, it } from 'vitest';
import { Redacted } from 'effect';
import { controllerFixture } from './fixtures/preview-controller';
import { retainedIdentity } from '../scripts/preview-lifecycle-state';
import { verifySourcePublicationReadback } from '../scripts/preview-publication';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lifecycleTargetOrigin, lifecycleSourceId, lifecycleTargetId } from './fixtures/preview-lifecycle';
import { readPreviewGeneration } from '../src/server/preview-generation';

let fixture: Awaited<ReturnType<typeof controllerFixture>>;

afterEach(async () => {
  await fixture?.dispose();
});

it.each(['github-503', 'comment-503', 'source-503', 'source-malformed', 'source-shape'] as const)(
  'preserves a completed healthy deployment after actual controller %s and finalization',
  async (mode) => {
    fixture = await controllerFixture();
    const before = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
    const row = await fixture.runner.worker.sourceDB.prepare('SELECT * FROM preview_arenas').all();

    const encrypted = await fixture.runner.worker.targetDB
      .prepare('SELECT encrypted_key FROM preview_runtime')
      .first('encrypted_key');

    fixture.mode = mode;
    const publication = await fixture.publish();
    expect(publication.status).toBe(1);

    if (mode === 'github-503' || mode === 'comment-503')
      expect(publication.stderr).toContain(mode === 'github-503' ? 'GitHub API 503' : 'Comment API HTTP 503');

    if (mode === 'comment-503') expect(fixture.commentCalls).toBeGreaterThan(0);

    if (mode === 'github-503') await expect(fixture.finalize()).rejects.toThrow('GitHub API 503');
    else await fixture.finalize();
    await expect(fixture.failure()).rejects.toThrow('ENOENT');
    const after = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
    expect(after.retired).toBe(false);
    expect(after.incarnation).toBe(before.incarnation);
    expect(after.delivery).toEqual(before.delivery);
    expect(Redacted.value(after.encryptedKey)).toBe(Redacted.value(before.encryptedKey));
    await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
    fixture.mode = 'healthy';
    await fixture.runner.restart();
    await fixture.resetProof();
    await fixture.runner.run(fixture.runner.delivery());
    const recovered = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
    expect(recovered.delivery).toEqual(before.delivery);
    expect(Redacted.value(recovered.encryptedKey)).toBe(Redacted.value(before.encryptedKey));
    expect(
      (await fixture.runner.worker.sourceDB.prepare('SELECT * FROM preview_arenas').all()).results,
    ).toEqual(row.results);
    expect(
      await fixture.runner.worker.targetDB
        .prepare('SELECT encrypted_key FROM preview_runtime')
        .first('encrypted_key'),
    ).toBe(encrypted);
    expect(await fixture.publish()).toMatchObject({ status: 0 });
    expect(await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin)).toMatchObject({
      operationId: before.delivery!.publish.operationId,
    });
    expect(await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin)).toMatchObject({
      operationId: before.delivery!.target.operationId,
    });
  },
  120_000,
);

it.each(['source-invalid', 'smoke-invalid', 'pr-closed', 'new-run'] as const)(
  'retires source first only for the exact current owner after confirmed %s',
  async (mode) => {
    fixture = await controllerFixture();
    fixture.mode = mode;
    const result = mode === 'smoke-invalid' ? await fixture.smoke() : await fixture.publish();
    expect(result.status, result.stderr).toBe(1);
    const marker = JSON.parse(await fixture.failure());
    expect(marker.reason).toBe(
      {
        'source-invalid': 'source-readback-invalid',
        'smoke-invalid': 'smoke-invalid',
        'pr-closed': 'eligibility-changed',
        'new-run': 'eligibility-changed',
      }[mode],
    );
    await fixture.finalize(99);
    expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
    const start = fixture.runner.worker.requests.length;
    await fixture.finalize();
    const identity = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
    expect(identity.retired).toBe(true);
    expect(fixture.runner.deleted).toEqual([]);

    const writes = fixture.runner.worker.requests
      .slice(start)
      .filter((request) =>
        request.body.batch.some((query) => query.sql.includes('INSERT INTO preview_generation_operations')),
      );

    expect(writes.map((request) => request.databaseId)).toEqual([lifecycleSourceId, lifecycleTargetId]);
    expect(
      await fixture.runner.worker.sourceDB
        .prepare('SELECT incarnation FROM preview_retired_arenas')
        .first('incarnation'),
    ).toBe(identity.incarnation);
    await expect(
      verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher),
    ).rejects.toThrow('unavailable');
  },
  120_000,
);

it('preserves completed identity after the actual smoke encounters a 503 and its workflow finalizer runs', async () => {
  fixture = await controllerFixture();
  fixture.mode = 'smoke-503';
  expect(await fixture.smoke()).toMatchObject({ status: 1 });
  await expect(fixture.failure()).rejects.toThrow('ENOENT');
  await fixture.finalize();
  expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
}, 120_000);

it('does not reuse invalidation evidence for another controller attempt or incarnation', async () => {
  fixture = await controllerFixture();
  fixture.mode = 'source-invalid';
  expect(await fixture.publish()).toMatchObject({ status: 1 });
  const marker = JSON.parse(await fixture.failure());
  fixture.mode = 'healthy';

  for (const changed of [
    { ...marker, controllerAttempt: '99' },
    { ...marker, incarnation: 'other-incarnation' },
  ]) {
    await writeFile(resolve(fixture.directory, '.agent-game/preview-failure.json'), JSON.stringify(changed));
    await fixture.finalize();
    expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
  }
}, 120_000);

it('wires the trusted workflow finalizer without any completed-step authority flag', async () => {
  const workflow = await readFile('.github/workflows/preview-deploy.yml', 'utf8');
  expect(workflow).toContain('run: node scripts/preview-controller.ts retire');
  expect(workflow).toContain('run: node scripts/verify-preview.mjs "$PREVIEW_URL"');
  expect(workflow).toContain('.agent-game/preview-failure.json');
  expect(workflow).not.toContain('PREVIEW_DELIVERY_COMPLETED');
  expect(workflow).toContain('cancel-in-progress: false');
});
