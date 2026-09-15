import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const origin = process.env.DOSSIER_ORIGIN ?? 'http://127.0.0.1:6291';

const directory =
  process.env.DOSSIER_EVIDENCE_DIR ??
  `docs/evidence/TIM-19-22-components/route${process.env.DOSSIER_PRODUCTION ? '-production' : ''}${process.env.DOSSIER_ROUTE_MODE ? `-${process.env.DOSSIER_ROUTE_MODE}` : ''}`;

await mkdir(directory, { recursive: true });

const loader = await createServer({
  configFile: false,
  cacheDir: '/tmp/opencode/dossier-fixture-cache',
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});

let fixture;

try {
  const module = await loader.ssrLoadModule('/.dossier/route-fixture.ts');
  fixture = await module.routeFixture();
} finally {
  await loader.close();
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

const checks = [];

const faults = [];

const failures = [];

let maxDOM = 0;

let maxDrift = 0;

function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

async function harness(width, mode, suffix = '', recoverPictures = false) {
  const page = await browser.newPage({
    viewport: { width, height: width === 1440 ? 1080 : 844 },
    reducedMotion: 'reduce',
  });

  page.on('pageerror', (error) => faults.push(error.message));

  const control = {
    mode,
    fail: false,
    requests: [],
    commands: [],
    socket: null,
    pictureReads: 0,
    imageRequests: 0,
  };

  const recovered = recoverPictures
    ? page.waitForResponse((response) => response.headers()['x-fixture-picture-revision'] === '2')
    : null;

  const observation = () => fixture.observation(control.mode, mode === 'controller' ? fixture.actor : null);
  await page.routeWebSocket('**/api/matches/*/events?*', (socket) => {
    control.socket = socket;
    socket.send(JSON.stringify({ type: 'observation', observation: observation() }));
  });
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    control.requests.push(url.pathname + url.search);
    const view = observation();
    const events = fixture.eventsFor(control.mode);

    const common = {
      protocolVersion: '2',
      gameId: 'succession',
      matchId: fixture.matchId,
      visibilityEpoch: view.history.visibilityEpoch,
    };

    if (url.pathname === '/api/agent-pictures') {
      control.pictureReads++;
      const stale = recoverPictures && control.pictureReads === 1;

      return route.fulfill({
        headers: { 'x-fixture-picture-revision': stale ? '1' : '2' },
        json: view.seats.map((seat) => ({
          agentId: seat.agentId,
          picture: stale
            ? {
                state: 'present',
                revision: 1,
                version: 'stale-fixture',
                url: `/api/agents/${seat.agentId}/picture/stale-fixture`,
                contentType: 'image/jpeg',
                width: 8,
                height: 8,
                bytes: 296,
              }
            : { state: 'missing', revision: recoverPictures ? 2 : 0 },
        })),
      });
    }

    if (url.pathname.endsWith('/picture/stale-fixture')) {
      control.imageRequests++;

      return route.fulfill({ status: 404 });
    }

    if (url.pathname.endsWith('/actions')) {
      const command = route.request().postDataJSON();
      control.commands.push(command);

      return route.fulfill({ json: { accepted: true, actionId: command.actionId, observation: view } });
    }

    if (url.pathname === `/api/matches/${fixture.matchId}`) return route.fulfill({ json: view });

    if (url.pathname.endsWith('/rounds'))
      return route.fulfill({
        json: {
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
        },
      });

    if (url.pathname.endsWith('/checkpoint'))
      return route.fulfill({
        json: fixture.checkpoint(control.mode, Number(url.searchParams.get('through'))),
      });

    if (url.pathname.endsWith('/history-anchor'))
      return route.fulfill({
        json: {
          ...common,
          cursor: events.find((event) => event.eventKey === url.searchParams.get('eventKey'))?.id ?? null,
        },
      });

    if (url.pathname.endsWith('/history')) {
      if (control.fail)
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: 'fixture-unavailable',
              message: 'Historical read temporarily unavailable',
              status: 503,
            },
          },
        });
      assert.equal(url.searchParams.get('limit'), '32');
      assert.equal(url.searchParams.get('maxBytes'), '16384');
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const selected = events.slice(after, Math.min(through, after + 32));
      const cursor = selected.at(-1)?.id ?? after;

      return route.fulfill({
        json: {
          ...common,
          after,
          through,
          cursor,
          streamHead: events.length,
          events: selected,
          reset: false,
          hasMore: cursor < through,
        },
      });
    }

    return route.fulfill({
      status: 404,
      json: { error: { code: 'fixture-not-found', message: 'Unavailable', status: 404 } },
    });
  });
  await page.goto(`${origin}/matches/${fixture.matchId}${suffix}`);
  await page
    .locator('.dossier-outcome')
    .waitFor()
    .catch(async (error) => {
      await writeFile(
        `${directory}/mount-failure.json`,
        JSON.stringify(
          { faults, body: await page.locator('body').innerText(), requests: control.requests },
          null,
          2,
        ),
      );
      throw error;
    });
  await page.evaluate(() => document.fonts.ready);

  return { page, control, recovered };
}

const chapter = (page, act) => page.getByRole('region', { name: `Act ${act} record`, exact: true });

const headings = (page) => page.locator('.dossier-chapter-trigger');

async function ready(timeline) {
  await timeline
    .locator('[data-story-key]')
    .first()
    .waitFor()
    .catch(async (error) => {
      await writeFile(
        `${directory}/reader-failure.json`,
        JSON.stringify({ body: await timeline.page().locator('body').innerText(), faults }, null, 2),
      );
      throw error;
    });
  await timeline
    .page()
    .waitForFunction(
      (element) => element.getAttribute('aria-busy') === 'false',
      await timeline.elementHandle(),
    );
}

try {
  for (const width of process.env.DOSSIER_ROUTE_MODE ? [] : [1440, 390, 320]) {
    const { page, control } = await harness(width, 'finished');
    const two = chapter(page, 'II');
    await ready(two);
    check(
      `${width}: compact completed outcome and chapter defaults`,
      (await headings(page).nth(0).getAttribute('aria-expanded')) === 'false' &&
        (await headings(page).nth(1).getAttribute('aria-expanded')) === 'true' &&
        (await page.locator('.dossier-outcome h1').textContent()).includes('wins'),
    );
    check(
      `${width}: actual route one reading surface`,
      (await page
        .locator('.succession-board, input[type=range], [role=tab], select, .history-paging')
        .count()) === 0,
    );
    check(
      `${width}: initial bounded source Act II`,
      (await two.locator('.dossier-row:not([data-source-act="2"])').count()) === 0 &&
        (await two.locator('[data-story-key]').count()) <= 128,
    );
    check(`${width}: archive starts hidden`, (await two.locator('.dossier-private').count()) === 0);
    check(
      `${width}: no document overflow`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${directory}/${width}-finished-entry.png` });
    await page.getByRole('checkbox', { name: /Show private archive/ }).check();
    await two.locator('.dossier-private').first().waitFor();
    check(`${width}: authorized archive rows reveal`, (await two.locator('.dossier-private').count()) > 0);
    await page.getByRole('checkbox', { name: /Show private archive/ }).uncheck();
    check(`${width}: archive hides again`, (await two.locator('.dossier-private').count()) === 0);
    const delivered = await two.getAttribute('data-story-delivered');
    await headings(page).nth(1).click();
    check(
      `${width}: closed panel removes its row UI`,
      (await page.locator('[data-story-key]').count()) === 0,
    );
    await headings(page).nth(1).click();
    await ready(two);
    check(
      `${width}: reopening retains reader window`,
      (await two.getAttribute('data-story-delivered')) === delivered,
    );
    const term = two.locator('.dossier-term').first();

    const fallback = await term.evaluate((element) => {
      let fiber = element[Object.keys(element).find((key) => key.startsWith('__reactFiber$'))];

      while (fiber) {
        const ref = fiber.memoizedProps?.fallbackFocus;

        if (ref?.current)
          return {
            tag: ref.current.tagName,
            text: ref.current.textContent,
            connected: ref.current.isConnected,
          };
        fiber = fiber.return;
      }

      return null;
    });

    await term.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => !!document.activeElement?.closest('[role=dialog]'));
    await headings(page)
      .nth(1)
      .evaluate((button) => button.click());
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
      .waitForFunction(
        (element) => document.activeElement === element,
        await headings(page).nth(1).elementHandle(),
        { timeout: 3000 },
      )
      .catch(async (error) => {
        failures.push(`${width}: chapter removal final focus`);
        await writeFile(
          `${directory}/${width}-chapter-focus-failure.json`,
          JSON.stringify(
            {
              fallback,
              error: error.message,
              state: await page.evaluate(() => ({
                active: { tag: document.activeElement?.tagName, id: document.activeElement?.id },
                expanded: [...document.querySelectorAll('.dossier-chapter-trigger')].map((button) =>
                  button.getAttribute('aria-expanded'),
                ),
                dialogs: document.querySelectorAll('[role=dialog]').length,
                rows: document.querySelectorAll('[data-story-key]').length,
              })),
            },
            null,
            2,
          ),
        );
        await page.screenshot({ path: `${directory}/${width}-chapter-focus-failure.png` });
      });

    if (!failures.includes(`${width}: chapter removal final focus`))
      checks.push(`${width}: active chapter help closes/restores surviving heading`);
    await headings(page).nth(1).focus();
    await page.keyboard.press('Enter');
    await ready(two);
    await headings(page).nth(0).click();
    const one = chapter(page, 'I');
    await ready(one);
    check(
      `${width}: both chapters retain exact source act`,
      (await one.locator('.dossier-row:not([data-source-act="1"])').count()) === 0 &&
        (await two.locator('.dossier-row:not([data-source-act="2"])').count()) === 0,
    );
    await one.locator('.dossier-departure').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/${width}-act-one-execution.png` });
    await headings(page).nth(0).click();

    if (width === 1440) {
      const seen = new Set();

      for (let step = 0; step < 23; step++) {
        await ready(two);
        const rows = two.locator('[data-story-key]');
        maxDOM = Math.max(maxDOM, await rows.count());
        (await rows.evaluateAll((rows) => rows.map((row) => row.dataset.storyKey))).forEach((key) =>
          seen.add(key),
        );
        const before = Number(await two.getAttribute('data-story-delivered'));

        if (before === fixture.eventsFor('finished').length) break;
        const tail = rows.last();
        const key = await tail.getAttribute('data-story-key');
        await tail.evaluate((element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
        const offset = (await tail.boundingBox()).y;
        await page.waitForFunction(
          ({ element, before }) =>
            Number(element.getAttribute('data-story-delivered')) > before &&
            element.getAttribute('aria-busy') === 'false',
          { element: await two.elementHandle(), before },
        );
        const retained = two.locator(`[data-story-key="${key}"]`);

        if (await retained.count())
          maxDrift = Math.max(maxDrift, Math.abs((await retained.boundingBox()).y - offset));
      }

      check(
        'production composition reads to terminal event through eviction',
        Number(await two.getAttribute('data-story-delivered')) === fixture.eventsFor('finished').length,
      );
      check('production DOM bounded to 128 visible records per reader', maxDOM <= 128);
      check('continuous production reader visits over 512 distinct records', seen.size > 512);

      const after = Number(await two.getAttribute('data-story-after'));
      await two
        .locator('[data-story-key]')
        .first()
        .evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.keyboard.press('PageUp');
      await page.waitForFunction(
        ({ element, after }) =>
          Number(element.getAttribute('data-story-after')) < after &&
          element.getAttribute('aria-busy') === 'false',
        { element: await two.elementHandle(), after },
      );
      await page.waitForFunction(
        (element) =>
          [...element.querySelectorAll('[data-story-key]')].some((row) => {
            const box = row.getBoundingClientRect();

            return box.bottom > 0 && box.top < innerHeight;
          }),
        await two.elementHandle(),
      );
      checks.push('production reader reverses through eviction with visible retained rows');
      await page.screenshot({ path: `${directory}/1440-bounded-history.png` });
    }

    check(
      `${width}: one ten-entrant query, no per-row picture metadata`,
      new Set(control.requests.filter((path) => path.startsWith('/api/agent-pictures?'))).size === 1 &&
        control.requests.filter((path) => path.startsWith('/api/agent-pictures?')).length <=
          (process.env.DOSSIER_PRODUCTION ? 1 : 2) &&
        !control.requests.some((path) => /\/api\/agents\/[^/]+\/picture/.test(path)),
    );
    check(`${width}: no legacy replay requests`, !control.requests.some((path) => path.includes('/replay?')));
    await page.close();
  }

  for (const mode of process.env.DOSSIER_ROUTE_MODE
    ? [process.env.DOSSIER_ROUTE_MODE]
    : ['active', 'controller', 'act1', 'interrupted']) {
    const { page, control } = await harness(390, mode);
    const current = fixture.observation(mode);
    const initialAct = current.act === 1 ? 0 : 1;
    await page.waitForFunction(({ buttons, act }) => buttons[act].getAttribute('aria-expanded') === 'true', {
      buttons: await headings(page).elementHandles(),
      act: initialAct,
    });
    check(
      `${mode}: current-act default`,
      (await headings(page).nth(initialAct).getAttribute('aria-expanded')) === 'true',
    );
    check(
      `${mode}: decisions only when entitled`,
      (await page.locator('.legal-actions button').count()) ===
        (mode === 'controller' ? current.decision.actions.length : 0),
    );

    if (mode === 'controller') {
      await ready(chapter(page, 'II'));
      await page.getByRole('button', { name: 'income', exact: true }).click();
      await page.getByText(/Accepted decision/).waitFor();
      const command = control.commands[0];
      check(
        'live command keeps authoritative phase/decision IDs',
        command.phaseId === current.phase.id &&
          command.decisionId === current.decision.id &&
          command.action.type === 'income',
      );
      await headings(page).nth(1).click();
      control.mode = 'finished';
      control.socket.send(
        JSON.stringify({ type: 'observation', observation: fixture.observation('finished', fixture.actor) }),
      );
      await page.getByRole('checkbox', { name: /Show private archive/ }).waitFor();
      check(
        'terminal epoch keeps explicit chapter closure and removes live commands',
        (await headings(page).nth(1).getAttribute('aria-expanded')) === 'false' &&
          (await page.locator('.legal-actions').count()) === 0,
      );
    }

    if (mode === 'interrupted')
      check(
        'interruption records no champion',
        (await page.locator('.dossier-outcome').textContent()).includes('no overall champion'),
      );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${directory}/390-${mode}.png` });
    await page.close();
  }

  const legacy = await harness(390, 'finished', '/history');
  await ready(chapter(legacy.page, 'II'));
  check(
    'existing /history URL uses the same continuous Dossier',
    (await legacy.page.locator('.dossier-outcome').count()) === 1 &&
      (await legacy.page.getByText('Load next record page').count()) === 0,
  );
  await legacy.page.close();

  if (process.env.DOSSIER_PRODUCTION) {
    const recovery = await harness(390, 'finished', '', true);
    await recovery.recovered;
    await recovery.page.locator('.dossier-outcome .dossier-portrait > svg').waitFor();
    await ready(chapter(recovery.page, 'II'));
    check('shared portrait reports failed delivery to its roster owner', recovery.control.imageRequests > 0);
    check('failed pictures use exactly one extra whole-roster read', recovery.control.pictureReads === 2);
    check(
      'newer removal metadata leaves an accessible fallback',
      (await recovery.page.locator('.dossier-outcome .dossier-portrait img').count()) === 0,
    );
    await recovery.page.screenshot({ path: `${directory}/390-picture-removal-recovery.png` });
    await recovery.page.close();
  }

  check('no application exceptions', faults.length === 0);

  if (maxDrift > 1) failures.push(`retained-row drift ${maxDrift}px exceeds 1px`);
  else checks.push('retained-row drift stays within 1px');
  await writeFile(
    `${directory}/checks.json`,
    JSON.stringify(
      {
        assertions: checks.length,
        checks,
        maxDOM,
        maxDrift,
        canonicalArchiveEvents: fixture.eventsFor('finished').length,
        interceptedBackend: true,
        actualMatchRoute: true,
        ruleHelpBaseline: 'ee2220f',
        failures,
        faults,
      },
      null,
      2,
    ),
  );
  console.log(
    `${checks.length} actual-route assertions passed; ${maxDOM} max visible records; ${maxDrift}px retained-row drift`,
  );
  assert.equal(failures.length, 0, 'See retained shared-interaction failures');
} finally {
  await browser.close();
}
