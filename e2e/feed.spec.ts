import { expect, test } from '@playwright/test';
import { createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import type { Observation } from '../src/game/types';

test('timeline preserves reading position on live updates and names archived voters', async ({ page }) => {
  const state = createMatch(
    'match_feed',
    Array.from({ length: 10 }, (_, i) => ({
      agentId: `agent-${i}`,
      ownerId: `owner-${i}`,
      name: `Agent ${i}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
  );

  const observation = observe(state);
  observation.events = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    at: state.createdAt + i * 1000,
    round: Math.floor(i / 10) + 1,
    type: 'chat',
    seat: i % 10,
    text: `Discussion ${i + 1}: Let’s review the last government before choosing our next Executor.`,
  }));
  observation.cursor = 40;
  await page.route('**/api/matches/match_feed', (route) => route.fulfill({ json: observation }));

  let send = (_value: Observation): void => {
    throw new Error('Socket not connected');
  };

  await page.routeWebSocket('**/api/matches/match_feed/events?*', (socket) => {
    send = (value) => socket.send(JSON.stringify({ type: 'observation', observation: value }));
  });
  await page.goto('/matches/match_feed');
  const list = page.getByLabel('Match timeline');
  await expect(list).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect
    .poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
    .toBeLessThan(2);
  await list.evaluate((element) => {
    element.scrollTop = 350;
    element.dispatchEvent(new Event('scroll'));
  });
  const position = await list.evaluate((element) => element.scrollTop);

  const event = {
    id: 41,
    at: state.createdAt + 41000,
    round: 4,
    type: 'policy',
    text: 'The government enacts a safeguard.',
    data: { policy: 'safeguard', safeguards: 1, overrides: 2 },
  };

  send({ ...observation, reset: false, cursor: 41, events: [event] });
  await expect(page.getByRole('button', { name: '1 new event · Jump to latest' })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByRole('button', { name: '1 new event · Jump to latest' }).click();
  await expect
    .poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
    .toBeLessThan(2);
  await expect(list.getByText('Safeguard enacted', { exact: true })).toBeVisible();
  send({
    ...observation,
    status: 'finished',
    winner: 'cooperative',
    winReason: 'five safeguards enacted',
    reset: true,
    cursor: 43,
    events: [
      ...observation.events,
      event,
      {
        id: 42,
        at: state.createdAt + 42000,
        round: 4,
        type: 'ballot',
        seat: 2,
        text: 'You voted reject.',
        data: { approve: false },
      },
      {
        id: 43,
        at: state.createdAt + 43000,
        round: 4,
        type: 'election',
        text: 'Government rejected: 1 approve, 2 reject.',
        data: { approved: false, votes: { 0: true, 1: false, 2: false } },
      },
    ],
  });
  await expect(list.getByText(`${observation.seats[2].name} voted reject.`, { exact: true })).toBeVisible();
  await expect(list.getByText('You voted reject.', { exact: true })).toHaveCount(0);
  await expect(list.getByLabel('Revealed ballots').locator('> span')).toHaveCount(3);
  await page.screenshot({ path: '/tmp/opencode/feed-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/opencode/feed-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Discussion', exact: true }).click();
  await expect(list.locator('.event-positive')).toHaveCount(0);
  await expect(list.locator('.event-chat')).toHaveCount(40);
});
