import { Effect } from 'effect';
import { GameError } from '../game/types';
import { gameDescriptor } from '../game/descriptors';
import {
  PreviewAllocationSchema,
  PreviewBrokerReferenceSchema,
  PreviewBrokerStatusRequestSchema,
  PreviewInferenceSchema,
  PreviewRetireInferenceSchema,
  previewAllocationIdentity,
} from '../shared/preview-broker';
import type { PreviewBrokerIntent, PreviewBrokerReceipt, PreviewInference } from '../shared/preview-broker';
import { platformCoordinator } from './coordinator';
import { hashSecret, json } from './http';
import { generateHouse } from './house-model';
import { previewInferenceCost } from './preview-ledger';
import { previewEnabled } from './preview-config';
import { previewBrokerConfiguration } from './preview-broker-config';
import { authorizePreviewCompetitor } from './preview-source';
import { decodePreview, verifyPreviewRequest } from './preview-transport';
import type { RpcResult } from '../shared/api';

type Target = { origin: string; incarnation: string };

function brokerValue<T>(result: RpcResult<T>): T {
  if (!result.ok) throw new GameError(result.error.code, result.error.message, result.error.status);

  return result.value;
}

async function currentTarget(env: Env, target: Target, commit: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT origin FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND closed_at IS NULL',
  )
    .bind(target.origin, target.incarnation, commit)
    .first();

  if (!row) throw new GameError('preview-target', 'Target revision is no longer registered.', 401);
}

async function authorizeIntent(env: Env, target: Target, intent: PreviewBrokerIntent): Promise<void> {
  if (intent.targetOrigin !== target.origin || intent.incarnation !== target.incarnation)
    throw new GameError('preview-target', 'Allocation belongs to a different target.', 401);
  await currentTarget(env, target, intent.commit);

  if (intent.rulesVersion !== gameDescriptor(intent.gameId).rulesVersion)
    throw new GameError('preview-rules', 'Unsupported rules version.', 409);

  if (
    new Set(intent.tickets.map((ticket) => ticket.agentId)).size !== intent.tickets.length ||
    new Set(intent.tickets.map((ticket) => ticket.ownerId)).size !== intent.tickets.length
  )
    throw new GameError('preview-tickets', 'A preview requires distinct competitors and owners.', 400);

  for (const ticket of intent.tickets) {
    const authority = await authorizePreviewCompetitor(env, target, ticket.handoffId, ticket.agentId);

    if (
      authority.ownerId !== ticket.ownerId ||
      ticket.expiresAt <= Date.now() ||
      ticket.expiresAt > authority.expiresAt ||
      ticket.joinedAt > Date.now()
    )
      throw new GameError('preview-tickets', 'Source play authority does not cover the ticket.', 401);
  }
}

function owns(target: Target, receipt: PreviewBrokerReceipt): void {
  if (receipt.intent.targetOrigin !== target.origin || receipt.intent.incarnation !== target.incarnation)
    throw new GameError('preview-target', 'Allocation belongs to a different target.', 401);
}

async function executeInference(
  env: Env,
  receipt: PreviewBrokerReceipt,
  input: PreviewInference,
  fingerprint: string,
): Promise<void> {
  const queue = platformCoordinator(env);
  const { provider, model, policyVersion } = receipt.snapshot.houseModel;

  if (provider !== 'workers-ai' && provider !== 'openai') throw new Error('Invalid broker provider');
  let generated;

  try {
    generated = await Effect.runPromise(
      generateHouse(
        env,
        { provider, model, policyVersion },
        input.prompt,
        input.deadline,
        input.choices.length,
        input.system,
      ),
    );
  } catch {
    await queue.finishPreviewInference(input, fingerprint, { state: 'failed' }, null);

    return;
  }

  const known =
    generated.inputTokens !== null &&
    generated.outputTokens !== null &&
    Number.isFinite(generated.inputTokens) &&
    generated.inputTokens >= 0 &&
    Number.isFinite(generated.outputTokens) &&
    generated.outputTokens >= 0;

  const actual = known
    ? previewInferenceCost(receipt, generated.inputTokens!, generated.outputTokens!)
    : null;

  const estimate = previewInferenceCost(
    receipt,
    new TextEncoder().encode(input.system + input.prompt).byteLength,
    receipt.maxOutputTokens,
  );

  // The source owns usage; a lost settlement acknowledgement leaves a held dispatch, never a zero charge.
  await queue.finishPreviewInference(
    input,
    fingerprint,
    { state: 'completed', ...generated, accountedUsd: actual ?? estimate },
    actual,
  );
}

/** Target-authenticated, bounded RPC façade. Provider I/O never runs in a coordinator transaction. */
export async function sourceBrokerRoute(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  if (previewEnabled(env) || request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;
  const operation = path.slice('/api/preview/broker/'.length);

  if (
    !path.startsWith('/api/preview/broker/') ||
    !['status', 'allocate', 'validate', 'inference', 'complete', 'retire'].includes(operation)
  )
    return null;
  const proof = await verifyPreviewRequest(env, request, 65536);
  const queue = platformCoordinator(env);

  // Cleanup remains available after broker disablement; it requires the exact registered target, not expired player authority.
  if (operation === 'complete' || operation === 'retire') {
    const input = decodePreview(PreviewBrokerReferenceSchema, proof.payload);
    await currentTarget(env, proof, input.commit);
    const receipt = await queue.previewAllocation(input.allocationId);

    if (receipt) owns(proof, receipt);

    if (operation === 'retire')
      await queue.retirePreviewInference(decodePreview(PreviewRetireInferenceSchema, proof.payload));
    else await queue.completePreview(input.allocationId, proof);

    return json({ closed: true });
  }

  const config = await previewBrokerConfiguration(env);

  if (operation === 'status') {
    const input = decodePreview(PreviewBrokerStatusRequestSchema, proof.payload);
    await currentTarget(env, proof, input.commit);
    await queue.reconcilePreviewTargets();

    return json({
      version: 1,
      sourceRevision: config.revision,
      sourcePolicyVersion: 'preview-broker-1',
      provider: env.HOUSE_PROVIDER,
      model: env.HOUSE_MODEL,
      profiles: ['smoke', 'live'],
      secretOverlord: await queue.previewBudget('secret-overlord'),
      succession: await queue.previewBudget('succession'),
    });
  }

  if (operation === 'allocate') {
    const intent = decodePreview(PreviewAllocationSchema, proof.payload);
    await authorizeIntent(env, proof, intent);

    return json(
      brokerValue(
        await queue.allocatePreview(
          intent,
          await hashSecret(previewAllocationIdentity(intent)),
          config.revision,
        ),
      ),
    );
  }

  const reference = decodePreview(PreviewBrokerReferenceSchema, proof.payload);
  const receipt = await queue.previewAllocation(reference.allocationId);

  if (!receipt) throw new GameError('preview-allocation', 'Unknown source allocation.', 401);
  owns(proof, receipt);

  if (receipt.closed) throw new GameError('preview-allocation-closed', 'Allocation is closed.', 409);

  if (reference.commit !== receipt.intent.commit)
    throw new GameError('preview-target', 'Allocation revision changed.', 401);
  await authorizeIntent(env, proof, receipt.intent);

  if (operation === 'validate') return json(receipt);

  if (!ctx) throw new Error('Broker execution context is required');
  const input = decodePreview(PreviewInferenceSchema, proof.payload);

  if (
    input.policyVersion !== receipt.intent.policyVersion ||
    input.deadline > Date.now() + 120000 ||
    (input.kind === 'required') !== input.choices.length > 0 ||
    new TextEncoder().encode(input.prompt).byteLength > 19000 ||
    new TextEncoder().encode(input.system).byteLength > 12000
  )
    throw new GameError(
      'preview-inference',
      'Invalid policy, bounded legal request or useful deadline.',
      400,
    );
  const fingerprint = await hashSecret(JSON.stringify({ ...input, attempt: 0 }));
  const begun = brokerValue(await queue.beginPreviewInference(input, fingerprint));

  if (begun.dispatch)
    ctx.waitUntil(
      executeInference(env, receipt, input, fingerprint).catch(() => {
        console.warn(
          JSON.stringify({ event: 'preview_dispatch_unsettled', allocationId: input.allocationId }),
        );
      }),
    );

  return json(begun.result, begun.result.state === 'pending' ? 202 : 200);
}
