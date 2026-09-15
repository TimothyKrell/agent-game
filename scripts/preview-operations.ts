import { Effect } from 'effect';
import type { StateService } from 'alchemy/State';
import type { PreviewDatabase } from '../src/server/preview-config.ts';
import {
  preparePreviewGeneration,
  previewGenerationPayload,
  readPreviewGeneration,
} from '../src/server/preview-generation.ts';
import type {
  PreviewGenerationIntent,
  PreviewGenerationOperation,
} from '../src/server/preview-generation.ts';
import { lifecycleResourceId, retainedIdentity } from './preview-lifecycle-state.ts';
import type { PreviewIdentityState } from './preview-lifecycle-state.ts';
import { requireCondition } from './preview-artifact.ts';

export function identityOwner(identity: PreviewIdentityState) {
  return `${identity.incarnation}:${identity.runId}:${identity.runAttempt}:${identity.builtCommit}:${identity.prHeadSha}`;
}

export async function saveIdentityOperations(
  state: StateService,
  stage: string,
  identity: PreviewIdentityState,
) {
  const current = await retainedIdentity(state, stage);
  requireCondition(
    current !== undefined && identityOwner(current.identity) === identityOwner(identity),
    'Lifecycle owner changed before operation persistence',
  );
  await Effect.runPromise(
    state.set({
      stack: 'agent-game',
      stage,
      fqn: lifecycleResourceId,
      value: { ...current.record, attr: identity },
    }),
  );
}

async function sameOperation(operation: PreviewGenerationOperation, intent: PreviewGenerationIntent) {
  requireCondition(
    operation.origin === intent.origin &&
      operation.payloadHash === (await previewGenerationPayload(intent)).hash,
    'Retained operation payload changed; use a new verified delivery',
  );
}

/** Counters are read only when reserving a new delivery. Its complete operation
 * sequence is then persisted in encrypted trusted state before any D1 write. */
export async function deliveryOperations(
  state: StateService,
  stage: string,
  identity: PreviewIdentityState,
  sourceDB: PreviewDatabase,
  targetDB: PreviewDatabase,
  targetDatabaseId: string,
  intents: {
    target: PreviewGenerationIntent;
    register: PreviewGenerationIntent;
    publish: PreviewGenerationIntent;
  },
) {
  const current = await retainedIdentity(state, stage);
  requireCondition(
    current !== undefined &&
      identityOwner(current.identity) === identityOwner(identity) &&
      !current.identity.retired,
    'Lifecycle owner changed before delivery reservation',
  );
  const existing = current.identity.delivery;

  if (existing?.owner === identityOwner(identity)) {
    requireCondition(
      existing.targetDatabaseId === targetDatabaseId,
      'Retire the incarnation before replacing its database',
    );
    await Promise.all([
      sameOperation(existing.target, intents.target),
      sameOperation(existing.register, intents.register),
      sameOperation(existing.publish, intents.publish),
    ]);

    return existing;
  }

  const [source, target] = await Promise.all([
    readPreviewGeneration(sourceDB, identity.targetOrigin),
    readPreviewGeneration(targetDB, identity.targetOrigin),
  ]);

  const plan = {
    owner: identityOwner(identity),
    targetDatabaseId,
    target: await preparePreviewGeneration(target.generation, intents.target),
    register: await preparePreviewGeneration(source.generation, intents.register),
    publish: await preparePreviewGeneration(source.generation + 1, intents.publish),
  };

  await saveIdentityOperations(state, stage, {
    ...current.identity,
    targetDatabaseId,
    delivery: plan,
    retirement: undefined,
  });

  return plan;
}

export async function retirementOperations(
  state: StateService,
  stage: string,
  identity: PreviewIdentityState,
  sourceDB: PreviewDatabase,
  sourceIntent: PreviewGenerationIntent,
  target?: { databaseId: string; DB: PreviewDatabase; intent: PreviewGenerationIntent },
  recoverStale = false,
) {
  const current = await retainedIdentity(state, stage);
  requireCondition(
    current !== undefined && identityOwner(current.identity) === identityOwner(identity),
    'Cleanup lifecycle owner changed',
  );

  if (current.identity.retirement) {
    const plan = current.identity.retirement;
    await sameOperation(plan.source, sourceIntent);
    requireCondition(
      plan.targetDatabaseId === target?.databaseId && !!plan.target === !!target,
      'Retirement database changed',
    );

    if (plan.target && target) await sameOperation(plan.target, target.intent);

    // Normal and cold retries never rebase. The already-authorized manual
    // closed-PR recovery may reserve a NEW operation after an owned in-flight
    // delivery wins. Keep the abandoned exact fence for audit/delayed requests.
    if (recoverStale) {
      const delivery = current.identity.delivery;
      requireCondition(
        delivery?.owner === identityOwner(identity),
        'Recovery requires the retained delivery owner',
      );
      const superseded = [...(plan.superseded ?? [])];

      const recover = async (
        DB: PreviewDatabase,
        operation: PreviewGenerationOperation,
        intent: PreviewGenerationIntent,
        ownedIds: string[],
      ) => {
        const latest = await readPreviewGeneration(DB, identity.targetOrigin);

        if (
          latest.generation === operation.expectedGeneration ||
          latest.operationId === operation.operationId
        )
          return operation;
        requireCondition(
          ownedIds.includes(latest.operationId ?? '') &&
            !(await DB.prepare(
              'SELECT operation_id FROM preview_generation_operations WHERE origin=? AND operation_id=?',
            )
              .bind(operation.origin, operation.operationId)
              .first()),
          'Recovery cannot supersede an applied operation or an unrelated generation',
        );
        superseded.push(operation);

        return preparePreviewGeneration(latest.generation, intent);
      };

      const source = await recover(sourceDB, plan.source, sourceIntent, [
        delivery.register.operationId,
        delivery.publish.operationId,
      ]);

      const targetOperation =
        plan.target && target
          ? await recover(target.DB, plan.target, target.intent, [delivery.target.operationId])
          : undefined;

      if (source !== plan.source || targetOperation !== plan.target) {
        requireCondition(superseded.length <= 16, 'Retirement recovery history is exhausted');
        const recovered = { ...plan, source, target: targetOperation, superseded };
        await saveIdentityOperations(state, stage, { ...current.identity, retirement: recovered });

        return recovered;
      }
    }

    return plan;
  }

  const source = await readPreviewGeneration(sourceDB, identity.targetOrigin);
  const targetCurrent = target ? await readPreviewGeneration(target.DB, identity.targetOrigin) : undefined;
  const delivery = current.identity.delivery;

  if (delivery?.owner === identityOwner(identity)) {
    requireCondition(
      source.generation === delivery.register.expectedGeneration ||
        source.operationId === delivery.register.operationId ||
        source.operationId === delivery.publish.operationId,
      'Source generation is no longer owned by this delivery',
    );
    requireCondition(
      !targetCurrent ||
        targetCurrent.generation === delivery.target.expectedGeneration ||
        targetCurrent.operationId === delivery.target.operationId,
      'Target generation is no longer owned by this delivery',
    );
  }

  const plan = {
    source: await preparePreviewGeneration(source.generation, sourceIntent),
    targetDatabaseId: target?.databaseId,
    target:
      target && targetCurrent
        ? await preparePreviewGeneration(targetCurrent.generation, target.intent)
        : undefined,
  };

  await saveIdentityOperations(state, stage, { ...current.identity, retirement: plan });

  return plan;
}
