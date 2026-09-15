import { createServer } from 'node:http';
import { once } from 'node:events';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { Schema } from 'effect';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { activeAgentPictures } from '../src/client/active-agent-pictures';
import { agentPictureOptions } from '../src/client/agent-picture-data';
import { refreshAgentPictures } from '../src/client/refresh-agent-pictures';
import type { AgentPicture } from '../src/shared/agent-picture';

const present: AgentPicture = {
  state: 'present',
  revision: 3,
  version: 'v3',
  url: '/api/agents/a/picture/v3',
  contentType: 'image/png',
  width: 32,
  height: 32,
  bytes: 200,
};

let origin = '';

let hold = false;

const requests: { aborted: boolean }[] = [];

const client = new QueryClient();

const server = createServer((request, response) => {
  const record = { aborted: false };
  const held = hold;
  requests.push(record);
  response.on('close', () => {
    if (held) record.aborted = true;
  });

  if (held) return;
  const ids = new URL(request.url ?? '', origin).searchParams.getAll('agentId');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(ids.map((agentId) => ({ agentId, picture: present }))));
});

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  origin = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  hold = false;
  requests.length = 0;
  const nativeFetch = globalThis.fetch;
  // Resolve relative browser URLs; actual native fetch and Query cancellation remain intact.
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

it('retains the highest active-ID knowledge through overlapping leases, but releases it at the last reader', () => {
  const known = activeAgentPictures(client);
  const releaseLeft = known.retain(['alpha', 'beta']);
  const releaseRight = known.retain(['alpha', 'gamma']);
  known.publish(new Map([['alpha', { state: 'missing', revision: 9 }]]));
  releaseRight();
  known.publish(
    new Map([
      ['alpha', present],
      ['gamma', present],
    ]),
  );
  expect([...known.getSnapshot()]).toEqual([
    ['alpha', { state: 'missing', revision: 9 }],
    ['beta', { state: 'missing', revision: 0 }],
  ]);
  expect(activeAgentPictures(new QueryClient()).getSnapshot().size).toBe(0);
  releaseLeft();
  known.publish(new Map([['alpha', present]]));
  expect(known.getSnapshot().size).toBe(0);
  const releaseNew = known.retain(['alpha']);
  known.publish(new Map([['alpha', present]]));
  expect(known.getSnapshot().get('alpha')).toEqual(present);
  releaseNew();
  expect(known.getSnapshot().size).toBe(0);
});

it('rejects actual Query cancellation with old source data even while the hook lifetime is still active', async () => {
  const options = agentPictureOptions(['a']);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});

  try {
    await client.fetchQuery(options);
    hold = true;
    const answer = refreshAgentPictures(client, ['a'], new AbortController().signal);
    const rejected = expect(answer).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    await client.cancelQueries({ queryKey: options.queryKey });
    await rejected;
    await vi.waitFor(() => expect(requests[1].aborted).toBe(true));
    // Query's normal cancellation/revert behavior remains intact for observers, never refresh success.
    expect(client.getQueryData(options.queryKey)?.get('a')).toEqual(present);
  } finally {
    unsubscribe();
  }
});

it('resolves explicit refresh with only the originating roster map from a completed new request', async () => {
  const options = agentPictureOptions(['a']);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});

  try {
    await client.fetchQuery(options);
    const pictures = await refreshAgentPictures(client, ['a'], new AbortController().signal);
    expect([...pictures]).toEqual([['a', present]]);
    expect(requests).toHaveLength(2);
  } finally {
    unsubscribe();
  }
});

it('rejects an already retired refresh without issuing a request or creating a query', async () => {
  const lifetime = new AbortController();
  lifetime.abort();
  await expect(refreshAgentPictures(client, ['a'], lifetime.signal)).rejects.toBe(lifetime.signal.reason);
  expect(requests).toHaveLength(0);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
