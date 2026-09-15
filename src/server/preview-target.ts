import { Schema } from 'effect';
import { GameError } from '../game/types';
import { PreviewAgentExchangeSchema, PreviewStartSchema } from '../shared/preview';
import { hashSecret, json, randomSecret, readJson } from './http';
import { openPreview, previewEnabled, previewTarget, sealPreview } from './preview-config';
import { previewBrowserOrigin, sourceCall, redeemPreview, previewChallenge } from './preview-transport';
import { importPreviewMetadata } from './preview-import';
import { previewAuthority } from './preview-authority';

export interface PreviewPending {
  id: string;
  incarnation: string;
  commit_id: string;
  encrypted_verifier: string;
  browser_hash: string;
  expires_at: number;
  encrypted_token: string;
  session_committed: number;
}

export function previewBrowserCookie(env: Env, id: string): string {
  return `${env.APP_URL.startsWith('https:') ? '__Host-' : ''}preview-${id}`;
}

export async function ownerPreviewPending(env: Env, id: string): Promise<PreviewPending> {
  const pending = await env.DB.prepare('SELECT * FROM preview_pending WHERE id=?')
    .bind(id)
    .first<PreviewPending>();

  const target = await previewTarget(env);

  if (!pending || pending.incarnation !== target.incarnation || pending.expires_at <= Date.now())
    throw new GameError('preview-expired', 'Restart preview sign-in.', 401);

  return pending;
}

export async function targetPreviewRoute(request: Request, env: Env): Promise<Response | null> {
  if (!previewEnabled(env) || request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;

  if (path === '/api/preview/owner-start') {
    previewBrowserOrigin(request, env);
    const input = await readJson(request, PreviewStartSchema);
    const target = await previewTarget(env);
    const browserHash = await hashSecret(input.browserProof);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO preview_pending
      (id,incarnation,commit_id,encrypted_verifier,browser_hash,expires_at,encrypted_token) VALUES (?,?,?,?,?,?,?)`,
    )
      .bind(
        input.requestId,
        target.incarnation,
        target.commit,
        await sealPreview(env, randomSecret()),
        browserHash,
        Date.now() + 1200000,
        await sealPreview(env, randomSecret()),
      )
      .run();
    const pending = await ownerPreviewPending(env, input.requestId);

    if (pending.browser_hash !== browserHash || pending.commit_id !== target.commit)
      throw new GameError('preview-conflict', 'This request belongs to another browser or revision.', 409);
    await sourceCall(
      env,
      '/api/preview/requests',
      JSON.stringify({
        requestId: pending.id,
        targetOrigin: target.origin,
        incarnation: pending.incarnation,
        commit: pending.commit_id,
        challenge: await previewChallenge(await openPreview(env, pending.encrypted_verifier)),
      }),
      Schema.Struct({ requestId: Schema.String }),
    );

    const response = json({
      requestId: pending.id,
      continueUrl: `${target.sourceOrigin}/preview/continue?requestId=${encodeURIComponent(pending.id)}`,
    });

    response.headers.append(
      'set-cookie',
      `${previewBrowserCookie(env, pending.id)}=${input.browserProof}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1200${target.origin.startsWith('https:') ? '; Secure' : ''}`,
    );

    return response;
  }

  if (path !== '/api/preview/agent-exchange') return null;

  if (request.headers.has('origin')) previewBrowserOrigin(request, env);
  const token = request.headers.get('authorization')?.match(/^Bearer (agk_[A-Za-z0-9_-]{43})$/)?.[1];

  if (!token) throw new GameError('preview-token', 'Present the new target credential.', 401);
  const input = await readJson(request, PreviewAgentExchangeSchema);
  const receipt = await redeemPreview(env, input.requestId, input.code, input.verifier);

  if (receipt.scope !== 'agent' || !receipt.agentId || receipt.tokenHash !== (await hashSecret(token)))
    throw new GameError('preview-proof', 'Target credential does not match the source authorization.', 401);
  await importPreviewMetadata(env, receipt);
  const target = await previewTarget(env);
  const grantId = `preview_${receipt.requestId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO agent_grants (id,agent_id,secret_hash,name,created_at,expires_at)
      SELECT ?,?,?,'Source preview connection',?,? WHERE NOT EXISTS
      (SELECT 1 FROM preview_authorities WHERE kind='grant' AND local_id=?)`,
    ).bind(grantId, receipt.agentId, receipt.tokenHash, Date.now(), receipt.expiresAt, grantId),
    env.DB.prepare(`INSERT OR IGNORE INTO preview_authorities VALUES ('grant',?,?,?,?)`).bind(
      grantId,
      receipt.requestId,
      target.incarnation,
      receipt.expiresAt,
    ),
  ]);

  const active = await env.DB.prepare(
    `SELECT g.id FROM agent_grants g JOIN agents a ON a.id=g.agent_id
    WHERE g.id=? AND g.secret_hash=? AND g.revoked_at IS NULL AND g.expires_at>? AND a.retired_at IS NULL`,
  )
    .bind(grantId, receipt.tokenHash, Date.now())
    .first();

  if (!active) throw new GameError('preview-revoked', 'Target connection is revoked or retired.', 401);
  await previewAuthority(env, 'grant', grantId, receipt.agentId);

  return json({ connectionId: grantId, agentId: receipt.agentId, expiresAt: receipt.expiresAt });
}
