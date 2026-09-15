import { GameError } from '../game/types';
import { PreviewMetadataSchema } from '../shared/preview';
import type { PreviewReceipt } from '../shared/preview';
import { nameValue, opaqueId } from './http';
import { previewTarget } from './preview-config';
import { sourceCall } from './preview-transport';

/** Source IDs are stable; mutable rows are inserted once. No provider accounts or history are imported. */
export async function importPreviewOwner(env: Env, receipt: PreviewReceipt): Promise<string> {
  const target = await previewTarget(env);
  const userId = opaqueId('preview-user');
  const { owner } = receipt;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO preview_sources (origin,kind,source_id,local_id)
      SELECT ?,'owner',?,? WHERE NOT EXISTS(SELECT 1 FROM owners WHERE id=?)`,
    ).bind(target.sourceOrigin, owner.id, owner.id, owner.id),
    env.DB.prepare(
      `INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt)
      SELECT ?,?,?,0,?,? WHERE NOT EXISTS(SELECT 1 FROM owners WHERE id=?)
      AND EXISTS(SELECT 1 FROM preview_sources WHERE origin=? AND kind='owner' AND source_id=? AND local_id=?)`,
    ).bind(
      userId,
      owner.name,
      `${userId}@preview.agent-game.invalid`,
      now,
      now,
      owner.id,
      target.sourceOrigin,
      owner.id,
      owner.id,
    ),
    env.DB.prepare(
      `INSERT INTO owners (id,user_id,handle,name,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=?)`,
    ).bind(owner.id, userId, owner.handle, owner.name, now, userId),
  ]);

  const imported = await env.DB.prepare(
    `SELECT o.user_id FROM owners o JOIN preview_sources p ON p.local_id=o.id
    WHERE p.origin=? AND p.kind='owner' AND p.source_id=? AND o.id=?`,
  )
    .bind(target.sourceOrigin, owner.id, owner.id)
    .first<{ user_id: string }>();

  if (!imported)
    throw new GameError('preview-collision', 'An existing local identity conflicts with source import.', 409);

  return imported.user_id;
}

export async function importPreviewMetadata(env: Env, receipt: PreviewReceipt): Promise<string> {
  const userId = await importPreviewOwner(env, receipt);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO preview_imports (handoff_id,scope,owner_id,agent_id,expires_at)
    VALUES (?,?,?,?,?)`,
  )
    .bind(receipt.requestId, receipt.scope, receipt.owner.id, receipt.agentId, receipt.expiresAt)
    .run();
  const target = await previewTarget(env);

  // Bounded pages are individually atomic; a retry resumes the persisted cursor.
  for (let pages = 0; pages < 20; pages++) {
    const progress = await env.DB.prepare('SELECT cursor,complete FROM preview_imports WHERE handoff_id=?')
      .bind(receipt.requestId)
      .first<{ cursor: string | null; complete: number }>();

    if (progress?.complete) return userId;

    const page = await sourceCall(
      env,
      '/api/preview/metadata',
      JSON.stringify({ requestId: receipt.requestId, after: progress?.cursor ?? '' }),
      PreviewMetadataSchema,
    );

    const statements: D1PreparedStatement[] = [];

    for (const agent of page.agents) {
      if (agent.ownerId !== receipt.owner.id || (receipt.scope === 'agent' && agent.id !== receipt.agentId))
        throw new GameError('preview-scope', 'Unexpected source competitor.', 401);
      const characters = [...nameValue(agent.name)];

      // Slice code points before JS lowercasing: SQLite lower() is ASCII-only, and e.g. İ expands.
      const prefixes = JSON.stringify(
        Array.from({ length: 41 }, (_, length) => {
          const name = characters.slice(0, length).join('');

          return { name, key: name.toLowerCase() };
        }),
      );

      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO preview_sources (origin,kind,source_id,local_id)
          SELECT ?,'agent',?,? WHERE NOT EXISTS(SELECT 1 FROM agents WHERE id=?)`,
        ).bind(target.sourceOrigin, agent.id, agent.id, agent.id),
        env.DB.prepare(
          // Choose inside the write transaction, including tombstones. No read/insert race or name adoption.
          `WITH RECURSIVE candidates(n,suffix) AS (
            SELECT 0,''
            UNION ALL
            SELECT n+1,' (source '||(n+1)||')' FROM candidates WHERE EXISTS
              (SELECT 1 FROM agents WHERE owner_id=?
               AND name_key=json_extract(?,'$['||(40-length(suffix))||'].key')||suffix)
              AND NOT EXISTS(SELECT 1 FROM agents WHERE id=?)
          ), selected AS (
            SELECT json_extract(?,'$['||(40-length(suffix))||'].name')||suffix AS name,
              json_extract(?,'$['||(40-length(suffix))||'].key')||suffix AS name_key
            FROM candidates ORDER BY n DESC LIMIT 1
          )
          INSERT INTO agents (id,owner_id,name,name_key,description,created_at,retired_at)
          SELECT ?,?,name,name_key,?,?,? FROM selected WHERE NOT EXISTS(SELECT 1 FROM agents WHERE id=?) AND EXISTS
          (SELECT 1 FROM preview_sources WHERE origin=? AND kind='agent' AND source_id=? AND local_id=?)`,
        ).bind(
          agent.ownerId,
          prefixes,
          agent.id,
          prefixes,
          prefixes,
          agent.id,
          agent.ownerId,
          agent.description,
          Date.now(),
          agent.retiredAt,
          agent.id,
          target.sourceOrigin,
          agent.id,
          agent.id,
        ),
      );
    }

    if (statements.length) await env.DB.batch(statements);

    for (const agent of page.agents) {
      const imported = await env.DB.prepare(
        `SELECT a.id FROM agents a JOIN preview_sources p ON p.local_id=a.id
        WHERE p.origin=? AND p.kind='agent' AND p.source_id=? AND a.owner_id=? AND a.house=0`,
      )
        .bind(target.sourceOrigin, agent.id, receipt.owner.id)
        .first();

      if (!imported)
        throw new GameError(
          'preview-collision',
          'An existing local competitor conflicts with source import.',
          409,
        );
    }

    // Commit progress only after collision checks; CAS prevents a slow response moving it backward.
    await env.DB.prepare(
      `UPDATE preview_imports SET cursor=?,complete=? WHERE handoff_id=? AND cursor IS ? AND complete=0`,
    )
      .bind(page.next, page.next === null ? 1 : 0, receipt.requestId, progress?.cursor ?? null)
      .run();
  }

  throw new GameError('preview-import-pending', 'Roster import is in progress; retry this completion.', 503);
}
