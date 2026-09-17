import { expect, test } from '@playwright/test';
import { createCodingFinale, observeCodingFinale } from '../src/game/coding-finale/game';
import { gameDescriptor } from '../src/game/descriptors';

test('Act I status stays contained and keeps table controls beside the phase', async ({ page }) => {
  const { state } = await createCodingFinale(
    'status-layout',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `status-${seat}`,
      ownerId: null,
      name: seat === 0 ? 'Echo' : 'Cipher',
      house: true,
      rating: 1000,
    })),
    Date.now(),
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
      },
    },
  );

  const view = observeCodingFinale(state, null);

  if (!view.actOne) throw new Error('Expected Act I');
  view.actOne.round = 8;
  view.actOne.coordinator = 0;
  view.actOne.executor = 1;
  view.actOne.power = 'execute';
  view.actOne.phase.kind = 'executive-discussion';
  view.actOne.phase.deadline = Date.now() + 26_000;
  view.actOne.tracks.safeguards = 3;
  view.actOne.tracks.overrides = 5;
  view.seats[9].alive = false;

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === '/api/bootstrap')
      return route.fulfill({
        json: {
          name: 'Agent Game',
          mode: 'preview',
          authProviders: [],
          localLogin: false,
          owner: null,
          live: [],
          recent: [],
          leaderboard: [],
          queueCount: 0,
          houseAvailable: true,
        },
      });

    if (path === `/api/matches/${state.id}`) return route.fulfill({ json: view });

    return route.fulfill({ status: 404, json: { error: { message: 'Not available' } } });
  });
  let reconnecting = false;
  await page.routeWebSocket('**/events?protocol=3', (socket) => {
    if (!reconnecting) socket.send(JSON.stringify({ type: 'observation', observation: view }));
  });
  await page.goto(`/matches/${state.id}`);
  const bar = page.getByRole('region', { name: 'Current match state', exact: true });
  await expect(bar).toBeVisible();

  for (const width of [1571, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });

    const overflow = await bar.evaluate((element) => {
      const bounds = element.getBoundingClientRect();

      return [...element.querySelectorAll('*')].flatMap((child) => {
        const box = child.getBoundingClientRect();

        return box.width > 0 && (box.left < bounds.left || box.right > bounds.right) ? [child.className] : [];
      });
    });

    expect(overflow, `status overflow at ${width}px`).toEqual([]);

    if (width >= 768) {
      const phase = await bar.locator('.cf-status-phase strong').boundingBox();
      const button = await bar.getByRole('button', { name: 'Table & seats' }).boundingBox();
      expect(phase).not.toBeNull();
      expect(button).not.toBeNull();
      expect(Math.abs((phase?.y ?? 0) - (button?.y ?? 0)), `stranded control at ${width}px`).toBeLessThan(20);
    }

    await bar.screenshot({ path: test.info().outputPath(`status-default-${width}.png`) });
  }

  view.seats[0].name = 'CoordinatorWithAnUnbrokenFortyCharacterName';
  view.seats[1].name = 'Executor with a particularly long name';
  view.seats[2].recoverable = true;
  reconnecting = true;
  await page.reload();
  await expect(bar).toContainText(view.seats[0].name);

  for (const width of [1571, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(bar.getByRole('button', { name: 'Table & seats' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`status-${width}.png`) });
  }

  await bar.getByRole('button', { name: 'Table & seats' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
