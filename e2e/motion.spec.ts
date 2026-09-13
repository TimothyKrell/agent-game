import { expect, test } from '@playwright/test';
import { interruptMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import type { Observation } from '../src/game/types';
import { observeMotion, visibility } from './motion-observer';
import { arena } from './motion-fixture';

test.use({ video: 'on' });

test.beforeEach(async ({ page }) => observeMotion(page));

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`motion preserves keyboard selection and settled geometry (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: reducedMotion === 'reduce' ? 390 : 1600, height: 1000 });
    await arena(page);
    await page.goto('/');
    const connect = page.locator('.splash-copy').getByRole('link', { name: 'Connect your agent' });
    await expect(connect).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.splash-copy')).toHaveAttribute('data-motion-settled', 'true');
    await connect.focus();
    await expect(connect).toBeFocused();
    expect(await connect.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await connect.hover();
    await expect(connect).toBeFocused();
    await page.screenshot({ path: `/tmp/opencode/motion-controls-${reducedMotion}.png` });

    const second = page.locator('.match-option').nth(1);
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute('aria-pressed', 'true');

    const choices = await page.evaluate(
      () => window.motionTrace.filter((entry) => entry.target === 'selected-intro').length,
    );

    expect(choices).toBe(reducedMotion === 'reduce' ? 0 : 1);
    await page.keyboard.press('Enter');
    expect(
      await page.evaluate(
        () => window.motionTrace.filter((entry) => entry.target === 'selected-intro').length,
      ),
    ).toBe(choices);
    await expect(
      page.getByRole('region', { name: 'Selected table' }).getByRole('link', { name: 'Watch this table' }),
    ).toHaveAttribute('href', '/matches/second-table');
    const recent = page.getByRole('button', { name: 'Recent replays', exact: true });
    await recent.focus();
    await page.keyboard.press('Enter');
    await expect(recent).toBeFocused();
    await expect(recent).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Selected table' })).toContainText(
      'An interrupted record.',
    );
    await page.screenshot({ path: `/tmp/opencode/motion-selection-${reducedMotion}.png` });

    await page.locator('.header nav').getByRole('link', { name: 'How to play' }).click();
    await expect(page.getByRole('heading', { name: 'The rules of trust.' })).toBeVisible();
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.goBack();
    await page.goBack();
    await expect(page.locator('.splash-copy')).toHaveAttribute('data-motion-settled', 'true');
    expect(await page.locator('.splash-copy h1').evaluate((element) => element.getAnimations().length)).toBe(
      0,
    );

    if (reducedMotion === 'reduce') expect(await page.evaluate(() => window.motionTrace)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`live reading and replay remain stable with motion (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: reducedMotion === 'reduce' ? 390 : 1600, height: 1000 });
    const { state } = await arena(page);

    state.events.push(
      ...Array.from({ length: 40 }, (_, index) => ({
        id: state.events.length + index + 1,
        at: state.createdAt + index * 1000,
        round: 1,
        type: 'chat',
        visibility: 'public' as const,
        seat: index % 10,
        text: `Discussion ${index + 1}: Read the proposed government carefully before casting your ballot.`,
      })),
    );

    const initial = observe(state);

    let send = (_view: Observation): void => {
      throw new Error('Socket is not connected');
    };

    await page.route('**/api/matches/motion-table', (route) => route.fulfill({ json: initial }));
    await page.routeWebSocket('**/api/matches/motion-table/events?*', (socket) => {
      send = (view) => socket.send(JSON.stringify({ type: 'observation', observation: view }));
      send(initial);
    });
    await page.goto('/matches/motion-table');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    const list = page.getByLabel('Match timeline', { exact: true });
    await list.scrollIntoViewIfNeeded();
    await list.evaluate((element) => {
      element.scrollTop = 350;
      element.dispatchEvent(new Event('scroll'));
    });
    const position = await list.evaluate((element) => element.scrollTop);
    await visibility(page, 'hidden');
    state.events.push({
      id: state.events.length + 1,
      at: state.createdAt + 45_000,
      round: 1,
      type: 'phase',
      visibility: 'public',
      text: 'The Coordinator is choosing an Executor nominee.',
    });
    send(observe(state, null, initial.cursor));
    const catchup = page.getByRole('button', { name: '1 new event · Jump to latest' });
    await expect(catchup).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'static');
    await visibility(page, 'visible');
    await expect(page.locator('html')).toHaveAttribute(
      'data-motion',
      reducedMotion === 'reduce' ? 'static' : 'enabled',
    );
    expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
    expect(await list.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await catchup.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
      .toBeLessThan(2);

    send(
      observe(interruptMatch(state, state.createdAt + 60_000, 'The supplied match record was interrupted.')),
    );
    await expect(page.getByRole('heading', { name: 'Match interrupted.' })).toBeVisible();
    await page.locator('.match-result').scrollIntoViewIfNeeded();
    await expect(page.locator('.match-result')).toHaveAttribute('data-motion-settled', 'true');

    const resultEntries = await page.evaluate(
      () => window.motionTrace.filter((entry) => entry.target === 'H1').length,
    );

    const slider = page.getByRole('slider', { name: 'Replay event' });
    await slider.focus();
    await slider.fill('0');
    await expect(slider).toBeFocused();
    await expect(page.getByLabel('At selected event')).toContainText('Setup record');
    await expect(page.locator('.final-track.safeguard b')).toHaveText('0');
    await expect(page.locator('.final-track.override b')).toHaveText('0');
    await page.getByRole('button', { name: 'Play from start' }).click();
    await expect.poll(() => slider.inputValue()).not.toBe('0');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await slider.inputValue();
    await page.getByRole('button', { name: 'Discussion', exact: true }).click();
    await expect(slider).toHaveValue(paused);
    expect(
      await page.evaluate(() => window.motionTrace.filter((entry) => entry.target === 'H1').length),
    ).toBe(resultEntries);
    expect(await list.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.screenshot({ path: `/tmp/opencode/motion-replay-${reducedMotion}.png`, fullPage: true });
  });
}

test('changing motion preference stops decoration immediately and keeps loading understandable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await arena(page);
  await page.goto('/');
  await expect(page.locator('.table-artwork')).toBeVisible();
  await page.locator('.splash-art').scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator('.art-rings-entry').evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await expect(page.locator('.table-artwork')).toHaveCSS('opacity', '1');
  const entrances = await page.evaluate(() => window.motionTrace.length);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'enabled');
  expect(await page.evaluate(() => window.motionTrace.length)).toBe(entrances);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: '/tmp/opencode/motion-reduced-splash-390.png' });

  let release = () => {};

  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/matches/loading', async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: { error: { message: 'Please retry the record.' } } });
  });
  await page.goto('/matches/loading');
  await expect(page.getByRole('status')).toContainText('Loading');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.screenshot({ path: '/tmp/opencode/motion-reduced-loading-390.png' });
  release();
  await expect(page.getByRole('alert')).toContainText('Please retry the record.');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
});

test('hidden entrances are consumed and an authoritative arena fallback stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1600, height: 1120 });
  const { bootstrap } = await arena(page);
  let reads = 0;
  await page.route('**/api/bootstrap', (route) => {
    reads++;

    return route.fulfill({ json: bootstrap });
  });
  await page.goto('/');
  await expect
    .poll(() => page.locator('.art-rings-entry').evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  await visibility(page, 'hidden');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  const calls = await page.evaluate(() => window.motionTrace.length);
  await visibility(page, 'visible');
  await expect(page.locator('.splash-art')).toHaveAttribute('data-motion-settled', 'true');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.motionTrace.length)).toBe(calls);

  await page.locator('.match-option').nth(1).click();
  await page
    .locator('.selected-intro')
    .evaluate((element) => element.setAttribute('data-test-retained', 'yes'));
  const explicit = await page.evaluate(() => window.motionTrace.length);
  bootstrap.live.pop();
  await expect.poll(() => reads, { timeout: 17_000 }).toBeGreaterThan(1);
  await expect(
    page.locator('.selected-match').getByRole('link', { name: 'Watch this table' }),
  ).toHaveAttribute('href', '/matches/motion-table');
  await expect(page.locator('.selected-intro')).toHaveAttribute('data-test-retained', 'yes');
  expect(await page.evaluate(() => window.motionTrace.length)).toBe(explicit);
  await page.evaluate(() => {
    history.pushState({}, '', '/?code=query-only');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(await page.evaluate(() => window.motionTrace.length)).toBe(explicit);
});
