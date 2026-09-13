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

async function scopeRoutes(page: Page) {
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
      owner,
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
  }) => {
    await page.setViewportSize({ width, height: width >= 768 ? 1120 : 844 });
    await scopeRoutes(page);

    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });

      for (const game of ['secret-overlord', 'succession'] as const) {
        await page.goto(`/?gameId=${game}`);
        const label = game === 'succession' ? 'Succession' : 'Secret Overlord';
        const selected = page.getByRole('button', { name: label, exact: true });
        await expect(selected).toHaveAttribute('aria-pressed', 'true');
        await expect(selected).toHaveCSS('color', 'rgb(187, 243, 238)');
        await expect(selected).toHaveCSS('border-image-source', /deco-game-selected|data:image/);
        await expect(page.getByRole('heading', { name: `Inside the arena · ${label}` })).toBeVisible();
        await page.screenshot({
          path: `/tmp/opencode/succession-ui/scope-${game}-${width}-${reducedMotion}.png`,
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
      await expect(page.getByRole('button', { name: 'Succession', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

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
        path: `/tmp/opencode/succession-ui/${path.replaceAll('/', '-').slice(1)}-${width}.png`,
        fullPage: true,
      });
    }
  });
}
