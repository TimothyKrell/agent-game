import { afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { controllerFixture } from './fixtures/preview-controller';
import { retainedIdentity } from '../scripts/preview-lifecycle-state';
import { verifySourcePublicationReadback } from '../scripts/preview-publication';
import { lifecycleTargetOrigin } from './fixtures/preview-lifecycle';
import { lifecycleSourceId, lifecycleTargetId } from './fixtures/preview-lifecycle';
import { Redacted, Schema } from 'effect';
import { readPreviewGeneration } from '../src/server/preview-generation';

let fixture: Awaited<ReturnType<typeof controllerFixture>>;

afterEach(async () => {
  await fixture?.dispose();
});

it('preserves a healthy completed preview after protocol-bearing health {} smoke data', async () => {
  fixture = await controllerFixture();
  const before = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;

  const healthBefore = await (
    await fixture.runner.worker.fetcher(lifecycleTargetOrigin + '/api/health')
  ).json();

  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
  fixture.smokeReadback = { path: '/api/health', body: '{}' };
  const smoke = await fixture.smoke();
  expect(smoke.status).toBe(1);
  const reads = fixture.githubReads;
  await fixture.finalize();
  const after = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;

  const healthAfter = await (
    await fixture.runner.worker.fetcher(lifecycleTargetOrigin + '/api/health')
  ).json();

  await writeFile(
    '.tim27-lifecycle/runs/smoke-health-schema.json',
    JSON.stringify(
      {
        smoke,
        before: { incarnation: before.incarnation, retired: before.retired },
        after: { incarnation: after.incarnation, retired: after.retired },
        healthBefore,
        healthAfter,
        finalizerGitHubReads: fixture.githubReads - reads,
      },
      null,
      2,
    ) + '\n',
  );
  expect(healthBefore).toEqual({ ok: true, protocolVersion: '1' });
  expect(healthAfter).toEqual(healthBefore);
  expect(after.retired).toBe(false);
  await expect(fixture.failure()).rejects.toThrow('ENOENT');
  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
  fixture.smokeReadback = undefined;
  await fixture.runner.restart();
  await fixture.resetProof();
  await fixture.runner.run(fixture.runner.delivery());
  const recovered = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
  expect(recovered.incarnation).toBe(before.incarnation);
  expect(recovered.delivery).toEqual(before.delivery);
  expect(Redacted.value(recovered.encryptedKey)).toBe(Redacted.value(before.encryptedKey));
  expect(
    (await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin)).operationId,
  ).toBe(before.delivery!.publish.operationId);
  expect(
    (await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin)).operationId,
  ).toBe(before.delivery!.target.operationId);
  expect(await fixture.publish()).toMatchObject({ status: 0 });
}, 120_000);

it('preserves identity and exact generations through ill-typed, missing, malformed and unavailable smoke readbacks and a cold retry', async () => {
  fixture = await controllerFixture();
  const before = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
  const source = await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin);
  const target = await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin);

  const cases = [
    { path: '/api/health', body: JSON.stringify({ ok: 'true', protocolVersion: '1' }) },
    { path: '/api/health', body: JSON.stringify({ ok: true, protocolVersion: 1 }) },
    { path: '/api/health', body: JSON.stringify({ ok: true }) },
    { path: '/api/health', body: '{broken' },
    {
      path: '/api/health',
      body: Buffer.concat([
        Buffer.from('{"ok":true,"protocolVersion":"'),
        Buffer.from([255]),
        Buffer.from('"}'),
      ]),
    },
    { path: '/api/health', body: JSON.stringify({ ok: false, protocolVersion: '1' }), status: 503 },
    { path: '/api/bootstrap', body: '{}' },
    { path: '/api/dev/exhibition', body: '{"matchId":42}' },
    { path: '/api/matches/*', body: '{}' },
  ];

  for (const input of cases) {
    fixture.smokeReadback = input;
    const substitutions = fixture.smokeSubstitutions;
    const result = await fixture.smoke();
    expect(result.status, result.stderr).toBe(1);
    expect(fixture.smokeSubstitutions).toBeGreaterThan(substitutions);
    await expect(fixture.failure()).rejects.toThrow('ENOENT');
    const reads = fixture.githubReads;
    await fixture.finalize();
    expect(fixture.githubReads).toBeGreaterThan(reads);
    expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
    expect(await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin)).toEqual(
      source,
    );
    expect(await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin)).toEqual(
      target,
    );
    expect(await (await fixture.runner.worker.fetcher(lifecycleTargetOrigin + '/api/health')).json()).toEqual(
      { ok: true, protocolVersion: '1' },
    );
    await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
  }

  fixture.smokeReadback = undefined;
  await fixture.runner.restart();
  await fixture.resetProof();
  await fixture.runner.run(fixture.runner.delivery());
  const after = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;
  expect(after.incarnation).toBe(before.incarnation);
  expect(Redacted.value(after.encryptedKey)).toBe(Redacted.value(before.encryptedKey));
  expect(after.delivery).toEqual(before.delivery);
  expect(await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin)).toEqual(source);
  expect(await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin)).toEqual(target);
  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
}, 240_000);

it('preserves completed identity after malformed native socket packets and invalid local smoke configuration', async () => {
  fixture = await controllerFixture();
  const before = (await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity;

  for (const packet of ['{}', '{"type":1,"observation":{}}']) {
    fixture.socketReadback = packet;
    const substitutions = fixture.smokeSubstitutions;
    const result = await fixture.smoke();
    expect(result.status, result.stderr).toBe(1);
    expect(fixture.smokeSubstitutions).toBeGreaterThan(substitutions);
    await expect(fixture.failure()).rejects.toThrow('ENOENT');
    await fixture.finalize();
    expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
  }

  fixture.socketReadback = undefined;
  expect(await fixture.smoke('http://invalid-smoke-config.example')).toMatchObject({ status: 1 });
  await expect(fixture.failure()).rejects.toThrow('ENOENT');
  await fixture.finalize();
  expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.delivery).toEqual(before.delivery);
  expect(
    (await readPreviewGeneration(fixture.runner.worker.sourceDB, lifecycleTargetOrigin)).operationId,
  ).toBe(before.delivery!.publish.operationId);
  expect(
    (await readPreviewGeneration(fixture.runner.worker.targetDB, lifecycleTargetOrigin)).operationId,
  ).toBe(before.delivery!.target.operationId);
  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
}, 120_000);

it.each([
  { ok: false, protocolVersion: '1' },
  { ok: true, protocolVersion: '2' },
])(
  'retires the exact owner source-first for well-typed negative health %j',
  async (health) => {
    fixture = await controllerFixture();
    fixture.smokeReadback = { path: '/api/health', body: JSON.stringify(health) };
    const result = await fixture.smoke();
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(await fixture.failure())).toMatchObject({ reason: 'smoke-invalid' });
    const start = fixture.runner.worker.requests.length;
    await fixture.finalize();

    const writes = fixture.runner.worker.requests
      .slice(start)
      .filter((request) =>
        request.body.batch.some((statement) =>
          statement.sql.includes('INSERT INTO preview_generation_operations'),
        ),
      );

    expect(writes.map((request) => request.databaseId)).toEqual([lifecycleSourceId, lifecycleTargetId]);
    expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(true);
    expect(await (await fixture.runner.worker.fetcher(lifecycleTargetOrigin + '/api/health')).json()).toEqual(
      { ok: true, protocolVersion: '1' },
    );
    await expect(
      verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher),
    ).rejects.toThrow('unavailable');
  },
  120_000,
);

it('completes both scripted games with the actual Node smoke and native HTTP/socket/archive observations', async () => {
  fixture = await controllerFixture();
  const result = await fixture.smoke(lifecycleTargetOrigin, 540_000);
  expect(result.status, result.stderr).toBe(0);

  const receipt = Schema.decodeUnknownSync(
    Schema.Struct({ matches: Schema.Array(Schema.Struct({ gameId: Schema.String, status: Schema.String })) }),
  )(JSON.parse(result.stdout));

  expect(receipt.matches).toEqual([
    { gameId: 'secret-overlord', status: 'finished' },
    { gameId: 'succession', status: 'finished' },
  ]);
  await writeFile('.tim27-lifecycle/runs/smoke-schema-games.json', result.stdout);
  await expect(fixture.failure()).rejects.toThrow('ENOENT');
  await fixture.finalize();
  expect((await retainedIdentity(fixture.runner.state, 'pr-27'))!.identity.retired).toBe(false);
  await verifySourcePublicationReadback(fixture.publication!, fixture.runner.worker.fetcher);
}, 570_000);
