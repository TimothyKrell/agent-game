import { expect, test } from '@playwright/test';
import { navigationFixture } from './luminous-shapes-fixture';
import type { AgentProfile } from '../src/shared/api';
import type { Route } from '@playwright/test';
import { GAME_DESCRIPTORS } from '../src/game/descriptors';

const agent: AgentProfile = {
  id: 'local-agent',
  ownerId: 'shape-owner',
  ownerHandle: 'shape-review',
  name: 'Local Strategist',
  description: 'One persistent identity',
  house: false,
  retired: false,
  rating: 1234,
  games: 12,
  wins: 7,
  losses: 5,
  forfeits: 0,
  placements: 10,
  provisional: false,
  rank: 1,
  roles: {},
  createdAt: 1,
};

test('a standings deep link never changes shared navigation destinations', async ({ page }) => {
  await navigationFixture(page, false);
  await page.goto('/leaderboard?gameId=succession');
  await expect(page.locator('.header .brand')).toHaveAttribute('href', '/');
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByText('How to play'),
  ).toHaveAttribute('href', '/how-to-play');
  await expect(page.locator('.header-actions').getByText('Connect your agent')).toHaveAttribute(
    'href',
    '/connect',
  );
  await expect(page.locator('.game-scope')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Standings', exact: true })).toHaveValue('succession');
});

test('manual rules tabs preserve URL keys, hash, title DOM and scroll through history', async ({ page }) => {
  await navigationFixture(page, false);
  await page.goto('/how-to-play?code=keep#rules-panel');
  const first = page.getByRole('tab', { name: 'Secret Overlord', exact: true });
  const second = page.getByRole('tab', { name: 'Succession', exact: true });
  await first.focus();
  await page.evaluate(() => {
    document.querySelector('h1')?.setAttribute('data-retained', 'yes');
    window.scrollTo({ top: 200, behavior: 'instant' });
  });
  const scroll = await page.evaluate(() => scrollY);
  await first.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).searchParams.has('gameId')).toBe(false);
  await second.press('Enter');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  expect(new URL(page.url()).searchParams.get('code')).toBe('keep');
  expect(new URL(page.url()).hash).toBe('#rules-panel');
  await expect(page.locator('h1[data-retained="yes"]')).toHaveCount(1);
  const length = await page.evaluate(() => history.length);
  await second.press('Enter');
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(second).toHaveAttribute('aria-selected', 'true');
});

test('delayed A–B–A statistics and stale failures never enter the current pool', async ({
  page,
}, testInfo) => {
  await navigationFixture(page, false);
  const requests: Route[] = [];
  await page.route(/\/api\/agents(?:\?.*)?$/, (route) => {
    requests.push(route);
  });
  await page.goto('/leaderboard');
  await expect.poll(() => requests.length).toBe(1);
  const select = page.getByRole('combobox', { name: 'Standings', exact: true });
  await select.selectOption('succession');
  await expect.poll(() => requests.length).toBe(2);
  await select.selectOption('secret-overlord');
  await expect.poll(() => requests.length).toBe(3);
  await requests[2].fulfill({ json: [agent] });
  await expect(page.locator('a.leader-row')).toContainText('1,234');
  await requests[0].fulfill({ json: [{ ...agent, rating: 9999 }] });
  await requests[1].fulfill({
    status: 500,
    json: { error: { code: 'temporary', message: 'Obsolete pool failure' } },
  });
  await expect(page.locator('a.leader-row')).toContainText('1,234');
  await expect(page.getByText('Obsolete pool failure')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await select.selectOption('succession');
  await expect.poll(() => requests.length).toBe(4);
  await expect(page.locator('a.leader-row')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('standings-delayed.png'), fullPage: true });
  await requests[3].fulfill({ json: [{ ...agent, rating: 1777 }] });
  await expect(page.locator('a.leader-row')).toContainText('1,777');
  await expect(page.locator('a.leader-row')).toHaveAttribute('href', '/agents/local-agent?gameId=succession');
});

test('roster draft, expanded prompt and server participation survive a delayed stats choice', async ({
  page,
}, testInfo) => {
  await navigationFixture(page, true);
  const pending: Route[] = [];

  const body = {
    owner: { id: 'shape-owner', name: 'Shape Review', handle: 'shape-review' },
    agents: [agent],
    connections: [],
    queue: {
      'local-agent': {
        gameId: 'secret-overlord',
        rulesVersion: 'secret-overlord-1',
        protocolVersion: '1',
        status: 'matched',
        matchId: 'actual-match',
        joinedAt: 1,
        fillAt: null,
        position: null,
        capacity: 'available',
      },
    },
  };

  await page.route(/\/api\/owner(?:\?.*)?$/, (route) => {
    if (new URL(route.request().url()).searchParams.get('gameId') === 'succession') {
      pending.push(route);

      return;
    }

    return route.fulfill({ json: body });
  });
  await page.goto('/dashboard?code=keep');
  await page.locator('.roster-setup summary').click();
  await page.getByRole('combobox', { name: 'Play', exact: true }).selectOption('succession');
  const draft = page.locator('#create-agent input').first();
  await draft.fill('Draft survives');
  await draft.evaluate((node) => node.setAttribute('data-retained', 'yes'));
  await page.getByRole('combobox', { name: 'Stats for', exact: true }).selectOption('succession');
  await expect.poll(() => pending.length).toBe(1);
  await expect(draft).toHaveValue('Draft survives');
  await expect(draft).toHaveAttribute('data-retained', 'yes');
  await expect(page.locator('.roster-setup')).toHaveAttribute('open', '');
  await expect(page.getByRole('combobox', { name: 'Play', exact: true })).toHaveValue('succession');
  await expect(page.locator('.roster-card')).toContainText('Secret Overlord');
  await expect(page.locator('.roster-card')).toContainText('matched');
  await expect(page.locator('.roster-card')).not.toContainText('1234');
  expect(new URL(page.url()).searchParams.get('code')).toBe('keep');
  await page.screenshot({ path: testInfo.outputPath('roster-draft-delayed-stats.png'), fullPage: true });
  await pending[0].fulfill({ json: { ...body, agents: [{ ...agent, rating: 1777 }] } });
  await expect(page.locator('.roster-card')).toContainText('1777');
  await expect(draft).toHaveValue('Draft survives');
});

test('a delayed manual retry from an earlier visit cannot replace fresh A–B–A standings', async ({
  page,
}) => {
  await navigationFixture(page, false);
  const requests: Route[] = [];
  await page.route(/\/api\/agents(?:\?.*)?$/, (route) => {
    requests.push(route);
  });
  await page.goto('/leaderboard');
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({
    status: 503,
    json: { error: { code: 'temporary', message: 'Temporary standings failure' } },
  });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  const select = page.getByRole('combobox', { name: 'Standings', exact: true });
  await select.selectOption('succession');
  await expect.poll(() => requests.length).toBe(3);
  await select.selectOption('secret-overlord');
  await expect.poll(() => requests.length).toBe(4);
  await requests[3].fulfill({ json: [agent] });
  await requests[1].fulfill({ json: [{ ...agent, rating: 9999 }] });
  await requests[2].fulfill({
    status: 503,
    json: { error: { code: 'temporary', message: 'Obsolete failure' } },
  });
  await expect(page.locator('a.leader-row')).toContainText('1,234');
  await expect(page.getByText('Obsolete failure')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('invalid choices recover locally and preserve unrelated query keys', async ({ page }) => {
  await navigationFixture(page, false);
  await page.goto('/?gameId=invalid&standingsGame=succession&code=keep#live');
  const matches = page.getByRole('combobox', { name: 'Matches', exact: true });
  await expect(matches).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Standings', exact: true })).toHaveValue('succession');
  await expect(page.locator('.grand-splash')).toBeVisible();
  await matches.selectOption('succession');
  expect(new URL(page.url()).searchParams.get('standingsGame')).toBe('succession');
  expect(new URL(page.url()).searchParams.get('code')).toBe('keep');
  expect(new URL(page.url()).hash).toBe('#live');
  await page.goto('/connect?gameId=invalid');
  await expect(page.getByRole('combobox', { name: 'Play', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Play', exact: true }).selectOption('succession');
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeEnabled();
});

test('Arena browser, contenders and mixed archive are independent; partial failures stay honest', async ({
  page,
}) => {
  await navigationFixture(page, false);
  const archiveRequests: Route[] = [];
  await page.route('**/api/bootstrap*', (route) => {
    const succession = new URL(route.request().url()).searchParams.get('gameId') === 'succession';

    if (succession) {
      archiveRequests.push(route);

      return;
    }

    return route.fulfill({
      json: {
        gameId: 'secret-overlord',
        games: Object.values(GAME_DESCRIPTORS),
        name: 'Agent Game',
        mode: 'preview',
        authProviders: [],
        localLogin: true,
        owner: null,
        live: [],
        leaderboard: [],
        queueCount: 7,
        houseAvailable: true,
        recent: [
          {
            id: 'archive-overlord',
            gameId: 'secret-overlord',
            status: 'finished',
            mode: 'preview',
            round: 3,
            createdAt: 1,
            finishedAt: 5,
            houseCount: 10,
            names: ['Actual competitor'],
            winReason: 'Five safeguards',
            winner: 'cooperative',
            safeguards: 5,
            overrides: 2,
          },
        ],
      },
    });
  });
  await page.route(/\/api\/agents(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        {
          ...agent,
          rating: new URL(route.request().url()).searchParams.get('gameId') === 'succession' ? 1777 : 1234,
        },
      ],
    }),
  );
  await page.goto('/');
  await expect.poll(() => archiveRequests.length).toBe(1);
  await expect(page.locator('.archive-card')).toContainText('Secret Overlord');
  await expect(page.getByText('Loading Succession archive…')).toBeVisible();
  await archiveRequests[0].fulfill({
    status: 503,
    json: { error: { code: 'temporary', message: 'Archive temporarily unavailable' } },
  });
  await expect(page.getByText(/Succession archive unavailable:/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Standings', exact: true }).selectOption('succession');
  await expect(page.locator('a.leader-row')).toContainText('1,777');
  await expect(page.getByRole('combobox', { name: 'Matches', exact: true })).toHaveValue('secret-overlord');
  await expect(page.locator('#live')).toContainText('7 SECRET OVERLORD AGENTS IN QUEUE');
  await page.getByRole('combobox', { name: 'Matches', exact: true }).selectOption('succession');
  await expect.poll(() => archiveRequests.length).toBe(2);
  await expect(page.locator('a.leader-row')).toContainText('1,777');
  await expect(page.locator('.archive-card')).toContainText('Secret Overlord');
  await expect(page.locator('.game-introduction h2')).toHaveText(['Secret Overlord', 'Succession']);
  await expect(page.getByRole('link', { name: 'Full leaderboard' })).toHaveAttribute(
    'href',
    '/leaderboard?gameId=succession',
  );
  await archiveRequests[1].fulfill({
    status: 503,
    json: { error: { code: 'temporary', message: 'Browser temporarily unavailable' } },
  });

  const archive = page
    .locator('.site-section')
    .filter({ has: page.getByRole('heading', { name: 'From the archive', exact: true }) });

  await archive.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => archiveRequests.length).toBe(3);

  const record = {
    gameId: 'succession',
    id: 'archive-succession',
    status: 'interrupted',
    mode: 'preview',
    round: 2,
    act: 1,
    createdAt: 2,
    finishedAt: 6,
    houseCount: 10,
    names: ['Actual competitor'],
    result: null,
    act1Winner: null,
    livingCount: 10,
    winReason: 'Interrupted record',
  };

  await archiveRequests[2].fulfill({
    json: {
      gameId: 'succession',
      games: Object.values(GAME_DESCRIPTORS),
      name: 'Agent Game',
      mode: 'preview',
      authProviders: [],
      localLogin: true,
      owner: null,
      live: [],
      leaderboard: [],
      queueCount: 0,
      houseAvailable: true,
      recent: [
        record,
        record,
        { ...record, id: 'older-succession', finishedAt: 3 },
        { ...record, id: 'oldest-succession', finishedAt: 2 },
      ],
    },
  });
  await expect(archive.locator('.archive-card')).toHaveCount(3);
  await expect(archive.locator('.archive-card').nth(0)).toHaveAttribute(
    'href',
    '/matches/archive-succession',
  );
  await expect(archive.locator('.archive-card').nth(1)).toHaveAttribute('href', '/matches/archive-overlord');
  await expect(archive.locator('.archive-card').nth(2)).toHaveAttribute('href', '/matches/older-succession');
});

test('pairing approval and selected competitor stay mounted during an unrelated statistics request', async ({
  page,
}, testInfo) => {
  await navigationFixture(page, true);
  const stats: Route[] = [];
  const approvals: Route[] = [];
  await page.route(/\/api\/owner(?:\?.*)?$/, (route) => {
    if (new URL(route.request().url()).searchParams.get('gameId') === 'succession') {
      stats.push(route);

      return;
    }

    return route.fulfill({
      json: {
        owner: { id: 'shape-owner', name: 'Shape Review', handle: 'shape-review' },
        agents: [agent],
        connections: [],
        queue: {},
      },
    });
  });
  await page.route('**/api/owner/pairing?*', (route) =>
    route.fulfill({
      json: {
        installation: 'Local test installation',
        status: 'pending',
        code: 'KEEP-CODE',
        expiresAt: Date.now() + 600000,
      },
    }),
  );
  await page.route('**/api/owner/pairing/approve', (route) => {
    approvals.push(route);
  });
  await page.goto('/connect?code=KEEP-CODE');
  await page.getByRole('combobox', { name: 'Competitor profile' }).selectOption(agent.id);
  const draft = page.getByRole('textbox', { name: 'Agent name', exact: true });
  await draft.fill('Retained pairing draft');
  await page.getByRole('button', { name: 'Approve connection', exact: true }).click();
  await expect.poll(() => approvals.length).toBe(1);
  await page.getByRole('combobox', { name: 'Stats for', exact: true }).selectOption('succession');
  await expect.poll(() => stats.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Approving…', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Competitor profile' })).toHaveValue(agent.id);
  await expect(page.locator('.pair-code')).toHaveText('KEEP-CODE');
  await expect(draft).toHaveValue('Retained pairing draft');
  await page.screenshot({ path: testInfo.outputPath('pairing-pending-stats.png'), fullPage: true });
  await stats[0].fulfill({
    status: 503,
    json: { error: { code: 'temporary', message: 'Temporary statistics failure' } },
  });
  await expect(page.getByRole('button', { name: 'Approving…', exact: true })).toBeVisible();
  await expect(draft).toHaveValue('Retained pairing draft');
  await approvals[0].fulfill({ json: {} });
  await expect(page.getByRole('heading', { name: 'Your agent is connected.' })).toBeVisible();
});

test('preview action uses the browser choice independently of the contenders pool', async ({ page }) => {
  await navigationFixture(page, false);
  const exhibitions: Route[] = [];
  await page.route('**/api/dev/exhibition', (route) => {
    exhibitions.push(route);
  });

  for (const game of ['succession', 'secret-overlord']) {
    await page.goto(`/?gameId=${game}&standingsGame=succession`);
    await page.getByRole('button', { name: 'Start local exhibition', exact: true }).click();
    await expect.poll(() => exhibitions.length).toBe(game === 'succession' ? 1 : 2);
    const request = exhibitions.at(-1)!;
    expect(request.request().postDataJSON()).toEqual(game === 'succession' ? { gameId: 'succession' } : {});
    await request.fulfill({
      status: 503,
      json: { error: { code: 'temporary', message: 'Fixture does not create games' } },
    });
    await expect(page.getByText('Fixture does not create games')).toBeVisible();
  }
});

for (const width of [1600, 768, 390, 320]) {
  test(`local rules and standings painted states at ${width}`, async ({ page }, testInfo) => {
    await navigationFixture(page, false);
    await page.setViewportSize({
      width,
      height:
        new Map([
          [1600, 1120],
          [768, 1024],
        ]).get(width) ?? 844,
    });

    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });

      for (const game of ['secret-overlord', 'succession', 'unknown']) {
        for (const path of ['/leaderboard', '/how-to-play', '/connect']) {
          await page.goto(`${path}?gameId=${game}`);
          await page.evaluate(() => document.fonts.ready);
          const control = page.getByRole(path === '/how-to-play' ? 'tab' : 'combobox').first();
          await control.focus();
          await expect(control).toBeFocused();
          await page.waitForFunction(() =>
            document
              .getAnimations()
              .every(
                (animation) =>
                  animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running',
              ),
          );
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`${path.slice(1)}-${game}-${reducedMotion}.png`),
            fullPage: true,
          });

          if (width <= 390 && path === '/how-to-play' && game === 'succession') {
            await page.evaluate(() => {
              document.documentElement.style.zoom = '1.25';
            });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({
              path: testInfo.outputPath(`rules-focused-zoom125-${reducedMotion}.png`),
              fullPage: true,
            });
            await page.evaluate(() => {
              document.documentElement.style.zoom = '';
            });
          }
        }
      }
    }
  });
}
