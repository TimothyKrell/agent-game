import { Schema } from 'effect';
import { GameError } from '../game/types';
import type { AgentPicture } from '../shared/agent-picture';
import { currentAgentPicture, pictureAssetKey, pictureView } from './agent-picture-data';
import { readPicture } from './agent-picture-upload';
import { hashSecret, json, readOptionalJson } from './http';

type PictureEnv = Pick<Env, 'DB' | 'AGENT_PICTURES'>;

interface PictureAuthority {
  ownerId: string;
  grantId: string | null;
}

async function receipt(env: PictureEnv, agentId: string, requestId: string, fingerprint: string) {
  const prior = await env.DB.prepare(
    'SELECT fingerprint, result_json FROM agent_picture_operations WHERE agent_id = ? AND request_id = ?',
  )
    .bind(agentId, requestId)
    .first<{ fingerprint: string; result_json: string }>();

  if (prior && prior.fingerprint !== fingerprint)
    throw new GameError('picture-request-reused', 'Use a new Idempotency-Key for a different change.', 409);

  return prior ? pictureView(prior.result_json) : null;
}

function metadataResponse(picture: AgentPicture) {
  const response = json(picture);
  response.headers.set('ETag', `"${picture.revision}"`);

  return response;
}

/** Authority is derived by the route through ownerSession/agentSession, never supplied in the body. */
export async function changeAgentPicture(
  request: Request,
  env: PictureEnv,
  agentId: string,
  authority: PictureAuthority,
): Promise<Response> {
  const removing = request.method === 'DELETE';
  const match = request.headers.get('if-match')?.match(/^"(0|[1-9]\d{0,14})"$/);
  const requestId = request.headers.get('idempotency-key') ?? '';

  if (!match)
    throw new GameError(
      'picture-precondition',
      'Read the picture and send its quoted revision in If-Match.',
      428,
    );

  if (!/^[\w:-]{8,128}$/.test(requestId))
    throw new GameError(
      'picture-request-id',
      'Use an Idempotency-Key of 8–128 letters, digits, hyphens, underscores or colons.',
      400,
    );

  // Local proxies can supply an empty stream even for a bodyless DELETE. A zero-byte limit accepts
  // that transport shape while rejecting real content without buffering it.
  if (removing) await readOptionalJson(request, Schema.Never, 0);

  const expected = Number(match[1]);
  const upload = removing ? null : await readPicture(request);

  const digest = upload
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', upload.bytes)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    : null;

  const fingerprint = await hashSecret(JSON.stringify([expected, request.method, digest]));
  const prior = await receipt(env, agentId, requestId, fingerprint);

  if (prior) return metadataResponse(prior);
  const current = await currentAgentPicture(env, agentId);

  if (current.revision !== expected)
    throw new GameError('picture-conflict', 'The picture changed. Refresh before making a new change.', 412);
  const attemptId = crypto.randomUUID();
  const version = upload ? attemptId : null;

  const result: AgentPicture = upload
    ? {
        state: 'present',
        revision: expected + 1,
        version: attemptId,
        url: `/api/agents/${encodeURIComponent(agentId)}/picture/${attemptId}`,
        ...upload.image,
        bytes: upload.bytes.byteLength,
      }
    : { state: 'missing', revision: expected + 1 };

  if (upload) {
    // The intent precedes R2. Expired/abandoned intents are fenced before garbage collection.
    await env.DB.prepare(
      "INSERT INTO agent_picture_assets (version, agent_id, state, expires_at) VALUES (?, ?, 'pending', ?)",
    )
      .bind(attemptId, agentId, Date.now() + 15 * 60_000)
      .run();
    await env.AGENT_PICTURES.put(pictureAssetKey(agentId, attemptId), upload.bytes, {
      httpMetadata: { contentType: upload.image.contentType },
    });
  }

  const now = Date.now();
  const resultJson = JSON.stringify(result);

  // D1 batch is a transaction. Only the fresh attempt can publish; replaying a receipt cannot roll back
  // a later picture. Retirement/revocation during the body/R2 write is rechecked at the commit fence.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO agent_picture_operations (agent_id, request_id, fingerprint, attempt_id, result_json)
       SELECT a.id, ?, ?, ?, ? FROM agents a LEFT JOIN agent_pictures p ON p.agent_id = a.id
       WHERE a.id = ? AND a.owner_id = ? AND (? = 1 OR a.retired_at IS NULL)
         AND coalesce(p.revision, 0) = ?
         AND (? IS NULL OR EXISTS (SELECT 1 FROM agent_grants g WHERE g.id = ? AND g.agent_id = a.id
           AND g.revoked_at IS NULL AND g.expires_at > ? AND a.retired_at IS NULL))
         AND (? IS NULL OR EXISTS (SELECT 1 FROM agent_picture_assets b WHERE b.version = ?
           AND b.state = 'pending' AND b.expires_at > ?))
       ON CONFLICT(agent_id, request_id) DO NOTHING`,
    ).bind(
      requestId,
      fingerprint,
      attemptId,
      resultJson,
      agentId,
      authority.ownerId,
      removing ? 1 : 0,
      expected,
      authority.grantId,
      authority.grantId,
      now,
      version,
      version,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO agent_pictures (agent_id, revision, version, picture_json)
       SELECT agent_id, ?, ?, result_json FROM agent_picture_operations WHERE attempt_id = ?
       ON CONFLICT(agent_id) DO UPDATE SET revision = excluded.revision, version = excluded.version,
         picture_json = excluded.picture_json`,
    ).bind(expected + 1, version, attemptId),
    env.DB.prepare(
      `UPDATE agent_picture_assets SET state = 'live' WHERE version = ?
       AND EXISTS (SELECT 1 FROM agent_pictures WHERE version = ?)`,
    ).bind(version, version),
  ]);
  const committed = await receipt(env, agentId, requestId, fingerprint);

  if (!committed)
    throw new GameError(
      'picture-conflict',
      'The picture or its authorization changed. Refresh before retrying.',
      412,
    );

  return metadataResponse(committed);
}

export async function readAgentPicture(request: Request, env: PictureEnv, agentId: string, version?: string) {
  const picture = await currentAgentPicture(env, agentId);

  if (!version) return metadataResponse(picture);

  if (picture.state !== 'present' || picture.version !== version)
    throw new GameError('picture-not-found', 'This picture is no longer available.', 404);

  const headers = new Headers({
    'Content-Type': picture.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: `"${version}"`,
    'Cross-Origin-Resource-Policy': 'same-origin',
  });

  const object = await env.AGENT_PICTURES.get(pictureAssetKey(agentId, version));

  if (!object) throw new GameError('picture-not-found', 'This picture is unavailable.', 404);

  if (request.headers.get('if-none-match') === `"${version}"`) {
    await object.body.cancel();

    return new Response(null, { status: 304, headers });
  }

  headers.set('Content-Length', String(object.size));

  if (request.method === 'HEAD') {
    await object.body.cancel();

    return new Response(null, { headers });
  }

  return new Response(object.body, { headers });
}
