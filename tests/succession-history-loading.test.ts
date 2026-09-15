import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { HistoryReset, matchReadScope, replaySliceOptions } from '../src/client/succession-replay-data';
import { storyWindowOptions } from '../src/client/succession-story-data';
import { readAuthorizedHistory } from '../src/client/succession-history-data';
import { ApiError } from '../src/client/api';
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

function baseline(through: number) {
  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: fixture.terminal.matchId,
    visibilityEpoch: 'archive',
    through,
    baseline: fixture.frame(through),
  };
}

it.each(['history', 'checkpoint'])(
  'rejects a wrong-match %s reset without retiring the story reader scope',
  async (endpoint) => {
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(input, 'http://fixture');

      if (url.pathname.endsWith(`/${endpoint}`))
        return Response.json({ ...fixture.reset(), matchId: 'another-match' });
      const through = Number(url.searchParams.get('through'));

      return Response.json(
        url.pathname.endsWith('/checkpoint')
          ? baseline(through)
          : fixture.page(Number(url.searchParams.get('after')), through),
      );
    });

    const pending = client.fetchQuery(storyWindowOptions(matchReadScope(fixture.terminal), 8, 40));
    await expect(pending).rejects.toBeInstanceOf(Error);
    await expect(pending).rejects.not.toBeInstanceOf(HistoryReset);
  },
);

it.each(['story', 'replay'] as const)(
  'walks the %s range through byte-short pages with one frozen through and bounded requests',
  async (reader) => {
    const walks: { after: number; through: number }[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(input, 'http://fixture');
      const through = Number(url.searchParams.get('through'));

      if (url.pathname.endsWith('/checkpoint')) return Response.json(baseline(through));

      if (url.pathname.endsWith('/replay')) return Response.json(fixture.frame(through));
      expect(url.searchParams.get('limit')).toBe('32');
      expect(url.searchParams.get('maxBytes')).toBe('16384');
      const after = Number(url.searchParams.get('after'));
      walks.push({ after, through });
      const page = fixture.page(after, through, 'archive', 3);
      page.streamHead = 512 + walks.length;

      return Response.json(page);
    });
    const scope = matchReadScope(fixture.terminal);

    const result =
      reader === 'story'
        ? await client.fetchQuery(storyWindowOptions(scope, 40, 168))
        : await client.fetchQuery(replaySliceOptions(scope, 168));

    const after = reader === 'story' ? 40 : 136;
    expect(result.events.map((event) => event.id)).toEqual(
      Array.from({ length: 168 - after }, (_, index) => after + index + 1),
    );
    expect(walks.every((walk, index) => walk.after === after + index * 3 && walk.through === 168)).toBe(true);
  },
);

it.each(['gap', 'overlap', 'no-progress', 'epoch', 'bytes', 'event-limit', 'wrong-match-reset'] as const)(
  'rejects an incomplete or uncorrelated shared range: %s',
  async (corruption) => {
    vi.stubGlobal('fetch', async () => {
      const page = fixture.page(0, 64, 'archive', corruption === 'event-limit' ? 33 : 32);

      if (corruption === 'gap') page.events.shift();

      if (corruption === 'overlap') page.after = 1;

      if (corruption === 'no-progress') {
        page.events = [];
        page.cursor = 0;
      }

      if (corruption === 'epoch') page.visibilityEpoch = 'wrong-epoch';

      if (corruption === 'bytes')
        page.events.forEach((event) => {
          event.text = 'x'.repeat(600);
        });

      return Response.json(
        corruption === 'wrong-match-reset' ? { ...fixture.reset(), matchId: 'other' } : page,
      );
    });

    const pending = readAuthorizedHistory(
      matchReadScope(fixture.terminal),
      { after: 0, through: 64 },
      new AbortController().signal,
      128,
    );

    await expect(pending).rejects.toBeInstanceOf(Error);
    await expect(pending).rejects.not.toBeInstanceOf(HistoryReset);
  },
);

it('keeps transport TypeError and structured ApiError intact and stops an aborted range before another page', async () => {
  const scope = matchReadScope(fixture.terminal);
  const abort = new AbortController();
  const failure = new TypeError('Offline transport');
  vi.stubGlobal('fetch', async () => {
    throw failure;
  });
  await expect(readAuthorizedHistory(scope, { after: 0, through: 32 }, abort.signal, 32)).rejects.toBe(
    failure,
  );
  vi.stubGlobal('fetch', async () =>
    Response.json({ error: { code: 'not-your-match', message: 'No longer authorized' } }, { status: 403 }),
  );
  const denied = readAuthorizedHistory(scope, { after: 0, through: 32 }, abort.signal, 32);
  await expect(denied).rejects.toBeInstanceOf(ApiError);
  await expect(denied).rejects.toMatchObject({ status: 403, code: 'not-your-match' });

  const fetch = vi.fn(async () => {
    abort.abort();

    return Response.json(fixture.page(0, 32, 'archive', 1));
  });

  vi.stubGlobal('fetch', fetch);
  await expect(
    readAuthorizedHistory(scope, { after: 0, through: 32 }, abort.signal, 32),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects invalid or unbounded selections before I/O and returns an empty exact range without walking', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const scope = matchReadScope(fixture.terminal);
  const signal = new AbortController().signal;

  for (const [after, through, bound] of [
    [0, 129, 128],
    [0, 1, 257],
    [0.5, 1, 32],
    [-1, 0, 32],
    [2, 1, 32],
  ])
    await expect(readAuthorizedHistory(scope, { after, through }, signal, bound)).rejects.toThrow('Invalid');
  await expect(readAuthorizedHistory(scope, { after: 10, through: 10 }, signal, 32)).resolves.toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
