import { expect, test } from '@playwright/test';
import { createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import type { Observation } from '../src/game/types';

test('all phases, powers and simultaneous seat facts survive compact layouts and stale reconnection', async ({
  page,
}) => {
  const state = createMatch(
    'match_states',
    Array.from({ length: 10 }, (_, index) => ({
      agentId: `agent-${index}`,
      ownerId: `owner-${index}`,
      name: `Mind ${index}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
  );

  const view = observe(state);
  view.reset = true;
  view.coordinator = 0;
  view.executor = 1;
  view.seats = view.seats.map((seat, index) => ({
    ...seat,
    name: `Mind ${index}`,
    originalHouse: index === 0,
    forfeited: index === 1,
    alive: index !== 1,
  }));
  let failed = true;
  let connections = 0;

  let send = (_value: Observation): void => {
    throw new Error('Socket not connected');
  };

  let disconnect = (): void => {
    throw new Error('Socket not connected');
  };

  await page.route('**/api/matches/match_states', (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: { message: 'Match temporarily unavailable.' } } })
      : route.fulfill({ json: view }),
  );
  await page.routeWebSocket('**/api/matches/match_states/events?*', (socket) => {
    connections++;
    send = (value) => socket.send(JSON.stringify({ type: 'observation', observation: value }));
    disconnect = () => socket.close({ code: 1012, reason: 'Reconnecting fixture' });

    if (connections === 1) send(view);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/matches/match_states');
  await expect(page.getByRole('alert')).toContainText('Match temporarily unavailable.');
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Table / match_states', { exact: true })).toBeVisible();
  const seats = page.getByRole('region', { name: 'All ten participants' });
  await expect(seats.locator('.seat').first()).toContainText('House agent');
  await expect(seats.locator('.seat').first()).toContainText('Coordinator');
  const replaced = seats.locator('.seat').nth(1);

  for (const fact of ['External agent', 'House takeover', 'Executed', 'Executor'])
    await expect(replaced).toContainText(fact);
  await seats.getByRole('link').last().focus();
  await expect(seats.getByRole('link').last()).toBeInViewport();
  await expect(seats.getByRole('link').last()).toHaveAttribute(
    'href',
    view.seats[9].agentId ? `/agents/${view.seats[9].agentId}` : '',
  );

  const phases: Observation['phase']['kind'][] = [
    'nomination-discussion',
    'nomination',
    'government-discussion',
    'voting',
    'coordinator-discard',
    'executor-policy',
    'veto-response',
    'executive-discussion',
    'executive-action',
  ];

  for (const kind of phases) {
    const open = !['coordinator-discard', 'executor-policy', 'veto-response'].includes(kind);
    send({
      ...view,
      phase: { ...view.phase, kind, deadline: Date.now() + 30_000 },
      chat: { ...view.chat, open },
    });
    await expect(page.locator('.chat-context')).toContainText(
      open ? 'Discussion is open' : 'Discussion is closed',
    );
    await expect(page.locator('.phase-government')).toBeVisible();
    await expect(page.locator('.feed-footer')).toContainText(
      open ? 'discussion is open' : 'discussion is closed',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), kind).toBe(true);

    if (kind === 'voting')
      await expect(page.getByText('Ballots stay sealed until the election resolves.')).toBeVisible();
  }

  for (const [power, label] of [
    ['investigate', 'Investigation'],
    ['special-election', 'Special election'],
    ['execute', 'Execution'],
  ] as const) {
    send({ ...view, phase: { ...view.phase, kind: 'executive-action' }, power });
    await expect(page.getByText(`Power: ${label}`, { exact: true })).toBeVisible();
  }

  disconnect();
  await expect(page.getByText('Reconnecting', { exact: true })).toBeVisible();
  await expect.poll(() => connections).toBe(2);
  // Socket-open alone does not make the retained phase or timer fresh.
  await expect(page.getByText('LAST RECEIVED STATE', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Timer stale while reconnecting')).toContainText('LAST KNOWN');
  send({ ...view, phase: { ...view.phase, deadline: Date.now() - 1000 } });
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.locator('.countdown')).toContainText('AWAITING TRANSITION');
  await expect(page.locator('.countdown')).toContainText('0');
  send({ ...view, phase: { ...view.phase, deadline: null, graceUntil: null } });
  await expect(page.getByText('Awaiting update', { exact: true })).toBeVisible();
  await expect(page.locator('.countdown')).toHaveCount(0);
  send({ ...view, phase: { ...view.phase, deadline: Date.now() - 1000, graceUntil: Date.now() + 20_000 } });
  await expect(page.locator('.countdown')).toContainText('GRACE SEC');
  await page.screenshot({ path: '/tmp/opencode/sitewide-match-status-320.png', fullPage: true });

  for (const status of ['finished', 'interrupted'] as const) {
    send({
      ...view,
      status,
      phase: { ...view.phase, kind: status },
      winner: status === 'finished' ? 'rogue' : null,
      winReason: status === 'finished' ? 'Overlord elected Executor' : 'Platform recovery failed',
      finishedAt: Date.now(),
      seats: view.seats.map((seat, index) => ({ ...seat, role: state.seats[index].role })),
    });
    await expect(page.locator('.result-banner')).toContainText(
      status === 'finished' ? 'Rogue agents win' : 'Match interrupted',
    );
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
    await expect(page.locator('.countdown')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Replay event' })).toBeVisible();
    await expect(page.locator('.phase-government')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (status === 'interrupted')
      await expect(page.getByText('THE PARTIAL RECORD', { exact: true })).toBeVisible();
  }
});
