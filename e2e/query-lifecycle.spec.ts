import { expect, test } from '@playwright/test';
import type { Page, Route, WebSocketRoute } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { Schema } from 'effect';
import { ActionRequest2Schema } from '../src/shared/succession';
import type { Observation2 } from '../src/shared/succession';
import { createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { successionClientFixture } from '../tests/fixtures/succession-client';

let fixture: Awaited<ReturnType<typeof successionClientFixture>>;

let html = '';

function capture<T>() {
  let value: T | undefined;

  return {
    save: (next: T) => {
      value = next;
    },
    ready: () => value !== undefined,
    clear: () => {
      value = undefined;
    },
    get: () => {
      if (value === undefined) throw new Error('Expected a captured transport operation');

      return value;
    },
  };
}

test.beforeAll(async () => {
  fixture = await successionClientFixture();

  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [react()],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('e2e/fixtures/query-lifecycle.tsx'),
        name: 'LifecycleFixture',
        formats: ['iife'],
      },
    },
  });

  const output = Array.isArray(bundle) ? bundle[0] : bundle;

  if (!('output' in output)) throw new Error('Expected one in-memory fixture bundle');
  const chunk = output.output.find((entry) => entry.type === 'chunk');

  if (!chunk) throw new Error('Missing fixture JavaScript');
  html = `<meta charset="utf-8"><div id="root"></div><script>${chunk.code.replaceAll('</script', '<\\/script')}</script>`;
});

test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

async function transport(page: Page, initial = fixture.terminal) {
  let current = initial;
  let socket: WebSocketRoute | null = null;
  let currentReads = 0;
  const frameReads: number[] = [];
  await page.route('**/tim10-harness*', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/matches/query-fixture', (route) => {
    currentReads++;

    return route.fulfill({ json: current });
  });
  await page.routeWebSocket('**/api/matches/query-fixture/events?*', (next) => {
    socket = next;
    next.send(JSON.stringify({ type: 'observation', observation: current }));
  });
  await page.route('**/api/matches/query-fixture/replay?*', (route) => {
    const url = new URL(route.request().url());
    const through = Number(url.searchParams.get('through'));
    frameReads.push(through);

    return route.fulfill({ json: fixture.frame(through, url.searchParams.get('epoch') ?? '') });
  });
  await page.route('**/api/matches/query-fixture/history?*', (route) => {
    const url = new URL(route.request().url());

    return route.fulfill({
      json: fixture.page(
        Number(url.searchParams.get('after')),
        Number(url.searchParams.get('through')),
        url.searchParams.get('epoch') ?? '',
      ),
    });
  });
  await page.route('**/api/matches/query-fixture/rounds?*', (route) =>
    route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: initial.matchId,
        visibilityEpoch: new URL(route.request().url()).searchParams.get('epoch'),
        rounds: [],
      },
    }),
  );
  await page.route('**/api/matches/query-fixture/history-anchor?*', (route) =>
    route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: initial.matchId,
        visibilityEpoch: new URL(route.request().url()).searchParams.get('epoch'),
        cursor: 17,
      },
    }),
  );

  const deliver = (view: Observation2) => {
    if (!socket) throw new Error('Fixture socket is not connected');
    socket.send(JSON.stringify({ type: 'observation', observation: view }));
  };

  return {
    frameReads,
    currentReads: () => currentReads,
    publish: (view: Observation2) => {
      current = view;
      deliver(view);
    },
    snapshot: (view: Observation2) => {
      current = view;
    },
    deliver,
    corrupt: () => {
      if (!socket) throw new Error('Missing socket');
      socket.send('{');
    },
  };
}

function primary(page: Page) {
  return page.getByLabel('Primary replay', { exact: true });
}

async function displayed(page: Page, cursor: number) {
  await expect(primary(page).getByLabel('At selected event', { exact: true })).toContainText(
    `AT SELECTED EVENT ${cursor} ·`,
  );
}

const metricsSchema = Schema.Struct({
  windows: Schema.Number,
  events: Schema.Number,
  entries: Schema.Number,
  epochs: Schema.Array(Schema.String),
});

async function metrics(page: Page) {
  return Schema.decodeUnknownSync(metricsSchema)(
    JSON.parse(await page.getByLabel('Cache metrics').innerText()),
  );
}

test('delayed A–B–A responses and failures cannot replace the newly selected window', async ({ page }) => {
  await transport(page);
  const old = capture<Route>();
  let reads = 0;
  await page.route('**/api/matches/query-fixture/replay?*', async (route) => {
    const through = Number(new URL(route.request().url()).searchParams.get('through'));

    if (through !== 10) return route.fallback();
    reads++;

    if (reads === 1) {
      old.save(route);

      return;
    }

    const frame = fixture.frame(10);
    frame.seats[0].name = 'Newest A';
    await route.fulfill({ json: frame });
  });
  await page.goto('/tim10-harness');
  await displayed(page, 512);
  const slider = primary(page).getByRole('slider', { name: 'Replay event' });
  await slider.fill('10');
  await expect.poll(() => reads).toBe(1);
  await slider.fill('20');
  await displayed(page, 20);
  await slider.fill('10');
  await displayed(page, 10);
  await expect(primary(page).getByText('Newest A', { exact: true })).toBeVisible();
  await old.get().fulfill({ status: 503, json: { error: { message: 'Obsolete A failed' } } });
  await expect(primary(page).getByRole('alert')).toHaveCount(0);
  await expect(primary(page).getByText('Newest A', { exact: true })).toBeVisible();
});

test('retains successful data on refetch failure and cancels an abandoned manual retry', async ({ page }) => {
  await transport(page);
  await page.goto('/tim10-harness');
  await displayed(page, 512);
  let attempt = 0;
  const old = capture<Route>();
  await page.route('**/api/matches/query-fixture/replay?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('through') !== '512') return route.fallback();
    attempt++;

    if (attempt === 1)
      return route.fulfill({ status: 503, json: { error: { message: 'Refetch unavailable' } } });

    if (attempt === 2) {
      old.save(route);

      return;
    }

    return route.fulfill({ json: fixture.frame(512) });
  });
  await page.getByRole('button', { name: 'Invalidate reads' }).click();
  await expect(primary(page).getByRole('alert')).toContainText('Refetch unavailable');
  await displayed(page, 512);
  await primary(page).getByRole('button', { name: 'Retry loading record' }).click();
  await expect.poll(() => attempt).toBe(2);
  await primary(page).getByRole('slider').fill('60');
  await displayed(page, 60);
  await primary(page).getByRole('slider').fill('512');
  await displayed(page, 512);
  await old.get().fulfill({ status: 503, json: { error: { message: 'Obsolete retry failed' } } });
  await expect(primary(page).getByRole('alert')).toHaveCount(0);
  expect(attempt).toBe(3);
});

test('concurrent readers share one request; playback bounds the cache and evicted ranges remain reachable', async ({
  page,
}) => {
  const server = await transport(page);
  const first = capture<Route>();
  let reads = 0;
  await page.route('**/api/matches/query-fixture/replay?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('through') !== '512') return route.fallback();
    reads++;
    first.save(route);
  });
  await page.clock.install();
  await page.goto('/tim10-harness');
  await expect.poll(() => reads).toBe(1);
  await page.getByRole('button', { name: 'Mount mirror' }).click();
  await page.clock.runFor(100);
  expect(reads).toBe(1);
  await first.get().fulfill({ json: fixture.frame(512) });
  await displayed(page, 512);
  await expect(
    page.getByLabel('Mirror replay').getByLabel('At selected event', { exact: true }),
  ).toContainText('AT SELECTED EVENT 512');
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Remove mirror' }).click();
  await primary(page).getByRole('button', { name: 'Play from start', exact: true }).click();
  await displayed(page, 0);
  let maxWindows = 0;
  let maxEvents = 0;

  for (let step = 1; step <= 48; step++) {
    await page.clock.runFor(800);
    await displayed(page, step);
    await page.clock.runFor(1);
    await expect.poll(async () => (await metrics(page)).windows).toBeLessThanOrEqual(2);
    const cache = await metrics(page);
    maxWindows = Math.max(maxWindows, cache.windows);
    maxEvents = Math.max(maxEvents, cache.events);
  }

  expect(maxWindows).toBeLessThanOrEqual(2);
  expect(maxEvents).toBeLessThanOrEqual(64);
  await primary(page).getByRole('slider').fill('10');
  await displayed(page, 10);
  expect(server.frameReads.filter((cursor) => cursor === 10)).toHaveLength(2);
  await page.getByRole('button', { name: 'Unmount replay' }).click();
  await page.clock.runFor(1);
  await expect.poll(async () => (await metrics(page)).entries).toBe(0);
});

for (const departure of ['unmount', 'seek'] as const) {
  test(`a remaining reader keeps its shared pending request when the other reader chooses ${departure}`, async ({
    page,
  }) => {
    await transport(page);
    const held = capture<Route>();
    let reads = 0;
    const failures: string[] = [];
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());

      if (url.pathname.endsWith('/replay') && url.searchParams.get('through') === '512')
        failures.push(request.failure()?.errorText ?? 'failed');
    });
    await page.route('**/api/matches/query-fixture/replay?*', (route) => {
      if (new URL(route.request().url()).searchParams.get('through') !== '512') return route.fallback();
      reads++;

      if (reads === 1) held.save(route);
      else
        return route.fulfill({ status: 503, json: { error: { message: 'The shared read was restarted' } } });
    });
    await page.clock.install();
    await page.goto('/tim10-harness');
    await expect.poll(held.ready).toBe(true);
    await page.getByRole('button', { name: 'Mount mirror' }).click();
    await page.clock.runFor(100);
    expect(reads).toBe(1);

    if (departure === 'unmount') await page.getByRole('button', { name: 'Unmount replay' }).click();
    else {
      await primary(page).getByRole('slider').fill('10');
      await displayed(page, 10);
    }

    await page.clock.runFor(100);
    const original = fixture.frame(512);
    original.seats[0].name = 'Original shared read';
    await held.get().fulfill({ json: original });
    const remaining = page.getByLabel('Mirror replay');
    await expect(remaining.getByLabel('At selected event', { exact: true })).toContainText(
      'AT SELECTED EVENT 512',
    );
    await expect(remaining.getByText('Original shared read', { exact: true })).toBeVisible();
    await expect(remaining.getByRole('alert')).toHaveCount(0);
    expect(reads).toBe(1);
    expect(failures).toEqual([]);
  });
}

test('offline reads show a paused state and resume without inventing a displayed frame', async ({
  page,
  context,
}) => {
  const server = await transport(page);
  await page.goto('/tim10-harness?hold');
  await expect(page.getByLabel('Connection')).toHaveText('connected');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mount replay' }).click();
  await expect(
    primary(page).getByText('Offline · Waiting to load the selected record', { exact: false }),
  ).toBeVisible();
  expect(server.frameReads).toHaveLength(0);
  await expect(primary(page).getByLabel('Archive disclosure at selected event')).toHaveCount(0);
  await context.setOffline(false);
  await displayed(page, 512);
  expect(server.frameReads).toEqual([512]);
});

test('a missing opaque anchor remains manually recoverable and translates the selected window', async ({
  page,
}) => {
  await transport(page);
  let reads = 0;
  await page.route('**/api/matches/query-fixture/history-anchor?*', (route) => {
    reads++;

    if (reads > 1) return route.fallback();

    return route.fulfill({
      json: {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: 'query-fixture',
        visibilityEpoch: 'archive',
        cursor: null,
      },
    });
  });
  await page.goto('/tim10-harness?anchor');
  await expect(primary(page).getByRole('alert')).toContainText('previous reading anchor is not available');
  await displayed(page, 512);
  await primary(page).getByRole('button', { name: 'Retry loading record' }).click();
  await displayed(page, 33);
  await expect(primary(page).getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(2);
});

test('a reset refreshes current once and manual retry recovers when the epoch is unchanged', async ({
  page,
}) => {
  const server = await transport(page);
  let reset = true;
  await page.route('**/api/matches/query-fixture/replay?*', (route) =>
    reset ? route.fulfill({ json: fixture.reset() }) : route.fallback(),
  );
  await page.goto('/tim10-harness');
  await expect(primary(page).getByRole('alert')).toContainText('record visibility changed');
  await expect.poll(server.currentReads).toBe(2);
  await page.clock.install();
  await page.clock.runFor(2000);
  expect(server.currentReads()).toBe(2);
  reset = false;
  await primary(page).getByRole('button', { name: 'Retry loading record' }).click();
  await displayed(page, 512);
  await expect(primary(page).getByRole('alert')).toHaveCount(0);
});

test('accepted epoch replacement retires in-flight scopes and old errors cannot reappear', async ({
  page,
}) => {
  const server = await transport(page);
  await page.goto('/tim10-harness');
  await displayed(page, 512);
  const old = capture<Route>();
  await page.route('**/api/matches/query-fixture/replay?*', (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('through') === '17' && url.searchParams.get('epoch') === 'archive') {
      old.save(route);

      return;
    }

    return route.fallback();
  });
  await primary(page).getByRole('slider').fill('17');
  await expect.poll(old.ready).toBe(true);
  server.publish({ ...fixture.terminal, history: { visibilityEpoch: 'replacement', streamHead: 512 } });
  await expect(page.getByLabel('Current epoch')).toHaveText('replacement');
  await displayed(page, 512);
  await expect
    .poll(async () => (await metrics(page)).epochs.every((epoch) => epoch === 'replacement'))
    .toBe(true);
  await old.get().fulfill({ status: 503, json: { error: { message: 'Retired epoch error' } } });
  server.deliver(fixture.terminal);
  await expect(page.getByLabel('Current epoch')).toHaveText('replacement');
  await expect(primary(page).getByRole('alert')).toHaveCount(0);
});

test('double submission is guarded and a receipt acknowledges its ID after a newer current packet', async ({
  page,
}) => {
  const server = await transport(page, fixture.controller);
  const pending = capture<Route>();
  let sends = 0;
  await page.route('**/api/matches/query-fixture/actions', (route) => {
    sends++;
    pending.save(route);
  });
  await page.goto('/tim10-harness');
  await page.getByRole('button', { name: 'Submit twice' }).click();
  await expect.poll(() => sends).toBe(1);
  await expect(page.getByRole('button', { name: 'Submit decision', exact: true })).toBeDisabled();

  const newer = {
    ...fixture.controller,
    phase: { ...fixture.controller.phase, id: 'newer-phase' },
    history: { ...fixture.controller.history, streamHead: 1 },
  };

  server.publish(newer);
  const request = Schema.decodeUnknownSync(ActionRequest2Schema)(pending.get().request().postDataJSON());
  await pending.get().fulfill({
    json: { actionId: request.actionId, accepted: true, observation: fixture.controller },
  });
  await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${request.actionId}`);
  await expect(page.getByLabel('Current phase')).toHaveText('newer-phase');
  await expect(page.getByRole('button', { name: 'Submit decision', exact: true })).toBeEnabled();
  await page.routeWebSocket('**/api/matches/query-fixture/events?*', () => {});
  await page.route('**/api/matches/query-fixture', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Readback unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Recheck current' }).click();
  await expect(page.getByLabel('Command error')).toContainText('Readback unavailable');
  await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${request.actionId}`);
  await expect(page.getByLabel('Current phase')).toHaveText('newer-phase');
});

for (const outcome of ['success', 'failure'] as const) {
  test(`current retry preserves an unresolved command and its ${outcome}`, async ({ page }) => {
    const server = await transport(page, fixture.controller);
    const held = capture<Route>();
    const ids: string[] = [];
    await page.route('**/api/matches/query-fixture/actions', (route) => {
      const request = Schema.decodeUnknownSync(ActionRequest2Schema)(route.request().postDataJSON());
      ids.push(request.actionId);

      if (ids.length === 1) {
        held.save(route);

        return;
      }

      return route.fulfill({
        json: { actionId: request.actionId, accepted: true, observation: fixture.controller },
      });
    });
    await page.goto('/tim10-harness');
    const submit = page.getByRole('button', { name: 'Submit decision', exact: true });
    await submit.click();
    await expect.poll(held.ready).toBe(true);
    server.corrupt();
    await expect(page.getByLabel('Command error')).toContainText('could not be read');
    await page.getByRole('button', { name: 'Recheck current' }).click();
    await expect.poll(server.currentReads).toBe(2);
    await expect(page.getByLabel('Connection')).toHaveText('connected');
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: 'Call act directly twice' }).click();
    await held
      .get()
      .fulfill(
        outcome === 'success'
          ? { json: { actionId: ids[0], accepted: true, observation: fixture.controller } }
          : { status: 409, json: { error: { message: 'Held decision rejected' } } },
      );
    await expect(submit).toBeEnabled();
    expect(ids).toHaveLength(1);

    if (outcome === 'success')
      await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${ids[0]}`);
    else {
      await expect(page.getByLabel('Command error')).toHaveText('Held decision rejected');
      await page.getByRole('button', { name: 'Recheck current' }).click();
      await expect.poll(server.currentReads).toBe(3);
      await expect(page.getByLabel('Command error')).toHaveText('Held decision rejected');
      await submit.click();
      await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${ids[1]}`);
      await expect(page.getByLabel('Command error')).toHaveText('');
      expect(ids).toHaveLength(2);
      expect(ids[1]).not.toBe(ids[0]);
    }
  });
}

for (const outcome of ['success', 'failure'] as const) {
  test(`another seat's takeover preserves the submitting controller's ${outcome}`, async ({ page }) => {
    const server = await transport(page, fixture.controller);
    const held = capture<Route>();
    await page.route('**/api/matches/query-fixture/actions', (route) => held.save(route));
    await page.goto('/tim10-harness');
    await expect(page.getByLabel('Connection')).toHaveText('connected');
    const submit = page.getByRole('button', { name: 'Submit decision', exact: true });
    await submit.click();
    await expect.poll(held.ready).toBe(true);
    const request = Schema.decodeUnknownSync(ActionRequest2Schema)(held.get().request().postDataJSON());

    if (!fixture.controller.you) throw new Error('Missing submitting controller');
    const other = (fixture.controller.you.seat + 1) % 10;

    const newer: Observation2 = {
      ...fixture.controller,
      phase: { ...fixture.controller.phase, id: 'other-seat-takeover' },
      seats: fixture.controller.seats.map((seat) =>
        seat.number === other
          ? { ...seat, generation: seat.generation + 1, forfeited: true, house: true }
          : seat,
      ),
    };

    server.publish(newer);
    await expect(page.getByLabel('Current phase')).toHaveText('other-seat-takeover');
    await expect.soft(submit).toBeDisabled();
    await held
      .get()
      .fulfill(
        outcome === 'success'
          ? { json: { actionId: request.actionId, accepted: true, observation: fixture.controller } }
          : { status: 409, json: { error: { message: 'Current controller rejection' } } },
      );

    if (outcome === 'success')
      await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${request.actionId}`);
    else await expect(page.getByLabel('Command error')).toHaveText('Current controller rejection');
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel('Current phase')).toHaveText('other-seat-takeover');
  });
}

test('a command receipt introducing the terminal archive retains its acknowledgment', async ({ page }) => {
  const server = await transport(page, fixture.controller);
  const held = capture<Route>();
  await page.route('**/api/matches/query-fixture/actions', (route) => held.save(route));
  await page.goto('/tim10-harness');
  await expect(page.getByLabel('Connection')).toHaveText('connected');
  await page.getByRole('button', { name: 'Submit decision', exact: true }).click();
  await expect.poll(held.ready).toBe(true);
  const request = Schema.decodeUnknownSync(ActionRequest2Schema)(held.get().request().postDataJSON());
  const archive = { ...fixture.terminal, you: fixture.controller.you };
  await held.get().fulfill({ json: { actionId: request.actionId, accepted: true, observation: archive } });
  await expect(page.getByLabel('Current epoch')).toHaveText('archive');
  await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${request.actionId}`);
  server.deliver(fixture.controller);
  await expect(page.getByLabel('Current epoch')).toHaveText('archive');
  await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${request.actionId}`);
});

test('command rejection and offline failure release pending without automatic replay', async ({
  page,
  context,
}) => {
  await transport(page, fixture.controller);
  const ids: string[] = [];
  let offline = false;
  await page.route('**/api/matches/query-fixture/actions', (route) => {
    ids.push(Schema.decodeUnknownSync(ActionRequest2Schema)(route.request().postDataJSON()).actionId);

    return offline
      ? route.abort('internetdisconnected')
      : route.fulfill({ status: 409, json: { error: { message: 'Decision rejected' } } });
  });
  await page.goto('/tim10-harness');
  const submit = page.getByRole('button', { name: 'Submit decision', exact: true });
  await submit.click();
  await expect(page.getByLabel('Command error')).toHaveText('Decision rejected');
  await expect(submit).toBeEnabled();
  offline = true;
  await context.setOffline(true);
  await submit.click();
  await expect.poll(() => ids.length).toBe(2);
  await expect(page.getByLabel('Command error')).toContainText('Failed to fetch');
  await expect(submit).toBeEnabled();
  await context.setOffline(false);
  await page.clock.install();
  await page.clock.runFor(2000);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`late command ${outcome} is ignored after takeover and after unmount`, async ({ page }) => {
    const server = await transport(page, fixture.controller);
    const pending = capture<Route>();
    await page.route('**/api/matches/query-fixture/actions', (route) => {
      pending.save(route);
    });
    await page.goto('/tim10-harness');
    await page.getByRole('button', { name: 'Submit decision', exact: true }).click();
    await expect.poll(pending.ready).toBe(true);

    if (!fixture.controller.you) throw new Error('Missing controlled submission');
    const request = Schema.decodeUnknownSync(ActionRequest2Schema)(pending.get().request().postDataJSON());

    const cutoff: Observation2 = {
      ...fixture.controller,
      private: null,
      decision: null,
      you: { ...fixture.controller.you, forfeited: true },
      seats: fixture.controller.seats.map((seat) =>
        seat.number === fixture.controller.you?.seat
          ? { ...seat, generation: seat.generation + 1, forfeited: true }
          : seat,
      ),
    };

    server.publish(cutoff);
    await expect(page.getByRole('button', { name: 'Submit decision', exact: true })).toBeEnabled();
    await pending
      .get()
      .fulfill(
        outcome === 'success'
          ? { json: { actionId: request.actionId, accepted: true, observation: fixture.controller } }
          : { status: 409, json: { error: { message: 'Obsolete failure' } } },
      );
    await expect(page.getByLabel('Command receipt')).toHaveText('');
    await expect(page.getByLabel('Command error')).toHaveText('');
    await page.getByRole('button', { name: 'Unmount game' }).click();
    server.snapshot(fixture.controller);
    await page.getByRole('button', { name: 'Mount game', exact: true }).click();
    pending.clear();
    await page.getByRole('button', { name: 'Submit decision', exact: true }).click();
    await expect.poll(pending.ready).toBe(true);
    const second = Schema.decodeUnknownSync(ActionRequest2Schema)(pending.get().request().postDataJSON());
    const oldRequest = pending.get();
    await page.getByRole('button', { name: 'Unmount game' }).click();

    const newController = {
      ...fixture.controller,
      you: { ...fixture.controller.you, agentId: 'new-controller', generation: 1 },
      seats: fixture.controller.seats.map((seat) =>
        seat.number === fixture.controller.you?.seat
          ? { ...seat, agentId: 'new-controller', generation: 1 }
          : seat,
      ),
    };

    server.snapshot(newController);
    await page.getByRole('button', { name: 'Mount game', exact: true }).click();
    await expect(page.getByLabel('Current controller')).toHaveText('new-controller');
    await expect(page.getByLabel('Connection')).toHaveText('connected');
    pending.clear();
    await page.getByRole('button', { name: 'Submit decision', exact: true }).click();
    await expect.poll(pending.ready).toBe(true);
    const third = Schema.decodeUnknownSync(ActionRequest2Schema)(pending.get().request().postDataJSON());
    await oldRequest.fulfill(
      outcome === 'success'
        ? { json: { actionId: second.actionId, accepted: true, observation: fixture.controller } }
        : { status: 409, json: { error: { message: 'Unmounted failure' } } },
    );
    await expect(page.getByRole('button', { name: 'Submit decision', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Command error')).toHaveText('');
    await expect(page.getByLabel('Command receipt')).toHaveText('');
    await pending
      .get()
      .fulfill({ json: { actionId: third.actionId, accepted: true, observation: newController } });
    await expect(page.getByLabel('Command receipt')).toHaveText(`Accepted decision ${third.actionId}`);
    await expect(page.getByLabel('Current controller')).toHaveText('new-controller');
  });

  test(`a public-seat-only takeover suppresses the old command's ${outcome}`, async ({ page }) => {
    const server = await transport(page, fixture.controller);
    const held = capture<Route>();
    await page.route('**/api/matches/query-fixture/actions', (route) => held.save(route));
    await page.goto('/tim10-harness');
    await page.getByRole('button', { name: 'Submit decision', exact: true }).click();
    await expect.poll(held.ready).toBe(true);
    const request = Schema.decodeUnknownSync(ActionRequest2Schema)(held.get().request().postDataJSON());

    const cutoff: Observation2 = {
      ...fixture.controller,
      private: null,
      decision: null,
      phase: { ...fixture.controller.phase, id: 'own-seat-replaced' },
      seats: fixture.controller.seats.map((seat) =>
        seat.number === fixture.controller.you?.seat
          ? { ...seat, generation: seat.generation + 1, forfeited: true, house: true }
          : seat,
      ),
    };

    server.publish(cutoff);
    await expect(page.getByLabel('Current phase')).toHaveText('own-seat-replaced');
    await page.routeWebSocket('**/api/matches/query-fixture/events?*', () => {});
    server.corrupt();
    await expect(page.getByLabel('Command error')).toContainText('could not be read');
    await held
      .get()
      .fulfill(
        outcome === 'success'
          ? { json: { actionId: request.actionId, accepted: true, observation: fixture.controller } }
          : { status: 409, json: { error: { message: 'Old public-seat command failed' } } },
      );
    await expect(page.getByLabel('Command receipt')).toHaveText('');
    await expect(page.getByLabel('Command error')).toContainText('could not be read');
    await expect(page.getByLabel('Current phase')).toHaveText('own-seat-replaced');
  });
}

test('a rejected stale packet after reconnect does not announce a resync', async ({ page }) => {
  const server = await transport(page, fixture.controller);
  await page.goto('/tim10-harness');
  await expect(page.getByLabel('Connection')).toHaveText('connected');
  const newer = { ...fixture.controller, history: { ...fixture.controller.history, streamHead: 1 } };
  server.publish(newer);
  server.snapshot(fixture.controller);
  server.corrupt();
  await expect(page.getByLabel('Connection')).toHaveText('disconnected');
  await page.clock.install();
  await page.clock.runFor(800);
  await expect(page.getByLabel('Connection')).toHaveText('disconnected');
  await expect(page.getByLabel('Command error')).toContainText('could not be read');
  server.publish(newer);
  await expect(page.getByLabel('Connection')).toHaveText('connected');
  await expect(page.getByLabel('Command error')).toHaveText('');
});

test('explicit current retry releases an abandoned live page so manual history loading can recover', async ({
  page,
}) => {
  const initial = { ...fixture.controller, history: { ...fixture.controller.history, streamHead: 20 } };
  const server = await transport(page, initial);
  const old = capture<Route>();
  let pages = 0;
  await page.route('**/api/matches/query-fixture/history?*', (route) => {
    pages++;

    if (pages === 1) {
      old.save(route);

      return;
    }

    return route.fallback();
  });
  await page.goto('/tim10-harness');
  await expect.poll(old.ready).toBe(true);
  await expect(page.getByRole('button', { name: 'Load history', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Recheck current' }).click();
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await expect(page.getByLabel('History cursor')).toHaveText('20');
  await old.get().fulfill({ status: 503, json: { error: { message: 'Abandoned live page error' } } });
  await expect(page.getByLabel('Command error')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Load history', exact: true })).toBeEnabled();
  server.publish({
    ...initial,
    seats: initial.seats.map((seat) =>
      seat.number === 0 ? { ...seat, generation: seat.generation + 1, forfeited: true, house: true } : seat,
    ),
  });
  await expect(page.getByLabel('History cursor')).toHaveText('20');
  expect(pages).toBe(2);
});

test('protocol one consumes its decoded initial observation once and retries a fresh read', async ({
  page,
}) => {
  await transport(page);

  const view = observe(
    createMatch(
      'protocol-one',
      Array.from({ length: 10 }, (_, seat) => ({
        agentId: `one-${seat}`,
        ownerId: null,
        name: `One ${seat}`,
        house: true,
        rating: 1000,
      })),
      Date.now(),
    ),
  );

  let reads = 0;
  const socket = capture<WebSocketRoute>();
  const after: string[] = [];
  await page.route('**/api/matches/protocol-one', (route) => {
    reads++;

    return route.fulfill({ json: view });
  });
  await page.routeWebSocket('**/api/matches/protocol-one/events?*', (next) => {
    socket.save(next);
    after.push(new URL(next.url()).searchParams.get('after') ?? '');
  });
  await page.goto('/tim10-harness?protocol-one');
  await expect.poll(() => after.length).toBe(1);
  expect(reads).toBe(1);
  expect(after).toEqual([String(view.cursor)]);
  await page.getByRole('button', { name: 'Rerender protocol one 0' }).click();
  await expect(page.getByRole('button', { name: 'Rerender protocol one 1' })).toBeVisible();
  expect(after).toHaveLength(1);
  const duplicate = { ...view, reset: false };
  socket.get().send(JSON.stringify({ type: 'observation', observation: duplicate }));
  await expect(page.getByLabel('Protocol one events')).toHaveText(
    view.events.map((event) => event.id).join(','),
  );
  const event = { id: view.cursor + 1, at: Date.now(), round: 1, type: 'chat', text: 'Delivered once' };
  socket.get().send(
    JSON.stringify({
      type: 'observation',
      observation: { ...view, reset: false, cursor: event.id, events: [...view.events.slice(-1), event] },
    }),
  );
  await expect(page.getByLabel('Protocol one events')).toHaveText(
    [...view.events.map((entry) => entry.id), event.id].join(','),
  );
  socket.get().send(
    JSON.stringify({
      type: 'observation',
      observation: { ...view, reset: true, cursor: event.id, events: [event] },
    }),
  );
  await expect(page.getByLabel('Protocol one events')).toHaveText(String(event.id));
  await page.getByRole('button', { name: 'Retry protocol one' }).click();
  await expect.poll(() => reads).toBe(2);
  await expect.poll(() => after.length).toBe(2);
});
