import { expect, test } from '@playwright/test';
import { observe } from '../src/game/observation';
import { arena } from './motion-fixture';

test('original contours exclude the desktop corner and leave no speech join seam', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { state } = await arena(page);

  state.events.push({
    id: state.events.length + 1,
    at: state.createdAt + 1000,
    round: 1,
    type: 'chat',
    text: 'A claim needs evidence. I will listen before committing my vote.',
    seat: 4,
    visibility: 'public',
  });
  const view = observe(state);

  await page.route('**/api/matches/motion-table', (route) => route.fulfill({ json: view }));
  await page.routeWebSocket('**/api/matches/motion-table/events?*', (socket) =>
    socket.send(JSON.stringify({ type: 'observation', observation: view })),
  );
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const active = page.locator('.header nav a.active');

  await expect(active).toContainText('Arena');
  const nav = await active.boundingBox();

  if (!nav) throw new Error('Missing selected navigation bounds');
  await expect.soft(page).toHaveScreenshot('desktop-nav-step.png', {
    clip: { x: nav.x, y: nav.y, width: 12, height: 12 },
    maxDiffPixels: 0,
  });
  await page.locator('.header').screenshot({ path: testInfo.outputPath('nav.png') });
  await page.goto('/matches/motion-table');
  const speech = page.locator('.entry-speech').first();

  await expect(speech).toContainText('A claim needs evidence');
  await speech.scrollIntoViewIfNeeded();
  const body = await speech.locator('.event-content').boundingBox();

  if (!body) throw new Error('Missing speech contour bounds');
  await expect.soft(page).toHaveScreenshot('speech-tail-join.png', {
    clip: { x: body.x - 12, y: body.y + 20, width: 24, height: 28 },
    maxDiffPixels: 0,
  });
  await speech.screenshot({ path: testInfo.outputPath('speech.png') });
  await page.screenshot({ path: testInfo.outputPath('match.png'), fullPage: true });
});
