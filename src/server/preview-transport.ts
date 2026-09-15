import { Schema } from 'effect';
import { PreviewSignedSchema, PreviewRedemptionSchema } from '../shared/preview';
import { GameError } from '../game/types';
import { hashSecret, randomSecret, readJson } from './http';
import { openPreview, previewTarget } from './preview-config';
import type { PreviewTarget } from './preview-config';

/** Unlike local development's general CORS helper, preview proofs bind the exact origin, including port. */
export function previewBrowserOrigin(request: Request, env: Env): void {
  if (request.headers.get('origin') !== env.APP_URL)
    throw new GameError('origin', 'Use the exact preview application origin.', 403);
}

/** RFC 7636 S256 encoding; token and authorization-code hashes remain hexadecimal. */
export async function previewChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function signedText(
  source: string,
  path: string,
  origin: string,
  incarnation: string,
  at: number,
  nonce: string,
  payload: string,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([1, 'POST', source, path, origin, incarnation, at, nonce, payload]),
  );
}

export async function signPreviewRequest(
  env: Env,
  target: PreviewTarget,
  path: string,
  payload: string,
): Promise<Request> {
  const at = Date.now();
  const nonce = randomSecret();

  const key = await crypto.subtle.importKey(
    'pkcs8',
    bytes(await openPreview(env, target.encryptedKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signedText(target.sourceOrigin, path, target.origin, target.incarnation, at, nonce, payload),
  );

  // workerd supports manual/follow only. sourceCall rejects every 3xx without following it.
  return new Request(target.sourceOrigin + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      origin: target.origin,
      incarnation: target.incarnation,
      at,
      nonce,
      payload,
      signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
    }),
  });
}

export async function sourceCall<A, I>(
  env: Env,
  path: string,
  payload: string,
  schema: Schema.Codec<A, I>,
): Promise<A> {
  const request = await signPreviewRequest(env, await previewTarget(env), path, payload);

  const response = await fetch(request).catch(() => {
    throw new GameError('preview-source-unavailable', 'Source authority is temporarily unavailable.', 503);
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new GameError(
      'preview-source-denied',
      'Source authority is unavailable, expired or revoked.',
      response.status >= 500 ? 503 : 401,
    );
  }

  // Reuse the bounded streaming decoder for cross-origin responses too.
  return readJson(
    new Request('https://preview-response.invalid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: response.body,
    }),
    schema,
    65536,
  );
}

/** The target, not the browser/CLI, attests its deployed revision on each exchange. */
export async function redeemPreview(env: Env, requestId: string, code: string, verifier: string) {
  const target = await previewTarget(env);

  return sourceCall(
    env,
    '/api/preview/redeem',
    JSON.stringify({ requestId, code, verifier, commit: target.commit }),
    PreviewRedemptionSchema,
  );
}

export async function verifyPreviewRequest(
  env: Env,
  request: Request,
  maxBytes = 32768,
): Promise<{ origin: string; incarnation: string; payload: string }> {
  const input = await readJson(request, PreviewSignedSchema, maxBytes);

  if (!Number.isSafeInteger(input.at) || input.at < Date.now() - 60000 || input.at > Date.now() + 5000)
    throw new GameError('preview-proof', 'Expired target proof.', 401);

  const arena = await env.DB.prepare(
    'SELECT public_key FROM preview_arenas WHERE origin=? AND incarnation=? AND closed_at IS NULL',
  )
    .bind(input.origin, input.incarnation)
    .first<{ public_key: string }>();

  if (!arena) throw new GameError('preview-target', 'Target is not registered.', 401);
  let valid = false;

  try {
    const key = await crypto.subtle.importKey(
      'spki',
      bytes(arena.public_key),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      bytes(input.signature),
      signedText(
        env.APP_URL,
        new URL(request.url).pathname,
        input.origin,
        input.incarnation,
        input.at,
        input.nonce,
        input.payload,
      ),
    );
  } catch {
    valid = false;
  }

  if (!valid) throw new GameError('preview-proof', 'Invalid target proof.', 401);
  await env.DB.prepare('DELETE FROM preview_nonces WHERE expires_at < ?').bind(Date.now()).run();

  const receipt = await env.DB.prepare('INSERT OR IGNORE INTO preview_nonces VALUES (?,?,?,?)')
    .bind(input.origin, input.incarnation, await hashSecret(input.nonce), input.at + 65001)
    .run();

  if (!receipt.meta.changes) throw new GameError('preview-replay', 'Target request already used.', 401);

  return input;
}

export function decodePreview<A, I>(schema: Schema.Codec<A, I>, payload: string): A {
  try {
    return Schema.decodeUnknownSync(schema)(JSON.parse(payload));
  } catch {
    throw new GameError('preview-payload', 'Invalid preview request.', 400);
  }
}
