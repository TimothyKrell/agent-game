import { expect, test } from '@playwright/test';
import { createCodingFinale, observeCodingFinale } from '../src/game/coding-finale/game';
import { gameDescriptor } from '../src/game/descriptors';
import type { Observation3 } from '../src/shared/coding-finale';
import { FINALE_RULES } from '../src/game/coding-finale/types';

test('live feed retains rows, follows the bottom, and pauses without moving the reader', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const { state } = await createCodingFinale(
    'live-stability',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: null,
      name: `Agent ${seat}`,
      house: true,
      rating: 1000,
    })),
    Date.now(),
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
      },
    },
  );

  let head = 30;
  let send = (_data: string) => {};

  let release: (() => void) | undefined;
  let hold = false;

  const view = () => ({
    ...observeCodingFinale(state, null),
    history: { visibilityEpoch: 'public-live', streamHead: head },
    serverNow: Date.now(),
  });

  const identity = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    matchId: state.id,
    visibilityEpoch: 'public-live',
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/bootstrap')
      return route.fulfill({
        json: {
          name: 'Agent Game',
          mode: 'preview',
          authProviders: [],
          localLogin: false,
          owner: null,
          live: [],
          recent: [],
          leaderboard: [],
          queueCount: 0,
          houseAvailable: true,
        },
      });

    if (url.pathname.endsWith('/rounds'))
      return route.fulfill({ json: { ...identity, streamHead: head, rounds: [] } });

    if (url.pathname.endsWith('/checkpoint')) {
      const through = Number(url.searchParams.get('through'));

      return route.fulfill({
        json: {
          ...identity,
          through,
          baseline: {
            ...view(),
            history: { visibilityEpoch: identity.visibilityEpoch, streamHead: through },
          },
        },
      });
    }

    if (url.pathname.endsWith('/history')) {
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const cursor = Math.min(through, after + 32);

      return route.fulfill({
        json: {
          ...identity,
          streamHead: head,
          after,
          through,
          cursor,
          hasMore: cursor < through,
          reset: false,
          events: Array.from({ length: cursor - after }, (_, index) => ({
            id: after + index + 1,
            eventKey: `chat-${after + index + 1}`,
            at: state.createdAt + index,
            act: 1,
            round: 1,
            type: 'chat',
            seat: index % 10,
            text: `Public statement ${after + index + 1}: preserve this exact conversation while the game continues.`,
            data:
              after + index + 1 === 30
                ? { to: [1, 2], replyTo: { eventKey: 'chat-27', seat: 1 } }
                : undefined,
          })),
        },
      });
    }

    if (url.pathname === `/api/matches/${state.id}`) return route.fulfill({ json: view() });

    return route.fulfill({ status: 404, json: { error: { message: 'Not available' } } });
  });
  await page.routeWebSocket('**/events?protocol=3', (socket) => {
    send = (data) => socket.send(data);
    socket.send(JSON.stringify({ type: 'observation', observation: view() }));
  });
  await page.goto(`/matches/${state.id}`);

  const last = page.getByText(
    'Public statement 30: preserve this exact conversation while the game continues.',
    { exact: true },
  );

  await expect(last).toBeVisible();
  const reply = page.locator('[data-event-key="chat-30"] .dossier-chat-address');
  await expect(reply).toContainText('Replying to');
  await expect(reply).toContainText(state.seats[1].entrant.name);
  await expect(reply).toContainText(state.seats[2].entrant.name);
  await expect(reply.locator('.dossier-portrait')).toHaveCount(2);
  await page
    .locator('[data-event-key="chat-30"]')
    .screenshot({ path: '/tmp/opencode/dialogue-address-badges.png' });
  const table = page.getByRole('button', { name: 'Table & seats', exact: true });
  await table.click();
  const dialog = page.getByRole('dialog', { name: 'Act I · The table', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.seat-grid > .seat')).toHaveCount(10);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(table).toBeFocused();
  hold = true;
  head = 31;
  send(JSON.stringify({ type: 'observation', observation: view() }));
  await expect.poll(() => !!release).toBe(true);

  try {
    await expect(last).toBeVisible({ timeout: 1000 });
  } finally {
    hold = false;
    release?.();
  }

  await expect(
    page.getByText('Public statement 31: preserve this exact conversation while the game continues.', {
      exact: true,
    }),
  ).toBeVisible();
  const feed = page.getByRole('region', { name: 'Match activity', exact: true });
  await feed.scrollIntoViewIfNeeded();

  const bottomGap = () =>
    feed.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);

  await expect.poll(bottomGap).toBeLessThanOrEqual(2);
  const height = await feed.evaluate((element) => element.clientHeight);
  await feed.hover();
  await page.mouse.wheel(0, -180);
  await expect(page.getByRole('button', { name: 'Jump to live' })).toBeVisible();
  const position = await feed.evaluate((element) => element.scrollTop);
  head = 35;
  send(JSON.stringify({ type: 'observation', observation: view() }));
  await expect(page.getByRole('button', { name: 'Jump to live · 4 new' })).toBeVisible();
  expect(await feed.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
  await expect(
    page.getByText('Public statement 35: preserve this exact conversation while the game continues.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Jump to live · 4 new' }).click();
  await expect(
    page.getByText('Public statement 35: preserve this exact conversation while the game continues.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(bottomGap).toBeLessThanOrEqual(2);
  head = 180;
  send(JSON.stringify({ type: 'observation', observation: view() }));
  await expect(
    page.getByText('Public statement 180: preserve this exact conversation while the game continues.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(bottomGap).toBeLessThanOrEqual(2);
  expect(await page.locator('.dossier-record > li').count()).toBeLessThanOrEqual(128);
  expect(await feed.evaluate((element) => element.clientHeight)).toBe(height);
  expect(errors).toEqual([]);
});

test('public puzzles unlock on progress and terminal reports show actual test evidence without chat', async ({
  page,
}) => {
  const now = Date.now();

  const { state } = await createCodingFinale(
    'public-puzzles',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `p-${seat}`,
      ownerId: null,
      name: `Finalist ${seat}`,
      house: true,
      rating: 1000,
    })),
    now,
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
      },
    },
  );

  const base = observeCodingFinale(state, null);

  let view: Observation3 = {
    ...base,
    act: 2,
    actOne: null,
    act1Result: { team: 'cooperative', reason: 'Five safeguards enacted.' },
    phase: { ...base.phase, kind: 'racing', deadline: now + 300_000 },
    chat: { ...base.chat, open: false },
    decision: null,
    history: { visibilityEpoch: 'race-public', streamHead: 0 },
    finale: {
      id: 'race',
      challengeId: 'public-task',
      rulesVersion: FINALE_RULES.version,
      status: 'racing',
      startedAt: now,
      deadline: now + 300_000,
      result: null,
      interruptionReason: null,
      commitment: 'digest',
      priorityReveal: null,
      finalists: [
        { seat: 0, forfeited: false, completedTier: 0, attempts: 0 },
        { seat: 1, forfeited: false, completedTier: 0, attempts: 0 },
      ],
      submissions: [],
      you: null,
      provisionalResult: null,
    },
  };

  const input = { nodes: 1, start: 0, target: 0, capacity: 0, rechargeTime: 0, rechargers: [], edges: [] };
  const tiers: number[] = [];
  let reportRequests = 0;
  let send = (_data: string) => {};

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    const identity = {
      gameId: 'coding-finale',
      protocolVersion: '3',
      matchId: state.id,
      visibilityEpoch: view.history.visibilityEpoch,
    };

    if (url.pathname === '/api/bootstrap')
      return route.fulfill({
        json: {
          name: 'Agent Game',
          mode: 'preview',
          authProviders: [],
          localLogin: false,
          owner: null,
          live: [],
          recent: [],
          leaderboard: [],
          queueCount: 0,
          houseAvailable: true,
        },
      });

    if (url.pathname.endsWith('/rounds'))
      return route.fulfill({ json: { ...identity, streamHead: 0, rounds: [] } });

    if (url.pathname.endsWith('/checkpoint') || url.pathname.endsWith('/replay'))
      return route.fulfill({ json: { ...identity, through: 0, baseline: null } });

    if (url.pathname.endsWith('/coding/challenge')) {
      const tier = Number(url.searchParams.get('tier'));
      tiers.push(tier);

      return route.fulfill({
        json: {
          challengeId: 'public-task',
          family: 'scheduled-network-1',
          tier,
          title: `Public puzzle ${tier}`,
          statement: 'Find the earliest arrival.\nReturn one integer.\nWait for scheduled connections.',
          example: { input, expected: 0 },
          starter: 'export function solve(input) {}',
          limits: FINALE_RULES,
        },
      });
    }

    if (url.pathname.endsWith('/coding/submission')) {
      reportRequests++;
      const sequence = Number(url.searchParams.get('sequence'));
      const passed = sequence === 2;

      return route.fulfill({
        json: {
          gameId: 'coding-finale',
          protocolVersion: '3',
          matchId: state.id,
          challengeId: 'public-task',
          sequence,
          seat: 0,
          generation: 0,
          tier: 1,
          receivedAt: now,
          status: 'judged',
          verdict: passed ? 'passed' : 'wrong-answer',
          program: {
            language: 'javascript',
            source: `export function solve() { return ${passed ? 0 : -999}; }`,
          },
          evidence: {
            status: 'recorded',
            totalCases: 24,
            passedCases: passed ? 24 : 1,
            cases: [
              {
                index: 0,
                input,
                expected: 0,
                actual: passed ? 0 : -999,
                status: passed ? 'passed' : 'failed',
              },
            ],
            execution: { exitCode: 0, timedOut: false, truncated: false, outputFormat: 'integer-array' },
          },
        },
      });
    }

    if (url.pathname === `/api/matches/${state.id}`) return route.fulfill({ json: view });

    return route.fulfill({ status: 404, json: { error: { message: 'Not available' } } });
  });
  await page.routeWebSocket('**/events?protocol=3', (socket) => {
    send = (data) => socket.send(data);
    socket.send(JSON.stringify({ type: 'observation', observation: view }));
  });
  await page.goto(`/matches/${state.id}`);
  await expect(page.getByRole('heading', { name: 'Public puzzle 1' })).toBeVisible();
  await expect(page.getByText('Revealed when the first finalist passes Tier 1.')).toBeVisible();
  expect(tiers).not.toContain(2);
  expect(reportRequests).toBe(0);
  await expect(page.getByText('Finalist chat', { exact: true })).toHaveCount(0);
  view.finale!.finalists[0].completedTier = 1;
  view.finale!.finalists[0].attempts = 2;
  view.finale!.submissions = [
    { sequence: 1, seat: 0, tier: 1, receivedAt: now, status: 'judged', verdict: null },
    { sequence: 2, seat: 0, tier: 1, receivedAt: now + 1, status: 'judged', verdict: null },
  ];
  send(JSON.stringify({ type: 'observation', observation: view }));
  await expect(page.getByRole('heading', { name: 'Public puzzle 2' })).toBeVisible();
  expect(tiers).toContain(2);
  expect(reportRequests).toBe(0);
  view = {
    ...view,
    status: 'finished',
    phase: { ...view.phase, kind: 'finished' },
    history: { ...view.history, visibilityEpoch: 'race-archive' },
    result: {
      kind: 'individual',
      winnerSeat: 0,
      credited: true,
      reason: 'tier-one',
      submission: 2,
      act1: view.act1Result!,
    },
    finale: {
      ...view.finale!,
      status: 'finished',
      submissions: [
        { sequence: 1, seat: 0, tier: 1, receivedAt: now, status: 'judged', verdict: 'wrong-answer' },
        { sequence: 2, seat: 0, tier: 1, receivedAt: now + 1, status: 'judged', verdict: 'passed' },
      ],
    },
  };
  send(JSON.stringify({ type: 'observation', observation: view }));
  await expect(page.getByText('24 / 24 tests passed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '#1 · Tier 1 · wrong answer', exact: true }).click();
  await expect(page.getByText('1 / 24 tests passed', { exact: true })).toBeVisible();
  await expect(page.getByText('expected 0 · got -999', { exact: true })).toBeVisible();
  await expect(page.getByText('export function solve() { return -999; }', { exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Solution tier' })
    .getByRole('button', { name: 'Tier 2', exact: true })
    .click();
  await expect(page.getByText('No Tier 2 submissions from this finalist.')).toBeVisible();
  await page
    .getByRole('group', { name: 'Solution tier' })
    .getByRole('button', { name: 'Tier 1', exact: true })
    .click();
  await page.getByRole('button', { name: `${view.seats[1].name} 0 submissions` }).click();
  await expect(page.getByText('This finalist did not submit a program.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('finished matches expose a bounded Act I timeline even after a long coding race', async ({ page }) => {
  const now = Date.now();

  const { state } = await createCodingFinale(
    'finished-timeline',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `archive-${seat}`,
      ownerId: null,
      name: `Archive ${seat}`,
      house: true,
      rating: 1000,
    })),
    now,
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
      },
    },
  );

  const initial = observeCodingFinale(state, null);

  let view: Observation3 = {
    ...initial,
    act: 2,
    status: 'finished',
    actOne: null,
    phase: { ...initial.phase, kind: 'finished', deadline: null },
    history: { visibilityEpoch: 'archive-only', streamHead: 420 },
    act1Result: { team: 'cooperative', reason: 'Five safeguards enacted.' },
    result: {
      kind: 'individual',
      winnerSeat: 0,
      credited: true,
      reason: 'priority',
      submission: null,
      act1: { team: 'cooperative', reason: 'Five safeguards enacted.' },
    },
    finale: {
      id: 'archive-race',
      challengeId: 'archive-puzzle',
      rulesVersion: FINALE_RULES.version,
      status: 'finished',
      startedAt: now,
      deadline: now + 300_000,
      result: { winnerSeat: 0, credited: true, reason: 'priority', submission: null },
      interruptionReason: null,
      commitment: 'digest',
      priorityReveal: null,
      finalists: [{ seat: 0, forfeited: false, completedTier: 0, attempts: 0 }],
      submissions: [],
      you: null,
      provisionalResult: null,
    },
    chat: { ...initial.chat, open: false },
  };

  const historyRequests: { after: number; through: number }[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    const identity = {
      gameId: 'coding-finale',
      protocolVersion: '3',
      matchId: state.id,
      visibilityEpoch: view.history.visibilityEpoch,
    };

    if (url.pathname === '/api/bootstrap')
      return route.fulfill({
        json: {
          name: 'Agent Game',
          mode: 'preview',
          authProviders: [],
          localLogin: false,
          owner: null,
          live: [],
          recent: [],
          leaderboard: [],
          queueCount: 0,
          houseAvailable: true,
        },
      });

    if (url.pathname === `/api/matches/${state.id}`) return route.fulfill({ json: view });

    if (url.pathname.endsWith('/rounds'))
      return route.fulfill({
        json: {
          ...identity,
          rounds: [
            { key: 'act-1:election-1', act: 1, round: 1, through: 1, eventKey: `${state.id}:1` },
            { key: 'act-2:table-1', act: 2, round: 1, through: 201, eventKey: `${state.id}:201` },
          ],
        },
      });

    if (url.pathname.endsWith('/replay') || url.pathname.endsWith('/checkpoint')) {
      const through = Number(url.searchParams.get('through'));

      return route.fulfill({
        json: {
          ...identity,
          through,
          baseline: { ...initial, history: { ...view.history, streamHead: through } },
        },
      });
    }

    if (url.pathname.endsWith('/history')) {
      const after = Number(url.searchParams.get('after'));
      const through = Number(url.searchParams.get('through'));
      const cursor = Math.min(through, after + 32);
      historyRequests.push({ after, through });

      return route.fulfill({
        json: {
          ...identity,
          after,
          through,
          cursor,
          streamHead: 420,
          hasMore: cursor < through,
          reset: false,
          events: Array.from({ length: cursor - after }, (_, index) => {
            const id = after + index + 1;

            return {
              id,
              eventKey: `${state.id}:${id}`,
              at: now + id,
              act: id <= 200 ? 1 : 2,
              round: 1,
              type: 'chat',
              seat: 0,
              text: `Archived statement ${id}`,
            };
          }),
        },
      });
    }

    return route.fulfill({ status: 404, json: { error: { message: 'Unavailable' } } });
  });
  let send = (_data: string) => {};

  await page.routeWebSocket('**/events?protocol=3', (socket) => {
    send = (data) => socket.send(data);
    socket.send(JSON.stringify({ type: 'observation', observation: view }));
  });
  await page.goto(`/matches/${state.id}`);
  await expect(page.getByRole('region', { name: 'Match activity', exact: true })).toBeVisible();
  await expect(page.getByText('Archived statement 200', { exact: true })).toBeVisible();
  expect(historyRequests.every((request) => request.through <= 200)).toBe(true);
  expect(await page.locator('.dossier-record > li').count()).toBeLessThanOrEqual(128);
  const feed = page.getByRole('region', { name: 'Match activity', exact: true });
  await feed.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByText('Archived statement 9', { exact: true })).toHaveCount(1);
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByText('Archived statement 200', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Archived statement 200', { exact: true })).toBeVisible();

  const terminal = view;
  view = {
    ...view,
    status: 'active',
    result: null,
    phase: { ...view.phase, kind: 'racing' },
    finale: { ...view.finale!, status: 'racing', result: null },
    history: { ...view.history, visibilityEpoch: 'race-live' },
  };
  await page.reload();
  await expect(page.getByRole('region', { name: 'Match activity', exact: true })).toBeVisible();
  await expect(page.getByText('Archived statement 200', { exact: true })).toBeVisible();
  view = terminal;
  send(JSON.stringify({ type: 'observation', observation: view }));
  await expect(page.getByRole('region', { name: 'Act I timeline', exact: true })).toBeVisible();
  await expect(page.getByText('Archived statement 200', { exact: true })).toBeVisible();
});
