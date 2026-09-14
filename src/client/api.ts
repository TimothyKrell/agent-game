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

export type ApiRequestOptions = { signal?: AbortSignal };

async function decode<A, I>(response: Response, schema: Schema.Codec<A, I>, signal?: AbortSignal) {
  const value: unknown = await response.json().catch((cause) => {
    signal?.throwIfAborted();

    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;

    return null;
  });

  signal?.throwIfAborted();

  return Schema.decodeUnknownOption(schema)(value);
}

async function request(
  path: string,
  body?: ApiRequestBody,
  method?: string,
  { signal }: ApiRequestOptions = {},
): Promise<Response> {
  signal?.throwIfAborted();
  const headers = new Headers({ 'X-Agent-Game-Protocols': '1,2' });

  if (body !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  signal?.throwIfAborted();

  if (!response.ok) {
    const data = Option.getOrNull(await decode(response, ErrorResponseSchema, signal));

    throw new ApiError(
      data?.error.message ?? `The request failed (${response.status}). Please try again.`,
      data?.error.code,
      response.status,
      data?.error,
    );
  }

  return response;
}

export async function api<A, I>(
  path: string,
  schema: Schema.Codec<A, I>,
  body?: ApiRequestBody,
  options: ApiRequestOptions = {},
): Promise<A> {
  const response = await request(path, body, undefined, options);
  const decoded = await decode(response, schema, options.signal);

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
