import { PreviewActiveSchema } from '../shared/preview';
import { GameError } from '../game/types';
import { previewEnabled, previewTarget } from './preview-config';
import { sourceCall } from './preview-transport';

export interface PreviewAuthority {
  handoff_id: string;
  incarnation: string;
  expires_at: number;
}

/** No positive cache: every privileged request consults current source authority. */
export async function previewAuthority(
  env: Env,
  kind: 'session' | 'grant',
  id: string,
  agentId?: string,
): Promise<PreviewAuthority | null> {
  if (!previewEnabled(env)) return null;

  const row = await env.DB.prepare(
    'SELECT handoff_id,incarnation,expires_at FROM preview_authorities WHERE kind=? AND local_id=?',
  )
    .bind(kind, id)
    .first<PreviewAuthority>();

  const target = await previewTarget(env);

  if (!row || row.incarnation !== target.incarnation || row.expires_at <= Date.now())
    throw new GameError('preview-authority', 'Preview authority is expired or unavailable.', 401);

  const imported = agentId
    ? await env.DB.prepare(
        "SELECT source_id FROM preview_sources WHERE origin=? AND kind='agent' AND local_id=?",
      )
        .bind(target.sourceOrigin, agentId)
        .first<{ source_id: string }>()
    : null;

  await sourceCall(
    env,
    '/api/preview/introspect',
    JSON.stringify({ requestId: row.handoff_id, agentId: imported?.source_id }),
    PreviewActiveSchema,
  );

  return row;
}
