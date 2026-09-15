import { Option, Schema } from 'effect';
import { ErrorResponseSchema } from '../shared/api';

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

interface ApiResponseOptions {
  signal?: AbortSignal;
  unreadableMessage?: string;
}

async function decode<A, I>(response: Response, schema: Schema.Codec<A, I>, signal?: AbortSignal) {
  const value: unknown = await response.json().catch((cause) => {
    signal?.throwIfAborted();

    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;

    return null;
  });

  signal?.throwIfAborted();

  return Schema.decodeUnknownOption(schema)(value);
}

/** A failed HTTP response retains its status even when its body is absent or unreadable. */
export async function requireApiResponse(response: Response, signal?: AbortSignal): Promise<void> {
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
}

export async function decodeApiResponse<A, I>(
  response: Response,
  schema: Schema.Codec<A, I>,
  {
    signal,
    unreadableMessage = 'The server returned an unreadable response. Please try again.',
  }: ApiResponseOptions = {},
): Promise<A> {
  await requireApiResponse(response, signal);
  const decoded = await decode(response, schema, signal);

  if (Option.isNone(decoded)) throw new ApiError(unreadableMessage, undefined, response.status);

  return decoded.value;
}
