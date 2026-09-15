import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ContinuousSuccessionHistory } from '../src/client/continuous-succession-history';
import { storyWindowOptions } from '../src/client/succession-story-data';
import { matchReadScope } from '../src/client/succession-replay-data';
import { buildSuccessionStory } from '../src/client/succession-story';
import { continuousStoryFixture } from './fixtures/continuous-story';
import { projected, storyAct2 } from './fixtures/succession-story';
import { observeSuccession } from '../src/game/succession/observation';

let fixture: Awaited<ReturnType<typeof continuousStoryFixture>>;

const readers: ContinuousSuccessionHistory[] = [];

beforeAll(async () => {
  fixture = await continuousStoryFixture(500);
});

afterEach(() => {
  readers.splice(0).forEach((reader) => reader.dispose());
  vi.unstubAllGlobals();
});

function transport() {
  const pending: (() => void)[] = [];
  const walks: { after: number; through: number }[] = [];

  const state = {
    head: 400,
    reset: false,
    unavailable: false,
    denied: false,
    malformed: false,
    hold: false,
    pending,
    walks,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      const url = new URL(path, 'http://fixture');
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const epoch = url.searchParams.get('epoch')!;
      const matchId = url.pathname.split('/')[3];

      if (state.denied)
        return Response.json(
          { error: { code: 'not-your-match', message: 'Revoked at source.' } },
          { status: 403 },
        );

      if (url.pathname.endsWith('/checkpoint')) {
        const result = fixture.checkpoint(through, matchId, epoch);

        return Response.json({ ...result, baseline: state.unavailable ? null : result.baseline });
      }

      state.walks.push({ after, through });

      if (state.hold) await new Promise<void>((resolve) => state.pending.push(resolve));
      // Deliberately allow a body to arrive after abort; api and reader tickets must fence it.
      const events = fixture.events.slice(after, Math.min(after + 32, through));

      if (state.malformed) events.shift();
      const cursor = events.at(-1)?.id ?? after;

      if (state.reset)
        return Response.json({
          protocolVersion: '2',
          gameId: 'succession',
          matchId,
          visibilityEpoch: 'replacement-epoch',
          streamHead: state.head,
          after: 0,
          through: state.head,
          cursor: 0,
          events: [],
          hasMore: state.head > 0,
          reset: true,
        });

      return Response.json({
        protocolVersion: '2',
        gameId: 'succession',
        matchId,
        visibilityEpoch: epoch,
        streamHead: state.head,
        after,
        through,
        cursor,
        events,
        hasMore: cursor < through,
        reset: state.reset,
        abortedByFixture: init.signal?.aborted,
      });
    }),
  );

  return state;
}

function reader(head: number, following = false) {
  const client = new QueryClient();
  const reset = vi.fn();

  const result = new ContinuousSuccessionHistory(
    client,
    fixture.current(head),
    { initial: following ? 'latest' : 'start' },
    reset,
  );

  readers.push(result);
  result.observe(fixture.current(head));
  result.setEnabled(true);

  return { reader: result, client, reset };
}

async function ready(reader: ContinuousSuccessionHistory) {
  await vi.waitFor(() => expect(reader.getSnapshot().status).toBe('ready'));
}

it('uses exact pre-window engine checkpoints across a long chat gap and Tax resource changes', async () => {
  const state = transport();
  state.head = fixture.events.length;
  const client = new QueryClient();
  const resolution = fixture.events.find((event) => event.type === 'coins')!;
  const after = resolution.id - 2;

  const window = await client.fetchQuery(
    storyWindowOptions(matchReadScope(fixture.current()), after, after + 128),
  );

  const model = buildSuccessionStory(window);
  const expected = fixture.checkpoint(after + 128).baseline;
  expect(model.rows).toHaveLength(128);
  expect(model.end.map((seat) => (seat.coins.status === 'unavailable' ? null : seat.coins.value))).toEqual(
    expected.seats.map((seat) => seat.coins),
  );
  expect(window.baseline && 'history' in window.baseline && window.baseline.history.streamHead).toBe(after);
  expect(state.walks).toHaveLength(4);
  expect(state.walks.every((walk) => walk.through === after + 128)).toBe(true);
  client.clear();
});

it('does not turn observed head growth into delivery and completes the frozen window before following a newer head', async () => {
  const state = transport();
  state.hold = true;
  const { reader: reading, client } = reader(300, true);
  await vi.waitFor(() => expect(state.pending.length).toBe(1));
  expect(client.getQueryCache().getAll()).toHaveLength(1);
  state.head = 500;
  reading.observe(fixture.current(500));
  expect(reading.getSnapshot().delivered).toBe(0);
  expect(state.walks[0].through).toBe(300);
  state.hold = false;
  state.pending.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(reading.getSnapshot().delivered).toBe(500));
  expect(state.walks.slice(0, 4).every((walk) => walk.through === 300)).toBe(true);
  expect(reading.getSnapshot().rows).toHaveLength(128);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it('preserves zero-event and unavailable baselines honestly, then follows new records without freezing at zero', async () => {
  const state = transport();
  state.head = 0;
  state.unavailable = true;
  const { reader: reading } = reader(0, true);
  await ready(reading);
  expect(state.walks).toHaveLength(0);
  expect(reading.getSnapshot().rows).toHaveLength(0);
  expect(reading.getSnapshot().model.issues).toContainEqual({
    kind: 'missing-baseline',
    after: 0,
    through: 0,
  });
  state.head = 10;
  reading.observe(fixture.current(10));
  await vi.waitFor(() => expect(reading.getSnapshot().delivered).toBe(10));
  expect(reading.getSnapshot().model.end.every((seat) => seat.coins.status === 'unavailable')).toBe(true);
});

it.each(['reset', 'denied'] as const)(
  'retires previously delivered rows after a source %s and asks the authoritative owner to refresh',
  async (failure) => {
    const state = transport();
    const { reader: reading, reset } = reader(400);
    await ready(reading);
    state[failure] = true;
    await reading.loadLater();
    expect(reading.getSnapshot().status).toBe('reset');
    expect(reading.getSnapshot().rows).toHaveLength(0);
    expect(reset).toHaveBeenCalledTimes(1);
    reading.setEnabled(false);
    reading.setEnabled(true);
    expect(reading.getSnapshot().status).toBe('reset');
    await reading.retry();
    expect(reset).toHaveBeenCalledTimes(2);
    state[failure] = false;
    reading.observe(fixture.current(400));
    await ready(reading);
    expect(reading.getSnapshot().rows).toHaveLength(128);
  },
);

it('rejects a skipped source cursor without discarding delivered history and retries the same bounded operation', async () => {
  const state = transport();
  const { reader: reading } = reader(400);
  await ready(reading);
  state.malformed = true;
  await reading.loadLater();
  expect(reading.getSnapshot()).toMatchObject({ status: 'error', after: 0, delivered: 128 });
  state.malformed = false;
  await reading.retry();
  expect(reading.getSnapshot()).toMatchObject({ status: 'ready', after: 64, delivered: 192 });
});

it('cancels hidden/unmounted reads without accepting their late bodies or cancelling another reader', async () => {
  const state = transport();
  state.hold = true;
  const first = reader(300);
  const second = reader(400);
  await vi.waitFor(() => expect(state.pending.length).toBe(2));
  first.reader.setEnabled(false);
  state.hold = false;
  state.pending.splice(0).forEach((resolve) => resolve());
  await ready(second.reader);
  expect(first.reader.getSnapshot().delivered).toBe(0);
  expect(first.client.getQueryCache().getAll()).toHaveLength(0);
  first.reader.setEnabled(true);
  await ready(first.reader);
  expect(first.reader.getSnapshot().delivered).toBe(128);
});

it('keeps a newly visible opposite-edge anchor when an older scroll request completes late', async () => {
  const state = transport();
  const { reader: reading, client } = reader(400);
  await ready(reading);
  reading.rememberAnchor({ eventKey: fixture.events[127].eventKey, cursor: 128, offset: 0 });
  state.hold = true;
  const pending = reading.loadLater();
  await vi.waitFor(() => expect(state.pending.length).toBe(1));
  reading.rememberAnchor({ eventKey: fixture.events[0].eventKey, cursor: 1, offset: 0 });
  state.hold = false;
  state.pending.splice(0).forEach((resolve) => resolve());
  await pending;
  expect(reading.getSnapshot()).toMatchObject({ status: 'ready', after: 0, delivered: 128 });
  expect(reading.getSnapshot().rows[0].source.eventKey).toBe(fixture.events[0].eventKey);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it('uses canonical return landmarks for independent act windows and freezes the completed first act on live head growth', async () => {
  const { initial, transition } = await storyAct2(8);
  const events = projected([transition], 'public');
  const start = events.find((event) => event.type === 'act-started')!;
  const scope = { visibilityEpoch: 'return-public', streamHead: events.length };
  const current = observeSuccession(transition.state, null, scope);
  const queries: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      queries.push(path);
      const url = new URL(path, 'http://fixture');

      const common = {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: initial.id,
        visibilityEpoch: scope.visibilityEpoch,
      };

      if (url.pathname.endsWith('/rounds'))
        return Response.json({
          ...common,
          rounds: [events[0], start].map((event) => ({
            key: `${event.act}:${event.round}`,
            act: event.act,
            round: event.round,
            through: event.id,
            eventKey: event.eventKey,
          })),
        });
      const through = Number(url.searchParams.get('through'));

      if (url.pathname.endsWith('/checkpoint')) {
        const source = events[through - 1];

        const saved =
          transition.replayFrames.find((frame) => frame.eventKey === source?.eventKey)?.state ?? initial;

        const baseline = observeSuccession(saved, null, { ...scope, streamHead: through });
        baseline.decision = null;
        baseline.chat = { ...baseline.chat, open: false, nextSpeakAt: null };

        return Response.json({ ...common, through, baseline });
      }

      const after = Number(url.searchParams.get('after'));

      return Response.json({
        ...common,
        streamHead: events.length,
        after,
        through,
        cursor: through,
        events: events.slice(after, through),
        hasMore: false,
        reset: false,
      });
    }),
  );
  const client = new QueryClient();
  const first = new ContinuousSuccessionHistory(client, current, { act: 1 });
  const second = new ContinuousSuccessionHistory(client, current, { act: 2 });
  readers.push(first, second);
  first.setEnabled(true);
  second.setEnabled(true);
  await ready(first);
  await ready(second);
  expect(first.getSnapshot().rows.every((row) => row.position.act === 1)).toBe(true);
  expect(first.getSnapshot().delivered).toBe(start.id - 1);
  expect(second.getSnapshot().rows[0].fact.kind).toBe('act-started');
  expect(
    second.getSnapshot().model.end.every((seat) => seat.alive.status !== 'unavailable' && seat.alive.value),
  ).toBe(true);
  const requests = queries.length;
  first.observe({ ...current, history: { ...scope, streamHead: events.length + 100 } });
  await first.loadLater();
  expect(queries).toHaveLength(requests);
  expect(first.getSnapshot().head).toBe(start.id - 1);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
