import { GameError } from '../game/types';
import { hashSecret, opaqueId } from './http';
import { ownedAgent } from './repository';
import { previewEnabled } from './preview-config';
import { previewAuthority } from './preview-authority';
import type { PreviewAuthority } from './preview-authority';

interface Pending {
  id: string;
  code: string;
  installation: string;
  status: string;
  agent_id: string | null;
  grant_id: string | null;
  expires_at: number;
  last_poll_at: number | null;
}

export async function startPairing(env: Env, installation: string, tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash) || !installation.trim() || installation.length > 80)
    throw new GameError(
      'invalid-pairing',
      'Supply an installation name and SHA-256 credential challenge.',
      400,
    );
  const now = Date.now();

  const previous = await env.DB.prepare(
    'SELECT * FROM pending_connections WHERE secret_hash = ? AND expires_at > ?',
  )
    .bind(tokenHash, now)
    .first<Pending>();

  if (previous)
    return {
      requestId: previous.id,
      code: previous.code,
      verificationUrl: `${env.APP_URL}/connect?code=${previous.code}`,
      expiresAt: previous.expires_at,
      interval: 5,
    };
  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const id = opaqueId('pair');
  await env.DB.prepare('DELETE FROM pending_connections WHERE secret_hash = ? AND expires_at <= ?')
    .bind(tokenHash, now)
    .run();
  await env.DB.prepare(
    'INSERT INTO pending_connections (id, code, secret_hash, installation, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, code, tokenHash, installation.trim(), now, now + 10 * 60_000)
    .run();

  return {
    requestId: id,
    code,
    verificationUrl: `${env.APP_URL}/connect?code=${code}`,
    expiresAt: now + 10 * 60_000,
    interval: 5,
  };
}

export async function pairingDetails(env: Env, code: string) {
  const pending = await env.DB.prepare('SELECT * FROM pending_connections WHERE code = ? AND expires_at > ?')
    .bind(code.toUpperCase(), Date.now())
    .first<Pending>();

  if (!pending)
    throw new GameError(
      'pairing-expired',
      'This pairing request has expired. Ask your agent to start a new connection.',
      404,
    );

  return {
    code: pending.code,
    installation: pending.installation,
    status: pending.status,
    expiresAt: pending.expires_at,
  };
}

export async function approvePairing(
  env: Env,
  ownerId: string,
  code: string,
  agentId: string,
  authority: PreviewAuthority | null = null,
) {
  if (previewEnabled(env) && !authority)
    throw new GameError('preview-authority', 'Preview pairing requires source owner authority.', 401);
  const agent = await ownedAgent(env, ownerId, agentId);

  if (agent.retired) throw new GameError('agent-retired', 'Choose an active agent.');

  const pending = await env.DB.prepare('SELECT * FROM pending_connections WHERE code = ? AND expires_at > ?')
    .bind(code.toUpperCase(), Date.now())
    .first<Pending>();

  if (!pending) throw new GameError('pairing-expired', 'This pairing request has expired.', 404);

  if (pending.status === 'approved') {
    if (pending.agent_id !== agentId)
      throw new GameError('pairing-used', 'This request has already been approved for another agent.');

    return { approved: true, agentId };
  }

  const now = Date.now();
  const grantId = opaqueId('connection');

  const statements = [
    env.DB.prepare(
      `INSERT INTO agent_grants (id, agent_id, secret_hash, name, created_at, expires_at)
      SELECT ?, ?, p.secret_hash, p.installation, ?, ? FROM pending_connections p JOIN agents a ON a.id = ?
      WHERE p.id = ? AND p.status = 'pending' AND p.expires_at > ? AND a.owner_id = ? AND a.retired_at IS NULL`,
    ).bind(
      grantId,
      agentId,
      now,
      Math.min(now + 90 * 86400_000, authority?.expires_at ?? Infinity),
      agentId,
      pending.id,
      now,
      ownerId,
    ),
    env.DB.prepare(
      `UPDATE pending_connections SET status = 'approved', agent_id = ?, grant_id = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ? AND EXISTS(SELECT 1 FROM agent_grants WHERE id = ?)`,
    ).bind(agentId, grantId, pending.id, now, grantId),
  ];

  if (authority)
    statements.push(
      env.DB.prepare(
        `INSERT INTO preview_authorities
    SELECT 'grant',?,?,?,? WHERE EXISTS(SELECT 1 FROM agent_grants WHERE id=?)`,
      ).bind(grantId, authority.handoff_id, authority.incarnation, authority.expires_at, grantId),
    );
  await env.DB.batch(statements);

  const result = await env.DB.prepare('SELECT agent_id FROM pending_connections WHERE id = ? AND status = ?')
    .bind(pending.id, 'approved')
    .first<{ agent_id: string }>();

  if (result?.agent_id !== agentId)
    throw new GameError('pairing-conflict', 'The pairing request changed. Reload and try again.');

  return { approved: true, agentId };
}

export async function pollPairing(env: Env, request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (agk_[A-Za-z0-9_-]{43})$/)?.[1];

  if (!token) throw new GameError('invalid-pairing-proof', 'Supply the private pairing credential.', 401);
  const hash = await hashSecret(token);
  const now = Date.now();

  const pending = await env.DB.prepare('SELECT * FROM pending_connections WHERE secret_hash = ?')
    .bind(hash)
    .first<Pending>();

  if (!pending || pending.expires_at <= now)
    throw new GameError('pairing-expired', 'Start a new pairing request.', 410);

  if (pending.last_poll_at && now - pending.last_poll_at < 4500)
    throw new GameError('slow-down', 'Poll no more often than every five seconds.', 429);
  await env.DB.prepare('UPDATE pending_connections SET last_poll_at = ? WHERE id = ?')
    .bind(now, pending.id)
    .run();

  if (pending.status !== 'approved') return { status: 'pending', interval: 5 };

  const grant = await env.DB.prepare(
    `SELECT g.id AS connectionId, g.agent_id AS agentId, a.name AS agentName, g.expires_at AS expiresAt
    FROM agent_grants g JOIN agents a ON a.id = g.agent_id WHERE g.id = ? AND g.revoked_at IS NULL AND a.retired_at IS NULL`,
  )
    .bind(pending.grant_id)
    .first<{ connectionId: string; agentId: string; agentName: string; expiresAt: number }>();

  if (!grant) throw new GameError('connection-revoked', 'The approved connection was revoked.', 401);
  await previewAuthority(env, 'grant', grant.connectionId, grant.agentId);

  return { status: 'approved', ...grant };
}
