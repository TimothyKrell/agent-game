import { Schema } from 'effect';
import type { PreviewBrokerIntent, PreviewBrokerReceipt, PreviewInference } from '../shared/preview-broker';
import {
  PreviewBrokerReceiptSchema,
  PreviewBrokerStatusSchema,
  PreviewInferenceResultSchema,
} from '../shared/preview-broker';
import { GameError } from '../game/types';
import { previewTarget } from './preview-config';
import { previewBrokerConfiguration } from './preview-broker-config';
import { sourceCall } from './preview-transport';

export async function previewCapabilities(env: Env) {
  const [config, target] = await Promise.all([previewBrokerConfiguration(env), previewTarget(env)]);

  if (config.revision !== target.commit)
    throw new GameError(
      'preview-allocation-pending',
      'Live broker configuration is for another revision.',
      503,
    );

  return sourceCall(
    env,
    '/api/preview/broker/status',
    JSON.stringify({ commit: target.commit }),
    PreviewBrokerStatusSchema,
  );
}

export async function allocatePreview(env: Env, intent: PreviewBrokerIntent): Promise<PreviewBrokerReceipt> {
  return sourceCall(env, '/api/preview/broker/allocate', JSON.stringify(intent), PreviewBrokerReceiptSchema);
}

export async function validatePreviewAllocation(
  env: Env,
  receipt: PreviewBrokerReceipt,
): Promise<PreviewBrokerReceipt> {
  return sourceCall(
    env,
    '/api/preview/broker/validate',
    JSON.stringify({ allocationId: receipt.allocationId, commit: receipt.intent.commit }),
    PreviewBrokerReceiptSchema,
  );
}

export async function closePreviewAllocation(
  env: Env,
  allocationId: string,
  incarnation: string,
): Promise<void> {
  const target = await previewTarget(env);

  // Replacement registration closes the retired incarnation at source. A new key cannot act for the old one.
  if (target.incarnation !== incarnation) return;
  await sourceCall(
    env,
    '/api/preview/broker/complete',
    JSON.stringify({ allocationId, commit: target.commit }),
    Schema.Struct({ closed: Schema.Boolean }),
  );
}

export async function previewInference(env: Env, input: PreviewInference) {
  const target = await previewTarget(env);

  if (target.commit !== input.commit)
    throw new GameError('preview-target', 'Inference belongs to another deployed revision.', 401);

  return sourceCall(
    env,
    '/api/preview/broker/inference',
    JSON.stringify(input),
    PreviewInferenceResultSchema,
  );
}

export async function retirePreviewInference(
  env: Env,
  input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>,
): Promise<void> {
  const target = await previewTarget(env);
  await sourceCall(
    env,
    '/api/preview/broker/retire',
    JSON.stringify({ ...input, commit: target.commit }),
    Schema.Struct({ closed: Schema.Boolean }),
  );
}
