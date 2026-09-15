import type { StateService } from 'alchemy/State';
import { Effect, Schema } from 'effect';
import type { PreviewDatabase } from '../src/server/preview-config.ts';
import { configurePreviewBroker } from '../src/server/preview-broker-config.ts';
import { bridgeSettings, sourceResources, sourceCapabilities } from './preview-lifecycle-state.ts';
import { previewD1 } from './preview-d1.ts';
import { previewTransaction } from './preview-transaction.ts';
import { canonical, requireCondition } from './preview-artifact.ts';
import {
  executePreviewGeneration,
  preparePreviewGeneration,
  previewGenerationPayload,
  readPreviewGeneration,
  PreviewGenerationOperationSchema,
} from '../src/server/preview-generation.ts';

interface BrokerSettings {
  enabled: number;
  revision: string;
}

export function brokerSettings(db: PreviewDatabase) {
  return db
    .prepare('SELECT enabled,revision FROM preview_broker_settings WHERE id=1')
    .first<BrokerSettings>();
}

/** Explicit source-operator seam. Parent invokes this after operating-ledger
 * reconciliation; per-PR delivery never changes the shared source switch.
 * The revision is independently checked against actual production stack output.
 */
export async function configureSourcePreviewBroker(
  state: StateService,
  env: NodeJS.ProcessEnv,
  revision: string,
  enabled: boolean,
  fetcher: typeof fetch = fetch,
) {
  const settings = bridgeSettings(env);
  requireCondition(
    settings !== undefined && (!enabled || env.PREVIEW_BROKER_ENABLED === 'true'),
    'Explicit protected broker configuration is required',
  );
  const source = await sourceResources(state, settings.sourceOrigin);
  requireCondition(
    source.sourceCommit === revision,
    'Broker source revision differs from trusted production deployment',
  );

  const db = previewD1(
    env.CLOUDFLARE_ACCOUNT_ID ?? '',
    source.databaseId,
    env.CLOUDFLARE_API_TOKEN ?? '',
    fetcher,
  );

  if (enabled)
    await sourceCapabilities(
      source.sourceOrigin,
      `https://agent-game-pr-1.${env.WORKERS_SUBDOMAIN}.workers.dev`,
      settings.executable,
      fetcher,
    );
  requireCondition(
    canonical(await sourceResources(state, settings.sourceOrigin)) === canonical(source),
    'Production deployment changed before broker configuration',
  );
  const desired = { enabled: enabled ? 1 : 0, revision };
  const intent = { origin: source.sourceOrigin, kind: 'source-broker' as const, revision, enabled };
  const payload = await previewGenerationPayload(intent);
  // Dedicated fixed control-state output, encrypted by the same trusted state
  // backend. Never overwrite the production resource graph or its output.
  const address = { stack: 'agent-game-preview-control', stage: 'source-broker' };
  const raw = await Effect.runPromise(state.getOutput(address));

  const previous =
    raw === undefined
      ? undefined
      : Schema.decodeUnknownSync(
          Schema.Struct({
            accountId: Schema.String,
            databaseId: Schema.String,
            operation: PreviewGenerationOperationSchema,
          }),
        )(raw);

  requireCondition(
    !previous ||
      (previous.accountId === env.CLOUDFLARE_ACCOUNT_ID && previous.databaseId === source.databaseId),
    'Source broker resource identity changed',
  );

  const operation =
    previous?.operation.payloadHash === payload.hash
      ? previous.operation
      : await preparePreviewGeneration(
          (await readPreviewGeneration(db, source.sourceOrigin)).generation,
          intent,
        );

  await Effect.runPromise(
    state.setOutput({
      ...address,
      value: { accountId: env.CLOUDFLARE_ACCOUNT_ID, databaseId: source.databaseId, operation },
    }),
  );
  await executePreviewGeneration(db, operation, intent, (DB) =>
    configurePreviewBroker({ DB }, { enabled, revision }),
  );
  requireCondition(
    canonical(await brokerSettings(db)) === canonical(desired),
    'Source broker configuration readback differs',
  );
}

export async function configureTargetPreviewBroker(
  sourceDB: PreviewDatabase,
  targetDB: PreviewDatabase,
  sourceRevision: string | undefined,
  incarnation: string,
  commit: string,
  enabled: boolean,
) {
  if (enabled) {
    const source = await brokerSettings(sourceDB);
    requireCondition(
      sourceRevision !== undefined && source?.enabled === 1 && source.revision === sourceRevision,
      'Current source broker must be explicitly configured before target activation',
    );
  }

  const runtime = targetDB
    .prepare(
      `SELECT CASE WHEN EXISTS(SELECT 1 FROM preview_runtime WHERE id=1 AND incarnation=? AND commit_id=?) THEN 1 ELSE json('preview-broker-runtime-conflict') END AS accepted`,
    )
    .bind(incarnation, commit);

  await previewTransaction(
    targetDB,
    [runtime],
    [(DB) => configurePreviewBroker({ DB }, { enabled, revision: commit })],
  );
}
