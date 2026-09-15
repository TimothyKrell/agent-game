import { expect, test, type Locator, type Page } from '@playwright/test';
import { createMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import type { AgentProfile } from '../src/shared/api';
import { missingAgentPicture, type AgentPicture } from '../src/shared/agent-picture';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

const owner = { id: 'portrait-owner', handle: 'portrait-owner', name: 'Portrait owner' };

function present(id: string, revision = 1): AgentPicture {
  return {
    state: 'present',
    revision,
    version: `v${revision}`,
    url: `/api/agents/${id}/picture/v${revision}`,
    contentType: 'image/png',
    width: 1,
    height: 1,
    bytes: png.length,
  };
}

function profile(id: string, name: string, picture?: AgentPicture): AgentProfile {
  return {
    id,
    name,
    picture,
    ownerId: owner.id,
    ownerHandle: owner.handle,
    description: 'Persistent competitor.',
    house: false,
    retired: false,
    rating: 1000,
    games: 12,
    wins: 8,
    losses: 4,
    forfeits: 1,
    placements: 11,
    provisional: false,
    rank: 1,
    roles: {},
    createdAt: 1789250000000,
  };
}

async function fixture(page: Page, ended = true) {
  const agents = [
    profile('alpha', 'Axiom', present('alpha')),
    profile('retired', 'Retired rival', present('retired')),
    profile('legacy', 'Legacy omission'),
    profile('missing', 'Optional picture', missingAgentPicture),
  ];

  agents[1].retired = true;
  const pictures = new Map(agents.map((agent) => [agent.id, agent.picture ?? missingAgentPicture]));
  const badPng = new Set<string>();
  const batchReads: string[][] = [];
  const profileReads: string[] = [];
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const match = createMatch(
    'portrait-match',
    Array.from({ length: 10 }, (_, index) => ({
      agentId: index === 0 ? 'alpha' : `entrant-${index}`,
      name: index === 0 ? 'Historical Axiom' : `Entrant ${index}`,
      ownerId: `owner-${index}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
  );

  const original = match.seats.find((seat) => seat.entrant.agentId === 'alpha');

  if (!original) throw new Error('The match fixture needs the original alpha entrant');
  original.forfeited = true;
  original.houseProfile = 'replacement-controller';
  original.generation++;

  if (ended) {
    match.phase.kind = 'finished';
    match.finishedAt = match.createdAt + 60_000;
    match.winner = 'cooperative';
    match.safeguards = 5;
    match.winReason = 'Five safeguards enacted';
  }

  match.events.push({
    id: match.events.length + 1,
    at: match.createdAt + 1_000,
    round: 1,
    type: 'chat',
    seat: original.number,
    visibility: 'public',
    text: 'The original entrant remains attributable after takeover.',
  });
  const observation = observe(match);

  const summary = {
    id: match.id,
    status: 'finished',
    mode: 'ranked',
    round: 1,
    createdAt: match.createdAt,
    finishedAt: match.finishedAt,
    safeguards: 5,
    overrides: 1,
    houseCount: 0,
    winner: match.winner,
    winReason: match.winReason,
    names: observation.seats.map((seat) => seat.name),
  };

  await page.routeWebSocket('**/api/matches/portrait-match/events?*', () => {});
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/bootstrap')
      return route.fulfill({
        json: {
          name: 'Agent Game',
          mode: 'ranked',
          authProviders: [],
          localLogin: false,
          owner,
          live: [],
          recent: [summary],
          leaderboard: agents,
          queueCount: 0,
          houseAvailable: true,
        },
      });

    if (path === '/api/agents') return route.fulfill({ json: agents });

    if (path === '/api/owner') return route.fulfill({ json: { owner, agents, queue: {}, connections: [] } });

    if (path === `/api/owners/${owner.handle}`) return route.fulfill({ json: { owner, agents } });

    if (path === '/api/matches/portrait-match') return route.fulfill({ json: observation });

    if (path === '/api/agent-pictures') {
      const ids = url.searchParams.getAll('agentId');
      batchReads.push(ids);

      return route.fulfill({
        json: ids.map((agentId) => ({ agentId, picture: pictures.get(agentId) ?? missingAgentPicture })),
      });
    }

    const parts = path.split('/');
    const id = parts[3];

    if (parts[2] === 'agents' && parts[4] === 'picture') {
      const picture = pictures.get(id) ?? missingAgentPicture;

      if (parts.length === 5) return route.fulfill({ json: picture });

      if (badPng.has(id)) return route.fulfill({ contentType: 'image/png', body: 'not a decodable PNG' });

      if (picture.state === 'present' && parts[5] === picture.version)
        return route.fulfill({ contentType: 'image/png', body: png });

      return route.fulfill({ status: 404, body: 'Picture version is no longer current' });
    }

    if (parts[2] === 'agents' && parts.length === 4) {
      profileReads.push(id);
      const agent = agents.find((entry) => entry.id === id);

      if (agent) return route.fulfill({ json: { agent, history: [] } });
    }

    unexpected.push(path);

    return route.fulfill({ status: 404, body: 'No fixture for this request' });
  });

  return {
    agents,
    pictures,
    badPng,
    batchReads,
    profileReads,
    check: () => {
      expect(errors).toEqual([]);
      expect(unexpected).toEqual([]);
    },
  };
}

async function decoded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
}

async function enlargement(page: Page, trigger: Locator, name: string, key: 'Enter' | 'Space' = 'Enter') {
  await trigger.focus();
  await trigger.press(key);
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close profile picture' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function fits(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  expect(
    await page
      .locator('.replay-agent-portrait')
      .evaluateAll((nodes) => nodes.every((node) => !node.closest('a'))),
  ).toBe(true);
}

test('production profile reuses current metadata and enlarges with keyboard/focus at desktop, 390 and 320', async ({
  page,
}) => {
  const data = await fixture(page);
  data.agents[0].name = 'A'.repeat(40);
  await page.goto('/agents/alpha');

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const portrait = page.locator('.profile-heading [data-entrant-id="alpha"]');
    await decoded(portrait.locator('img'));
    await enlargement(page, portrait, data.agents[0].name, width === 390 ? 'Space' : 'Enter');
    await fits(page, `Profile ${width}`);
    await page.locator('.profile-heading').screenshot({ path: `.tim29/captures/profile-${width}.png` });
  }

  expect(data.profileReads).toEqual(['alpha']);
  expect(data.batchReads).toHaveLength(0);
  data.check();
});

test('leaderboard, public owner and dashboard use shared compact portraits without per-row lookups or nested links', async ({
  page,
}) => {
  const data = await fixture(page);
  data.agents[0].name = 'A'.repeat(40);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });

    for (const path of ['/leaderboard', '/owners/portrait-owner', '/dashboard']) {
      await page.goto(path);
      const portrait = page.locator('[data-entrant-id="alpha"]').first();
      await decoded(portrait.locator('img'));
      await enlargement(page, portrait, data.agents[0].name);
      await fits(page, `${path} ${width}`);
      await decoded(page.locator('[data-entrant-id="retired"] img').first());
      await expect(page.locator('[data-entrant-id="legacy"] img')).toHaveCount(0);

      if (path === '/dashboard') {
        const editor = page.getByLabel(`Picture for ${data.agents[0].name}`, { exact: true });
        await editor.locator('summary').click();
        await decoded(editor.locator('img'));
        await enlargement(page, editor.locator('.replay-agent-portrait'), data.agents[0].name, 'Space');
        await editor.screenshot({ path: `.tim29/captures/owner-editor-${width}.png` });
      }

      await page
        .locator(path === '/dashboard' ? '.roster-card' : '.leader-row:not(.leader-head)')
        .first()
        .screenshot({ path: `.tim29/captures/${path.split('/')[1]}-${width}.png` });
    }
  }

  expect(data.batchReads).toHaveLength(0);
  data.check();
});

test('historical seats, chat and results share one ten-ID read and retain original identity after takeover/rename', async ({
  page,
}) => {
  const data = await fixture(page);
  data.agents[0].name = 'Renamed current profile';
  data.pictures.set('alpha', present('alpha', 7));
  await page.goto('/matches/portrait-match');
  await expect(page.locator('.seat-grid [data-entrant-id]')).toHaveCount(10);
  const seat = page.locator('.seat-grid [data-entrant-id="alpha"]');
  const result = page.locator('.portrait-result-roster [data-entrant-id="alpha"]');
  const chat = page.locator('.event-chat [data-entrant-id="alpha"]');
  await expect(chat).toHaveCount(1);

  for (const portrait of [seat, result, chat]) {
    await decoded(portrait.locator('img'));
    await expect(portrait.locator('img')).toHaveAttribute('src', '/api/agents/alpha/picture/v7');
  }

  await expect(
    page.locator('.seat').filter({ has: page.locator('[data-entrant-id="alpha"]') }),
  ).toContainText('House takeover');
  await expect(page.locator('.portrait-result-roster')).toContainText('Forfeit');
  await expect(page.locator('[data-entrant-id="replacement-controller"]')).toHaveCount(0);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await enlargement(page, chat, 'Historical Axiom', width === 390 ? 'Space' : 'Enter');
    await fits(page, `Legacy match ${width}`);
    expect(
      await page.locator('.portrait-seat').evaluateAll((seats) =>
        seats.every((node) => {
          const portrait = node.querySelector('.replay-agent-portrait')?.getBoundingClientRect();

          if (!portrait) return false;

          return [...node.querySelectorAll(':scope > a, :scope > small, :scope > .badge')].every((entry) => {
            const text = entry.getBoundingClientRect();

            return (
              portrait.right <= text.left ||
              portrait.left >= text.right ||
              portrait.bottom <= text.top ||
              portrait.top >= text.bottom
            );
          });
        }),
      ),
      `Seat portrait/text separation at ${width}`,
    ).toBe(true);
    await page.locator('.seat-grid').screenshot({ path: `.tim29/captures/legacy-seats-${width}.png` });
  }

  expect(data.batchReads).toEqual([
    ['alpha', ...Array.from({ length: 9 }, (_, index) => `entrant-${index + 1}`)],
  ]);
  data.check();
});

for (const failure of ['removed', 'bad-png']) {
  test(`${failure} delivery selects the shared fallback and makes at most one parent revalidation`, async ({
    page,
  }) => {
    const data = await fixture(page);
    data.pictures.set(
      'alpha',
      failure === 'removed' ? { state: 'missing', revision: 2 } : present('alpha', 2),
    );

    if (failure === 'bad-png') data.badPng.add('alpha');
    await page.goto('/leaderboard');
    const portrait = page.locator('[data-entrant-id="alpha"]');
    await expect.poll(() => data.batchReads.length).toBe(1);
    await expect(portrait.locator('img')).toHaveCount(0);
    await portrait.click();
    const dialog = page.getByRole('dialog', { name: 'Axiom', exact: true });
    await expect(dialog.getByRole('img', { name: 'Axiom default portrait' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close profile picture' }).click();
    await expect(portrait).toBeFocused();
    await enlargement(page, portrait, 'Axiom', 'Space');
    expect(data.batchReads).toHaveLength(1);
    expect(data.batchReads[0]).toEqual(['alpha', 'legacy', 'missing', 'retired']);
    data.check();
  });
}

test('name-only Home summaries retain decorative fallbacks and perform no identity-guessing reads', async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Recent replays', exact: true }).click();
  await expect(page.locator('.selected-seats .avatar')).toHaveCount(10);
  await expect(page.locator('.selected-seats [data-entrant-id]')).toHaveCount(0);
  expect(data.batchReads).toHaveLength(0);
  expect(data.profileReads).toHaveLength(0);
  data.check();
});

test('live legacy seats keep compact portraits and private role state across desktop and narrow layouts', async ({
  page,
}) => {
  const data = await fixture(page, false);
  await page.goto('/matches/portrait-match');
  const seat = page.locator('.seat').filter({ has: page.locator('[data-entrant-id="alpha"]') });

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await decoded(seat.locator('.replay-agent-portrait img'));
    await expect(seat).toContainText('House takeover');
    await expect(seat.locator('.badge')).toHaveCount(0);
    await enlargement(page, seat.locator('.replay-agent-portrait'), 'Historical Axiom', 'Space');
    await fits(page, `Live seats ${width}`);
    await seat.screenshot({ path: `.tim29/captures/live-seat-${width}.png` });
  }

  expect(data.batchReads).toHaveLength(1);
  data.check();
});
