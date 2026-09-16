import { createAuthClient } from 'better-auth/react';
import type { Schema } from 'effect';
import type { ApiRequestBody } from '../shared/api';
import type { ActionRequest3 } from '../shared/coding-finale';
import { decodeApiResponse, requireApiResponse } from './api-response';

export { ApiError } from './api-response';

export const auth = createAuthClient();

export type ApiRequestOptions = { signal?: AbortSignal };

async function request(
  path: string,
  body?: ApiRequestBody | ActionRequest3,
  method?: string,
  { signal }: ApiRequestOptions = {},
): Promise<Response> {
  signal?.throwIfAborted();
  const headers = new Headers({ 'X-Agent-Game-Protocols': '1,2,3' });

  if (body !== undefined) headers.set('content-type', 'application/json');

  return fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

export async function api<A, I>(
  path: string,
  schema: Schema.Codec<A, I>,
  body?: ApiRequestBody | ActionRequest3,
  options: ApiRequestOptions = {},
): Promise<A> {
  const response = await request(path, body, undefined, options);

  return decodeApiResponse(response, schema, options);
}

export async function mutate(path: string, body: ApiRequestBody): Promise<void> {
  await requireApiResponse(await request(path, body));
}
