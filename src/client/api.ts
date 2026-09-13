import { createAuthClient } from 'better-auth/react';
import { Option, Schema } from 'effect';
import { ErrorResponseSchema, type ApiRequestBody } from '../shared/api';

export const auth = createAuthClient();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number,
    readonly details?: (typeof ErrorResponseSchema.Type)['error'],
  ) {
    super(message);
  }
}

async function request(path: string, body?: ApiRequestBody, method?: string): Promise<Response> {
  const headers = new Headers({ 'X-Agent-Game-Protocols': '1,2' });

  if (body !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const data = Option.getOrNull(
      Schema.decodeUnknownOption(ErrorResponseSchema)(await response.json().catch(() => null)),
    );

    throw new ApiError(
      data?.error.message ?? `The request failed (${response.status}). Please try again.`,
      data?.error.code,
      response.status,
      data?.error,
    );
  }

  return response;
}

export async function api<A, I>(path: string, schema: Schema.Codec<A, I>, body?: ApiRequestBody): Promise<A> {
  const response = await request(path, body);
  const decoded = Schema.decodeUnknownOption(schema)(await response.json().catch(() => null));

  if (Option.isNone(decoded)) {
    throw new ApiError(
      'The server returned an unreadable response. Please try again.',
      undefined,
      response.status,
    );
  }

  return decoded.value;
}

export async function mutate(path: string, body: ApiRequestBody): Promise<void> {
  await request(path, body);
}
