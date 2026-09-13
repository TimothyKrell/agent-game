import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { interruptMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import type { Observation } from '../src/game/types';
import { arena, completed } from './motion-fixture';
import { observeMotion, visibility } from './motion-observer';
import { expectTimelineFiltersBounded } from './timeline-bounds';

test('native-size motion review scenes', async ({ page }, info) => {
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const started = Date.now();
  const scenes: { name: string; offsetMs: number }[] = [];
  const mark = (name: string) => scenes.push({ name, offsetMs: Date.now() - started });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await observeMotion(page);
  const { state } = await arena(page);
  const complete = completed(state);

  const partial = observe(
    interruptMatch(state, state.createdAt + 60_000, 'The match record was interrupted.'),
  );

  state.events.push(
    ...Array.from({ length: 35 }, (_, index) => ({
      id: state.events.length + index + 1,
      at: state.createdAt + index * 1000,
      round: 1,
      type: 'chat',
      visibility: 'public' as const,
      seat: index % 10,
      text: `Discussion ${index + 1}: Let’s consider the proposed government and keep the record in view.`,
    })),
  );

  let record = observe(state);

  let send = (_view: Observation): void => {
    throw new Error('Live recording socket not connected');
  };

  await page.route('**/api/matches/motion-table', (route) => route.fulfill({ json: record }));
  await page.routeWebSocket('**/api/matches/motion-table/events?*', (socket) => {
    send = (view) => socket.send(JSON.stringify({ type: 'observation', observation: view }));
    send(record);
  });

  // Real-time holds are intentional review evidence, not synchronization for functional assertions.
  mark('homepage-navigation');
  await page.goto('/');
  await expect(page.locator('.splash-copy')).toBeVisible();
  await page.waitForTimeout(2000);
  mark('artwork-first-viewport');
  await page.locator('.splash-art').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  if (info.project.use.viewport?.width === 1600) {
    mark('art-hover');
    await page.locator('.splash-art').hover();
    await page.waitForTimeout(1000);
    mark('art-leave');
    await page.mouse.move(8, 8);
  } else {
    await page.locator('.splash-copy').scrollIntoViewIfNeeded();
    await page.locator('.splash-art').scrollIntoViewIfNeeded();
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: info.outputPath('splash-settled.png') });
  const entranceTrace = await page.evaluate(() => window.motionTrace);
  const action = page.locator('.splash-copy').getByRole('link', { name: 'Connect your agent' });
  await action.scrollIntoViewIfNeeded();
  mark('control-hover');
  await action.hover();
  await page.waitForTimeout(300);
  mark('control-press');
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(8, 8);
  await page.mouse.up();
  await action.focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(400);
  await expect(action).toBeFocused();
  await page.screenshot({ path: info.outputPath('keyboard-focus.png') });

  await page.locator('.splash-copy').getByRole('link', { name: 'Watch the games' }).click();
  await page.locator('.match-option').nth(1).scrollIntoViewIfNeeded();
  mark('table-selection');
  await page.locator('.match-option').nth(1).click();
  await page.waitForTimeout(700);
  mark('tab-selection');
  await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Live matches', exact: true }).click();
  await page.locator('.match-option').nth(0).click();
  await page.locator('.match-option').nth(1).click();
  await page.locator('.match-option').nth(1).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('selection-settled.png') });

  mark('public-route-entry');
  await page.locator('.header nav').getByRole('link', { name: 'How to play' }).click();
  await page.waitForTimeout(700);
  await page.goBack();
  await page.waitForTimeout(500);
  const controlTrace = await page.evaluate(() => window.motionTrace);

  mark('live-record');
  await page.goto('/matches/motion-table');
  const list = page.getByLabel('Match timeline', { exact: true });
  await list.scrollIntoViewIfNeeded();
  await list.evaluate((element) => {
    element.scrollTop = 350;
    element.dispatchEvent(new Event('scroll'));
  });
  const anchor = await list.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(500);
  state.events.push({
    id: state.events.length + 1,
    at: state.createdAt + 40_000,
    round: 1,
    type: 'chat',
    visibility: 'public',
    seat: 3,
    text: 'A new thought arrives while you are reading an earlier discussion.',
  });
  mark('live-update-away-from-bottom');
  send(observe(state, null, record.cursor));
  await expect(page.getByRole('button', { name: '1 new event · Jump to latest' })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(anchor, 0);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '1 new event · Jump to latest' }).click();
  await page.locator('.discussion-toggle').first().click();
  await page.waitForTimeout(350);
  await page.locator('.discussion-toggle').first().click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Discussion', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Everything', exact: true }).click();
  await expectTimelineFiltersBounded(page);
  await page.getByLabel('Browse by round').selectOption('1');
  await page.waitForTimeout(500);

  mark('hidden-live-update');
  await visibility(page, 'hidden');
  send(partial);
  await expect(page.getByRole('heading', { name: 'Match interrupted.' })).toBeVisible();
  await page.waitForTimeout(500);
  await visibility(page, 'visible');
  await page.locator('.match-result').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('hidden-return-settled.png') });
  const liveTrace = await page.evaluate(() => window.motionTrace);

  for (const archive of [complete, partial]) {
    record = archive;
    mark(`${archive.status}-result-navigation`);
    await page.goto('/matches/motion-table');
    await expect(page.locator('.match-result')).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: info.outputPath(`${archive.status}-result-settled.png`) });
    const slider = page.getByRole('slider', { name: 'Replay event' });
    await page.getByRole('button', { name: 'Play from start' }).click();
    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await slider.fill('0');
    await expect(page.getByLabel('At selected event')).toContainText('Setup record');
    await slider.fill(String(archive.events.length));
    await page.getByLabel('Browse by round').selectOption('1');
    await page.waitForTimeout(500);
    await expect(page.locator('.final-track.safeguard b')).toHaveText(String(archive.tracks.safeguards));
    await expect(page.locator('.final-track.override b')).toHaveText(String(archive.tracks.overrides));
  }

  mark('preference-interruption');
  await page.goto('/');
  await page.locator('.splash-art').scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(700);
  await page.emulateMedia({ reducedMotion: info.project.use.reducedMotion });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: info.outputPath('preference-return-settled.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    info.outputPath('scenes.json'),
    JSON.stringify(
      {
        source,
        viewport: info.project.use.viewport,
        reducedMotion: info.project.use.reducedMotion,
        pointer: info.project.use.hasTouch ? 'coarse touch' : 'fine',
        started,
        scenes,
        entranceTrace,
        controlTrace,
        liveTrace,
        finalTrace: await page.evaluate(() => window.motionTrace),
        visibility:
          'Simulated visibilityState boundary; actual subscriptions, cancellation and observation updates.',
        frameTiming:
          'Unmodified real-time WebM. Scene clock begins after page creation; samples use nearest video frame. Animation traces record browser performance time and actual timing options.',
      },
      null,
      2,
    ),
  );
});
