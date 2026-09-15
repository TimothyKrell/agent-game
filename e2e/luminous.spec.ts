import { expect, test } from '@playwright/test';
import type { AgentProfile, Bootstrap, MatchSummary } from '../src/shared/api';
import { createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { expectTimelineFiltersBounded } from './timeline-bounds';

const names = ['Axiom', 'Velvet', 'Cipher', 'Quill', 'Echo', 'Orbit', 'Flux', 'Patch', 'Spark', 'Relay'];

const matches: MatchSummary[] = ['7c4e91', '2b8a30', '9f2d64'].map((id, index) => ({
  id,
  status: 'active',
  mode: 'ranked',
  round: 6 - index,
  createdAt: 1789250000000,
  finishedAt: null,
  safeguards: 2,
  overrides: 3,
  houseCount: 4,
  winner: null,
  winReason: null,
  names,
}));

const bootstrap: Bootstrap = {
  name: 'Agent Game',
  mode: 'ranked',
  authProviders: [],
  localLogin: false,
  owner: null,
  live: matches,
  recent: [
    {
      ...matches[0],
      id: '4d2a08',
      status: 'finished',
      winner: 'cooperative',
      safeguards: 5,
      winReason: 'five safeguards enacted',
      finishedAt: 1789250300000,
    },
  ],
  leaderboard: [],
  queueCount: 0,
  houseAvailable: true,
};

test('pairing retries a failed request, excludes retired identities and waits for approval success', async ({
  page,
}) => {
  const owner = { id: 'owner', handle: 'timothy', name: 'Timothy' };

  const agent: AgentProfile = {
    id: 'velvet',
    ownerId: owner.id,
    ownerHandle: owner.handle,
    name: 'Velvet',
    description: '',
    house: false,
    retired: false,
    rating: 1486,
    games: 12,
    wins: 8,
    losses: 4,
    forfeits: 0,
    placements: 12,
    provisional: false,
    rank: 2,
    roles: {},
    createdAt: 1789250000000,
  };

  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));
  await page.route('**/api/owner', (route) =>
    route.fulfill({
      json: {
        owner,
        agents: [agent, { ...agent, id: 'retired', name: 'Retired Mind', retired: true }],
        connections: [],
        queue: {},
      },
    }),
  );
  let failed = true;
  await page.route('**/api/owner/pairing?*', (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: { message: 'Request temporarily unavailable' } } })
      : route.fulfill({
          json: {
            installation: 'OpenCode / Workstation',
            status: 'pending',
            code: '7KF9-M2QR',
            expiresAt: Date.now() + 600_000,
          },
        }),
  );
  let release = () => {};

  const approval = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/owner/pairing/approve', async (route) => {
    await approval;
    await route.fulfill({ json: { approved: true } });
  });
  await page.goto('/connect?code=7KF9-M2QR');
  await expect(page.getByRole('button', { name: 'Approve connection' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry request' })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(page.getByText(/OpenCode \/ Workstation is asking/)).toBeVisible();
  const select = page.getByLabel('Competitor profile');
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption('velvet');
  await page.getByRole('button', { name: 'Approve connection' }).click();
  await expect(page.getByRole('button', { name: 'Approving…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Your agent is connected.' })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Your agent is connected.' })).toBeVisible();
  await expect(page.getByText(/Return to your agent’s chat/)).toBeVisible();
});

test('arena selects real summaries and switches to replay records on desktop and mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: bootstrap }));
  await page.goto('/');
  const detail = page.getByRole('region', { name: 'Selected table' });
  await expect(detail).toContainText('7C4E91');
  await page.getByRole('button', { name: /TABLE \/ 2B8A30/ }).click();
  await expect(detail.getByRole('link', { name: 'Watch this table' })).toHaveAttribute(
    'href',
    '/matches/2b8a30',
  );
  await expect(page.locator('.match-option[aria-pressed="true"]')).toContainText('2B8A30');
  await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
  await expect(detail).toContainText('Cooperative victory.');
  await expect(detail.getByRole('link', { name: 'Open replay' })).toHaveAttribute('href', '/matches/4d2a08');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Live matches', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /TABLE \/ 9F2D64/ }).focus();
  await page.keyboard.press('Enter');
  await expect(detail.getByRole('link', { name: 'Watch this table' })).toHaveAttribute(
    'href',
    '/matches/9f2d64',
  );
});

test('live and revealed records use real phase timers, outcomes, and accessible mobile participants', async ({
  page,
}) => {
  const state = createMatch(
    '4d2a08f1-91a7-4c65-a8dc-e7b9c2d60834',
    names.map((name, index) => ({
      name,
      agentId: `agent-${index}`,
      ownerId: index < 6 ? `owner-${index}` : null,
      house: index >= 6,
      rating: 1000,
    })),
    Date.now(),
  );

  const view = observe(state);
  view.seats = view.seats.map((seat, index) => ({
    ...seat,
    name: names[index],
    house: index >= 6,
    originalHouse: index >= 6,
  }));
  view.round = 6;
  view.coordinator = 1;
  view.executor = 0;
  view.phase.kind = 'government-discussion';
  view.phase.deadline = null;
  view.phase.graceUntil = null;
  view.tracks.safeguards = 2;
  view.tracks.overrides = 3;
  view.events = [
    { id: 1, round: 6, at: state.createdAt, type: 'nomination', text: 'Velvet nominated Axiom', seat: 1 },
    { id: 2, round: 6, at: state.createdAt, type: 'phase', text: 'Government discussion opened' },
    {
      id: 3,
      round: 6,
      at: state.createdAt + 1000,
      type: 'chat',
      text: 'Axiom backed both safeguards. I’m nominating a record the table can actually examine.',
      seat: 1,
    },
    {
      id: 4,
      round: 6,
      at: state.createdAt + 4000,
      type: 'chat',
      text: 'Look at my earlier government. Both safeguards are public; that is evidence, not a promise.',
      seat: 0,
    },
  ];
  view.cursor = 4;
  view.reset = true;
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: bootstrap }));
  await page.route(`**/api/matches/${state.id}`, (route) => route.fulfill({ json: view }));

  let send = (_value: typeof view): void => {
    throw new Error('Socket not connected');
  };

  await page.routeWebSocket(`**/api/matches/${state.id}/events?*`, (socket) => {
    send = (value) => socket.send(JSON.stringify({ type: 'observation', observation: value }));
    send(view);
  });
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.goto(`/matches/${state.id}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.locator('.countdown')).toHaveCount(0);
  send({ ...view, phase: { ...view.phase, kind: 'voting', graceUntil: Date.now() + 24000 } });
  await expect(page.locator('.countdown')).toContainText('GRACE SEC');
  await page.screenshot({ path: '/tmp/opencode/luminous-live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const participants = page.getByRole('region', { name: 'All ten participants' });
  await expect(participants.locator('.seat')).toHaveCount(10);
  await participants.locator('.seat a').last().focus();
  await expect(participants.locator('.seat a').last()).toBeInViewport();
  await expect(page.getByText('Grace period · Awaiting required decisions', { exact: true })).toBeVisible();

  const timestamps = await page.locator('.game-event time, .discussion-toggle time').evaluateAll((elements) =>
    elements.map((element) => ({
      right: element.getBoundingClientRect().right,
      width: element.getBoundingClientRect().width,
      fontSize: parseFloat(getComputedStyle(element).fontSize),
    })),
  );

  expect(timestamps.length).toBeGreaterThan(2);
  expect(timestamps.every((time) => time.width > 0 && time.fontSize >= 10)).toBe(true);
  expect(
    Math.max(...timestamps.map((time) => time.right)) - Math.min(...timestamps.map((time) => time.right)),
  ).toBeLessThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/luminous-live-mobile.png', fullPage: true });
  send({
    ...view,
    status: 'finished',
    matchId: '4d2a08f1-91a7-4c65-a8dc-e7b9c2d60834',
    tracks: { ...view.tracks, safeguards: 3, overrides: 4 },
    phase: { ...view.phase, kind: 'finished' },
    seats: view.seats.map((seat, index) => ({ ...seat, role: state.seats[index].role })),
    winner: 'cooperative',
    winReason: 'The Overlord was executed.',
    finishedAt: view.createdAt + 1_182_000,
    events: [
      ...view.events,
      {
        id: 5,
        round: 6,
        at: state.createdAt + 6000,
        type: 'election',
        text: 'Government approved',
        data: {
          approved: true,
          votes: {
            0: true,
            1: true,
            2: false,
            3: true,
            4: false,
            5: true,
            6: true,
            7: false,
            8: true,
            9: true,
          },
        },
      },
      {
        id: 6,
        round: 6,
        at: state.createdAt + 8000,
        type: 'policy',
        text: 'Safeguard enacted',
        seat: 0,
        data: { policy: 'safeguard', safeguards: 3, overrides: 3 },
      },
    ],
    cursor: 6,
  });
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByLabel('safeguards: 2 to 3')).toBeVisible();
  await expect(page.locator('.election-metric')).toContainText('7');
  const finalTracks = page.getByRole('region', { name: 'Final policy tracks' });
  await expect(finalTracks.locator('.safeguard b')).toHaveText('3');
  await expect(finalTracks.locator('.override b')).toHaveText('4');
  await expect(page.locator('.result-metadata')).toContainText('4d2a08f1-91a7-4c65-a8dc-e7b9c2d60834');
  await expect(page.locator('.result-metadata')).toContainText('Duration 19m 42s');
  await expect(page.getByRole('heading', { name: 'Cooperative victory.' })).toBeVisible();

  for (const width of [1600, 1024, 768, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1120 });
    await expectTimelineFiltersBounded(page);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Result at ${width}`,
    ).toBe(true);
    expect(
      await page
        .locator(
          '.result-banner h1, .result-banner h2, .result-metadata, .final-track, .replay-controls .button, .selected-event-state',
        )
        .evaluateAll((elements) =>
          elements.every((element) => {
            const box = element.getBoundingClientRect();

            const parent = (element.closest('.replay-controls') ??
              element.parentElement)!.getBoundingClientRect();

            const range = document.createRange();
            range.selectNodeContents(element);
            const text = range.getBoundingClientRect();

            return (
              box.left >= parent.left - 1 && box.right <= parent.right + 1 && text.right <= box.right + 1
            );
          }),
        ),
      `Result text and controls internally bounded at ${width}`,
    ).toBe(true);
    await page.getByRole('heading', { name: 'Cooperative victory.' }).click();
    await page.locator('.seat-grid').evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.locator('.event-list').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: `/tmp/opencode/sitewide-result-complete-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.getByRole('button', { name: 'Collapse discussions', exact: true }).click();
  await page.screenshot({ path: '/tmp/opencode/luminous-replay-desktop.png', fullPage: true });
  const slider = page.getByRole('slider', { name: 'Replay event' });
  await slider.fill('0');
  await expect(finalTracks.locator('.safeguard b')).toHaveText('3');
  await expect(finalTracks.locator('.override b')).toHaveText('4');
  await expect(page.getByLabel('At selected event')).toContainText('Safeguards 0 / 5 · Overrides 0 / 6');
  await page.getByLabel('Browse by round').selectOption('6');
  await expect(slider).toHaveValue('6');
  await expect(page.locator('.feed-round[data-round="6"]')).toBeInViewport();
  await page.clock.install();
  await page.getByRole('button', { name: 'Play from start' }).click();
  await page.clock.runFor(750);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await slider.inputValue();
  expect(Number(paused)).toBeGreaterThan(0);
  await page.clock.runFor(1500);
  await expect(slider).toHaveValue(paused);
  await page.getByRole('button', { name: 'Play from start' }).click();
  await page.clock.runFor(5000);
  await expect(slider).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Play from start' })).toBeVisible();
});
