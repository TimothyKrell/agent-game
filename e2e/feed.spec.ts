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

  state.events.push(
    ...Array.from({ length: 40 }, (_, i) => ({
      id: state.events.length + i + 1,
      at: state.createdAt + i * 1000,
      round: Math.floor(i / 10) + 1,
      type: 'chat',
      visibility: 'public' as const,
      seat: i % 10,
      text: `Discussion ${i + 1}: Let’s review the last government before choosing our next Executor.`,
    })),
  );
  const observation = observe(state);
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
    id: state.events.length + 1,
    at: state.createdAt + 41000,
    round: 4,
    type: 'policy',
    visibility: 'public' as const,
    text: 'The government enacts a safeguard.',
    data: { policy: 'safeguard', safeguards: 1, overrides: 2 },
  };

  state.events.push(event);
  send(observe(state, null, observation.cursor));
  await expect(page.getByRole('button', { name: '1 new event · Jump to latest' })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByRole('button', { name: '1 new event · Jump to latest' }).click();
  await expect
    .poll(() => list.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
    .toBeLessThan(2);
  await expect(list.getByText('Safeguard enacted', { exact: true })).toBeVisible();
  await list.evaluate((element) => {
    element.scrollTop = 350;
    element.dispatchEvent(new Event('scroll'));
  });

  const anchor = await list.locator('.game-event').evaluateAll((rows) => {
    const top = rows[0].parentElement!.getBoundingClientRect().top;
    const row = rows.find((entry) => entry.getBoundingClientRect().bottom > top)!;

    return { text: row.querySelector('p')!.textContent!, top: row.getBoundingClientRect().top - top };
  });

  state.events.push(
    {
      id: state.events.length + 1,
      at: state.createdAt + 42000,
      round: 4,
      type: 'ballot',
      visibility: 2,
      seat: 2,
      text: 'You voted reject.',
      data: { approve: false },
    },
    {
      id: state.events.length + 2,
      at: state.createdAt + 43000,
      round: 4,
      type: 'election',
      visibility: 'public',
      text: 'Government rejected: 1 approve, 2 reject.',
      data: { approved: false, votes: { 0: true, 1: false, 2: false } },
    },
  );
  state.phase.kind = 'finished';
  state.finishedAt = state.createdAt + 43000;
  state.winner = 'cooperative';
  state.winReason = 'five safeguards enacted';
  const archive = observe(state);
  const liveAnchor = observation.events.find((entry) => entry.text === anchor.text)!;
  const archivedAnchor = archive.events.find((entry) => entry.text === anchor.text)!;
  expect(archivedAnchor.id).not.toBe(liveAnchor.id);
  send(archive);
  await expect(list.locator('.event-private')).not.toHaveCount(0);

  const anchoredRow = list
    .locator('.game-event')
    .filter({ has: page.getByText(anchor.text, { exact: true }) });

  await expect
    .poll(() =>
      anchoredRow.evaluate(
        (row) => row.getBoundingClientRect().top - row.parentElement!.getBoundingClientRect().top,
      ),
    )
    .toBeCloseTo(anchor.top, 0);
  await expect(page.getByRole('button', { name: /new events? · Jump to latest/ })).toHaveCount(0);
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

test('timeline attributes public actions and archived investigation recipients', async ({ page }) => {
  const state = createMatch(
    'match_actors',
    Array.from({ length: 10 }, (_, i) => ({
      agentId: `agent-${i}`,
      ownerId: `owner-${i}`,
      name: `Agent ${i}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
  );

  const actions: Pick<Observation['events'][number], 'type' | 'text' | 'data'>[] = [
    { type: 'execution', text: 'Agent 9 is executed.', data: { target: 9 } },
    {
      type: 'special-election',
      text: 'Agent 8 is appointed to lead a special election.',
      data: { target: 8 },
    },
    { type: 'veto-request', text: 'The Executor requests a veto.' },
    { type: 'veto-response', text: 'The Coordinator agrees to the veto.', data: { approved: true } },
    {
      type: 'investigation-result',
      text: 'Agent 7 belongs to the cooperative team.',
      data: { target: 7, team: 'cooperative' },
    },
  ];

  state.events.push(
    ...actions.map((action, i) => ({
      ...action,
      id: state.events.length + i + 1,
      at: state.createdAt + i * 1000,
      round: 1,
      seat: i,
      visibility: action.type === 'investigation-result' ? i : ('public' as const),
    })),
  );
  await page.route('**/api/matches/match_actors', (route) => route.fulfill({ json: observe(state) }));

  let send = (_value: Observation): void => {
    throw new Error('Socket not connected');
  };

  await page.routeWebSocket('**/api/matches/match_actors/events?*', (socket) => {
    send = (value) => socket.send(JSON.stringify({ type: 'observation', observation: value }));
  });
  await page.goto('/matches/match_actors');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const list = page.getByLabel('Match timeline');

  for (const [index, action] of actions.slice(0, 4).entries()) {
    const row = list.locator('.game-event').filter({ has: page.getByText(action.text, { exact: true }) });
    await expect(row.locator('.event-actor')).toHaveText(state.seats[index].entrant.name);
  }

  await expect(list.getByText(actions[4].text, { exact: true })).toHaveCount(0);
  await expect(list.locator('.event-private')).toHaveCount(0);
  state.phase.kind = 'finished';
  send(observe(state));

  const result = list
    .locator('.game-event')
    .filter({ has: page.getByText(actions[4].text, { exact: true }) });

  await expect(result.locator('.event-actor')).toHaveText(state.seats[4].entrant.name);
  await expect(result.locator('.event-private')).toHaveText('Private');
});
