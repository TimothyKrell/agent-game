import { Effect, Redacted, Schema } from 'effect';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { StateService } from 'alchemy/State';
import {
  configurePreviewTarget,
  closePreviewTarget,
  registerPreviewTarget,
  openPreview,
} from '../src/server/preview-config.ts';
import {
  parsePreviewArtifactManifest,
  readPreviewArtifacts,
  registerPreviewArtifacts,
} from '../src/server/preview-artifacts.ts';
import {
  assertPreviewGeneration,
  executePreviewGeneration,
  readPreviewGeneration,
} from '../src/server/preview-generation.ts';
import { configurePreviewBroker } from '../src/server/preview-broker-config.ts';
import {
  bridgeSettings,
  retainedIdentity,
  markIdentityRetired,
  sourceResources,
  targetResources,
} from './preview-lifecycle-state.ts';
import type { PreviewIdentityState } from './preview-lifecycle-state.ts';
import {
  previewTransaction,
  sourceGuard,
  sourceRevision,
  targetGuard,
  targetRevision,
} from './preview-transaction.ts';
import { previewD1 } from './preview-d1.ts';
import { canonical, requireCondition, validateArtifact } from './preview-artifact.ts';
import { previewTarget } from './preview-controller.ts';
import {
  previewArtifactPublication,
  verifySourceExecutable,
  verifySourceArenaReadback,
} from './preview-publication.ts';
import { PreviewEligibilityChanged, type VerifiedRun } from './preview-github.ts';
import { brokerSettings, configureTargetPreviewBroker } from './preview-broker-lifecycle.ts';
import { deliveryOperations, identityOwner, retirementOperations } from './preview-operations.ts';

export async function assertLifecycleGeneration(
  state: StateService,
  stage: string,
  expected: PreviewIdentityState,
) {
  const retained = await retainedIdentity(state, stage);
  requireCondition(
    retained !== undefined &&
      retained.identity.incarnation === expected.incarnation &&
      retained.identity.runId === expected.runId &&
      retained.identity.runAttempt === expected.runAttempt &&
      retained.identity.builtCommit === expected.builtCommit &&
      !retained.identity.retired,
    'Lifecycle generation changed; refusing stale operation',
  );

  return retained.identity;
}

function sourceEnvironment(identity: PreviewIdentityState, env: NodeJS.ProcessEnv, fetcher: typeof fetch) {
  requireCondition(
    identity.accountId === env.CLOUDFLARE_ACCOUNT_ID,
    'Retained source account differs from protected environment',
  );

  return {
    DB: previewD1(identity.accountId, identity.sourceDatabaseId, env.CLOUDFLARE_API_TOKEN ?? '', fetcher),
    APP_URL: identity.sourceOrigin,
    ENVIRONMENT: 'production',
    PREVIEW_SOURCE_URL: '',
  };
}

/** Artifact-independent, source-first retirement. A lost acknowledgement keeps
 * the resource state and key; retry reads the durable tombstone before destroy.
 */
export async function retireLifecycle(
  state: StateService,
  stage: string,
  identity: PreviewIdentityState,
  env: NodeJS.ProcessEnv,
  recheck: () => Promise<void>,
  fetcher: typeof fetch = fetch,
  recoverStale = false,
) {
  const retained = await retainedIdentity(state, stage);
  requireCondition(
    retained !== undefined && identityOwner(retained.identity) === identityOwner(identity),
    'Cleanup generation changed',
  );
  const source = sourceEnvironment(identity, env, fetcher);

  const retired = () =>
    source.DB.prepare('SELECT incarnation FROM preview_retired_arenas WHERE origin=? AND incarnation=?')
      .bind(identity.targetOrigin, identity.incarnation)
      .first();

  const before = await sourceRevision(source.DB, identity.targetOrigin);
  requireCondition(
    !before || before.incarnation === identity.incarnation || before.closed_at !== null,
    'Unknown live source incarnation; cleanup refused',
  );

  const registration = {
    origin: identity.targetOrigin,
    incarnation: identity.incarnation,
    commit: identity.builtCommit,
    publicKey: identity.publicKey,
  };

  const sourceIntent = { ...registration, kind: 'source-retire' as const };
  const targetId = retained.identity.delivery?.targetDatabaseId ?? retained.identity.targetDatabaseId;

  const target = targetId
    ? {
        databaseId: targetId,
        DB: previewD1(identity.accountId, targetId, env.CLOUDFLARE_API_TOKEN ?? '', fetcher),
        intent: { ...registration, kind: 'target-retire' as const },
      }
    : undefined;

  const plan = await retirementOperations(
    state,
    stage,
    identity,
    source.DB,
    sourceIntent,
    target,
    recoverStale,
  );

  const tombstone = await retired();
  await recheck();
  requireCondition(
    identityOwner((await retainedIdentity(state, stage))!.identity) === identityOwner(identity),
    'Cleanup owner changed',
  );
  await executePreviewGeneration(source.DB, plan.source, sourceIntent, (database) =>
    previewTransaction(
      database,
      [
        sourceGuard(database, identity.targetOrigin, before, {
          incarnation: identity.incarnation,
          commit_id: identity.builtCommit,
          public_key: identity.publicKey,
          closed_at: null,
        }),
      ],
      tombstone
        ? [(DB) => closePreviewTarget({ DB }, identity.targetOrigin, identity.incarnation)]
        : [
            (DB) => registerPreviewTarget({ ...source, DB }, registration),
            (DB) => closePreviewTarget({ DB }, identity.targetOrigin, identity.incarnation),
          ],
    ),
  );
  requireCondition(!!(await retired()), 'Source retirement acknowledgement missing');

  // A target-local closing generation also fences old configuration requests
  // if the same database is retained for a later fresh incarnation.
  if (target && plan.target) {
    const beforeTarget = await targetRevision(target.DB);
    await executePreviewGeneration(target.DB, plan.target, target.intent, (database) =>
      previewTransaction(
        database,
        [
          targetGuard(database, beforeTarget, {
            incarnation: identity.incarnation,
            commit_id: identity.builtCommit,
          }),
        ],
        [(DB) => configurePreviewBroker({ DB }, { enabled: false, revision: identity.builtCommit })],
      ),
    );
    await assertPreviewGeneration(target.DB, plan.target);
  }

  await assertPreviewGeneration(source.DB, plan.source);
  await recheck();
  requireCondition(
    identityOwner((await retainedIdentity(state, stage))!.identity) === identityOwner(identity),
    'Cleanup owner changed',
  );
  await markIdentityRetired(state, stage, identity.incarnation);
}

/** Recheck immediately before destructive apply, including after plan I/O. */
export async function assertRetirementCurrent(
  state: StateService,
  stage: string,
  identity: PreviewIdentityState,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
) {
  const retained = await retainedIdentity(state, stage);
  requireCondition(
    retained !== undefined &&
      identityOwner(retained.identity) === identityOwner(identity) &&
      retained.identity.retired &&
      retained.identity.retirement !== undefined,
    'Cleanup owner changed before destruction',
  );
  const plan = retained.identity.retirement;
  await assertPreviewGeneration(sourceEnvironment(identity, env, fetcher).DB, plan.source);

  if (plan.target && plan.targetDatabaseId) {
    const database = await Effect.runPromise(state.get({ stack: 'agent-game', stage, fqn: 'Identity' }));

    if (database && 'attr' in database && database.attr !== undefined) {
      const actual = Schema.decodeUnknownSync(Schema.Struct({ databaseId: Schema.String }))(database.attr);
      requireCondition(
        actual.databaseId === plan.targetDatabaseId,
        'Target database owner changed before destruction',
      );
    }

    await assertPreviewGeneration(
      previewD1(identity.accountId, plan.targetDatabaseId, env.CLOUDFLARE_API_TOKEN ?? '', fetcher),
      plan.target,
    );
  }
}

/** Runs only inside the trusted Alchemy process after prebuilt apply. */
export async function registerLifecycle(
  state: StateService,
  verified: VerifiedRun,
  artifact: Awaited<ReturnType<typeof validateArtifact>>,
  env: NodeJS.ProcessEnv,
  recheck: () => Promise<void>,
  fetcher: typeof fetch = fetch,
) {
  const settings = bridgeSettings(env);
  requireCondition(settings !== undefined, 'Preview identity activation is disabled');
  const target = previewTarget(verified.prNumber, env.WORKERS_SUBDOMAIN ?? '');
  const retained = await retainedIdentity(state, target.stage);
  requireCondition(retained !== undefined, 'Missing persisted preview identity');
  const identity = retained.identity;
  requireCondition(
    identity.targetOrigin === target.origin &&
      identity.sourceOrigin === settings.sourceOrigin &&
      identity.runId === verified.runId &&
      identity.runAttempt === verified.runAttempt &&
      identity.builtCommit === verified.builtCommit,
    'Retained identity differs from verified delivery',
  );
  await assertLifecycleGeneration(state, target.stage, identity);
  const sourceOutput = await sourceResources(state, settings.sourceOrigin);
  requireCondition(
    sourceOutput.databaseId === identity.sourceDatabaseId,
    'Production database changed before registration',
  );
  const targetOutput = await targetResources(state, verified.prNumber, identity);
  const source = sourceEnvironment(identity, env, fetcher);

  const auth = await Effect.runPromise(
    state.get({ stack: 'agent-game', stage: target.stage, fqn: 'PreviewAuth' }),
  );

  requireCondition(
    auth !== undefined && 'resourceType' in auth && auth.resourceType === 'Alchemy.Random',
    'Missing retained target auth resource',
  );

  const secret = Schema.decodeUnknownSync(Schema.Struct({ text: Schema.Redacted(Schema.String) }))(
    auth.attr,
  ).text;

  const targetEnv = {
    DB: previewD1(identity.accountId, targetOutput.databaseId, env.CLOUDFLARE_API_TOKEN ?? '', fetcher),
    ENVIRONMENT: 'preview',
    APP_URL: identity.targetOrigin,
    PREVIEW_SOURCE_URL: identity.sourceOrigin,
    BETTER_AUTH_SECRET: Redacted.value(secret),
  };

  const privateKey = await openPreview(targetEnv, Redacted.value(identity.encryptedKey));
  const beforeSource = await sourceRevision(source.DB, identity.targetOrigin);
  requireCondition(
    !beforeSource || beforeSource.incarnation === identity.incarnation || beforeSource.closed_at !== null,
    'Unknown live source incarnation; registration refused',
  );
  const beforeTarget = await targetRevision(targetEnv.DB);

  const desiredSource = {
    incarnation: identity.incarnation,
    commit_id: identity.builtCommit,
    public_key: identity.publicKey,
    closed_at: null,
  };

  const publication = previewArtifactPublication(verified, artifact, {
    subdomain: env.WORKERS_SUBDOMAIN ?? '',
    sourceOrigin: identity.sourceOrigin,
    incarnation: identity.incarnation,
    executable: settings.executable,
  });

  const manifest = parsePreviewArtifactManifest(source, JSON.stringify(publication));

  const registration = {
    origin: identity.targetOrigin,
    incarnation: identity.incarnation,
    commit: identity.builtCommit,
    publicKey: identity.publicKey,
  };

  const intents = {
    target: {
      ...registration,
      kind: 'target-configure' as const,
      sourceOrigin: identity.sourceOrigin,
      enabled: env.PREVIEW_BROKER_ENABLED === 'true',
      sourceRevision: sourceOutput.sourceCommit ?? null,
    },
    register: { ...registration, kind: 'source-register' as const },
    publish: { ...registration, kind: 'source-publish' as const, manifest },
  };

  const plan = await deliveryOperations(
    state,
    target.stage,
    identity,
    source.DB,
    targetEnv.DB,
    targetOutput.databaseId,
    intents,
  );

  try {
    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await recheck();
    await executePreviewGeneration(targetEnv.DB, plan.target, intents.target, (database) =>
      previewTransaction(
        database,
        [targetGuard(database, beforeTarget, desiredSource)],
        [
          (DB) =>
            configurePreviewTarget(
              { ...targetEnv, DB },
              identity.incarnation,
              identity.builtCommit,
              privateKey,
            ),
          (DB) =>
            configureTargetPreviewBroker(
              source.DB,
              DB,
              sourceOutput.sourceCommit,
              identity.incarnation,
              identity.builtCommit,
              env.PREVIEW_BROKER_ENABLED === 'true',
            ),
        ],
      ),
    );
    requireCondition(
      canonical(await targetRevision(targetEnv.DB)) ===
        canonical({ incarnation: identity.incarnation, commit_id: identity.builtCommit }),
      'Target configuration readback differs',
    );
    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    const currentSource = await readPreviewGeneration(source.DB, identity.targetOrigin);

    // An interrupted runner may already have completed its later publication.
    // Only that exact retained operation may skip registration; no replay writes.
    if (currentSource.operationId !== plan.publish.operationId)
      await executePreviewGeneration(source.DB, plan.register, intents.register, (database) =>
        previewTransaction(
          database,
          [sourceGuard(database, identity.targetOrigin, beforeSource, desiredSource)],
          [
            (DB) =>
              registerPreviewTarget(
                { ...source, DB },
                {
                  origin: identity.targetOrigin,
                  incarnation: identity.incarnation,
                  commit: identity.builtCommit,
                  publicKey: identity.publicKey,
                },
              ),
          ],
        ),
      );

    // Persisted identity predates every side effect, including a lost register
    // acknowledgement. Staleness retires this exact generation before returning.
    await recheck();

    await assertLifecycleGeneration(state, target.stage, identity);
    requireCondition(
      canonical(await sourceRevision(source.DB, identity.targetOrigin)) === canonical(desiredSource),
      'Source identity readback differs',
    );
    await verifySourceExecutable(identity.sourceOrigin, settings.executable, fetcher);

    if (env.PREVIEW_BROKER_ENABLED === 'true')
      requireCondition(
        await verifySourceArenaReadback(publication, fetcher),
        'Source broker/provider is not ready for live target publication',
      );

    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await executePreviewGeneration(source.DB, plan.publish, intents.publish, async (DB) => {
      await registerPreviewArtifacts({ ...source, DB }, manifest, { atomicGuard: true });
    });
    requireCondition(
      canonical(await readPreviewArtifacts(source, identity.targetOrigin, identity.builtCommit)) ===
        canonical(manifest),
      'Source artifact readback differs',
    );

    const configured = Schema.decodeUnknownSync(
      Schema.Struct({ incarnation: Schema.String, commit_id: Schema.String, encrypted_key: Schema.String }),
    )(
      await targetEnv.DB.prepare(
        'SELECT incarnation,commit_id,encrypted_key FROM preview_runtime WHERE id=1',
      ).first(),
    );

    const configuredKey = await openPreview(targetEnv, configured.encrypted_key);
    requireCondition(
      configured.incarnation === identity.incarnation &&
        configured.commit_id === identity.builtCommit &&
        createPublicKey(
          createPrivateKey({ key: Buffer.from(configuredKey, 'base64'), type: 'pkcs8', format: 'der' }),
        )
          .export({ type: 'spki', format: 'der' })
          .toString('base64') === identity.publicKey,
      'Target signing-key readback differs',
    );
    requireCondition(
      canonical(await brokerSettings(targetEnv.DB)) ===
        canonical({ enabled: intents.target.enabled ? 1 : 0, revision: identity.builtCommit }),
      'Target broker configuration readback differs',
    );
    requireCondition(
      canonical(await sourceRevision(source.DB, identity.targetOrigin)) === canonical(desiredSource),
      'Source identity readback differs',
    );
    await assertPreviewGeneration(targetEnv.DB, plan.target);
    await assertPreviewGeneration(source.DB, plan.publish);

    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);

    return publication;
  } catch (error) {
    if (error instanceof PreviewEligibilityChanged)
      await retireLifecycle(state, target.stage, identity, env, async () => {}, fetcher);
    throw error;
  }
}
