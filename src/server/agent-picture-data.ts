import { Schema } from 'effect';
import { GameError } from '../game/types';
import { AgentPictureSchema, missingAgentPicture, type AgentPicture } from '../shared/agent-picture';

export function pictureView(json: string | null): AgentPicture {
  return json ? Schema.decodeUnknownSync(AgentPictureSchema)(JSON.parse(json)) : missingAgentPicture;
}

export async function agentPictures(env: Pick<Env, 'DB'>, ids: string[]) {
  const unique = [...new Set(ids)];

  if (!unique.length) return [];

  const rows = await env.DB.prepare(
    `SELECT agent_id, picture_json FROM agent_pictures WHERE agent_id IN (${unique.map(() => '?').join(',')})`,
  )
    .bind(...unique)
    .all<{ agent_id: string; picture_json: string }>();

  const pictures = new Map(rows.results.map((row) => [row.agent_id, pictureView(row.picture_json)]));

  return unique.map((agentId) => ({ agentId, picture: pictures.get(agentId) ?? missingAgentPicture }));
}

export async function currentAgentPicture(env: Pick<Env, 'DB'>, agentId: string): Promise<AgentPicture> {
  const row = await env.DB.prepare(
    'SELECT p.picture_json FROM agents a LEFT JOIN agent_pictures p ON p.agent_id = a.id WHERE a.id = ?',
  )
    .bind(agentId)
    .first<{ picture_json: string | null }>();

  if (!row) throw new GameError('agent-not-found', 'Agent not found.', 404);

  return pictureView(row.picture_json);
}

export function pictureAssetKey(agentId: string, version: string) {
  return `agent-pictures/${agentId}/${version}`;
}

/** Claim before deleting: a garbage asset can never subsequently become current. */
export async function collectAgentPictures(env: Pick<Env, 'DB' | 'AGENT_PICTURES'>): Promise<void> {
  const now = Date.now();

  const rows = await env.DB.prepare(
    `UPDATE agent_picture_assets SET state = 'garbage'
     WHERE version IN (
       SELECT version FROM agent_picture_assets b
       WHERE (state = 'live' OR expires_at < ?) AND collected_at < ?
         AND NOT EXISTS (SELECT 1 FROM agent_pictures p WHERE p.version = b.version)
       ORDER BY collected_at, expires_at LIMIT 50
     ) RETURNING agent_id, version`,
  )
    .bind(now, now - 86_400_000)
    .all<{ agent_id: string; version: string }>();

  for (const row of rows.results) {
    await env.AGENT_PICTURES.delete(pictureAssetKey(row.agent_id, row.version));
    // Retain tombstones and revisit daily: even an extremely late R2 put cannot resurrect a picture.
    await env.DB.prepare('UPDATE agent_picture_assets SET collected_at = ? WHERE version = ?')
      .bind(now, row.version)
      .run();
  }
}
