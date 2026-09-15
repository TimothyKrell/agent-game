import type { StateService } from 'alchemy/State';
import type { PreviewDatabase } from '../src/server/preview-config.ts';
import { configurePreviewBroker } from '../src/server/preview-broker-config.ts';
import { bridgeSettings, sourceResources, sourceCapabilities } from './preview-lifecycle-state.ts';
import { previewD1 } from './preview-d1.ts';
import { previewTransaction } from './preview-transaction.ts';
import { canonical, requireCondition } from './preview-artifact.ts';

interface BrokerSettings {
  enabled: number;
  revision: string;
}

function brokerSettings(db: PreviewDatabase) {
  return db
    .prepare('SELECT enabled,revision FROM preview_broker_settings WHERE id=1')
    .first<BrokerSettings>();
}

function brokerGuard(db: PreviewDatabase, before: BrokerSettings | null, desired: BrokerSettings) {
  return db
    .prepare(
      `SELECT CASE WHEN
    (?=1 AND NOT EXISTS(SELECT 1 FROM preview_broker_settings WHERE id=1)) OR
    EXISTS(SELECT 1 FROM preview_broker_settings WHERE id=1 AND enabled=? AND revision=?) OR
    EXISTS(SELECT 1 FROM preview_broker_settings WHERE id=1 AND enabled=? AND revision=?)
    THEN 1 ELSE json('preview-broker-generation-conflict') END AS accepted`,
    )
    .bind(
      before === null ? 1 : 0,
      before?.enabled ?? 0,
      before?.revision ?? '',
      desired.enabled,
      desired.revision,
    );
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

  const before = await brokerSettings(db);

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
  await previewTransaction(
    db,
    [brokerGuard(db, before, desired)],
    [(DB) => configurePreviewBroker({ DB }, { enabled, revision })],
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

  const before = await brokerSettings(targetDB);
  const desired = { enabled: enabled ? 1 : 0, revision: commit };

  const runtime = targetDB
    .prepare(
      `SELECT CASE WHEN EXISTS(SELECT 1 FROM preview_runtime WHERE id=1 AND incarnation=? AND commit_id=?) THEN 1 ELSE json('preview-broker-runtime-conflict') END AS accepted`,
    )
    .bind(incarnation, commit);

  await previewTransaction(
    targetDB,
    [runtime, brokerGuard(targetDB, before, desired)],
    [(DB) => configurePreviewBroker({ DB }, { enabled, revision: commit })],
  );
  requireCondition(
    canonical(await brokerSettings(targetDB)) === canonical(desired),
    'Target broker configuration readback differs',
  );
}
