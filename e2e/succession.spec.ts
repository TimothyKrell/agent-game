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
import { motionMark, traceSuccessionMotion } from './succession-motion-observer';
import { visibility } from './motion-observer';
import { writeFile } from 'node:fs/promises';

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
  await expect(page.locator('.phase-banner').filter({ hasText: 'CURRENT PHASE' })).toHaveCount(0);
  expect(transport.pageRequests.length).toBeLessThan(8);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/archive-anchor-1600.png', fullPage: true });
});

async function outcomeSnapshot(page: Page, state: SuccessionState) {
  const view = observeSuccession(state, null, { visibilityEpoch: 'archive', streamHead: 1 });
  await routes(page, view);

  const event: AuthorizedEvent2 = {
    id: 1,
    eventKey: 'outcome-snapshot',
    at: state.finishedAt ?? Date.now(),
    act: view.act,
    round: view.round,
    type: state.status,
    text: state.result
      ? `Table-round cap reached. Winning seat ${state.result.winnerSeat + 1}.`
      : (state.interruptionReason ?? 'Partial record.'),
  };

  await page.route('**/api/matches/succession-ui/history?*', (route) =>
    route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: state.id,
        visibilityEpoch: 'archive',
        streamHead: 1,
        after: 0,
        through: 1,
        cursor: 1,
        events: [event],
        hasMore: false,
        reset: false,
      },
    }),
  );
  await page.route('**/api/matches/succession-ui/rounds?*', (route) =>
    route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: state.id,
        visibilityEpoch: 'archive',
        rounds: [
          {
            key: `act-${view.act}:${view.act === 1 ? 'election' : 'table'}-${view.round}`,
            act: view.act,
            round: view.round,
            through: 1,
            eventKey: event.eventKey,
          },
        ],
      },
    }),
  );
  await page.route('**/api/matches/succession-ui/replay?*', (route) =>
    route.fulfill({ json: replayFrameSuccession(state, 1, 'archive') }),
  );
  await page.goto('/matches/succession-ui');
}

function capSnapshot(criterion: 'influence' | 'coins' | 'priority', forfeit = false) {
  let state = structuredClone(fixture.act2);

  if (state.stage.act !== 2) throw new Error('Expected Act 2 fixture');
  const board = state.stage.board;
  const actor = (board.firstSeat + 9) % 10;
  board.round = 12;
  board.slot = 9;
  board.activeSeat = actor;

  for (const [seat, resource] of board.resources.entries()) {
    resource.coins = criterion === 'priority' ? (seat === actor ? 0 : 1) : 0;

    if (criterion === 'influence' && seat !== actor) {
      const card = resource.hand.pop();

      if (card) resource.revealed.push(card);
    }
  }

  const winner = criterion === 'priority' ? state.commitment.priority[0] : actor;

  if (forfeit) {
    state.seats[winner].forfeited = true;
    state.seats[winner].generation++;
    state.seats[winner].houseProfile = 'house-relief';
  }

  const random = { id: () => crypto.randomUUID(), random: () => 0 };
  state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline ?? Date.now() }, random).state;
  const decision = observeSuccession(state, actor, undefined, state.seats[actor].houseProfile !== null);
  state = evolveSuccession(
    state,
    {
      type: 'act',
      seat: actor,
      generation: state.seats[actor].generation,
      now: state.phase.startedAt + 1,
      request: {
        gameId: 'succession',
        actionId: random.id(),
        phaseId: decision.phase.id,
        decisionId: decision.decision?.id,
        action: { type: 'income' },
      },
    },
    random,
  ).state;
  expect(state.status).toBe('finished');
  expect(state.result?.tieBreak?.decisive).toBe(criterion);

  return state;
}

test('cap criteria, forfeited champion and interrupted acts retain their separate outcomes', async ({
  page,
}) => {
  for (const [index, criterion] of (['influence', 'coins', 'priority'] as const).entries()) {
    await page.setViewportSize({ width: [320, 390, 1600][index], height: 1120 });
    await outcomeSnapshot(page, capSnapshot(criterion, criterion === 'priority'));
    await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Cap tiebreak · Decided by ${criterion}` })).toBeVisible();
    await expect(page.locator('.cap-evidence tbody tr')).toHaveCount(10);
    await expect(page.getByRole('region', { name: 'Historical match state' })).toBeVisible();
    await expect(page.getByText('Updating historical frame…')).toHaveCount(0);
    expect(await page.locator('.cap-evidence').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
      true,
    );

    for (const label of ['Influence', 'Coins', 'Priority']) {
      await expect(page.locator(`.cap-evidence td[data-label="${label}"]`)).toHaveCount(10);
    }

    if (criterion === 'priority') await expect(page.locator('.forfeit-result')).toContainText('forfeit loss');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/opencode/succession-ui/cap-${criterion}.png`, fullPage: true });
  }

  for (const source of [fixture.act1, fixture.act2]) {
    const state = evolveSuccession(
      source,
      {
        type: 'interrupt',
        now: Date.now(),
        reason: 'Synthetic platform interruption for presentation coverage.',
      },
      { id: () => crypto.randomUUID(), random: () => 0 },
    ).state;

    await page.setViewportSize({ width: source.stage.act === 1 ? 320 : 768, height: 1120 });
    await outcomeSnapshot(page, state);
    await expect(page.getByRole('heading', { name: 'Match interrupted.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One champion.' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Act 2 begins.' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: `Act ${source.stage.act} board` })).toBeVisible();
    await page.screenshot({
      path: `/tmp/opencode/succession-ui/interrupted-act${source.stage.act}.png`,
      fullPage: true,
    });
  }
});

test('a replaced controller loses private cards and controls and delayed private snapshots cannot restore them', async ({
  page,
}) => {
  const state = fixture.stages.get('act-2:action');

  if (!state || state.stage.act !== 2) throw new Error('Missing action fixture');
  const seat = state.stage.board.activeSeat;
  const initial = observeSuccession(state, seat, { visibilityEpoch: 'seat', streamHead: 0 });
  const transport = await routes(page, initial);
  await page.setViewportSize({ width: 768, height: 1120 });
  await page.goto('/matches/succession-ui');
  await expect(page.getByRole('heading', { name: 'Your capability cards' })).toBeVisible();
  await expect(page.locator('.legal-actions button').first()).toBeVisible();
  await page.screenshot({ path: '/tmp/opencode/succession-ui/entitled-controller-768.png', fullPage: true });

  if (!initial.you) throw new Error('Missing controller');

  const cutoff: Observation2 = {
    ...initial,
    private: null,
    decision: null,
    you: { ...initial.you, forfeited: true },
    seats: initial.seats.map((entry) =>
      entry.number === seat
        ? { ...entry, forfeited: true, house: true, generation: entry.generation + 1 }
        : entry,
    ),
  };

  transport.publish(cutoff);
  await expect(page.locator('.succession-private')).toHaveCount(0);
  await expect(page.getByText(/Your original controller has been replaced/)).toBeVisible();
  transport.deliver(initial);
  await expect(page.locator('.legal-actions')).toHaveCount(0);
  await expect(page.locator('.capability-hand')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/forfeit-cutoff-768.png', fullPage: true });
});

for (const width of [320, 390, 768, 1600]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test.describe(`native capture ${width} ${reducedMotion}`, () => {
      const viewport = { width, height: width < 768 ? 844 : width === 768 ? 1024 : 1120 };
      test(`live resources and sealed challenge stay readable at ${width}px (${reducedMotion})`, async ({
        browser,
        baseURL,
      }, testInfo) => {
        const context = await browser.newContext({
          baseURL,
          viewport,
          reducedMotion,
          recordVideo: { dir: testInfo.outputPath('native-video'), size: viewport },
        });

        const page = await context.newPage();

        try {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion });
          const state = fixture.stages.get('act-2:challenge');

          if (!state) throw new Error('Missing challenge fixture');
          await routes(page, viewOf(state));
          await page.goto('/matches/succession-ui');
          await expect(
            page.getByText('Challenges sealed · Choices reveal together at resolution.'),
          ).toBeVisible();
          await expect(page.locator('.seat')).toHaveCount(10);
          await expect(page.locator('.legal-actions')).toHaveCount(0);
          await expect(page.locator('html')).toHaveAttribute(
            'data-motion',
            reducedMotion === 'reduce' ? 'static' : 'enabled',
          );
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({
            path: `/tmp/opencode/succession-ui/live-${width}-${reducedMotion}.png`,
            fullPage: true,
          });
          // Deliberate native-speed recording dwell after the settled live phase.
          await page.waitForTimeout(2000);
        } finally {
          await context.close();
        }
      });
    });
  }
}

for (const width of [320, 390]) {
  test(`full phase identities fit actor target blocker and historical coordinator at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1120 });
    const state = fixture.stages.get('act-2:challenge');

    if (!state) throw new Error('Missing challenge fixture');
    const view = viewOf(state);

    if (view.board.act !== 2 || !view.board.pending) throw new Error('Missing pending claim');
    // Presentation fixture: retain the engine phase, give every displayed identity its maximum-length example.
    view.seats = view.seats.map((seat) => ({ ...seat, name: 'ThePersistentStrategistWithAnUnabridgedName' }));
    const target = (view.board.pending.actor + 1) % 10;
    view.board.pending = {
      ...view.board.pending,
      action: 'assassinate',
      claim: 'assassin',
      paid: 3,
      target,
      block: { seat: target, capability: 'guard' },
    };
    await routes(page, view);
    await page.goto('/matches/succession-ui');
    await expect(page.getByRole('heading', { name: 'Challenge the block' })).toBeVisible();
    const phase = page.getByRole('region', { name: 'Current match state' });
    expect(await phase.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/opencode/succession-ui/long-phase-${width}.png`, fullPage: true });
    await routes(page, viewOf(fixture.terminal, true));
    await page.goto('/matches/succession-ui');
    await page.getByLabel('Replay event', { exact: true }).fill('0');
    const historical = page.getByRole('region', { name: 'Historical match state' });
    await expect(historical).toContainText('Coordinator:');
    expect(await historical.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({
      path: `/tmp/opencode/succession-ui/historical-phase-${width}.png`,
      fullPage: true,
    });
  });
}

for (const width of [1600, 768, 390, 320]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`composite native Succession motion ${width} ${reducedMotion}`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      const viewport = {
        width,
        height:
          new Map([
            [1600, 1120],
            [768, 1024],
          ]).get(width) ?? 844,
      };

      const context = await browser.newContext({
        baseURL,
        viewport,
        deviceScaleFactor: 1,
        hasTouch: width < 768,
        reducedMotion,
        recordVideo: { dir: testInfo.outputPath('native-video'), size: viewport },
      });

      const page = await context.newPage();
      const trace = await traceSuccessionMotion(page);
      await motionMark(page, 'capture start on blank page before first navigation');

      try {
        await routes(page, viewOf(fixture.terminal, true));
        await page.goto('/how-to-play');
        const picker = page.getByRole('button', { name: 'Secret Overlord', exact: true });
        const succession = page.getByRole('button', { name: 'Succession', exact: true });
        await picker.focus();
        await motionMark(page, 'SM01 keyboard focus Secret Overlord; hold 1s');
        await page.waitForTimeout(1000);
        await page.keyboard.press('Tab');
        const pickerCueStart = trace.length;
        await expect(succession).toBeFocused();
        await motionMark(page, 'SM01 Enter selects Succession');
        await page.keyboard.press('Enter');
        await expect(succession).toHaveAttribute('aria-pressed', 'true');
        await expect(succession).toBeFocused();
        await page.waitForTimeout(1000);

        if (width < 768) {
          await motionMark(page, 'SM01 touch selects Secret Overlord');
          await picker.tap();
          await succession.tap();
        } else {
          await motionMark(page, 'SM01 fine pointer selects Secret Overlord then Succession');
          await picker.click();
          await succession.click();
        }

        await motionMark(page, 'SM01 rapid selection begins; DOM activation every 50ms');

        for (const name of ['Secret Overlord', 'Succession', 'Secret Overlord', 'Succession']) {
          await page.getByRole('button', { name, exact: true }).evaluate((node) => {
            if (node instanceof HTMLButtonElement) node.click();
          });
          await motionMark(page, `SM01 rapid ${name}`);
          await page.waitForTimeout(50);
        }

        await page.waitForTimeout(2000);
        const pickerCues = trace.slice(pickerCueStart).filter((entry) => entry.kind === 'animate');

        if (reducedMotion === 'reduce') expect(pickerCues).toHaveLength(0);
        else {
          expect(pickerCues.length).toBeGreaterThanOrEqual(4);
          expect(
            pickerCues.every(
              (entry) =>
                entry.detail.includes('"pseudoElement":"::after"') && entry.detail.includes('"duration":180'),
            ),
          ).toBe(true);
        }

        const beforeNoop = trace.filter((entry) => entry.kind === 'animate').length;
        await succession.click();
        await page.evaluate(() => {
          history.replaceState(null, '', `${location.pathname}?gameId=succession&retained=1`);
          dispatchEvent(new PopStateEvent('popstate'));
        });
        await motionMark(page, 'SM01 same selection and retained query-only update');
        await page.waitForTimeout(300);
        expect(trace.filter((entry) => entry.kind === 'animate').length).toBe(beforeNoop);
        await motionMark(page, 'SM02 fresh completed record navigation');
        const resultCueStart = trace.length;
        await page.goto('/matches/succession-ui');
        const result = page.locator('.succession-result');
        await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
        await expect(result).toHaveAttribute('data-motion-settled', 'true');
        await page.waitForTimeout(2000);
        await motionMark(page, 'SM02 completed result settled; scroll away and back');
        const resultCues = trace.slice(resultCueStart).filter((entry) => entry.kind === 'animate');
        expect(resultCues).toHaveLength(reducedMotion === 'reduce' ? 0 : 2);

        if (reducedMotion === 'no-preference') {
          expect(
            resultCues.some(
              (entry) =>
                entry.detail.includes('"duration":240') &&
                entry.detail.includes(`translateY(${width < 768 ? 2 : 4}px)`),
            ),
          ).toBe(true);
          expect(
            resultCues.some(
              (entry) => entry.detail.includes('"duration":420') && entry.detail.includes('"delay":40'),
            ),
          ).toBe(true);
        }

        const resultText = await result.innerText();
        const beforeReplay = trace.filter((entry) => entry.kind === 'animate').length;
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(400);
        await page.evaluate(() => scrollTo(0, 0));
        await page.getByLabel('Replay event', { exact: true }).fill('0');
        await expect(page.getByRole('region', { name: 'Historical match state' })).toContainText('ACT 1');
        await page.getByLabel('Browse by round').selectOption('2:1');
        await expect(page.getByRole('region', { name: 'Historical match state' })).toContainText('ACT 2');
        await page.evaluate(() => {
          history.replaceState(null, '', `${location.pathname}#replay`);
          dispatchEvent(new HashChangeEvent('hashchange'));
          scrollTo(0, 0);
        });
        await page.waitForTimeout(2000);
        expect(await result.innerText()).toBe(resultText);
        expect(trace.filter((entry) => entry.kind === 'animate').length).toBe(beforeReplay);
        await motionMark(page, 'SM02 replay Act1/Act2/hash and scroll restoration add no result cue');
        const source = width === 1600 || width === 390 ? fixture.act1 : fixture.act2;

        const interrupted = evolveSuccession(
          source,
          { type: 'interrupt', now: Date.now(), reason: 'Motion evidence neutral interruption.' },
          { id: () => crypto.randomUUID(), random: () => 0 },
        ).state;

        await motionMark(page, `SM02 fresh interrupted Act${source.stage.act} record`);
        const partialCueStart = trace.length;
        await outcomeSnapshot(page, interrupted);
        await expect(page.getByRole('heading', { name: 'Match interrupted.' })).toBeVisible();
        await expect(page.locator('.succession-result')).toHaveAttribute('data-motion-settled', 'true');
        await page.waitForTimeout(2000);
        const partialCues = trace.slice(partialCueStart).filter((entry) => entry.kind === 'animate');
        expect(partialCues).toHaveLength(reducedMotion === 'reduce' ? 0 : 1);

        if (reducedMotion === 'no-preference') expect(partialCues[0].detail).toContain('"duration":180');

        if (reducedMotion === 'reduce')
          expect(trace.filter((entry) => entry.kind === 'animate')).toHaveLength(0);

        if (reducedMotion === 'no-preference' && (width === 1600 || width === 320)) {
          for (const boundary of ['reduced', 'hidden'] as const) {
            await routes(page, viewOf(fixture.terminal, true));
            await page.goto('/matches/succession-ui');
            await page.waitForFunction(() =>
              document
                .getAnimations()
                .some(
                  (animation) =>
                    animation.playState === 'running' &&
                    animation.effect instanceof KeyframeEffect &&
                    animation.effect.target?.closest('.succession-result'),
                ),
            );
            await motionMark(page, `SM03 confirmed active result before ${boundary}`);

            if (boundary === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
            else await visibility(page, 'hidden');
            await expect
              .poll(() =>
                page.evaluate(
                  () =>
                    document.getAnimations().filter((animation) => animation.playState === 'running').length,
                ),
              )
              .toBe(0);
            await motionMark(
              page,
              `SM03 ${boundary} canceled running animations; hidden boundary is simulated`,
            );

            if (boundary === 'reduced') await page.emulateMedia({ reducedMotion: 'no-preference' });
            else await visibility(page, 'visible');
            const beforeRestore = trace.filter((entry) => entry.kind === 'animate').length;
            await page.waitForTimeout(2000);
            expect(trace.filter((entry) => entry.kind === 'animate').length).toBe(beforeRestore);
            await motionMark(page, `SM03 ${boundary} restored without burst`);
          }

          const transport = await routes(page, viewOf(fixture.act2));
          await page.goto('/matches/succession-ui');
          await expect(page.getByRole('region', { name: 'Act 2 board' })).toBeVisible();
          await visibility(page, 'hidden');
          const beforeHidden = trace.filter((entry) => entry.kind === 'animate').length;
          transport.publish(viewOf(fixture.terminal, true));
          await expect(page.getByRole('heading', { name: 'One champion.' })).toBeAttached();
          await visibility(page, 'visible');
          await page.waitForTimeout(2000);
          expect(trace.filter((entry) => entry.kind === 'animate').length).toBe(beforeHidden);
          await motionMark(page, 'SM03 new result while simulated hidden consumed; restore no cue');
        }
      } finally {
        await motionMark(page, 'capture end');
        await context.close();
        const tracePath = testInfo.outputPath('action-animation-trace.json');
        await writeFile(
          tracePath,
          JSON.stringify(
            {
              viewport,
              deviceScaleFactor: 1,
              reducedMotion,
              touch: width < 768,
              visibilityBoundary:
                'simulated via existing visibility helper; media-query subscription and cancellation real',
              records: trace,
            },
            null,
            2,
          ),
        );
        await testInfo.attach('action-animation-trace.json', {
          path: tracePath,
          contentType: 'application/json',
        });
      }
    });
  }
}

for (const width of [1600, 320]) {
  test(`growing history remains truthful across an in-flight page at ${width}`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const viewport = { width, height: width === 1600 ? 1120 : 844 };

    const context = await browser.newContext({
      baseURL,
      viewport,
      recordVideo: { dir: testInfo.outputPath('native-video'), size: viewport },
    });

    const page = await context.newPage();

    try {
      const source = fixture.stages.get('act-2:discussion');

      if (!source) throw new Error('Missing late live discussion fixture');
      const live = viewOf(source);
      const initial = { ...live, history: { ...live.history, streamHead: 1 } };
      const transport = await routes(page, initial);
      let release = () => {};

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      let started = false;
      await page.route('**/api/matches/succession-ui/history?*', async (route) => {
        if (!started) {
          started = true;
          await gate;
        }

        await route.fallback();
      });
      await page.goto('/matches/succession-ui');
      await expect.poll(() => started).toBe(true);
      transport.publish(live);
      await expect(page.getByRole('region', { name: 'History page controls' })).toContainText(
        `${live.history.streamHead} events available`,
      );
      release();
      const footer = page.locator('.feed-footer');
      await expect(footer).toContainText('newer events available');
      await page.locator('.history-paging').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/opencode/succession-ui/paging-delayed-${width}.png`,
        fullPage: true,
      });
      await page.waitForTimeout(2000);
      const next = page.getByRole('button', { name: 'Load next record page', exact: true });

      for (let n = 0; n < 32 && (await next.isEnabled()); n++) {
        await next.click();
        await expect(page.getByRole('button', { name: 'Loading record…' })).toHaveCount(0);
      }

      await expect(next).toBeDisabled();
      await expect(footer).not.toContainText('newer events available');
      await page.screenshot({
        path: `/tmp/opencode/succession-ui/paging-caught-up-${width}.png`,
        fullPage: true,
      });
      const earlier = page.getByRole('button', { name: 'Load earlier record', exact: true });

      await expect(earlier).toBeVisible();
      await earlier.click();
      await expect(footer).toContainText('newer events available');
      await page.screenshot({
        path: `/tmp/opencode/succession-ui/paging-earlier-${width}.png`,
        fullPage: true,
      });
      expect(transport.pageRequests.every((url) => Number(url.searchParams.get('limit')) <= 32)).toBe(true);
      await page.waitForTimeout(2000);
    } finally {
      await context.close();
    }
  });
}
