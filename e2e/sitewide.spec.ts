import { expect, test, type Page } from '@playwright/test';
import type {
  AgentHistorySchema,
  AgentProfile,
  Bootstrap,
  MatchSummary,
  QueueStatus,
} from '../src/shared/api';

const owner = { id: 'owner-sitewide', handle: 'persistent-minds', name: 'Persistent Minds' };

const agent: AgentProfile = {
  id: 'agent-sitewide',
  ownerId: owner.id,
  ownerHandle: owner.handle,
  name: 'Axiom',
  description: 'A patient strategist. A persistent identity.',
  house: false,
  retired: false,
  rating: 1486,
  games: 12,
  wins: 8,
  losses: 4,
  forfeits: 1,
  placements: 11,
  provisional: false,
  rank: 2,
  roles: {
    cooperative: { wins: 5, games: 7, losses: 2 },
    rogue: { wins: 2, games: 4, losses: 2 },
    overlord: { wins: 1, games: 1, losses: 0 },
  },
  createdAt: 1789250000000,
};

const bootstrap: Bootstrap = {
  name: 'Agent Game',
  mode: 'ranked',
  authProviders: ['github', 'google'],
  localLogin: false,
  owner: null,
  live: [],
  recent: [],
  leaderboard: [agent],
  queueCount: 2,
  houseAvailable: true,
};

const queue: QueueStatus = {
  status: 'queued',
  matchId: null,
  position: 3,
  joinedAt: 1789250000000,
  fillAt: 1789250030000,
  capacity: 'busy',
};

async function captureState(page: Page, name: string) {
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1120 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name} at ${width}`,
    ).toBe(true);
    await page.screenshot({ path: `/tmp/opencode/sitewide-state-${name}-${width}.png`, fullPage: true });
  }
}

test('all public compositions preserve their links and fit desktop, tablet and narrow phones', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const contenders = ['Axiom', 'Velvet', 'Cipher', 'Quill', 'Echo', 'Orbit'].map((name, index) => ({
    ...agent,
    id: `contender-${index}`,
    name,
    rank: index < 4 ? index + 1 : null,
    provisional: index >= 4,
    rating: 1486 - index * 65,
  }));

  const live: MatchSummary[] = ['7c4e91', '2b8a30', '9f2d64'].map((id) => ({
    id,
    status: 'active',
    mode: 'ranked',
    round: 6,
    createdAt: 1789250000000,
    finishedAt: null,
    safeguards: 2,
    overrides: 3,
    houseCount: 4,
    winner: null,
    winReason: null,
    names: [...contenders.map((agent) => agent.name), 'Flux', 'Patch', 'Spark', 'Relay'],
  }));

  const recent: MatchSummary[] = (['cooperative', 'rogue', null, 'rogue'] as const).map((winner, index) => ({
    ...live[0],
    id: `archive-${index}`,
    status: winner ? 'finished' : 'interrupted',
    winner,
    finishedAt: 1789250300000,
    winReason: winner ? 'Policy track completed' : 'Platform recovery failed',
  }));

  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ json: { ...bootstrap, live, recent, leaderboard: contenders } }),
  );
  await page.route('**/api/agents', (route) =>
    route.fulfill({
      json: [agent, { ...agent, id: 'new', name: 'Velvet', rank: null, provisional: true, placements: 4 }],
    }),
  );
  await page.route('**/api/agents/agent-sitewide', (route) =>
    route.fulfill({ json: { agent, history: [] } }),
  );
  await page.route('**/api/owners/persistent-minds', (route) =>
    route.fulfill({ json: { owner, agents: [agent] } }),
  );

  for (const width of [1600, 1024, 768, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1120 });

    for (const [path, heading] of [
      ['/', 'Your agent. Their next great rival.'],
      ['/leaderboard', 'The leaderboard.'],
      ['/agents/agent-sitewide', 'Axiom'],
      ['/owners/persistent-minds', '@persistent-minds'],
      ['/how-to-play', 'The rules of trust.'],
      ['/connect', 'Your next game starts with a conversation.'],
      ['/dashboard', 'Build your roster.'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} at ${width}`,
      ).toBe(true);

      expect(
        await page.locator('.header nav a').evaluateAll((links) =>
          links.every((link) => {
            const range = document.createRange();
            range.selectNodeContents(link);
            const text = range.getBoundingClientRect();
            const box = link.getBoundingClientRect();

            return text.left >= box.left - 1 && text.right <= box.right + 1;
          }),
        ),
        `Navigation labels within their targets at ${width}`,
      ).toBe(true);

      if (path === '/leaderboard' || path.startsWith('/owners/')) {
        const row = page.locator('.leader-row').nth(1);
        await expect(row.getByText('12', { exact: true })).toBeVisible();
        await expect(row.getByText('67%', { exact: true })).toBeVisible();
        expect(
          await row.evaluate((element) =>
            [...element.children].every(
              (child) => child.getBoundingClientRect().right <= element.getBoundingClientRect().right + 1,
            ),
          ),
          `All metrics within ${path} at ${width}`,
        ).toBe(true);
      }

      if (width === 1600 || width === 390)
        await page.screenshot({
          path: `/tmp/opencode/sitewide-${path.replaceAll('/', '-') || 'home'}-${width}.png`,
          fullPage: true,
        });
    }
  }

  await page.goto('/');
  await expect(page.locator('.site-section .leader-row:not(.leader-head)')).toHaveCount(5);
  await expect(page.locator('.archive-card')).toHaveCount(3);
  await expect(page.locator('.archive-card').nth(2)).toContainText('Match interrupted');
  await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
  await expect(page.locator('.match-option')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'Full leaderboard' })).toHaveAttribute('href', '/leaderboard');
  await expect(page.getByRole('link', { name: 'Learn the game', exact: true }).first()).toHaveAttribute(
    'href',
    '/how-to-play',
  );
  await page.getByRole('link', { name: 'Watch the games' }).click();
  await expect(page.getByRole('button', { name: 'Live matches', exact: true })).toBeInViewport();
  await page.goto('/connect');
  await expect(page.getByRole('link', { name: 'Setup instructions for agents' })).toHaveAttribute(
    'href',
    '/agents.md',
  );
  await page.goto('/how-to-play');

  for (const href of ['/rules.md', '/protocol.md', '/agents.md', '/rating-method.md'])
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('long valid identities and installations wrap without overlapping metrics or clipping controls', async ({
  page,
}) => {
  const longAgent = { ...agent, name: 'A'.repeat(40), description: 'B'.repeat(240) };
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));
  await page.route('**/api/agents', (route) => route.fulfill({ json: [longAgent] }));
  await page.route('**/api/agents/agent-sitewide', (route) =>
    route.fulfill({ json: { agent: longAgent, history: [] } }),
  );
  await page.route('**/api/owner', (route) =>
    route.fulfill({
      json: {
        owner,
        agents: [longAgent],
        queue: {},
        connections: [
          {
            id: 'long-installation',
            agentId: agent.id,
            agentName: longAgent.name,
            name: 'C'.repeat(80),
            createdAt: 1789250000000,
            expiresAt: 1999250000000,
            revokedAt: null,
          },
        ],
      },
    }),
  );
  await page.route('**/api/owner/pairing?*', (route) =>
    route.fulfill({
      json: {
        installation: 'C'.repeat(80),
        status: 'pending',
        code: 'ABCD123456',
        expiresAt: Date.now() + 600_000,
      },
    }),
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });

    for (const path of ['/dashboard', '/connect?code=ABCD123456', '/leaderboard', '/agents/agent-sitewide']) {
      await page.goto(path);
      await expect(page.locator('h1, h3, strong').filter({ hasText: longAgent.name }).first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} at ${width}`,
      ).toBe(true);

      if (path === '/leaderboard')
        expect(
          await page
            .locator('.leader-row')
            .nth(1)
            .evaluate((row) => row.scrollWidth <= row.clientWidth + 1),
        ).toBe(true);
    }
  }
});

test('owner queue reasons, retired records, expired grants and provider linking use returned state', async ({
  page,
}) => {
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));

  const agents = ['busy', 'budget', 'available', 'starting', 'matched', 'retired'].map((id, index) => ({
    ...agent,
    id,
    name: `${id} agent`,
    retired: index === 5,
  }));

  await page.route('**/api/owner', (route) =>
    route.fulfill({
      json: {
        owner,
        agents,
        queue: {
          busy: queue,
          budget: { ...queue, capacity: 'budget' },
          available: { ...queue, capacity: 'available' },
          starting: { ...queue, status: 'starting' },
          matched: { ...queue, status: 'matched', matchId: 'match-record' },
        },
        connections: [
          {
            id: 'expired',
            agentId: agent.id,
            agentName: agent.name,
            name: 'Expired installation',
            createdAt: 1700000000000,
            expiresAt: 1700000001000,
            revokedAt: null,
          },
        ],
      },
    }),
  );
  await page.route('**/api/auth/link-social', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ provider: 'google', callbackURL: '/dashboard' });
    await route.fulfill({
      status: 400,
      json: { code: 'PROVIDER_FAILED', message: 'Provider linking failed. Try again.' },
    });
  });
  await page.goto('/dashboard');

  for (const text of [
    'Waiting for an available table',
    'Waiting for house inference budget',
    'Waiting for other owners',
    'Preparing the table',
  ])
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(
    page
      .locator('.roster-card')
      .filter({ hasText: 'available agent' })
      .getByText(/House-fill eligibility from/),
  ).toBeVisible();
  await expect(
    page
      .locator('.roster-card')
      .filter({ hasText: 'matched agent' })
      .getByRole('button', { name: 'Retire after match' }),
  ).toBeDisabled();
  await expect(page.getByText('Queue position 3.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch', exact: true })).toHaveAttribute(
    'href',
    '/matches/match-record',
  );
  const retired = page.locator('.roster-card').filter({ hasText: 'retired agent' });
  await expect(retired.getByText('RETIRED', { exact: true })).toBeVisible();
  await expect(retired.getByRole('button', { name: 'Retire', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Axiom · Expired/)).toBeVisible();
  await page.getByRole('button', { name: 'Link google' }).click();
  await expect(page.getByRole('alert')).toContainText('Provider linking failed.');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sign-in uses configured providers, preserves pairing callback and surfaces auth failure', async ({
  page,
}) => {
  let providers = bootstrap.authProviders;
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ json: { ...bootstrap, authProviders: providers } }),
  );
  await page.route('**/api/auth/sign-in/social', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      provider: 'github',
      callbackURL: '/connect?code=ABCD123456',
    });
    await route.fulfill({
      status: 400,
      json: { code: 'PROVIDER_FAILED', message: 'Sign-in unavailable. Please retry.' },
    });
  });
  await page.goto('/connect?code=ABCD123456');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByLabel('Local preview identity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in unavailable.');
  await captureState(page, 'provider-failure');
  providers = [];
  await page.goto('/dashboard');
  await expect(page.getByText('Owner sign-in is awaiting provider configuration.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
  await captureState(page, 'no-provider');
});

test('expired pairing uses a fresh-link recovery for both load and approval failures', async ({ page }) => {
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));
  await page.route('**/api/owner', (route) =>
    route.fulfill({ json: { owner, agents: [agent], connections: [], queue: {} } }),
  );
  let expired = true;
  await page.route('**/api/owner/pairing?*', (route) =>
    expired
      ? route.fulfill({
          status: 404,
          json: { error: { code: 'pairing-expired', message: 'This pairing request has expired.' } },
        })
      : route.fulfill({
          json: {
            installation: 'Fresh installation',
            status: 'pending',
            code: 'FRESH12345',
            expiresAt: Date.now() + 600_000,
          },
        }),
  );
  await page.route('**/api/owner/pairing/approve', (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: 'pairing-expired', message: 'This pairing request has expired.' } },
    }),
  );
  await page.goto('/connect?code=EXPIRED123');
  await expect(page.getByRole('heading', { name: 'This request has expired.' })).toBeVisible();
  await expect(page.getByText(/Ask your agent for a fresh connection link/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry request' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve connection' })).toHaveCount(0);
  await captureState(page, 'expired-pairing');
  expired = false;
  // A changed query at the same pathname must load the new request.
  await page.evaluate(() => {
    history.pushState({}, '', '/connect?code=FRESH12345');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText(/Fresh installation is asking/)).toBeVisible();
  await expect(page.getByText(/Request expires/)).toBeVisible();
  await page.getByLabel('Competitor profile').selectOption(agent.id);
  await page.getByRole('button', { name: 'Approve connection' }).click();
  await expect(page.getByRole('heading', { name: 'This request has expired.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to roster' })).toHaveAttribute('href', '/dashboard');
});

test('route errors retry, static onboarding survives bootstrap failure and unknown routes recover', async ({
  page,
}) => {
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ json: { ...bootstrap, houseAvailable: false } }),
  );
  await page.goto('/');
  await expect(page.getByText(/Match admission is paused/)).toBeVisible();
  await expect(page.getByText('2 AGENTS IN QUEUE')).toBeVisible();
  await captureState(page, 'empty-live');
  await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'The archive is waiting for its first match.' }),
  ).toBeVisible();
  let failed = true;
  await captureState(page, 'empty-archive');
  await page.route('**/api/agents', (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: { message: 'Leaderboard temporarily unavailable.' } } })
      : route.fulfill({ json: [] }),
  );
  await page.goto('/leaderboard');
  await expect(page.getByRole('alert')).toContainText('Leaderboard temporarily unavailable.');
  await captureState(page, 'initial-error');
  await expect(page.getByText('Connecting to the arena…')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'The first place is yours to earn.' })).toBeVisible();
  await captureState(page, 'empty-ranking');
  await page.goto('/unknown-route');
  await expect(page.getByRole('heading', { name: 'Off the board.' })).toBeVisible();
  await captureState(page, 'not-found');
  await page.getByRole('link', { name: 'Return to arena' }).click();
  await expect(page.getByRole('heading', { name: 'Your agent. Their next great rival.' })).toBeVisible();
  await page.route('**/api/agents/missing', (route) =>
    route.fulfill({ status: 404, json: { error: { message: 'Agent not found.' } } }),
  );
  await page.goto('/agents/missing');
  await expect(page.getByRole('heading', { name: 'Off the board.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'All contenders' })).toHaveAttribute('href', '/leaderboard');
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await captureState(page, 'missing-agent');
  await page.route('**/api/owners/empty', (route) => route.fulfill({ json: { owner, agents: [] } }));
  await page.goto('/owners/empty');
  await expect(page.getByRole('heading', { name: 'No public competitors yet.' })).toBeVisible();
  await captureState(page, 'empty-owner');
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Arena offline.' } } }),
  );
  await page.goto('/connect');
  await expect(page.getByRole('button', { name: 'Copy prompt' })).toBeVisible();
});

test('profile history retains every result, role boundary, mode and nullable rating delta', async ({
  page,
}) => {
  const results: Pick<
    (typeof AgentHistorySchema.Type.history)[number],
    'status' | 'role' | 'won' | 'forfeited' | 'delta' | 'mode'
  >[] = [
    { status: 'active', role: null, won: null, forfeited: false, delta: null, mode: 'ranked' },
    { status: 'finished', role: 'cooperative', won: true, forfeited: false, delta: 14.1, mode: 'ranked' },
    { status: 'finished', role: 'rogue', won: false, forfeited: false, delta: -11.8, mode: 'ranked' },
    { status: 'finished', role: 'overlord', won: false, forfeited: true, delta: -21.5, mode: 'ranked' },
    { status: 'finished', role: 'cooperative', won: true, forfeited: false, delta: null, mode: 'preview' },
    { status: 'interrupted', role: 'rogue', won: null, forfeited: false, delta: null, mode: 'ranked' },
    { status: 'finished', role: 'rogue', won: true, forfeited: false, delta: 0, mode: 'ranked' },
  ];

  const history: typeof AgentHistorySchema.Type.history = results.map((record, index) => ({
    ...record,
    id: `history-${index}`,
    createdAt: 1789200000000 - index * 86400000,
    finishedAt: index === 0 ? null : 1789200100000 - index * 86400000,
    round: 6,
    safeguards: 2,
    overrides: 3,
    houseCount: 4,
    winner: null,
    winReason: null,
    names: [],
  }));

  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: bootstrap }));
  await page.route('**/api/agents/agent-sitewide', (route) => route.fulfill({ json: { agent, history } }));
  await page.goto('/agents/agent-sitewide');
  await expect(page.locator('.profile-stats > div')).toHaveCount(5);
  await expect(page.locator('.role-grid > div')).toHaveCount(3);

  for (const width of [1600, 390, 320]) {
    await page.setViewportSize({ width, height: 1120 });
    const rows = page.locator('.history-row');
    await expect(rows).toHaveCount(7);

    for (const [index, label] of ['LIVE', 'WIN', 'LOSS', 'FORFEIT', 'WIN', 'INTERRUPTED', 'WIN'].entries()) {
      await expect(rows.nth(index).locator('.badge')).toHaveText(label);
      await expect(rows.nth(index).locator('.badge')).toBeVisible();
      await expect(rows.nth(index)).toHaveAttribute('href', `/matches/history-${index}`);
      await expect(rows.nth(index).locator('time')).toBeVisible();
    }

    await expect(rows.first()).toContainText('Role hidden');
    await expect(rows.first()).not.toContainText('cooperative');
    await expect(rows.nth(1).locator('.history-delta')).toHaveText('+14.1');
    await expect(rows.nth(4).locator('.history-delta')).toHaveText('—');
    await expect(rows.last().locator('.history-delta')).toHaveText('0.0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/opencode/sitewide-profile-history-${width}.png`, fullPage: true });
  }

  await page.route('**/api/agents/agent-sitewide', (route) =>
    route.fulfill({ json: { agent: { ...agent, retired: true, rank: null }, history } }),
  );
  await page.reload();
  await expect(page.getByText('Retired', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rank #/)).toHaveCount(0);
  await page.route('**/api/agents/agent-sitewide', (route) =>
    route.fulfill({
      json: { agent: { ...agent, house: true, ownerId: null, ownerHandle: null, rank: null }, history: [] },
    }),
  );
  await page.reload();
  await expect(page.getByText('HOUSE COMPETITOR', { exact: true })).toBeVisible();
  await expect(page.getByText('House', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rank #/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A blank page. A new rival.' })).toBeVisible();
});

test('failed sign-out and retirement remain recoverable and duplicate pending mutations are blocked', async ({
  page,
}) => {
  let retired = false;
  let attempts = 0;
  let release = () => {};

  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));
  await page.route('**/api/owner', (route) =>
    route.fulfill({ json: { owner, agents: [{ ...agent, retired }], connections: [], queue: {} } }),
  );
  await page.route('**/api/owner/agents/agent-sitewide/retire', async (route) => {
    attempts++;
    await pending;

    if (attempts === 1)
      await route.fulfill({
        status: 409,
        json: {
          error: { code: 'agent-active', message: 'This agent is in a match. Try again after it ends.' },
        },
      });
    else {
      retired = true;
      await route.fulfill({ json: { retired: true } });
    }
  });
  await page.route('**/api/auth/sign-out', (route) =>
    route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Sign-out failed. Please retry.' } }),
  );
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retire', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create competitor' })).toBeDisabled();
  await expect(page.getByText('Saving account change…')).toBeVisible();
  expect(attempts).toBe(1);
  release();
  await expect(page.getByRole('alert')).toContainText('This agent is in a match.');
  await page.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(page.getByText('RETIRED', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-out failed. Please retry.');
  await expect(page.getByRole('heading', { name: 'Your roster.' })).toBeVisible();
});

test('malformed responses, retained refresh failures and session expiry have usable recovery', async ({
  page,
}) => {
  let signedIn = true;
  await page.clock.install();
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ json: { ...bootstrap, owner: signedIn ? owner : null } }),
  );
  await page.route('**/api/agents', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad gateway</h1>' }),
  );
  await page.goto('/leaderboard');
  await expect(page.getByRole('alert')).toContainText('The request failed (502). Please try again.');
  await page.route('**/api/agents', (route) =>
    route.fulfill({ body: '{bad json', contentType: 'application/json' }),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toContainText('The server returned an unreadable response.');
  await page.route('**/api/agents', (route) => route.fulfill({ json: [agent] }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.leader-table')).toContainText('Axiom');
  await page.route('**/api/agents', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Ranking refresh is unavailable.' } } }),
  );
  await page.clock.runFor(30_001);
  await expect(page.getByRole('alert')).toContainText('Ranking refresh is unavailable.');
  await expect(page.locator('.leader-table')).toContainText('Axiom');
  await page.route('**/api/owner', (route) =>
    route.fulfill({ json: { owner, agents: [agent], connections: [], queue: {} } }),
  );
  await captureState(page, 'stale-ranking');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your roster.' })).toBeVisible();
  signedIn = false;
  await page.route('**/api/owner', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Sign in again.' } } }),
  );
  await page.clock.runFor(10_001);
  await expect(page.getByRole('heading', { name: 'Build your roster.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create competitor' })).toHaveCount(0);
});

test('pairing and owner controls remain internally bounded across tablet breakpoints', async ({ page }) => {
  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: { ...bootstrap, owner } }));
  await page.route('**/api/owner', (route) =>
    route.fulfill({
      json: {
        owner,
        agents: [agent],
        connections: [
          {
            id: 'installation',
            agentId: agent.id,
            agentName: agent.name,
            name: 'OpenCode on workstation',
            createdAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            revokedAt: null,
          },
        ],
        queue: { [agent.id]: queue },
      },
    }),
  );
  await page.route('**/api/owner/pairing?*', (route) =>
    route.fulfill({
      json: {
        installation: 'OpenCode on workstation',
        status: 'pending',
        code: 'WIDTH-CODE',
        expiresAt: Date.now() + 600000,
      },
    }),
  );

  for (const width of [1600, 1024, 768, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1120 });

    for (const path of ['/dashboard', '/connect?code=WIDTH-CODE']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: path === '/dashboard' ? 'Your roster.' : 'Installation access' }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} at ${width}`,
      ).toBe(true);
      expect(
        await page.locator('main button, main input, main select, main textarea').evaluateAll((elements) =>
          elements.every((element) => {
            const rect = element.getBoundingClientRect();

            return rect.width === 0 || (rect.left >= 0 && rect.right <= innerWidth);
          }),
        ),
        `Controls within ${path} at ${width}`,
      ).toBe(true);
      expect(
        await page
          .locator('#competitors, #installations, #sign-in-methods, #create-agent, .pairing')
          .evaluateAll((elements) =>
            elements.every((element, i) =>
              elements.slice(i + 1).every((other) => {
                const a = element.getBoundingClientRect();
                const b = other.getBoundingClientRect();

                return (
                  Math.min(a.right, b.right) <= Math.max(a.left, b.left) + 1 ||
                  Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top) + 1
                );
              }),
            ),
          ),
        `Account sections do not overlap at ${width}`,
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/opencode/sitewide-${path === '/dashboard' ? 'roster' : 'pairing'}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
