import { createServer } from 'node:http';
import { once } from 'node:events';
import { Schema } from 'effect';
import { expect, test, type Page } from '@playwright/test';
import { GameBootstrapSchema } from '../../../src/shared/api';
import { summaryAgentIds } from '../summary-entrants';

const origin = 'http://127.0.0.1:6372';

test.beforeAll(async ({ request }) => {
  const seed = await request.post('/__probe/seed');
  expect(seed.ok(), await seed.text()).toBe(true);
});

function requestsFor(page: Page) {
  const batches: string[][] = [];
  const observations: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());

    if (url.pathname === '/api/agent-pictures') batches.push(url.searchParams.getAll('agentId'));

    if (url.pathname.startsWith('/api/matches/')) observations.push(url.pathname);
  });

  return {
    batches,
    check: () => {
      expect(errors).toEqual([]);
      expect(observations).toEqual([]);
    },
  };
}

async function selectedPictures(page: Page, group: number) {
  const seats = page.locator('.selected-seats');
  await seats.scrollIntoViewIfNeeded();
  await expect(seats.locator('[data-entrant-id]')).toHaveCount(10);
  expect(
    await seats
      .locator('[data-entrant-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-entrant-id'))),
  ).toEqual(summaryAgentIds(group));
  await expect(seats.locator('img')).toHaveCount(10);
  await expect
    .poll(() =>
      seats
        .locator('img')
        .evaluateAll((nodes) =>
          nodes.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1,
          ),
        ),
    )
    .toBe(true);
  await expect(seats).toContainText('A'.repeat(40));
  await expect(seats).not.toContainText('Renamed');
  await expect(seats.locator('[data-entrant-id^="replacement"]')).toHaveCount(0);
}

for (const gameId of ['secret-overlord', 'succession'] as const) {
  test(`${gameId}: actual bootstrap hydrates original participants and only the selected table fetches pictures`, async ({
    page,
    request,
  }) => {
    const response = await request.get(`/api/bootstrap?gameId=${gameId}`);
    expect(response.ok(), await response.text()).toBe(true);
    // One participant SQL read per bounded page: two live matches and one archived match.
    expect(JSON.parse(response.headers()['x-summary-participant-bindings']).sort()).toEqual([1, 2]);
    const bootstrap = Schema.decodeUnknownSync(GameBootstrapSchema)(await response.json());
    expect(bootstrap.live).toHaveLength(2);
    expect(bootstrap.recent).toHaveLength(1);
    expect(bootstrap.recent[0].entrants).toEqual(
      summaryAgentIds(0).map((agentId, number) => ({
        number,
        agentId,
        name: bootstrap.recent[0].names[number],
      })),
    );

    for (const [index, match] of bootstrap.live.entries()) {
      expect(match.entrants).toEqual(
        summaryAgentIds(index).map((agentId, number) => ({ number, agentId, name: match.names[number] })),
      );
    }

    const metadata = await request.get(
      `/api/agent-pictures?${summaryAgentIds(0)
        .map((agentId) => `agentId=${agentId}`)
        .join('&')}`,
    );

    expect(metadata.ok(), await metadata.text()).toBe(true);
    expect(metadata.headers()['x-summary-participant-bindings']).toBe('[]');

    const run = requestsFor(page);
    await page.goto(`/?gameId=${gameId}`);
    await selectedPictures(page, 0);
    expect(run.batches).toEqual([summaryAgentIds(0)]);

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const trigger = page.locator('.selected-seats [data-entrant-id]').first();
      await trigger.focus();
      await trigger.press(width === 390 ? 'Space' : 'Enter');
      const dialog = page.getByRole('dialog', { name: 'A'.repeat(40), exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close profile picture' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Home ${gameId} ${width}`,
      ).toBe(true);
      await page
        .locator('.selected-seats')
        .screenshot({ path: `test-results/agent-summaries/captures/${gameId}-${width}.png` });
    }

    await page.locator('.match-option').nth(1).click();
    await selectedPictures(page, 1);
    expect(run.batches).toEqual([summaryAgentIds(0), summaryAgentIds(1)]);
    await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
    await selectedPictures(page, 0);
    expect(run.batches).toEqual([summaryAgentIds(0), summaryAgentIds(1), summaryAgentIds(0)]);
    run.check();
  });
}

for (const compatibility of ['omitted', 'empty', 'unavailable', 'partial'] as const) {
  test(`${compatibility} summary metadata retains honest legacy fallback and bounded reads`, async ({
    page,
  }) => {
    const run = requestsFor(page);
    await page.route('**/api/bootstrap*', async (route) => {
      const response = await route.fetch();
      const value = Schema.decodeUnknownSync(GameBootstrapSchema)(await response.json());

      const live =
        compatibility === 'empty'
          ? []
          : value.live.map((match) => {
              const { entrants, ...old } = match;

              return compatibility === 'omitted'
                ? old
                : {
                    ...old,
                    entrants:
                      compatibility === 'unavailable'
                        ? []
                        : entrants?.filter((entrant) => entrant.number !== 3),
                  };
            });

      await route.fulfill({ response, json: { ...value, live } });
    });
    await page.goto('/');

    if (compatibility === 'empty') await expect(page.locator('.waiting-table')).toBeVisible();
    else {
      await expect(page.locator('.selected-seats')).toBeVisible();
      await expect(page.locator('.selected-seats .avatar')).toHaveCount(compatibility === 'partial' ? 1 : 10);

      if (compatibility === 'partial') {
        await expect(page.locator('.selected-seats [data-entrant-id]')).toHaveCount(9);
        await expect(page.locator('.selected-seats > div').nth(3)).toContainText('Historical entrant 3');
        await expect(
          page.locator('.selected-seats > div').nth(4).locator('[data-entrant-id]'),
        ).toHaveAttribute('data-entrant-id', summaryAgentIds(0)[4]);
        await expect.poll(() => run.batches.length).toBe(1);
      }
    }

    expect(run.batches).toEqual(
      compatibility === 'partial' ? [summaryAgentIds(0).filter((_, seat) => seat !== 3)] : [],
    );
    run.check();
  });
}

test('selected Home A → B → A retires its native HTTP request and cannot display the late A response on B', async ({
  page,
}) => {
  const run = requestsFor(page);
  const records: { ids: string[]; aborted: boolean; release: () => void }[] = [];
  const failures: string[] = [];

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', origin);
      const result = await fetch(url);
      const bytes = Buffer.from(await result.arrayBuffer());
      let sent = false;

      const record = {
        ids: url.searchParams.getAll('agentId'),
        aborted: false,
        release: () => {
          sent = true;
          response.writeHead(result.status, {
            'content-type': result.headers.get('content-type') ?? 'application/octet-stream',
          });
          response.end(bytes);
        },
      };

      response.on('close', () => {
        if (!sent) record.aborted = true;
      });

      if (url.pathname === '/api/agent-pictures') {
        records.push(record);

        if (records.length === 1) return;
      }

      record.release();
    })().catch((error) => {
      failures.push(String(error));
      response.destroy();
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());

  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect.poll(() => records.length).toBe(1);
    await expect(page.locator('.selected-seats img')).toHaveCount(0);
    await page.locator('.match-option').nth(1).click();
    await selectedPictures(page, 1);
    await expect.poll(() => records[0].aborted).toBe(true);
    records[0].release();
    await selectedPictures(page, 1);
    await page.locator('.match-option').first().click();
    await selectedPictures(page, 0);
    expect(records.map((record) => record.ids)).toEqual([
      summaryAgentIds(0),
      summaryAgentIds(1),
      summaryAgentIds(0),
    ]);
    expect(run.batches).toEqual([summaryAgentIds(0), summaryAgentIds(1), summaryAgentIds(0)]);
    run.check();
    expect(failures).toEqual([]);
  } finally {
    await page.close();
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
