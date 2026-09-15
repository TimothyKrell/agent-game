import { GameError } from '../game/types';
import { houseConfigured } from './house-model';
import { previewEnabled } from './preview-config';
import type { PreviewDatabase } from './preview-config';

/** Trusted deployment-controller API; defaults off. It does not create or raise an allowance. */
export async function configurePreviewBroker(
  env: { DB: PreviewDatabase },
  input: { enabled: boolean; revision: string },
): Promise<void> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.revision)) throw new Error('Invalid broker revision');
  await env.DB.prepare(
    'INSERT INTO preview_broker_settings VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision',
  )
    .bind(input.enabled ? 1 : 0, input.revision)
    .run();
}

export async function previewBrokerConfiguration(env: Env): Promise<{ revision: string }> {
  const row = await env.DB.prepare(
    'SELECT revision FROM preview_broker_settings WHERE id=1 AND enabled=1',
  ).first<{ revision: string }>();

  if (!row || (!previewEnabled(env) && (env.HOUSE_PROVIDER === 'preview' || !houseConfigured(env))))
    throw new GameError('preview-allocation-pending', 'Live preview broker is not configured.', 503);

  return row;
}
