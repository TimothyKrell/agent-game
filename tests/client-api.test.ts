import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Schema } from 'effect';
import { api, ApiError, mutate } from '../src/client/api';

const responseSchema = Schema.Struct({ ok: Schema.Boolean });

const received: {
  path: string;
  protocol: string | string[] | undefined;
  method: string | undefined;
  body: string;
}[] = [];

const bodyStarted = new Map<string, () => void>();

const responses = new Map([
  ['/malformed', { status: 200, content: '{' }],
  ['/shape', { status: 200, content: '{"unexpected":1}' }],
  ['/error', { status: 502, content: '<h1>Unavailable</h1>' }],
  [
    '/structured',
    { status: 404, content: '{"error":{"code":"pairing-expired","message":"Expired request."}}' },
  ],
]);

const server = createServer(async (request, response) => {
  let body = '';

  for await (const chunk of request) body += chunk;
  const path = request.url ?? '';
  received.push({ path, protocol: request.headers['x-agent-game-protocols'], method: request.method, body });

  if (path === '/headers') {
    bodyStarted.get(path)?.();

    return;
  }

  if (path.startsWith('/body')) {
    response.writeHead(path.endsWith('error') ? 503 : 200, { 'content-type': 'application/json' });
    response.write('{"ok":');
    bodyStarted.get(path)?.();

    return;
  }

  const result = responses.get(path) ?? { status: 200, content: '{"ok":true}' };
  response.writeHead(result.status);
  response.end(result.content);
});

let origin = '';

afterEach(() => vi.restoreAllMocks());

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
});

it('preserves protocol negotiation and the existing three-argument POST contract', async () => {
  await expect(api(`${origin}/post`, responseSchema, { name: 'API owner' })).resolves.toEqual({ ok: true });
  expect(received.at(-1)).toMatchObject({ protocol: '1,2,3', method: 'POST', body: '{"name":"API owner"}' });
});

it('does not send an already aborted request', async () => {
  const signal = AbortSignal.abort();
  await expect(api(`${origin}/never`, responseSchema, undefined, { signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(received.some((request) => request.path === '/never')).toBe(false);
});

for (const path of ['/headers', '/body', '/body-error']) {
  it(`preserves cancellation while waiting at ${path}`, async () => {
    const controller = new AbortController();
    const nativeFetch = globalThis.fetch;
    const responses: Response[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      const response = await nativeFetch(...args);
      responses.push(response);

      return response;
    });
    const started = new Promise<void>((resolve) => bodyStarted.set(path, resolve));
    const pending = api(`${origin}${path}`, responseSchema, undefined, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started;

    if (path.startsWith('/body')) await vi.waitFor(() => expect(responses[0]?.bodyUsed).toBe(true));
    controller.abort();
    await rejected;
  });
}

for (const path of ['/malformed', '/shape']) {
  it(`keeps the unreadable 2xx error for ${path}`, async () => {
    await expect(api(`${origin}${path}`, responseSchema)).rejects.toMatchObject({
      status: 200,
      message: 'The server returned an unreadable response. Please try again.',
    });
  });
}

it('keeps non-JSON and structured HTTP error decoding', async () => {
  await expect(api(`${origin}/error`, responseSchema)).rejects.toMatchObject({
    status: 502,
    message: 'The request failed (502). Please try again.',
  });
  await expect(api(`${origin}/structured`, responseSchema)).rejects.toEqual(
    new ApiError('Expired request.', 'pairing-expired', 404, {
      code: 'pairing-expired',
      message: 'Expired request.',
    }),
  );
});

it('uses the same structured and non-JSON error boundary for ordinary mutations', async () => {
  await expect(mutate(`${origin}/error`, {})).rejects.toEqual(
    new ApiError('The request failed (502). Please try again.', undefined, 502),
  );
  await expect(mutate(`${origin}/structured`, {})).rejects.toEqual(
    new ApiError('Expired request.', 'pairing-expired', 404, {
      code: 'pairing-expired',
      message: 'Expired request.',
    }),
  );
});

it('preserves successful mutations that do not consume a response body', async () => {
  await expect(mutate(`${origin}/malformed`, {})).resolves.toBeUndefined();
});
