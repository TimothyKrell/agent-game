import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import { act, advance, createMatch, decisionId, interruptMatch, pendingSeats } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { previewAction } from '../src/game/preview';
import { terminal } from '../src/game/types';
import type { Observation } from '../src/game/types';
import { expectTimelineFiltersBounded } from './timeline-bounds';

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
  await expectTimelineFiltersBounded(page);
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
      status === 'finished' ? 'Rogue victory.' : 'Match interrupted',
    );
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
    await expect(page.locator('.countdown')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Replay event' })).toBeVisible();
    await expect(page.getByLabel('At selected event')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (status === 'interrupted')
      await expect(page.locator('.result-banner')).toContainText('THE PARTIAL RECORD');

    for (const width of [1600, 390, 320]) {
      await page.setViewportSize({ width, height: 1120 });
      await expectTimelineFiltersBounded(page);
      await page.locator('.seat-grid').evaluate((element) => {
        element.scrollLeft = 0;
      });
      await page.screenshot({ path: `/tmp/opencode/sitewide-result-${status}-${width}.png`, fullPage: true });
    }
  }
});

test('engine-produced archives show setup and proposed offices at the selected event', async ({ page }) => {
  let state = createMatch(
    'replay-phases',
    Array.from({ length: 10 }, (_, index) => ({
      agentId: `replay-agent-${index}`,
      ownerId: `replay-owner-${index}`,
      name: `Replay mind ${index}`,
      house: false,
      rating: 1000,
    })),
    1789250000000,
    { random: (n) => n - 1 },
  );

  let now = state.createdAt;
  let partial: Observation | null = null;

  for (let step = 0; !terminal(state) && step < 1000; step++) {
    if (!partial && state.phase.kind === 'government-discussion')
      partial = observe(interruptMatch(state, now, 'Replay phase regression'));
    const pending = pendingSeats(state);

    if (!pending.length) {
      now = state.phase.deadline!;
      state = advance(state, now);
    } else {
      const seat = pending[0];
      const action = previewAction(observe(state, seat));

      if (!action) throw new Error('Engine decision has no preview action');
      state = act(
        state,
        seat,
        state.seats[seat].generation,
        {
          actionId: crypto.randomUUID(),
          phaseId: state.phase.id,
          decisionId: decisionId(state, seat),
          action,
        },
        now,
      );
    }
  }

  expect(terminal(state)).toBe(true);
  expect(partial).not.toBeNull();
  const complete = observe(state);
  let record = complete;
  await page.route('**/api/matches/replay-phases', (route) => route.fulfill({ json: record }));
  await page.routeWebSocket('**/api/matches/replay-phases/events?*', () => {});

  for (const archive of [complete, partial!]) {
    record = archive;
    await page.goto('/matches/replay-phases');
    const slider = page.getByRole('slider', { name: 'Replay event' });
    const firstPhase = archive.events.findIndex((event) => event.type === 'phase');

    const proposal = archive.events.findIndex(
      (event) => event.type === 'phase' && event.data?.phase === 'government-discussion',
    );

    expect(firstPhase).toBeGreaterThan(0);
    expect(proposal).toBeGreaterThan(firstPhase);

    for (const cursor of [0, firstPhase]) {
      await slider.fill(String(cursor));
      await expect(page.getByLabel('At selected event')).toContainText(
        'Setup record · Awaiting the first recorded phase',
      );
      await expect(page.getByLabel('At selected event')).not.toContainText('Complete record');
      await expect(page.locator('.seat small').filter({ hasText: 'Coordinator' })).toHaveCount(0);
    }

    await slider.fill(String(firstPhase + 1));
    await expect(page.getByLabel('At selected event')).toContainText(
      'Nomination discussion · Discussion open',
    );
    await slider.fill(String(proposal + 1));
    await expect(page.getByLabel('At selected event')).toContainText(
      'Government discussion · Discussion open',
    );
    const nominee = Schema.decodeUnknownSync(Schema.Number)(archive.events[proposal].data?.executor);
    await expect(page.locator('.seat').nth(nominee)).toContainText('Executor nominee');
    await expect(page.locator('.final-track.safeguard b')).toHaveText(String(archive.tracks.safeguards));
    await expect(page.locator('.final-track.override b')).toHaveText(String(archive.tracks.overrides));
    await page.screenshot({
      path: `/tmp/opencode/sitewide-replay-proposal-${archive.status}.png`,
      fullPage: true,
    });

    const voting = archive.events.findIndex(
      (event) => event.type === 'phase' && event.data?.phase === 'voting',
    );

    if (archive.status === 'finished') {
      expect(voting).toBeGreaterThan(proposal);
      await slider.fill(String(voting + 1));
      await expect(page.getByLabel('At selected event')).toContainText('Voting · Discussion open');
      await expect(page.locator('.seat').nth(nominee)).toContainText('Executor nominee');
    }

    await slider.fill(String(archive.events.length));
    await expect(page.getByLabel('At selected event')).toContainText(
      archive.status === 'finished'
        ? 'Complete record · Discussion closed'
        : 'Interrupted match · Discussion closed',
    );
    await expect(page.locator('.seat small').filter({ hasText: 'Executor nominee' })).toHaveCount(0);
    await expect(page.locator('.final-track.safeguard b')).toHaveText(String(archive.tracks.safeguards));
    await expect(page.locator('.final-track.override b')).toHaveText(String(archive.tracks.overrides));
  }
});
