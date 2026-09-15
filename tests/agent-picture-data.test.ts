import { createServer } from 'node:http';
import { once } from 'node:events';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { Schema } from 'effect';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { agentPictureOptions, mergeAgentPictures, readAgentPictures } from '../src/client/agent-picture-data';
import { ApiError } from '../src/client/api';
import { AgentProfileSchema } from '../src/shared/api';
import { missingAgentPicture, type AgentPicture } from '../src/shared/agent-picture';

function present(id: string, revision: number): AgentPicture {
  return {
    state: 'present',
    revision,
    version: `v${revision}`,
    url: `/api/agents/${id}/picture/v${revision}`,
    contentType: 'image/png',
    width: 32,
    height: 32,
    bytes: 200,
  };
}

const received: URL[] = [];

let origin = '';

let current = new Map<string, AgentPicture>();

let fault: { status: number; body: string } | null = null;

const client = new QueryClient();

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '', origin);
  received.push(url);
  response.writeHead(fault?.status ?? 200, { 'content-type': 'application/json' });
  response.end(
    fault?.body ??
      JSON.stringify(
        url.searchParams
          .getAll('agentId')
          .reverse()
          .map((agentId) => ({
            agentId,
            picture: current.get(agentId) ?? missingAgentPicture,
          })),
      ),
  );
});

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  origin = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  received.length = 0;
  current = new Map();
  fault = null;
  const nativeFetch = globalThis.fetch;
  // Resolve the browser-relative origin only. Real fetch, HTTP bodies and the shared decoder execute.
  vi.spyOn(globalThis, 'fetch').mockImplementation((path, options) =>
    nativeFetch(new URL(String(path), origin), options),
  );
});

afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
});

it('deduplicates one ten-entrant roster and matches returned metadata by ID, not response position', async () => {
  const ids = Array.from({ length: 10 }, (_, index) => `entrant-${index}`);
  current.set(ids[0], present(ids[0], 3));
  current.set(ids[1], { state: 'missing', revision: 4 });
  const pictures = await readAgentPictures([...ids, ids[0], ids[1], '']);
  expect(received).toHaveLength(1);
  expect(received[0].pathname).toBe('/api/agent-pictures');
  expect(received[0].searchParams.getAll('agentId')).toEqual(ids);
  expect(pictures.size).toBe(10);
  expect(pictures.get(ids[0])).toEqual(present(ids[0], 3));
  expect(pictures.get(ids[1])).toEqual({ state: 'missing', revision: 4 });
  expect(pictures.get(ids[2])).toEqual(missingAgentPicture);
});

it('encodes stable IDs and splits a larger public roster at the 50-ID API limit', async () => {
  const ids = [...Array.from({ length: 50 }, (_, index) => `agent-${index}`), 'agent/& ?#'];
  const pictures = await readAgentPictures(ids);
  expect(received.map((url) => url.searchParams.getAll('agentId').length)).toEqual([50, 1]);
  expect([...pictures.keys()].sort()).toEqual(ids.sort());
  expect(received.every((url) => url.pathname === '/api/agent-pictures' && !url.hash)).toBe(true);
});

it('does not fetch an empty roster', async () => {
  expect((await readAgentPictures([])).size).toBe(0);
  expect(received).toHaveLength(0);
});

it('shares one in-flight read for reordered/repeated IDs and keeps controller/name changes out of cache keys', async () => {
  current.set('original', present('original', 3));

  const [seats, mentions, result] = await Promise.all([
    client.fetchQuery(agentPictureOptions(['original', 'other'])),
    client.fetchQuery(agentPictureOptions(['other', 'original', 'original'])),
    client.fetchQuery(agentPictureOptions(['original', 'other'])),
  ]);

  expect(received).toHaveLength(1);
  expect(seats).toBe(mentions);
  expect(result).toBe(seats);
  expect(result.get('original')).toEqual(present('original', 3));
  expect(result.has('replacement-controller')).toBe(false);
  expect(client.getQueryCache().getAll()).toHaveLength(1);
});

it('merges current revisions without reviving a removed picture or leaking another roster', async () => {
  const pictures = mergeAgentPictures(
    [
      { id: 'removed', picture: present('removed', 1) },
      { id: 'updated', picture: present('updated', 5) },
      { id: 'legacy' },
      { id: 'updated', picture: present('updated', 2) },
    ],
    new Map([
      ['removed', { state: 'missing', revision: 2 }],
      ['updated', present('updated', 3)],
      ['unrelated', present('unrelated', 10)],
    ]),
  );

  expect([...pictures]).toEqual([
    ['removed', { state: 'missing', revision: 2 }],
    ['updated', present('updated', 5)],
    ['legacy', missingAgentPicture],
  ]);
});

it('accepts a retired legacy profile without picture metadata and supplies a missing fallback', () => {
  const agent = Schema.decodeUnknownSync(AgentProfileSchema)({
    id: 'retired',
    name: 'Original name',
    ownerId: 'owner',
    ownerHandle: 'owner',
    description: '',
    house: false,
    retired: true,
    rating: 1000,
    games: 1,
    wins: 0,
    losses: 1,
    forfeits: 1,
    placements: 1,
    provisional: true,
    rank: null,
    roles: {},
    createdAt: 0,
  });

  expect(mergeAgentPictures([agent]).get(agent.id)).toEqual(missingAgentPicture);
});

for (const body of ['{', '[{"agentId":"agent","picture":{"state":"present"}}]']) {
  it(`rejects an unreadable successful metadata response: ${body}`, async () => {
    fault = { status: 200, body };
    await expect(readAgentPictures(['agent'])).rejects.toEqual(
      new ApiError('The server returned an unreadable response. Please try again.', undefined, 200),
    );
  });
}

for (const ids of [[], ['other'], ['agent', 'agent']]) {
  it(`rejects uncorrelated metadata IDs: ${JSON.stringify(ids)}`, async () => {
    fault = {
      status: 200,
      body: JSON.stringify(ids.map((agentId) => ({ agentId, picture: missingAgentPicture }))),
    };
    await expect(readAgentPictures(['agent'])).rejects.toEqual(
      new ApiError('The server returned picture metadata for a different roster.', undefined, 200),
    );
  });
}

it('preserves canonical non-JSON HTTP faults and performs no automatic retry', async () => {
  fault = { status: 503, body: 'Unavailable' };
  await expect(client.fetchQuery(agentPictureOptions(['agent']))).rejects.toEqual(
    new ApiError('The request failed (503). Please try again.', undefined, 503),
  );
  expect(received).toHaveLength(1);
});

it('retires the unmounted query and aborts its pending body without caching late metadata', async () => {
  let signal: AbortSignal | null | undefined;
  let finish: (() => void) | undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      finish = () => controller.close();
    },
  });

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_path, options) => {
    signal = options?.signal;

    return new Response(body);
  });
  const observer = new QueryObserver(client, agentPictureOptions(['retired-scope']));
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(signal).toBeDefined());
  unsubscribe();
  expect(signal?.aborted).toBe(true);
  finish?.();
  await vi.waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
});

it('preserves explicit cancellation before the first batch request', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(readAgentPictures(['agent'], controller.signal)).rejects.toBe(controller.signal.reason);
  expect(received).toHaveLength(0);
});
