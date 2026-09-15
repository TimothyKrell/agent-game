import { expect, test } from '@playwright/test';
import type { Page, WebSocketRoute } from '@playwright/test';
import { Schema } from 'effect';
import { ActionRequest2Schema } from '../src/shared/succession';
import { observeSuccession } from '../src/game/succession/observation';
import { board2 } from '../tests/fixtures/succession-story';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { continuousStoryFixture } from '../tests/fixtures/continuous-story';

let html = '';

let fixture: Awaited<ReturnType<typeof continuousStoryFixture>>;

test.beforeAll(async () => {
  fixture = await continuousStoryFixture();

  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [react()],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('e2e/fixtures/continuous-story.tsx'),
        name: 'ContinuousStoryFixture',
        formats: ['iife'],
      },
    },
  });

  const output = Array.isArray(bundle) ? bundle[0] : bundle;

  if (!('output' in output)) throw new Error('Expected fixture output');
  const chunk = output.output.find((entry) => entry.type === 'chunk');

  if (!chunk) throw new Error('Missing fixture script');
  html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>${chunk.code}</script></body></html>`;
});

async function harness(
  page: Page,
  initialHead = fixture.events.length,
  documentRoot = false,
  commands = false,
  sparse = false,
) {
  const pending: (() => Promise<void>)[] = [];

  const control = {
    head: initialHead,
    epoch: 'continuous-public',
    requests: 0,
    maxBytes: 0,
    maxEvents: 0,
    fail: false,
    gap: false,
    hold: false,
    reset: false,
    pending,
  };

  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.message));

  await page.route('http://127.0.0.1:6283/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });

    if (url.pathname === '/fixture-current') {
      const view = commands
        ? observeSuccession(fixture.initial, board2(fixture.initial).activeSeat, {
            visibilityEpoch: control.epoch,
            streamHead: control.head,
          })
        : fixture.current(control.head);

      view.matchId = `match_${url.searchParams.get('match')}`;

      return route.fulfill({ json: view });
    }

    const matchId = url.pathname.split('/')[3];
    const through = Number(url.searchParams.get('through'));
    const epoch = url.searchParams.get('epoch')!;

    if (url.pathname.endsWith('/checkpoint'))
      return route.fulfill({ json: fixture.checkpoint(through, matchId, epoch) });

    if (url.pathname.endsWith('/history-anchor')) {
      const cursor =
        fixture.events.find((event) => event.eventKey === url.searchParams.get('eventKey'))?.id ?? null;

      return route.fulfill({
        json: { protocolVersion: '2', gameId: 'succession', matchId, visibilityEpoch: epoch, cursor },
      });
    }

    if (url.pathname.endsWith('/history')) {
      control.requests++;
      expect(url.searchParams.get('limit')).toBe('32');
      expect(url.searchParams.get('maxBytes')).toBe('16384');
      const after = Number(url.searchParams.get('after'));
      const events = fixture.events.slice(after, Math.min(through, after + 32));

      if (control.gap) events.shift();
      const cursor = events.at(-1)?.id ?? after;

      const result = {
        protocolVersion: '2',
        gameId: 'succession',
        matchId,
        visibilityEpoch: epoch,
        streamHead: control.head,
        after,
        through,
        cursor,
        events,
        hasMore: cursor < through,
        reset: control.reset,
      };

      control.maxBytes = Math.max(control.maxBytes, Buffer.byteLength(JSON.stringify(result)));
      control.maxEvents = Math.max(control.maxEvents, events.length);

      const deliver = () =>
        route.fulfill(
          control.fail
            ? { status: 503, json: { error: { code: 'fixture-unavailable', message: 'Fixture retry' } } }
            : { json: result },
        );

      if (control.hold) {
        control.pending.push(deliver);

        return;
      }

      return deliver();
    }

    return route.fulfill({ status: 404 });
  });
  await page.goto(
    `http://127.0.0.1:6283/${commands ? '?commands' : documentRoot ? '?document' : sparse ? '?sparse' : ''}`,
  );

  return { control, faults };
}

const metrics = (page: Page, name = 'primary') => page.getByLabel(`${name} metrics`, { exact: true });

const timeline = (page: Page, name = 'primary') => page.getByLabel(`${name} timeline`, { exact: true });

async function ready(page: Page, name = 'primary') {
  await expect(metrics(page, name)).toContainText('"status":"ready"');
}

async function geometry(page: Page) {
  return timeline(page).evaluate((root) => {
    const top = root.getBoundingClientRect().top;

    const row = Array.from(root.querySelectorAll<HTMLElement>('[data-story-key]')).find(
      (element) => element.getBoundingClientRect().bottom > top + 1,
    )!;

    return { key: row.dataset.storyKey!, offset: row.getBoundingClientRect().top - top };
  });
}

test('reads 2,048 canonical messages forward/backward through eviction and revisits with a finite DOM', async ({
  page,
}) => {
  const { control, faults } = await harness(page);
  await ready(page);
  const seen = new Set<string>();
  let maxDOM = 0;

  for (let index = 0; index < 40; index++) {
    const keys = await timeline(page)
      .locator('[data-story-key]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-story-key')!));

    keys.forEach((key) => seen.add(key));
    maxDOM = Math.max(maxDOM, keys.length);
    const delivered = Number(await timeline(page).getAttribute('data-story-delivered'));

    if (delivered === fixture.events.length) break;
    await timeline(page).evaluate((root) => {
      root.scrollTop = root.scrollHeight - root.clientHeight - 100;
    });
    await expect
      .poll(async () => Number(await timeline(page).getAttribute('data-story-delivered')))
      .toBeGreaterThan(delivered);
    await ready(page);
  }

  expect(seen.size).toBe(fixture.events.length);
  expect(maxDOM).toBeLessThanOrEqual(128);
  expect(control.maxEvents).toBeLessThanOrEqual(32);
  expect(control.maxBytes).toBeLessThanOrEqual(16_384);

  for (let index = 0; index < 40; index++) {
    const after = Number(await timeline(page).getAttribute('data-story-after'));

    if (after === 0) break;
    await timeline(page).evaluate((root) => {
      root.scrollTop = 90;
    });
    await expect
      .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
      .toBeLessThan(after);
    await ready(page);
  }

  await expect(timeline(page)).toHaveAttribute('data-story-after', '0');
  await expect(timeline(page).locator('[data-story-cursor="1"]')).toContainText('Record 1.');
  await expect(page.getByLabel('cache entries', { exact: true })).toHaveText('0');
  expect(control.requests).toBeLessThanOrEqual(270);
  expect(faults).toEqual([]);
  await test.info().attach('bounds', {
    body: JSON.stringify({
      maxDOM,
      seen: seen.size,
      requests: control.requests,
      maxBytes: control.maxBytes,
    }),
    contentType: 'application/json',
  });
});

test('holds geometry and focus across prepend, chapter closure, live growth and narrow keyboard reading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { control, faults } = await harness(page, 700);
  await ready(page);
  await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '700');
  await ready(page);
  await timeline(page).evaluate((root) => {
    root.scrollTop = 500;
  });
  await expect(metrics(page)).toContainText('"following":false');
  const anchor = await geometry(page);
  control.head = 760;
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await expect(metrics(page)).toContainText('"head":760');
  expect(await geometry(page)).toEqual(anchor);
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '700');
  await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  await ready(page);
  expect(await geometry(page)).toEqual(anchor);
  const focus = timeline(page).locator('[data-story-key]').nth(50).getByRole('button');
  const focusName = await focus.getAttribute('aria-label');
  await focus.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: focusName!, exact: true })).toBeFocused();
  await timeline(page).focus();

  const prependedAnchor = await timeline(page).evaluate((root) => {
    root.scrollTop = 100;
    const top = root.getBoundingClientRect().top;

    const row = Array.from(root.querySelectorAll<HTMLElement>('[data-story-key]')).find(
      (element) => element.getBoundingClientRect().bottom > top + 1,
    )!;

    return { key: row.dataset.storyKey!, offset: row.getBoundingClientRect().top - top };
  });

  await expect
    .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
    .toBeLessThan(572);
  await ready(page);
  const restoredAnchor = await geometry(page);
  expect(restoredAnchor.key).toBe(prependedAnchor.key);
  expect(Math.abs(restoredAnchor.offset - prependedAnchor.offset)).toBeLessThanOrEqual(1);
  await test.info().attach('prepend-geometry', {
    body: JSON.stringify({ before: prependedAnchor, after: await geometry(page) }),
    contentType: 'application/json',
  });
  await expect(timeline(page).locator('[data-story-key]')).toHaveCount(128);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(faults).toEqual([]);
});

test('pauses hidden reading, follows successive frozen live heads, and recovers a network retry from an empty record', async ({
  page,
}) => {
  const { control, faults } = await harness(page, 0);
  await ready(page);
  expect(control.requests).toBe(0);
  await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  control.hold = true;
  control.head = 200;
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await expect.poll(() => control.pending.length).toBe(1);
  control.head = 300;
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await expect(metrics(page)).toContainText('"head":300');
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '0');
  control.hold = false;

  for (const deliver of control.pending.splice(0)) await deliver();
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '300');
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const requests = control.requests;
  control.head = 400;
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await expect(metrics(page)).toContainText('"head":400');
  expect(control.requests).toBe(requests);
  control.fail = true;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(metrics(page)).toContainText('"status":"error"');
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '300');
  control.fail = false;
  await timeline(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '400');
  expect(faults).toEqual([]);
});

test('uses document scrolling and retains a focused row across automatic prepending', async ({ page }) => {
  const { faults } = await harness(page, 600, true);
  await ready(page);
  await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  await expect(timeline(page)).toHaveAttribute('data-story-after', '472');
  await ready(page);
  const focus = timeline(page).locator('[data-story-key]').nth(2).getByRole('button');
  const name = await focus.getAttribute('aria-label');
  await focus.focus();
  const before = await focus.evaluate((node) => node.getBoundingClientRect().top);
  await expect
    .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
    .toBeLessThan(472);
  await ready(page);
  await expect(page.getByRole('button', { name: name!, exact: true })).toBeFocused();
  expect(
    await page
      .getByRole('button', { name: name!, exact: true })
      .evaluate((node) => node.getBoundingClientRect().top),
  ).toBeCloseTo(before, 0);
  expect(faults).toEqual([]);
});

test('crosses a long run of omitted row renderings in both directions without a request loop', async ({
  page,
}) => {
  const { control, faults } = await harness(page, 900, false, false, true);
  await ready(page);
  await timeline(page).evaluate((root) => {
    root.scrollTop = root.scrollHeight;
  });
  await expect
    .poll(async () => Number(await timeline(page).getAttribute('data-story-delivered')))
    .toBeGreaterThanOrEqual(768);
  await ready(page);
  await expect(timeline(page).locator('[data-story-cursor="701"]')).toBeAttached();
  await timeline(page).focus();
  await timeline(page).evaluate((root) => {
    root.scrollTop = 0;
  });
  await timeline(page).hover();
  await page.mouse.wheel(0, -200);
  await expect(timeline(page).locator('[data-story-cursor="99"]')).toBeAttached();
  await ready(page);
  expect(control.requests).toBeLessThan(100);
  expect(faults).toEqual([]);
});

test('keeps actual command mutation receipts independent of cancelled reading and newer authoritative current', async ({
  page,
}) => {
  const controller = observeSuccession(fixture.initial, board2(fixture.initial).activeSeat, {
    visibilityEpoch: 'continuous-public',
    streamHead: 128,
  });

  controller.matchId = 'match_a';
  let socket: WebSocketRoute | null = null;
  let deliver: (() => Promise<void>) | null = null;
  await page.routeWebSocket('**/api/matches/match_a/events?*', (connection) => {
    socket = connection;
    connection.send(JSON.stringify({ type: 'observation', observation: controller }));
  });
  const { control, faults } = await harness(page, 128, false, true);
  await ready(page);
  expect(control.requests).toBe(4);
  await page.route('**/api/matches/match_a/actions', (route) => {
    const request = Schema.decodeUnknownSync(ActionRequest2Schema)(route.request().postDataJSON());
    deliver = () =>
      route.fulfill({ json: { accepted: true, actionId: request.actionId, observation: controller } });
  });
  await page.getByRole('button', { name: 'Declare income', exact: true }).click();
  await expect(page.getByLabel('command metrics')).toContainText('"pending":true');
  await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  await expect.poll(() => socket !== null && deliver !== null).toBe(true);

  if (!socket || !deliver) throw new Error('Missing held command or current connection');
  const connection: WebSocketRoute = socket;
  const receipt: () => Promise<void> = deliver;
  connection.send(
    JSON.stringify({
      type: 'observation',
      observation: { ...controller, history: { ...controller.history, streamHead: 200 }, decision: null },
    }),
  );
  await expect(page.getByLabel('command metrics')).toContainText('"head":200');
  await receipt();
  await expect(page.getByLabel('command metrics')).toContainText('Accepted decision');
  await expect(page.getByLabel('command metrics')).toContainText('"head":200');
  await expect(page.getByLabel('command metrics')).toContainText('"legacyRows":0');
  expect(faults).toEqual([]);
});

test('fences pending reads on match A–B–A, keeps independent readers and recovers errors and epochs', async ({
  page,
}) => {
  const { control, faults } = await harness(page, 600);
  await ready(page);
  control.hold = true;
  await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  await expect.poll(() => control.pending.length).toBe(1);
  await page.getByRole('button', { name: 'Match B', exact: true }).click();
  await expect.poll(() => control.pending.length).toBe(2);
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await expect.poll(() => control.pending.length).toBe(3);
  control.hold = false;

  for (const deliver of control.pending.splice(0).reverse()) await deliver();
  await ready(page);
  await expect(timeline(page)).toHaveAttribute('data-story-after', '0');
  await page.getByRole('button', { name: 'Toggle second reader', exact: true }).click();
  await ready(page, 'secondary');
  control.hold = true;
  await page.getByRole('button', { name: 'Follow secondary', exact: true }).click();
  await expect.poll(() => control.pending.length).toBe(1);
  await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  control.hold = false;

  for (const deliver of control.pending.splice(0)) await deliver();
  await expect(timeline(page, 'secondary')).toHaveAttribute('data-story-delivered', '600');
  await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  control.gap = true;
  await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  await expect(metrics(page)).toContainText('"status":"error"');
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '128');
  control.gap = false;
  await timeline(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(timeline(page)).toHaveAttribute('data-story-delivered', '600');
  await timeline(page).evaluate((root) => {
    root.scrollTop = 600;
  });
  const anchor = await geometry(page);
  control.epoch = 'new-archive-epoch';
  await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  await ready(page);
  expect(await timeline(page).locator(`[data-story-key="${anchor.key}"]`).count()).toBe(1);
  expect(faults).toEqual([]);
});
