import { createAuthClient } from 'better-auth/react';
import { Option, Schema } from 'effect';
import { ErrorResponseSchema, type ApiRequestBody } from '../shared/api';

export const auth = createAuthClient();

async function request(path: string, body?: ApiRequestBody, method?: string): Promise<Response> {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const data = Option.getOrNull(Schema.decodeUnknownOption(ErrorResponseSchema)(await response.json()));
    throw new Error(data?.error.message ?? 'The request could not be completed.');
  }

  return response;
}

export async function api<A, I>(path: string, schema: Schema.Codec<A, I>, body?: ApiRequestBody): Promise<A> {
  const response = await request(path, body);

  return Schema.decodeUnknownSync(schema)(await response.json());
}

export async function mutate(path: string, body: ApiRequestBody): Promise<void> {
  await request(path, body);
}
