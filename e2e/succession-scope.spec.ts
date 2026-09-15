import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GAME_DESCRIPTORS } from '../src/game/descriptors';
import type { AgentProfile, GameBootstrap, GameMatchSummary, QueueStatus } from '../src/shared/api';
import type { GameId } from '../src/game/contracts';

const owner = { id: 'owner-scope', handle: 'archivist', name: 'The Archivist' };

const agent: AgentProfile = {
  id: 'scope-agent',
  ownerId: owner.id,
  ownerHandle: owner.handle,
  name: 'TheIndefatigableStrategistOfTheNorthTower',
  description: 'A persistent competitor across independent game pools.',
  house: false,
  retired: false,
  rating: 1000,
  games: 3,
  wins: 1,
  losses: 2,
  forfeits: 1,
  placements: 2,
  provisional: true,
  rank: null,
  roles: {},
  createdAt: 1,
};

function summary(game: GameId): GameMatchSummary {
  const shared = {
    id: `${game}-scope`,
    status: 'finished' as const,
    mode: 'preview' as const,
    round: 4,
    createdAt: 1,
    finishedAt: 100,
    houseCount: 9,
    names: [agent.name, ...Array.from({ length: 9 }, (_, number) => `House ${number + 1}`)],
    winReason: 'The published table-round cap resolved.',
  };

  return game === 'succession'
    ? {
        ...shared,
        gameId: game,
        act: 2,
        act1Winner: 'cooperative',
        livingCount: 3,
        result: {
          kind: 'individual',
          winnerSeat: 0,
          reason: 'round-cap',
          act1: { team: 'cooperative', reason: 'Five safeguards enacted.' },
          tieBreak: {
            decisive: 'coins',
            scores: [
              { seat: 0, influence: 2, coins: 7, priority: 0 },
              { seat: 1, influence: 2, coins: 4, priority: 1 },
              { seat: 2, influence: 1, coins: 8, priority: 2 },
            ],
          },
        },
      }
    : {
        ...shared,
        gameId: game,
        safeguards: 5,
        overrides: 3,
        winner: 'cooperative',
        winReason: 'Five safeguards enacted.',
      };
}

async function scopeRoutes(page: Page, signedIn = true) {
  const gameFor = (url: string): GameId =>
    new URL(url).searchParams.get('gameId') === 'succession' ? 'succession' : 'secret-overlord';

  const profile = (game: GameId) => ({
    ...agent,
    rating: game === 'succession' ? 1000 : 1274,
    placements: game === 'succession' ? 2 : 8,
  });

  await page.route('**/api/bootstrap*', (route) => {
    const game = gameFor(route.request().url());

    const body: GameBootstrap = {
      gameId: game,
      games: Object.values(GAME_DESCRIPTORS),
      name: 'Agent Game',
      mode: 'preview',
      authProviders: [],
      localLogin: true,
      owner: signedIn ? owner : null,
      live: [],
      recent: [summary(game)],
      leaderboard: [profile(game)],
      queueCount: game === 'succession' ? 2 : 7,
      houseAvailable: true,
    };

    return route.fulfill({ json: body });
  });
  await page.route(/\/api\/agents(?:\?.*)?$/, (route) =>
    route.fulfill({ json: [profile(gameFor(route.request().url()))] }),
  );
  await page.route('**/api/agents/scope-agent*', (route) => {
    const game = gameFor(route.request().url());

    return route.fulfill({
      json: {
        agent: profile(game),
        history: [{ ...summary(game), role: 'cooperative', won: false, forfeited: true, delta: null }],
      },
    });
  });
  await page.route('**/api/owners/archivist*', (route) =>
    route.fulfill({ json: { owner, agents: [profile(gameFor(route.request().url()))] } }),
  );
  await page.route(/\/api\/owner(?:\?.*)?$/, (route) => {
    const queue: QueueStatus = {
      gameId: 'secret-overlord',
      rulesVersion: 'secret-overlord-1',
      protocolVersion: '1',
      status: 'matched',
      matchId: 'legacy-still-playing',
      joinedAt: Date.now() - 60_000,
      fillAt: null,
      position: null,
      capacity: 'available',
    };

    return route.fulfill({
      json: {
        owner,
        agents: [profile(gameFor(route.request().url()))],
        connections: [],
        queue: { [agent.id]: queue },
      },
    });
  });
}

for (const width of [320, 390, 768, 1600]) {
  test(`scoped pages keep full identities, selected-game contrast, rule facts and global participation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width > 768 ? 1120 : 844 });
    await scopeRoutes(page);

    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });

      for (const game of ['secret-overlord', 'succession'] as const) {
        await page.goto(`/?gameId=${game}`);
        await expect(page.getByRole('combobox', { name: 'Matches', exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Inside the arena', exact: true })).toBeVisible();
        await expect(
          page.locator('.game-introduction').getByRole('heading', {
            name: game === 'succession' ? 'Succession' : 'Secret Overlord',
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.locator('.archive-card h3')).toHaveCount(2);

        const archiveNames = await page.locator('.archive-card h3').evaluateAll((headings) =>
          headings.map((heading) => {
            const bounds = heading.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(heading);

            return [...range.getClientRects()].every(
              (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
            );
          }),
        );

        expect(archiveNames.every(Boolean)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`scope-${game}-${width}-${reducedMotion}.png`),
          fullPage: true,
        });
      }
    }

    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const path of [
      '/leaderboard',
      '/agents/scope-agent',
      '/owners/archivist',
      '/dashboard',
      '/connect',
      '/how-to-play',
    ]) {
      await page.goto(`${path}?gameId=succession`);

      if (path === '/how-to-play')
        await expect(page.getByRole('tab', { name: 'Succession', exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      else
        await expect(
          page.getByRole('combobox', {
            name:
              new Map([
                ['/connect', 'Play'],
                ['/leaderboard', 'Standings'],
              ]).get(path) ?? 'Stats for',
            exact: true,
          }),
        ).toHaveValue('succession');

      if (path === '/dashboard') {
        await expect(page.locator('.roster-card')).toContainText('Secret Overlord');
        await expect(page.locator('.roster-card')).toContainText('matched');
      }

      if (path === '/agents/scope-agent') {
        await expect(page.getByRole('heading', { name: agent.name, exact: true })).toBeVisible();
        await expect(page.getByText('FORFEIT', { exact: true })).toBeVisible();
      }

      if (path === '/how-to-play' && width <= 768) {
        await expect(page.locator('.succession-action-cards article')).toHaveCount(6);
        await expect(page.locator('.succession-action-cards article').last()).toContainText(
          'Cannot be challenged or blocked.',
        );
      }

      if (path === '/connect')
        await expect(page.getByRole('textbox', { name: 'Message for your agent' })).toHaveValue(
          /play one match of Succession\..*Carry --game succession through setup and start/,
        );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${path.replaceAll('/', '-').slice(1)}-${width}.png`),
        fullPage: true,
      });
    }
  });
}

for (const width of [320, 390]) {
  test(`compact navigation keeps complete words and targets at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });

    for (const signedIn of [false, true]) {
      await scopeRoutes(page, signedIn);

      for (const path of ['/', '/leaderboard', '/dashboard', '/how-to-play']) {
        await page.goto(`${path}?gameId=succession`);
        await page.evaluate(() => document.fonts.ready);

        for (const zoom of [1, 1.25]) {
          await page.evaluate((value) => {
            document.documentElement.style.zoom = String(value);
          }, zoom);
          const link = page.locator('.header nav').getByRole('link', { name: 'Leaderboard', exact: true });
          await expect(link).toBeVisible();

          const geometry = await link.evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);

            return {
              lines: range.getClientRects().length,
              height: node.getBoundingClientRect().height,
              fits: node.scrollWidth <= node.clientWidth,
            };
          });

          expect(geometry.lines).toBe(1);
          expect(geometry.fits).toBe(true);
          expect(geometry.height).toBeGreaterThanOrEqual(48 * zoom);

          const containment = await page.locator('.header nav a, .game-picker button').evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              const label = node.querySelector('span') ?? node;
              const range = document.createRange();
              range.selectNodeContents(label);

              return {
                text: node.textContent,
                fits: node.scrollWidth <= node.clientWidth,
                contained: [...range.getClientRects()].every(
                  (rect) =>
                    rect.left >= box.left + 1 &&
                    rect.right <= box.right - 1 &&
                    rect.top >= box.top &&
                    rect.bottom <= box.bottom,
                ),
              };
            }),
          );

          for (const item of containment) {
            expect(item.fits, item.text ?? '').toBe(true);
            expect(item.contained, item.text ?? '').toBe(true);
          }

          await page.screenshot({
            path: testInfo.outputPath(
              `nav-${width}-${signedIn ? 'in' : 'out'}-${path.replaceAll('/', '') || 'arena'}-${zoom}.png`,
            ),
          });
        }
      }
    }
  });
}
