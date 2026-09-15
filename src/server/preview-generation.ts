import { Schema } from 'effect';
import { GameError } from '../game/types';
import { PreviewArtifactManifestSchema } from '../shared/preview-artifacts';
import type { PreviewDatabase, PreviewStatement } from './preview-config';
import { previewOrigin } from './preview-config';

const Counter = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }));

const Commit = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/));

const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));

const Origin = Schema.String.check(Schema.isMaxLength(256));

const Identity = {
  origin: Origin,
  incarnation: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,100}$/)),
  commit: Commit,
  publicKey: Schema.String.check(Schema.isMaxLength(512)),
};

export const PreviewGenerationIntentSchema = Schema.Union([
  Schema.Struct({
    ...Identity,
    kind: Schema.Literal('target-configure'),
    sourceOrigin: Origin,
    enabled: Schema.Boolean,
    sourceRevision: Schema.NullOr(Commit),
  }),
  Schema.Struct({ ...Identity, kind: Schema.Literal('source-register') }),
  Schema.Struct({
    ...Identity,
    kind: Schema.Literal('source-publish'),
    manifest: PreviewArtifactManifestSchema,
  }),
  Schema.Struct({ ...Identity, kind: Schema.Literal('source-retire') }),
  Schema.Struct({ ...Identity, kind: Schema.Literal('target-retire') }),
  Schema.Struct({
    origin: Origin,
    kind: Schema.Literal('source-broker'),
    revision: Commit,
    enabled: Schema.Boolean,
  }),
]);

export type PreviewGenerationIntent = typeof PreviewGenerationIntentSchema.Type;

export const PreviewGenerationOperationSchema = Schema.Struct({
  origin: Origin,
  operationId: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
  expectedGeneration: Counter,
  generation: Counter,
  payloadHash: Digest,
});

export type PreviewGenerationOperation = typeof PreviewGenerationOperationSchema.Type;

/** Public semantics, including the public key, are hashed; randomized AES-GCM
 * ciphertext is deliberately not an operation identity. Object order is immaterial. */
export async function previewGenerationPayload(input: PreviewGenerationIntent) {
  const intent = Schema.decodeUnknownSync(PreviewGenerationIntentSchema)(input, {
    onExcessProperty: 'error',
  });

  previewOrigin(intent.origin, { ENVIRONMENT: 'production' });
  const keys = new Set<string>();
  JSON.stringify(intent, (key, value) => {
    keys.add(key);

    return value;
  });
  const json = JSON.stringify(intent, [...keys].sort());
  const bytes = new TextEncoder().encode(json);

  if (bytes.length > 24 * 1024)
    throw new GameError('preview-operation', 'Preview operation is too large.', 400);
  const hash = await crypto.subtle.digest('SHA-256', bytes);

  return {
    intent,
    json,
    hash: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}

/** No I/O. Caller MUST durably persist this exact operation before executing it. */
export async function preparePreviewGeneration(
  expectedGeneration: number,
  intent: PreviewGenerationIntent,
): Promise<PreviewGenerationOperation> {
  if (
    !Number.isSafeInteger(expectedGeneration) ||
    expectedGeneration < 0 ||
    expectedGeneration >= Number.MAX_SAFE_INTEGER
  )
    throw new GameError('preview-generation', 'Preview generation is exhausted or invalid.', 409);
  const payload = await previewGenerationPayload(intent);

  return {
    origin: intent.origin,
    operationId: crypto.randomUUID(),
    expectedGeneration,
    generation: expectedGeneration + 1,
    payloadHash: payload.hash,
  };
}

const Current = Schema.Struct({
  version: Schema.Literal(1),
  generation: Schema.NullOr(Counter),
  operation_id: Schema.NullOr(Schema.String),
  payload_hash: Schema.NullOr(Digest),
  intent_json: Schema.NullOr(Schema.String),
  receipt_generation: Schema.NullOr(Counter),
  expected_generation: Schema.NullOr(Counter),
});

/** Requires deployed 0008; never creates or repairs schema at runtime. */
export async function readPreviewGeneration(db: PreviewDatabase, origin: string) {
  try {
    const row = Schema.decodeUnknownSync(Current)(
      await db
        .prepare(
          `SELECT s.version,g.generation,g.operation_id,r.payload_hash,r.intent_json,r.generation AS receipt_generation,r.expected_generation
       FROM preview_generation_schema s LEFT JOIN preview_generations g ON g.origin=?
       LEFT JOIN preview_generation_operations r ON r.origin=g.origin AND r.operation_id=g.operation_id
       WHERE s.id=1`,
        )
        .bind(origin)
        .first(),
    );

    if (row.generation === null) {
      if (row.operation_id !== null || row.payload_hash !== null || row.intent_json !== null)
        throw new Error('Invalid empty generation');

      return { generation: 0, operationId: null, payloadHash: null, intent: null };
    }

    if (
      !row.operation_id ||
      !row.payload_hash ||
      !row.intent_json ||
      row.receipt_generation !== row.generation ||
      row.expected_generation === null ||
      row.expected_generation + 1 !== row.generation
    )
      throw new Error('Missing or mismatched operation receipt');

    const payload = await previewGenerationPayload(
      Schema.decodeUnknownSync(PreviewGenerationIntentSchema)(JSON.parse(row.intent_json)),
    );

    if (payload.hash !== row.payload_hash || payload.intent.origin !== origin)
      throw new Error('Invalid generation receipt');

    return {
      generation: row.generation,
      operationId: row.operation_id,
      payloadHash: row.payload_hash,
      intent: payload.intent,
    };
  } catch {
    throw new GameError(
      'preview-generation-unavailable',
      'Preview generation schema or readback is unavailable.',
      503,
    );
  }
}

export async function assertPreviewGeneration(db: PreviewDatabase, operation: PreviewGenerationOperation) {
  const current = await readPreviewGeneration(db, operation.origin);

  if (
    current.generation !== operation.generation ||
    current.operationId !== operation.operationId ||
    current.payloadHash !== operation.payloadHash
  )
    throw new GameError('preview-generation-stale', 'Preview operation is not the current generation.', 409);

  return current;
}

const Receipt = Schema.Struct({ expected_generation: Counter, generation: Counter, payload_hash: Digest });

/** Wrap exactly one native batch. Accepted helpers may be composed into that
 * batch by previewTransaction; this wrapper never queues fabricated results.
 * An applied retry is read-only. A superseded receipt never authorizes writes. */
export async function executePreviewGeneration(
  db: PreviewDatabase,
  input: PreviewGenerationOperation,
  intent: PreviewGenerationIntent,
  write: (database: PreviewDatabase) => Promise<void>,
): Promise<void> {
  const operation = Schema.decodeUnknownSync(PreviewGenerationOperationSchema)(input);
  const payload = await previewGenerationPayload(intent);

  if (
    operation.origin !== intent.origin ||
    operation.payloadHash !== payload.hash ||
    operation.generation !== operation.expectedGeneration + 1
  )
    throw new GameError(
      'preview-operation-conflict',
      'Operation identity was reused with a different payload.',
      409,
    );
  const current = await readPreviewGeneration(db, operation.origin);

  const row = await db
    .prepare(
      'SELECT expected_generation,generation,payload_hash FROM preview_generation_operations WHERE origin=? AND operation_id=?',
    )
    .bind(operation.origin, operation.operationId)
    .first();

  if (row) {
    const receipt = Schema.decodeUnknownSync(Receipt)(row);

    if (
      receipt.expected_generation !== operation.expectedGeneration ||
      receipt.generation !== operation.generation ||
      receipt.payload_hash !== operation.payloadHash
    )
      throw new GameError(
        'preview-operation-conflict',
        'Operation identity was reused with a different payload.',
        409,
      );
    await assertPreviewGeneration(db, operation);

    return;
  }

  if (current.generation !== operation.expectedGeneration)
    throw new GameError(
      'preview-generation-stale',
      'Preview operation predecessor is no longer current.',
      409,
    );

  const prefix = [
    db
      .prepare(
        `SELECT CASE WHEN
      (SELECT version FROM preview_generation_schema WHERE id=1)=1 AND
      COALESCE((SELECT generation FROM preview_generations WHERE origin=?),0)=? AND
      NOT EXISTS(SELECT 1 FROM preview_generation_operations WHERE origin=? AND operation_id=?)
      THEN 1 ELSE json('preview-generation-conflict') END AS accepted`,
      )
      .bind(operation.origin, operation.expectedGeneration, operation.origin, operation.operationId),
    db
      .prepare(
        'INSERT INTO preview_generation_operations (origin,operation_id,expected_generation,generation,payload_hash,intent_json) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        operation.origin,
        operation.operationId,
        operation.expectedGeneration,
        operation.generation,
        operation.payloadHash,
        payload.json,
      ),
    db
      .prepare(
        `INSERT INTO preview_generations (origin,generation,operation_id) VALUES (?,?,?)
      ON CONFLICT(origin) DO UPDATE SET generation=excluded.generation,operation_id=excluded.operation_id`,
      )
      .bind(operation.origin, operation.generation, operation.operationId),
  ];

  let submitted = false;
  const statements = new WeakMap<PreviewStatement, PreviewStatement>();

  const batch = async <T>(items: PreviewStatement[]): Promise<D1Result<T>[]> => {
    if (submitted || items.length === 0 || items.length + prefix.length > 16)
      throw new GameError('preview-operation', 'Preview operation requires one bounded native batch.', 400);
    submitted = true;

    const native = items.map((item) => {
      const found = statements.get(item);

      if (!found) throw new GameError('preview-operation', 'Cross-database operation statement.', 400);

      return found;
    });

    const results = await db.batch<T>([...prefix, ...native]);

    if (results.length !== prefix.length + items.length || results.some((result) => !result.success))
      throw new GameError('preview-generation-unavailable', 'Incomplete operation acknowledgement.', 503);

    return results.slice(prefix.length);
  };

  const wrap = (native: PreviewStatement): PreviewStatement => {
    const statement: PreviewStatement = {
      bind: (...values) => wrap(native.bind(...values)),
      first: () => {
        throw new GameError('preview-operation', 'Use an atomic operation batch.', 400);
      },
      run: async <T>() => (await batch<T>([statement]))[0],
    };

    statements.set(statement, native);

    return statement;
  };

  await write({ prepare: (sql) => wrap(db.prepare(sql)), batch });

  if (!submitted) throw new GameError('preview-operation', 'Preview operation did not submit a batch.', 400);
  await assertPreviewGeneration(db, operation);
}
