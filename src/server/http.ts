import { Schema } from 'effect';
import { GameError } from '../game/types';
import type { ActionRequest } from '../game/types';
import type { RpcResult } from '../shared/api';

export async function readJson<A, I>(
  request: Request,
  schema: Schema.Codec<A, I>,
  limit = 16_384,
): Promise<A> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new GameError('content-type', 'Use application/json.', 415);

  if (Number(request.headers.get('content-length') ?? 0) > limit)
    throw new GameError('body-too-large', 'Request body is too large.', 413);
  const reader = request.body?.getReader();

  if (!reader) throw new GameError('invalid-json', 'A JSON body is required.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const next = await reader.read();

      if (next.done) break;
      size += next.value.byteLength;

      if (size > limit) {
        await reader.cancel();
        throw new GameError('body-too-large', 'Request body is too large.', 413);
      }

      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return Schema.decodeUnknownSync(schema)(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new GameError('invalid-json', 'The request does not match the documented schema.', 400);
  }
}

export function json<T>(value: T, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function rpcResponse<T>(result: RpcResult<T>): Response {
  return result.ok ? json(result.value) : json({ error: result.error }, result.error.status);
}

export function fault(cause: unknown): { code: string; message: string; status: number } {
  return cause instanceof GameError
    ? { code: cause.code, message: cause.message, status: cause.status }
    : { code: 'internal', message: 'The operation could not be completed.', status: 500 };
}

export function nameValue(value: string): string {
  const normalized = value.trim().normalize('NFKC');
  const characters = [...normalized];

  if (
    characters.length < 2 ||
    characters.length > 40 ||
    characters.some((character) => {
      const code = character.codePointAt(0)!;

      return code <= 31 || code === 127;
    })
  )
    throw new GameError('invalid-name', 'Names must contain 2–40 characters.', 400);

  return normalized;
}

export function opaqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function isLoopback(url: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}

export function checkOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('origin');

  if (
    !origin ||
    (origin !== new URL(env.APP_URL).origin &&
      !(env.ENVIRONMENT === 'development' && isLoopback(origin) && isLoopback(request.url)))
  ) {
    throw new GameError('origin', 'Use the application website for account operations.', 403);
  }
}

export function stableJson(request: ActionRequest): string {
  // Actions have scalar fields; the envelope's only nested object is the action.
  const action = Object.fromEntries(Object.entries(request.action).sort(([a], [b]) => a.localeCompare(b)));

  return JSON.stringify(
    Object.fromEntries(Object.entries({ ...request, action }).sort(([a], [b]) => a.localeCompare(b))),
  );
}
