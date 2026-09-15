/** Actual route, exact canonical backend, deliberately held stable-key navigation response. */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

let fixture;

test.beforeAll(async () => {
  const loader = await createServer({
    configFile: false,
    cacheDir: '/tmp/opencode/dossier-ending-fixture-cache',
    server: { middlewareMode: true, hmr: false },
    logLevel: 'error',
  });

  try {
    fixture = await (await loader.ssrLoadModule('/.dossier/route-fixture.ts')).routeFixture();
  } finally {
    await loader.close();
  }
});

const chapter = (page, act = 'II') => page.getByRole('region', { name: `Act ${act} record`, exact: true });

async function harness(page, width = 1440) {
  await page.setViewportSize({ width, height: width === 1440 ? 1080 : 844 });
  const control = { hold: false, release: null, reached: null, requests: [], faults: [] };
  page.on('pageerror', (error) => control.faults.push(error.message));
  const view = fixture.observation('finished');
  control.view = view;
  const events = fixture.eventsFor('finished');
  await page.routeWebSocket('**/api/matches/*/events?*', (socket) => {
    control.socket = socket;
    socket.send(JSON.stringify({ type: 'observation', observation: view }));
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    const common = {
      protocolVersion: '2',
      gameId: 'succession',
      matchId: fixture.matchId,
      visibilityEpoch: view.history.visibilityEpoch,
    };

    control.requests.push(url.pathname + url.search);
    let json;
    let held = false;

    if (url.pathname === '/api/agent-pictures')
      json = view.seats.map((seat) => ({
        agentId: seat.agentId,
        picture: { state: 'missing', revision: 0 },
      }));
    else if (url.pathname === `/api/matches/${fixture.matchId}`) json = view;
    else if (url.pathname.endsWith('/rounds'))
      json = {
        ...common,
        rounds: [...new Map(events.map((event) => [`${event.act}:${event.round}`, event])).values()].map(
          (event) => {
            const first = events.find(
              (candidate) => candidate.act === event.act && candidate.round === event.round,
            );

            return {
              key: `${event.act}:${event.round}`,
              act: event.act,
              round: event.round,
              through: first.id,
              eventKey: first.eventKey,
            };
          },
        ),
      };
    else if (url.pathname.endsWith('/checkpoint')) {
      json = fixture.checkpoint('finished', Number(url.searchParams.get('through')));
      json.visibilityEpoch = view.history.visibilityEpoch;
      json.baseline.visibilityEpoch = view.history.visibilityEpoch;
    } else if (url.pathname.endsWith('/history-anchor')) {
      json = {
        ...common,
        cursor: events.find((event) => event.eventKey === url.searchParams.get('eventKey'))?.id ?? null,
      };

      if (
        control.hold &&
        control.holdKind !== 'history' &&
        url.searchParams.get('eventKey') === events.findLast((event) => event.type === 'declaration').eventKey
      )
        await new Promise((resolve) => {
          control.release = resolve;
          control.reached();
          held = true;
        });
    } else if (url.pathname.endsWith('/history')) {
      expect(url.searchParams.get('limit')).toBe('32');
      expect(url.searchParams.get('maxBytes')).toBe('16384');
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const selected = events.slice(after, Math.min(through, after + 32));
      const cursor = selected.at(-1)?.id ?? after;

      if (control.hold && control.holdKind === 'history' && after === events.length - 128) {
        await new Promise((resolve) => {
          control.release = resolve;
          control.reached();
          held = true;
        });
      }

      json = {
        ...common,
        after,
        through,
        cursor,
        streamHead: events.length,
        events: selected,
        reset: false,
        hasMore: cursor < through,
      };
    }

    await (json
      ? route.fulfill({ json })
      : route.fulfill({
          status: 404,
          json: { error: { code: 'fixture-not-found', message: 'Unavailable', status: 404 } },
        }));

    if (held) control.replyDone();
  });
  await page.goto(`/matches/${fixture.matchId}${width === 390 ? '/history' : ''}`);
  await expect(chapter(page)).toHaveAttribute('data-story-delivered', String(events.length));
  await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => document.fonts.ready);

  return control;
}

async function older(page) {
  const timeline = chapter(page);
  const after = Number(await timeline.getAttribute('data-story-after'));
  await timeline
    .locator('[data-story-key]')
    .first()
    .evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.keyboard.press('PageUp');
  await expect.poll(async () => Number(await timeline.getAttribute('data-story-after'))).toBeLessThan(after);
  await expect(timeline).toHaveAttribute('aria-busy', 'false');
}

async function pending(page, control) {
  control.hold = true;
  control.reply = new Promise((resolve) => {
    control.replyDone = resolve;
  });

  const reached = new Promise((resolve) => {
    control.reached = resolve;
  });

  await page.getByRole('button', { name: 'Final move', exact: true }).click();
  await reached;
}

async function release(page, control) {
  control.hold = false;
  control.release();
  await control.reply;
  await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function state(page) {
  return page.evaluate(() => {
    const visible = [...document.querySelectorAll('[data-story-key]')].find(
      (row) => row.getBoundingClientRect().bottom > 0 && row.getBoundingClientRect().top < innerHeight,
    );

    return {
      y: scrollY,
      active: {
        tag: document.activeElement?.tagName,
        event: document.activeElement?.getAttribute('data-event-key'),
        text: document.activeElement?.textContent.slice(0, 100),
      },
      modalFocus: Boolean(document.activeElement?.closest('[role=dialog]')),
      dialogs: document.querySelectorAll('[role=dialog]').length,
      visible: visible ? { key: visible.dataset.storyKey, y: visible.getBoundingClientRect().top } : null,
    };
  });
}

for (const width of [1440, 390, 320]) {
  for (const destination of ['portrait', 'portrait-closed', 'rule', 'chapter', 'keyboard', 'wheel']) {
    test(`${width}: pending Final move respects later ${destination} ownership`, async ({ page }, info) => {
      const control = await harness(page, width);

      // Keyboard-only from the already loaded window is the smallest repro: no eviction or modal needed.
      if (destination !== 'keyboard') await older(page);
      await pending(page, control);

      if (destination.startsWith('portrait') || destination === 'rule') {
        const trigger =
          destination === 'rule'
            ? page.locator('.dossier-outcome .dossier-term').first()
            : page.locator('.dossier-outcome .replay-agent-portrait');

        if (width === 1440) await trigger.click();
        else await trigger.tap();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect.poll(async () => (await state(page)).modalFocus).toBe(true);

        if (destination === 'portrait-closed') {
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
      } else if (destination === 'chapter') {
        await page.locator('.dossier-chapter-trigger').nth(0).click();
        await expect(chapter(page, 'I').locator('[data-event-key]').first()).toBeVisible();
        await expect(chapter(page, 'I')).toHaveAttribute('aria-busy', 'false');
        await chapter(page, 'I').locator('[data-event-key]').first().focus();
      } else if (destination === 'keyboard') {
        await page.keyboard.press('Tab');
      } else {
        await page.mouse.move(width / 2, 400);
        const y = await page.evaluate(() => scrollY);
        await page.mouse.wheel(0, 120);
        await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(y);
      }

      const before = await state(page);
      await release(page, control);
      const after = await state(page);
      await info.attach('ownership', {
        body: JSON.stringify({ before, after, requests: control.requests }, null, 2),
        contentType: 'application/json',
      });
      expect(after.active).toEqual(before.active);

      if (destination === 'wheel' && before.visible) {
        expect(after.visible?.key).toBe(before.visible.key);
        expect(Math.abs(after.visible.y - before.visible.y)).toBeLessThanOrEqual(1);
      } else expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(after.modalFocus).toBe(before.modalFocus);

      if (after.modalFocus) {
        await page.keyboard.press('Tab');
        await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      expect(control.faults).toEqual([]);
    });
  }

  test(`${width}: held navigation completes without new intent; fresh cached navigation still works`, async ({
    page,
  }, info) => {
    const control = await harness(page, width);
    await older(page);
    await pending(page, control);
    await release(page, control);
    const key = fixture.eventsFor('finished').findLast((event) => event.type === 'declaration').eventKey;
    const target = page.locator(`[data-event-key="${key}"]`);
    await expect(target).toBeFocused();
    expect(await chapter(page).locator('[data-story-key]').count()).toBeLessThanOrEqual(128);
    await info.attach('uninterrupted', {
      body: JSON.stringify(await state(page), null, 2),
      contentType: 'application/json',
    });

    // A second request must survive the first request's cleanup and completion focus.
    await page.locator('.dossier-chapter-trigger').nth(1).click();
    const button = page.getByRole('button', { name: 'Final move', exact: true });

    if (width === 1440) await button.press('Enter');
    else await button.tap();
    await expect(target).toBeFocused();
    await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
    expect(control.faults).toEqual([]);
  });

  test(`${width}: a new visibility scope retires the old held navigation`, async ({ page }, info) => {
    const control = await harness(page, width);
    await older(page);
    await pending(page, control);
    control.view.history.visibilityEpoch = 'route-revised';

    const checkpoint = page.waitForResponse((response) =>
      response.url().includes('/checkpoint?epoch=route-revised'),
    );

    control.socket.send(JSON.stringify({ type: 'observation', observation: control.view }));
    await checkpoint;
    await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
    // Establish a destination in the new scope; its initial anchor restoration may
    // still be walking, independently of the retired response we are about to release.
    await page.locator('.dossier-chapter-trigger').nth(0).click();
    await expect(chapter(page, 'I')).toHaveAttribute('aria-busy', 'false');
    await chapter(page, 'I').locator('[data-event-key]').first().focus();
    const before = await state(page);
    await release(page, control);
    expect(await state(page)).toEqual(before);
    await info.attach('scope', {
      body: JSON.stringify({ before, after: await state(page), requests: control.requests }, null, 2),
      contentType: 'application/json',
    });
    expect(control.faults).toEqual([]);
  });
}

test('unmount retires a held request; a fresh route visit can navigate', async ({ page }, info) => {
  const control = await harness(page);
  await pending(page, control);
  await page.getByRole('link', { name: 'Back to Succession arena' }).click();
  await expect(page.locator('.dossier')).toHaveCount(0);
  await expect(page.getByText('The arena', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'How to play', exact: true }).focus();
  const before = await state(page);
  control.hold = false;
  control.release();
  await control.reply;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await state(page)).toEqual(before);
  await info.attach('unmounted', {
    body: JSON.stringify({ before, after: await state(page) }),
    contentType: 'application/json',
  });
  await page.goBack();
  await expect(chapter(page)).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Final move', exact: true }).click();
  await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  expect(control.faults).toEqual([]);
});

test('intervention also cancels a held history page after anchor resolution', async ({ page }, info) => {
  const control = await harness(page);
  await older(page);
  control.holdKind = 'history';
  await pending(page, control);
  await page.locator('.dossier-outcome .replay-agent-portrait').click();
  await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  const before = await state(page);
  await release(page, control);
  const after = await state(page);
  expect(after.active).toEqual(before.active);
  expect(after.y).toBe(before.y);
  expect(after.modalFocus).toBe(true);
  await info.attach('held-page', {
    body: JSON.stringify({ before, after, requests: control.requests }, null, 2),
    contentType: 'application/json',
  });
  expect(control.faults).toEqual([]);
});

test('a fresh request supersedes a held one without retaining its old completion', async ({ page }, info) => {
  const control = await harness(page);
  await older(page);
  await pending(page, control);
  control.hold = false;
  await page.getByRole('button', { name: 'Final move', exact: true }).click();
  await expect(page.locator('[data-event-type="declaration"]').last()).toBeFocused();
  await page.locator('.dossier-outcome .replay-agent-portrait').click();
  await expect.poll(async () => (await state(page)).modalFocus).toBe(true);
  const before = await state(page);
  await release(page, control);
  expect(await state(page)).toEqual(before);
  await info.attach('superseded', {
    body: JSON.stringify({ before, after: await state(page) }, null, 2),
    contentType: 'application/json',
  });
  expect(control.faults).toEqual([]);
});
