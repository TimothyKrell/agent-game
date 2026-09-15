import { Effect, Redacted, Schema } from 'effect';
import type { StateService } from 'alchemy/State';
import {
  configurePreviewTarget,
  closePreviewTarget,
  registerPreviewTarget,
  openPreview,
} from '../src/server/preview-config.ts';
import { parsePreviewArtifactManifest, registerPreviewArtifacts } from '../src/server/preview-artifacts.ts';
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
import { configureTargetPreviewBroker } from './preview-broker-lifecycle.ts';

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
) {
  const retained = await retainedIdentity(state, stage);
  requireCondition(
    retained !== undefined && retained.identity.incarnation === identity.incarnation,
    'Cleanup generation changed',
  );
  const source = sourceEnvironment(identity, env, fetcher);

  const retired = () =>
    source.DB.prepare('SELECT incarnation FROM preview_retired_arenas WHERE origin=? AND incarnation=?')
      .bind(identity.targetOrigin, identity.incarnation)
      .first();

  if (!(await retired())) {
    await assertLifecycleGeneration(state, stage, identity);
    const before = await sourceRevision(source.DB, identity.targetOrigin);
    requireCondition(
      !before || before.incarnation === identity.incarnation || before.closed_at !== null,
      'Unknown live source incarnation; cleanup refused',
    );
    await recheck();
    await assertLifecycleGeneration(state, stage, identity);

    const registration = {
      origin: identity.targetOrigin,
      incarnation: identity.incarnation,
      commit: identity.builtCommit,
      publicKey: identity.publicKey,
    };

    const desired = {
      incarnation: identity.incarnation,
      commit_id: identity.builtCommit,
      public_key: identity.publicKey,
      closed_at: null,
    };

    // Even a never-published identity gets a tombstone: accepted register+close
    // helpers run atomically. No observer can see the synthetic open row, and
    // delayed register/configure work cannot revive the retired incarnation.
    await previewTransaction(
      source.DB,
      [sourceGuard(source.DB, identity.targetOrigin, before, desired)],
      [
        (DB) => registerPreviewTarget({ ...source, DB }, registration),
        (DB) => closePreviewTarget({ DB }, identity.targetOrigin, identity.incarnation),
      ],
    );
  }

  requireCondition(!!(await retired()), 'Source retirement acknowledgement missing');
  await recheck();
  await markIdentityRetired(state, stage, identity.incarnation);
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

  try {
    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await previewTransaction(
      targetEnv.DB,
      [targetGuard(targetEnv.DB, beforeTarget, desiredSource)],
      [
        (DB) =>
          configurePreviewTarget(
            { ...targetEnv, DB },
            identity.incarnation,
            identity.builtCommit,
            privateKey,
          ),
      ],
    );
    requireCondition(
      canonical(await targetRevision(targetEnv.DB)) ===
        canonical({ incarnation: identity.incarnation, commit_id: identity.builtCommit }),
      'Target configuration readback differs',
    );
    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await configureTargetPreviewBroker(
      source.DB,
      targetEnv.DB,
      sourceOutput.sourceCommit,
      identity.incarnation,
      identity.builtCommit,
      env.PREVIEW_BROKER_ENABLED === 'true',
    );
    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await previewTransaction(
      source.DB,
      [sourceGuard(source.DB, identity.targetOrigin, beforeSource, desiredSource)],
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
    );

    // Persisted identity predates every side effect, including a lost register
    // acknowledgement. Staleness retires this exact generation before returning.
    await recheck();

    await assertLifecycleGeneration(state, target.stage, identity);
    requireCondition(
      canonical(await sourceRevision(source.DB, identity.targetOrigin)) === canonical(desiredSource),
      'Source identity readback differs',
    );
    const executable = await verifySourceExecutable(identity.sourceOrigin, settings.executable, fetcher);

    const publication = previewArtifactPublication(verified, artifact, {
      subdomain: env.WORKERS_SUBDOMAIN ?? '',
      sourceOrigin: identity.sourceOrigin,
      incarnation: identity.incarnation,
      executable,
    });

    if (env.PREVIEW_BROKER_ENABLED === 'true')
      requireCondition(
        await verifySourceArenaReadback(publication, fetcher),
        'Source broker/provider is not ready for live target publication',
      );

    await recheck();
    await assertLifecycleGeneration(state, target.stage, identity);
    await registerPreviewArtifacts(source, parsePreviewArtifactManifest(source, JSON.stringify(publication)));

    await recheck();

    return publication;
  } catch (error) {
    if (error instanceof PreviewEligibilityChanged)
      await retireLifecycle(state, target.stage, identity, env, async () => {}, fetcher);
    throw error;
  }
}
