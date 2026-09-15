import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Schema } from 'effect';
import { changePicture } from '../src/client/agent-picture-api';
import { ApiError } from '../src/client/api';

const imageBytes = Uint8Array.of(137, 80, 78, 71, 0, 255);

const file = new File([imageBytes], 'owner.png', { type: 'image/png' });

const committed = {
  state: 'present',
  revision: 8,
  version: 'uploaded-version',
  url: '/api/agents/upload/picture/uploaded-version',
  contentType: 'image/png',
  width: 1,
  height: 1,
  bytes: imageBytes.length,
};

const problem = { code: 'picture-conflict', message: 'Refresh before retrying.', status: 409 };

const responses = new Map([
  ['unauthorized', { status: 401, content: '<h1>Sign in</h1>' }],
  ['forbidden', { status: 403, content: '<h1>Forbidden</h1>' }],
  ['unavailable', { status: 503, content: '<h1>Unavailable</h1>' }],
  ['malformed', { status: 200, content: '{' }],
  ['shape', { status: 200, content: '{"unexpected":1}' }],
  ['structured', { status: 409, content: JSON.stringify({ error: problem }) }],
  ['upload', { status: 200, content: JSON.stringify(committed) }],
  ['remove', { status: 200, content: '{"state":"missing","revision":8}' }],
]);

const received: {
  method: string | undefined;
  path: string;
  contentType: string | undefined;
  revision: string | string[] | undefined;
  requestId: string | string[] | undefined;
  bytes: Buffer;
}[] = [];

const server = createServer(async (request, response) => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) chunks.push(chunk);
  const path = request.url ?? '';
  const agentId = path.split('/')[4];
  received.push({
    method: request.method,
    path,
    contentType: request.headers['content-type'],
    revision: request.headers['if-match'],
    requestId: request.headers['idempotency-key'],
    bytes: Buffer.concat(chunks),
  });
  const result = responses.get(agentId);

  if (!result) {
    response.writeHead(404);
    response.end('Missing fixture');

    return;
  }

  response.writeHead(result.status);
  response.end(result.content);
});

let origin = '';

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  origin = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  const nativeFetch = globalThis.fetch;
  // The browser client uses same-origin paths. Only resolve that origin for this native HTTP test;
  // request construction and response parsing still run through the real client and fetch.
  vi.spyOn(globalThis, 'fetch').mockImplementation((path, options) =>
    nativeFetch(new URL(String(path), origin), options),
  );
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
});

for (const [agentId, status] of [
  ['unauthorized', 401],
  ['forbidden', 403],
  ['unavailable', 503],
] as const) {
  it(`preserves the HTTP ${status} and canonical fallback for a non-JSON picture response`, async () => {
    await expect(changePicture(agentId, { requestId: 'picture-test', revision: 7, file })).rejects.toEqual(
      new ApiError(`The request failed (${status}). Please try again.`, undefined, status),
    );
  });
}

for (const agentId of ['malformed', 'shape']) {
  it(`reports the ${agentId} successful body as an unreadable picture with the actual HTTP status`, async () => {
    await expect(changePicture(agentId, { requestId: 'picture-test', revision: 7, file })).rejects.toEqual(
      new ApiError('The server returned an unreadable picture response.', undefined, 200),
    );
  });
}

it('preserves the structured picture fault code, message and details', async () => {
  await expect(changePicture('structured', { requestId: 'picture-test', revision: 7, file })).rejects.toEqual(
    new ApiError(problem.message, problem.code, 409, problem),
  );
});

it('keeps binary upload construction and decodes the confirmed picture receipt', async () => {
  await expect(changePicture('upload', { requestId: 'picture-test', revision: 7, file })).resolves.toEqual(
    committed,
  );
  expect(received.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/owner/agents/upload/picture',
    contentType: 'image/png',
    revision: '"7"',
    requestId: 'picture-test',
    bytes: Buffer.from(imageBytes),
  });
});

it('keeps removal bodyless and decodes its missing-picture receipt', async () => {
  await expect(
    changePicture('remove', { requestId: 'picture-test', revision: 7, file: null }),
  ).resolves.toEqual({ state: 'missing', revision: 8 });
  expect(received.at(-1)).toEqual({
    method: 'DELETE',
    path: '/api/owner/agents/remove/picture',
    contentType: undefined,
    revision: '"7"',
    requestId: 'picture-test',
    bytes: Buffer.alloc(0),
  });
});
