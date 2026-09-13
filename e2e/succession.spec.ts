import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Schema } from 'effect';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { replayFrameSuccession } from '../src/game/succession/replay';
import type { SuccessionState, SuccessionEvent } from '../src/game/succession/types';
import { HistoryPage2Schema, Observation2Schema, ReplayFrame2Schema } from '../src/shared/succession';
import type { AuthorizedEvent2, Observation2 } from '../src/shared/succession';

test.use({ video: 'on' });

async function gameFixture() {
  let serial = 0;
  let seed = 7;

  const random = {
    id: () => `ui-id-${serial++}`,
    random: (size: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return Math.floor((seed / 4294967296) * size);
    },
  };

  const initial = await createSuccession(
    'succession-ui',
    Array.from({ length: 10 }, (_, number) => ({
      agentId: `agent-${number}`,
      ownerId: `owner-${number}`,
      name: number === 0 ? 'ThePersistentStrategistWithAnUnabridgedName' : `Contender ${number + 1}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
    { random, salt: new Uint8Array(32).fill(7) },
  );

  let state = initial.state;
  const act1 = state;
  const facts: SuccessionEvent[] = [...initial.appendedEvents];
  const frames = new Map(initial.replayFrames.map((frame) => [frame.eventKey, frame.state]));
  const stages = new Map<string, SuccessionState>();
  const heads = new Map<SuccessionState, { live: number; archive: number }>();
  heads.set(state, {
    live: facts.filter((event) => event.visibility === 'public').length,
    archive: facts.length,
  });
  let act2: SuccessionState | null = null;

  for (let step = 0; state.status === 'active' && step < 6000; step++) {
    stages.set(state.phase.kind, state);

    const decision = state.seats
      .map((seat) => observeSuccession(state, seat.number))
      .find((view) => view.decision);

    const action = decision && previewSuccessionAction(decision, random.random);

    const evolution =
      decision?.you && action
        ? evolveSuccession(
            state,
            {
              type: 'act',
              seat: decision.you.seat,
              generation: decision.you.generation,
              now: state.phase.startedAt + 1,
              request: {
                gameId: 'succession',
                actionId: random.id(),
                phaseId: decision.phase.id,
                decisionId: decision.decision?.id,
                action,
              },
            },
            random,
          )
        : evolveSuccession(
            state,
            { type: 'advance', now: state.phase.deadline ?? state.phase.startedAt + 30_000 },
            random,
          );

    state = evolution.state;
    facts.push(...evolution.appendedEvents);
    heads.set(state, {
      live: facts.filter((event) => event.visibility === 'public').length,
      archive: facts.length,
    });

    for (const frame of evolution.replayFrames) frames.set(frame.eventKey, frame.state);

    if (!act2 && state.stage.act === 2) act2 = state;
  }

  if (!act2 || state.status !== 'finished') throw new Error('Synthetic browser match did not finish.');

  const events = (archive: boolean): AuthorizedEvent2[] => {
    const result: AuthorizedEvent2[] = [];

    for (const { visibility, ...event } of facts) {
      if (archive || visibility === 'public') result.push({ ...event, id: result.length + 1 });
    }

    return result;
  };

  return { act1, act2, terminal: state, events, frames, stages, heads };
}

type Fixture = Awaited<ReturnType<typeof gameFixture>>;

let fixture: Fixture;

test.beforeAll(async () => {
  fixture = await gameFixture();
});

async function routes(page: Page, initial: Observation2) {
  let current = initial;

  let send = (_view: Observation2): void => {
    throw new Error('No connected fixture socket');
  };

  let corrupt: () => void = () => {
    throw new Error('No connected fixture socket');
  };

  const pageRequests: URL[] = [];
  await page.route('**/api/matches/succession-ui', (route) =>
    route.fulfill({ json: Schema.decodeUnknownSync(Observation2Schema)(current) }),
  );
  await page.routeWebSocket('**/api/matches/succession-ui/events?*', (socket) => {
    send = (view) =>
      socket.send(
        JSON.stringify({
          type: 'observation',
          observation: Schema.decodeUnknownSync(Observation2Schema)(view),
        }),
      );
    send(current);
    corrupt = () => socket.send('{');
  });
  await page.route('**/api/matches/succession-ui/history?*', (route) => {
    const url = new URL(route.request().url());
    pageRequests.push(url);
    const epoch = url.searchParams.get('epoch') ?? '';
    const after = Number(url.searchParams.get('after'));
    const through = Number(url.searchParams.get('through'));
    const archive = epoch === 'archive';

    const events = fixture
      .events(archive)
      .filter((event) => event.id > after && event.id <= through)
      .slice(0, 32);

    const cursor = events.at(-1)?.id ?? after;

    return route.fulfill({
      json: Schema.decodeUnknownSync(HistoryPage2Schema)({
        protocolVersion: '2',
        gameId: 'succession',
        matchId: 'succession-ui',
        visibilityEpoch: epoch,
        streamHead: current.history.streamHead,
        after,
        through,
        cursor,
        events,
        hasMore: cursor < through,
        reset: false,
      }),
    });
  });
  await page.route('**/api/matches/succession-ui/replay?*', (route) => {
    const url = new URL(route.request().url());
    const through = Number(url.searchParams.get('through'));
    const event = fixture.events(true)[through - 1];
    const state = event ? fixture.frames.get(event.eventKey) : fixture.act1;

    if (!state) throw new Error(`Missing exact historical fixture frame ${through}`);

    return route.fulfill({
      json: Schema.decodeUnknownSync(ReplayFrame2Schema)(replayFrameSuccession(state, through, 'archive')),
    });
  });
  await page.route('**/api/matches/succession-ui/rounds?*', (route) => {
    const rounds = new Map<
      string,
      { key: string; act: 1 | 2; round: number; through: number; eventKey: string }
    >();

    for (const event of fixture.events(true)) {
      const key = `act-${event.act}:${event.act === 1 ? 'election' : 'table'}-${event.round}`;

      if (!rounds.has(key))
        rounds.set(key, {
          key,
          act: event.act,
          round: event.round,
          through: event.id,
          eventKey: event.eventKey,
        });
    }

    return route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: 'succession-ui',
        visibilityEpoch: 'archive',
        rounds: [...rounds.values()],
      },
    });
  });
  await page.route('**/api/matches/succession-ui/history-anchor?*', (route) => {
    const url = new URL(route.request().url());
    const event = fixture.events(true).find((entry) => entry.eventKey === url.searchParams.get('eventKey'));

    return route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: 'succession-ui',
        visibilityEpoch: 'archive',
        cursor: event?.id ?? null,
      },
    });
  });

  return {
    pageRequests,
    publish: (view: Observation2) => {
      current = view;
      send(view);
    },
    deliver: (view: Observation2) => send(view),
    corrupt: () => corrupt(),
  };
}

function viewOf(state: SuccessionState, archive = false) {
  const view = observeSuccession(state, null, {
    visibilityEpoch: archive ? 'archive' : 'live',
    streamHead: fixture.heads.get(state)?.[archive ? 'archive' : 'live'] ?? 0,
  });

  // Engine decisions use a deterministic fast virtual clock. Visual captures rebase
  // only the displayed current deadline to an ordinary 30-second window.
  if (view.status === 'active' && view.phase.deadline !== null) view.phase.deadline = Date.now() + 30_000;

  return view;
}

test('actual engine boards preserve all ten identities, transition, public stages and spectator privacy', async ({
  page,
}) => {
  const transport = await routes(page, viewOf(fixture.act1));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/matches/succession-ui?gameId=secret-overlord');
  await expect(page.getByRole('heading', { name: 'Succession', exact: false }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Act 1 board' })).toBeVisible();
  transport.publish(viewOf(fixture.act2));
  await expect(page.getByRole('heading', { name: 'Act 2 begins.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Act 2 board' })).toBeVisible();
  await expect(page.locator('.seat')).toHaveCount(10);
  await expect(page.locator('.returned-marker')).toHaveCount(10);
  await expect(page.getByRole('region', { name: 'Your private controller state' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'One champion.' })).toHaveCount(0);

  const stages = [...fixture.stages.values()]
    .filter((state) => state.stage.act === 2)
    .sort((a, b) => (fixture.heads.get(a)?.live ?? 0) - (fixture.heads.get(b)?.live ?? 0));

  for (const state of stages) {
    if (state) {
      transport.publish(viewOf(state));
      await expect(page.locator('.phase-banner')).toHaveAttribute('data-phase', state.phase.kind);
      await expect(page.locator('.legal-actions')).toHaveCount(0);
    }
  }

  await page.locator('.seat a').last().focus();
  await expect(page.locator('.seat a').last()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/act2-320.png', fullPage: true });
  expect(transport.pageRequests.length).toBeLessThan(10);
});

test('one terminal champion remains fixed during two-act replay with bounded page reads', async ({
  page,
}) => {
  const transport = await routes(page, viewOf(fixture.terminal, true));
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.goto('/matches/succession-ui');
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Archive disclosure at selected event' })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Replay event' });
  await slider.fill('0');
  await expect(page.getByRole('region', { name: 'Act 1 board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Your legal choices' })).toHaveCount(0);
  await page.getByLabel('Browse by round').focus();
  await page.getByLabel('Browse by round').selectOption('2:1');
  await expect(page.getByRole('region', { name: 'Act 2 board' })).toBeVisible();
  await expect(page.getByLabel('Browse by round')).toBeFocused();
  await page.screenshot({ path: '/tmp/opencode/succession-ui/replay-1600.png', fullPage: true });
  expect(transport.pageRequests.every((url) => Number(url.searchParams.get('limit')) <= 32)).toBe(true);
  expect(transport.pageRequests.length).toBeLessThan(10);
});

test('game scope survives rules navigation and back without changing actual match identity', async ({
  page,
}) => {
  await page.goto('/how-to-play');
  const picker = page.getByRole('button', { name: 'Succession', exact: true });
  await picker.click();
  await expect(page).toHaveURL(/gameId=succession/);
  await expect(page.getByRole('heading', { name: 'Win together. Then stand alone.' })).toBeVisible();
  await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
  await expect(page).toHaveURL(/leaderboard\?gameId=succession/);
  await page.goBack();
  await expect(picker).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/rules-390.png', fullPage: true });
});

test('archive expansion preserves the opaque reading anchor and rejects delayed live snapshots', async ({
  page,
}) => {
  const live = viewOf(fixture.act2);
  const transport = await routes(page, live);
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.goto('/matches/succession-ui');
  const timeline = page.getByLabel('Match timeline', { exact: true });
  await expect(timeline.locator('[data-event-id]').first()).toBeVisible();
  await timeline.evaluate((element) => {
    element.scrollTop = 300;
  });
  await expect(page.getByRole('button', { name: /Jump to latest/ })).toBeVisible();

  const before = await timeline.evaluate((element) => {
    const top = element.getBoundingClientRect().top;

    const row = [...element.querySelectorAll<HTMLElement>('[data-event-id]')].find(
      (entry) => entry.getBoundingClientRect().bottom > top,
    );

    if (!row) throw new Error('No visible reading anchor');

    return { id: Number(row.dataset.eventId), offset: row.getBoundingClientRect().top - top };
  });

  const key = fixture.events(false).find((event) => event.id === before.id)?.eventKey;

  if (!key) throw new Error('Missing public event key');
  const archived = fixture.events(true).find((event) => event.eventKey === key);

  if (!archived) throw new Error('Missing archived event key');
  transport.publish(viewOf(fixture.terminal, true));
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
  const restored = timeline.locator(`[data-event-id="${archived.id}"]`).first();
  await expect(restored).toBeVisible();
  await expect
    .poll(async () =>
      restored.evaluate(
        (row) => row.getBoundingClientRect().top - row.closest('.event-list')!.getBoundingClientRect().top,
      ),
    )
    .toBeCloseTo(before.offset, 0);
  transport.deliver(live);
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
  await expect(page.locator('.phase-banner')).toHaveCount(0);
  expect(transport.pageRequests.length).toBeLessThan(8);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/archive-anchor-1600.png', fullPage: true });
});
