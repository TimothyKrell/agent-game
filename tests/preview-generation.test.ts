import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  executePreviewGeneration,
  preparePreviewGeneration,
  previewGenerationPayload,
  readPreviewGeneration,
} from '../src/server/preview-generation';
import {
  closePreviewTarget,
  configurePreviewTarget,
  openPreview,
  registerPreviewTarget,
} from '../src/server/preview-config';
import { configurePreviewBroker } from '../src/server/preview-broker-config';
import { readPreviewArtifacts, registerPreviewArtifacts } from '../src/server/preview-artifacts';
import { previewTransaction, sourceRevision, targetRevision } from '../scripts/preview-transaction';
import { generationFixture, holdGenerationWrites } from './fixtures/preview-generation';
import type { PreviewGenerationIntent } from '../src/server/preview-generation';

let fixture: Awaited<ReturnType<typeof generationFixture>>;

beforeEach(async () => {
  fixture = await generationFixture();
});

afterEach(async () => {
  await fixture?.dispose();
});

async function update(phase: 'source' | 'target', intent = fixture.intent(phase)) {
  const db = fixture.database(phase);

  const operation = await preparePreviewGeneration(
    (await readPreviewGeneration(db, intent.origin)).generation,
    intent,
  );

  await executePreviewGeneration(db, operation, intent, (DB) => fixture.write(DB, intent));

  return operation;
}

it.each(['source', 'target'] as const)(
  'fences the original delayed %s A→B→A sequence with durable counters',
  async (phase) => {
    const db = fixture.database(phase);
    await update(phase);
    const stale = fixture.intent(phase, 'c'.repeat(40));
    const operation = await preparePreviewGeneration(1, stale);
    const held = holdGenerationWrites(fixture.fetcher);

    const old = executePreviewGeneration(fixture.database(phase, held.transport), operation, stale, (DB) =>
      fixture.write(DB, stale),
    );

    const rejected = expect(old).rejects.toThrow('D1');

    try {
      await held.waiting;
      await update(phase, fixture.intent(phase, 'b'.repeat(40)));
      await update(phase);
    } finally {
      held.release();
    }

    await rejected;
    expect((await readPreviewGeneration(db, fixture.identity.origin)).generation).toBe(3);
    expect(
      (phase === 'source' ? await sourceRevision(db, fixture.identity.origin) : await targetRevision(db))
        ?.commit_id,
    ).toBe('a'.repeat(40));
  },
);

it.each(['source', 'target'] as const)(
  'recovers lost %s acknowledgement with the serialized exact operation and read-only semantic retry',
  async (phase) => {
    const intent = fixture.intent(phase);
    const operation = await preparePreviewGeneration(0, intent);

    const lost: typeof fetch = async (url, init) => {
      const response = await fixture.fetcher(url, init);

      if (String(init?.body ?? '').includes('INSERT INTO preview_generation_operations'))
        throw new Error('lost acknowledgement');

      return response;
    };

    await expect(
      executePreviewGeneration(fixture.database(phase, lost), operation, intent, (DB) =>
        fixture.write(DB, intent),
      ),
    ).rejects.toThrow('acknowledgement');

    const before = await fixture.target
      .prepare('SELECT encrypted_key FROM preview_runtime WHERE id=1')
      .first('encrypted_key');

    const recovered = JSON.parse(JSON.stringify(operation));
    let writes = 0;
    await executePreviewGeneration(fixture.database(phase), recovered, { ...intent }, async () => {
      writes++;
    });
    expect(writes).toBe(0);
    expect((await readPreviewGeneration(fixture.database(phase), intent.origin)).operationId).toBe(
      operation.operationId,
    );

    const after = await fixture.target
      .prepare('SELECT encrypted_key FROM preview_runtime WHERE id=1')
      .first<string>('encrypted_key');

    expect(after).toBe(before);

    if (after) expect(await openPreview(fixture.targetEnv, after)).toBe(fixture.privateKey);
  },
);

it('rejects same operation ID with a different semantic payload even if its caller recomputes the hash', async () => {
  const operation = await update('source');
  const changed = fixture.intent('source', 'b'.repeat(40));
  await expect(
    executePreviewGeneration(fixture.database('source'), operation, changed, (DB) =>
      fixture.write(DB, changed),
    ),
  ).rejects.toMatchObject({ code: 'preview-operation-conflict' });
  await expect(
    executePreviewGeneration(
      fixture.database('source'),
      { ...operation, payloadHash: (await previewGenerationPayload(changed)).hash },
      changed,
      (DB) => fixture.write(DB, changed),
    ),
  ).rejects.toMatchObject({ code: 'preview-operation-conflict' });
  expect((await sourceRevision(fixture.database('source'), fixture.identity.origin))?.commit_id).toBe(
    fixture.identity.commit,
  );
});

it.each(['source', 'target'] as const)(
  'never reapplies an already-applied %s operation after an identical desired tuple receives a new generation',
  async (phase) => {
    const old = await update(phase);
    const next = await update(phase);
    let writes = 0;
    await expect(
      executePreviewGeneration(fixture.database(phase), old, fixture.intent(phase), async () => {
        writes++;
      }),
    ).rejects.toMatchObject({ code: 'preview-generation-stale' });
    expect(writes).toBe(0);
    expect((await readPreviewGeneration(fixture.database(phase), fixture.identity.origin)).operationId).toBe(
      next.operationId,
    );
  },
);

it.each(['source', 'target'] as const)(
  'allows exactly one simultaneous next %s generation and returns no successful receipt for the loser',
  async (phase) => {
    const held = holdGenerationWrites(fixture.fetcher, 2);
    const first = fixture.intent(phase);
    const second = fixture.intent(phase, 'b'.repeat(40));

    const operations = await Promise.all(
      [first, second].map((intent) => preparePreviewGeneration(0, intent)),
    );

    const result = Promise.allSettled(
      [first, second].map((intent, index) =>
        executePreviewGeneration(fixture.database(phase, held.transport), operations[index], intent, (DB) =>
          fixture.write(DB, intent),
        ),
      ),
    );

    await held.waiting;
    held.release();
    const results = await result;
    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const current = await readPreviewGeneration(fixture.database(phase), fixture.identity.origin);
    expect(current.operationId).toBe(
      operations[results.findIndex((entry) => entry.status === 'fulfilled')].operationId,
    );
    expect(current.generation).toBe(1);
  },
);

it('rolls back generation, registration and publication together when an immutable artifact conflicts', async () => {
  const db = fixture.database('source');
  await update('source');
  const desired = fixture.manifest('b'.repeat(40));
  const conflicting = { ...desired, executable: { ...desired.executable, sha256: 'e'.repeat(64) } };
  await registerPreviewTarget(fixture.sourceEnv, { ...fixture.identity, commit: desired.commit });
  await registerPreviewArtifacts(fixture.sourceEnv, conflicting);
  await registerPreviewTarget(fixture.sourceEnv, fixture.identity);

  const intent: PreviewGenerationIntent = {
    ...fixture.identity,
    commit: desired.commit,
    kind: 'source-publish',
    manifest: desired,
  };

  const operation = await preparePreviewGeneration(1, intent);
  await expect(
    executePreviewGeneration(db, operation, intent, (database) =>
      previewTransaction(
        database,
        [],
        [
          (DB) =>
            registerPreviewTarget(
              { ...fixture.sourceEnv, DB },
              { ...fixture.identity, commit: desired.commit },
            ),
          async (DB) => {
            await registerPreviewArtifacts({ ...fixture.sourceEnv, DB }, desired, { atomicGuard: true });
          },
        ],
      ),
    ),
  ).rejects.toThrow('D1');
  expect((await readPreviewGeneration(db, fixture.identity.origin)).generation).toBe(1);
  expect((await sourceRevision(db, fixture.identity.origin))?.commit_id).toBe(fixture.identity.commit);
  expect(
    await fixture.source
      .prepare('SELECT operation_id FROM preview_generation_operations WHERE operation_id=?')
      .bind(operation.operationId)
      .first(),
  ).toBeNull();
  expect(await fixture.source.prepare('SELECT COUNT(*) AS n FROM preview_artifacts').first('n')).toBe(1);
});

it('publishes atomically with semantic key-order equality and no phantom success for an unregistered tuple', async () => {
  const db = fixture.database('source');
  const manifest = fixture.manifest();
  const intent: PreviewGenerationIntent = { ...fixture.identity, kind: 'source-publish', manifest };
  const missing = await preparePreviewGeneration(0, intent);
  await expect(
    executePreviewGeneration(db, missing, intent, async (DB) => {
      await registerPreviewArtifacts({ ...fixture.sourceEnv, DB }, manifest, { atomicGuard: true });
    }),
  ).rejects.toThrow('D1');
  expect((await readPreviewGeneration(db, intent.origin)).generation).toBe(0);
  const operation = await preparePreviewGeneration(0, intent);
  await executePreviewGeneration(db, operation, intent, (database) =>
    previewTransaction(
      database,
      [],
      [
        (DB) => registerPreviewTarget({ ...fixture.sourceEnv, DB }, fixture.identity),
        async (DB) => {
          await registerPreviewArtifacts({ ...fixture.sourceEnv, DB }, manifest, { atomicGuard: true });
        },
      ],
    ),
  );
  expect(await readPreviewArtifacts(fixture.sourceEnv, intent.origin, fixture.identity.commit)).toEqual(
    manifest,
  );

  const reordered = {
    ...intent,
    manifest: {
      games: manifest.games,
      executable: manifest.executable,
      version: manifest.version,
      sourceOrigin: manifest.sourceOrigin,
      targetOrigin: manifest.targetOrigin,
      incarnation: manifest.incarnation,
      commit: manifest.commit,
    },
  };

  expect((await previewGenerationPayload(reordered)).hash).toBe(operation.payloadHash);
  await executePreviewGeneration(db, operation, reordered, async () => {
    throw new Error('Retry must be read-only');
  });
});

it('does not advance a generation if key validation fails before the accepted helper submits its batch', async () => {
  const intent = fixture.intent('target');
  const operation = await preparePreviewGeneration(0, intent);
  await expect(
    executePreviewGeneration(fixture.database('target'), operation, intent, (DB) =>
      configurePreviewTarget(
        { ...fixture.targetEnv, DB },
        fixture.identity.incarnation,
        fixture.identity.commit,
        'invalid',
      ),
    ),
  ).rejects.toThrow();
  expect((await readPreviewGeneration(fixture.database('target'), intent.origin)).generation).toBe(0);
  expect(
    await fixture.target.prepare('SELECT COUNT(*) AS n FROM preview_generation_operations').first('n'),
  ).toBe(0);
});

it.each(['source-register', 'source-retire', 'target-configure'] as const)(
  'fences delayed %s across retirement and same-commit fresh-incarnation recreation',
  async (kind) => {
    const phase = kind === 'target-configure' ? 'target' : 'source';
    const db = fixture.database(phase);
    await update(phase);

    const stale: PreviewGenerationIntent =
      kind === 'source-retire' ? { ...fixture.identity, kind } : fixture.intent(phase);

    const operation = await preparePreviewGeneration(1, stale);
    const held = holdGenerationWrites(fixture.fetcher);

    const pending = executePreviewGeneration(
      fixture.database(phase, held.transport),
      operation,
      stale,
      (DB) => fixture.write(DB, stale),
    );

    const rejected = expect(pending).rejects.toThrow('D1');

    try {
      await held.waiting;

      const closing: PreviewGenerationIntent = {
        ...fixture.identity,
        kind: phase === 'source' ? 'source-retire' : 'target-retire',
      };

      await update(phase, closing);

      if (phase === 'source')
        await fixture.source
          .prepare('DELETE FROM preview_arenas WHERE origin=?')
          .bind(fixture.identity.origin)
          .run();
      const incarnation = crypto.randomUUID();
      await update(phase, fixture.intent(phase, fixture.identity.commit, incarnation));
      expect(
        (phase === 'source' ? await sourceRevision(db, fixture.identity.origin) : await targetRevision(db))
          ?.incarnation,
      ).toBe(incarnation);
    } finally {
      held.release();
    }

    await rejected;
    expect((await readPreviewGeneration(db, fixture.identity.origin)).generation).toBe(3);
  },
);

it('retains counters and receipts after registry deletion and rolls back a retired-incarnation registration', async () => {
  await update('source');
  await update('source', { ...fixture.identity, kind: 'source-retire' });
  await fixture.source
    .prepare('DELETE FROM preview_arenas WHERE origin=?')
    .bind(fixture.identity.origin)
    .run();
  const operation = await preparePreviewGeneration(2, fixture.intent('source'));
  await expect(
    executePreviewGeneration(fixture.database('source'), operation, fixture.intent('source'), (DB) =>
      fixture.write(DB, fixture.intent('source')),
    ),
  ).rejects.toThrow('D1');
  expect((await readPreviewGeneration(fixture.database('source'), fixture.identity.origin)).generation).toBe(
    2,
  );
  expect(
    await fixture.source.prepare('SELECT COUNT(*) AS n FROM preview_generation_operations').first('n'),
  ).toBe(2);
  await expect(fixture.source.prepare('DELETE FROM preview_generations').run()).rejects.toThrow('retained');
  await expect(fixture.source.prepare('DELETE FROM preview_generation_operations').run()).rejects.toThrow(
    'retained',
  );
});

it('fails closed with 503 when generation migration is absent and never silently creates schema', async () => {
  await fixture.dispose();
  fixture = await generationFixture(false);
  await expect(
    readPreviewGeneration(fixture.database('source'), fixture.identity.origin),
  ).rejects.toMatchObject({ code: 'preview-generation-unavailable', status: 503 });
  const operation = await preparePreviewGeneration(0, fixture.intent('source'));
  await expect(
    executePreviewGeneration(fixture.database('source'), operation, fixture.intent('source'), (DB) =>
      fixture.write(DB, fixture.intent('source')),
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(
    await fixture.source.prepare("SELECT name FROM sqlite_master WHERE name='preview_generations'").first(),
  ).toBeNull();
});

it('rejects exhausted and unsafe counters before generating a write operation', async () => {
  for (const generation of [-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Infinity])
    await expect(preparePreviewGeneration(generation, fixture.intent('source'))).rejects.toThrow(
      'generation',
    );
});

it('rolls back the source generation and receipt when a retirement trigger rejects closing', async () => {
  await update('source');
  await fixture.source
    .prepare(
      "CREATE TRIGGER reject_retirement BEFORE UPDATE ON preview_arenas WHEN NEW.closed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic close rejection'); END",
    )
    .run();
  const intent: PreviewGenerationIntent = { ...fixture.identity, kind: 'source-retire' };
  const operation = await preparePreviewGeneration(1, intent);
  await expect(
    executePreviewGeneration(fixture.database('source'), operation, intent, (DB) =>
      closePreviewTarget({ DB }, intent.origin, intent.incarnation),
    ),
  ).rejects.toThrow('D1');
  expect((await readPreviewGeneration(fixture.database('source'), intent.origin)).generation).toBe(1);
  expect(await fixture.source.prepare('SELECT closed_at FROM preview_arenas').first('closed_at')).toBeNull();
  expect(await fixture.source.prepare('SELECT COUNT(*) AS n FROM preview_retired_arenas').first('n')).toBe(0);
  expect(
    await fixture.source.prepare('SELECT COUNT(*) AS n FROM preview_generation_operations').first('n'),
  ).toBe(1);
});

it('fences a delayed shared-source broker operation across enabled→disabled→enabled and preserves exact retries', async () => {
  const db = fixture.database('source');

  const intent = {
    origin: fixture.sourceEnv.APP_URL,
    kind: 'source-broker' as const,
    enabled: true,
    revision: 'e'.repeat(40),
  };

  const write = (enabled: boolean) => (DB: typeof db) =>
    configurePreviewBroker({ DB }, { enabled, revision: intent.revision });

  const first = await preparePreviewGeneration(0, intent);
  await executePreviewGeneration(db, first, intent, write(true));
  const old = await preparePreviewGeneration(1, { ...intent, enabled: false });
  const held = holdGenerationWrites(fixture.fetcher);

  const pending = executePreviewGeneration(
    fixture.database('source', held.transport),
    old,
    { ...intent, enabled: false },
    write(false),
  );

  const rejected = expect(pending).rejects.toThrow('D1');

  try {
    await held.waiting;
    await executePreviewGeneration(
      db,
      await preparePreviewGeneration(1, { ...intent, enabled: false }),
      { ...intent, enabled: false },
      write(false),
    );
    const latest = await preparePreviewGeneration(2, intent);
    await executePreviewGeneration(db, latest, intent, write(true));
    await executePreviewGeneration(db, JSON.parse(JSON.stringify(latest)), intent, async () => {
      throw new Error('Retry must be read-only');
    });
  } finally {
    held.release();
  }

  await rejected;
  expect(await fixture.source.prepare('SELECT enabled FROM preview_broker_settings').first('enabled')).toBe(
    1,
  );
  expect((await readPreviewGeneration(db, intent.origin)).generation).toBe(3);
});
