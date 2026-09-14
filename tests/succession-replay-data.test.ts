import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  HistoryReset,
  historyAnchorOptions,
  matchReadScope,
  replaySliceOptions,
  roundIndexOptions,
} from '../src/client/succession-replay-data';
import { successionClientFixture } from './fixtures/succession-client';

let fixture: Awaited<ReturnType<typeof successionClientFixture>>;

const client = new QueryClient();

beforeAll(async () => {
  fixture = await successionClientFixture();
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

it('correlates one frozen window across byte-short pages using delivered cursors', async () => {
  const paths: URL[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input, 'http://fixture');
    paths.push(url);
    const through = Number(url.searchParams.get('through'));

    return Response.json(
      url.pathname.endsWith('/replay')
        ? fixture.frame(through)
        : fixture.page(Number(url.searchParams.get('after')), through, 'archive', 3),
    );
  });
  const result = await client.fetchQuery(replaySliceOptions(matchReadScope(fixture.terminal), 80));
  expect(result.frame.through).toBe(80);
  expect(result.events.map((event) => event.id)).toEqual(
    Array.from({ length: 32 }, (_, index) => index + 49),
  );
  const pages = paths.filter((url) => url.pathname.endsWith('/history'));
  expect(pages.map((url) => Number(url.searchParams.get('after')))).toEqual([
    48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78,
  ]);
  expect(
    pages.every(
      (url) =>
        url.searchParams.get('through') === '80' &&
        url.searchParams.get('limit') === '32' &&
        url.searchParams.get('maxBytes') === '16384',
    ),
  ).toBe(true);
});

it('cancels a sibling body when history resets and carries only the requested scope', async () => {
  let sibling: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', async (input: string, options?: RequestInit) => {
    if (input.includes('/replay?')) {
      sibling = options?.signal;

      return new Promise<Response>((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason)),
      );
    }

    return Response.json(fixture.reset());
  });
  const scope = matchReadScope(fixture.terminal);
  await expect(client.fetchQuery(replaySliceOptions(scope, 40))).rejects.toEqual(new HistoryReset(scope));
  expect(sibling?.aborted).toBe(true);
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => query.state.data === undefined),
  ).toBe(true);
});

for (const corruption of ['cursor', 'epoch', 'controller', 'bytes', 'gap', 'match']) {
  it(`rejects a decodable but uncorrelated ${corruption} response`, async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      if (input.includes('/replay?')) {
        const frame = fixture.frame(
          corruption === 'cursor' ? 41 : 40,
          corruption === 'epoch' ? 'other' : 'archive',
        );

        if (corruption === 'controller') frame.you = fixture.controller.you;

        return Response.json(frame);
      }

      const page = fixture.page(corruption === 'gap' ? 9 : 8, 40);

      if (corruption === 'match') page.matchId = 'other';

      if (corruption === 'bytes') for (const event of page.events) event.text = 'x'.repeat(600);

      return Response.json(page);
    });
    await expect(
      client.fetchQuery(replaySliceOptions(matchReadScope(fixture.terminal), 40)),
    ).rejects.toThrow();
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => query.state.data === undefined),
    ).toBe(true);
  });
}

it('correlates round and anchor reads and segregates actual controller/generation keys', async () => {
  vi.stubGlobal('fetch', async (input: string) =>
    Response.json(
      input.includes('/rounds?')
        ? {
            protocolVersion: '2',
            gameId: 'succession',
            matchId: 'other',
            visibilityEpoch: 'archive',
            rounds: [],
          }
        : {
            protocolVersion: '2',
            gameId: 'succession',
            matchId: 'query-fixture',
            visibilityEpoch: 'archive',
            cursor: 17,
          },
    ),
  );
  const scope = matchReadScope(fixture.terminal);
  await expect(client.fetchQuery(roundIndexOptions(scope))).rejects.toThrow('changed');
  await expect(client.fetchQuery(historyAnchorOptions(scope, 'opaque-key'))).resolves.toMatchObject({
    cursor: 17,
  });
  const controlled = matchReadScope({ ...fixture.terminal, you: fixture.controller.you });
  expect(replaySliceOptions(controlled, 1).queryKey).not.toEqual(replaySliceOptions(scope, 1).queryKey);

  const replaced = matchReadScope({
    ...fixture.terminal,
    seats: fixture.terminal.seats.map((seat) => ({ ...seat, generation: seat.generation + 1 })),
  });

  expect(replaySliceOptions(replaced, 1).queryKey).not.toEqual(replaySliceOptions(scope, 1).queryKey);
});
