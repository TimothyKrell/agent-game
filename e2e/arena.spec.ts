import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

test('onboards without signing in first and copies a self-contained prompt on desktop and mobile', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('link', { name: 'Connect your agent', exact: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Your next game starts with a conversation.' }),
  ).toBeVisible();
  const prompt = page.getByLabel('Message for your agent');
  const text = await prompt.inputValue();
  const origin = new URL(page.url()).origin;
  expect(text).toContain(`${origin}/agents.md`);
  expect(text).toContain('personal /agent-game skill');
  await page.getByRole('button', { name: 'Copy prompt' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await expect(page.getByRole('status')).toContainText('Copied.');
  await expect(page.getByText('Next time, just ask.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/agent-game-onboarding-mobile.png', fullPage: true });
  // Clipboard-disabled browsers still leave a selectable, complete prompt.
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new Error('unavailable');
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(page.getByRole('status')).toContainText('Message selected.');
  expect(
    await prompt.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart),
  ).toBe(text.length);
});

test('browser pairing approves only the chosen competitor and revokes the installation', async ({
  page,
  request,
}) => {
  const token = `agk_${randomBytes(32).toString('base64url')}`;

  const pairingResponse = await request.post('/api/pairing', {
    data: {
      installation: 'Browser pairing check',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    },
  });

  const pairing = await pairingResponse.json();
  await page.goto(`/connect?code=${pairing.code}`);
  await page.getByLabel('Local preview identity').fill(`Pairing owner ${Date.now()}`);
  await page.getByRole('button', { name: 'Enter local preview' }).click();
  await expect(page.getByRole('heading', { name: 'Authorize an installation' })).toBeVisible();
  await page.getByLabel('Agent name', { exact: true }).fill('Paired Contender');
  await page.getByRole('button', { name: 'Create competitor' }).click();
  await expect(page.getByLabel('Competitor profile')).toContainText('Paired Contender');
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.screenshot({ path: '/tmp/opencode/luminous-pairing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/opencode/luminous-pairing-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve connection' }).click();
  await expect(page.getByRole('heading', { name: 'Your agent is connected.' })).toBeVisible();
  await expect(page.getByText(/Return to your agent’s chat/)).toBeVisible();
  const proof = await request.get('/api/pairing/status', { headers: { authorization: `Bearer ${token}` } });
  expect(await proof.json()).toMatchObject({ status: 'approved', agentName: 'Paired Contender' });
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('Paired Contender · Revoked')).toBeVisible();
  expect((await request.get('/api/queue', { headers: { authorization: `Bearer ${token}` } })).status()).toBe(
    401,
  );
});

test('owner creates and retires a persistent competitor, signs out and returns to the same roster', async ({
  page,
}) => {
  const ownerName = `Browser owner ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Local preview identity').fill(ownerName);
  await page.getByRole('button', { name: 'Enter local preview' }).click();
  await expect(page.getByRole('heading', { name: 'Your roster.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  await page.getByLabel('Agent name', { exact: true }).fill('Browser Contender');
  await page.getByLabel('A little personality').fill('A patient strategist with a very long memory.');
  await page.getByRole('button', { name: 'Create competitor' }).click();
  await page.getByRole('link', { name: 'Browser Contender' }).click();
  await expect(page.getByRole('heading', { name: 'Browser Contender' })).toBeVisible();
  await expect(page.getByText('Provisional · 0/10 placement games')).toBeVisible();
  await expect(page.getByText('A patient strategist with a very long memory.')).toBeVisible();
  const profile = page.url();
  await page.getByRole('link', { name: 'Your roster', exact: true }).click();
  await page.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(page.locator('.roster-card').getByText('RETIRED', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retire', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enter local preview' })).toBeVisible();
  await page.getByLabel('Local preview identity').fill(ownerName);
  await page.getByRole('button', { name: 'Enter local preview' }).click();
  await expect(page.locator('.roster-card').getByText('RETIRED', { exact: true })).toBeVisible();
  await page.goto(profile);
  await expect(page.getByRole('heading', { name: 'Browser Contender' })).toBeVisible();
  await expect(page.getByText('Retired', { exact: true })).toBeVisible();
});

test('spectates a live exhibition and scrubs its completed private replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your agent. Their next great rival.' })).toBeVisible();
  await page.screenshot({ path: '/tmp/opencode/agent-game-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Start local exhibition' }).click();
  await expect(page.getByText('Public spectator', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Match timeline' })).toBeVisible();
  await expect(page.locator('.seat')).toHaveCount(10);
  await page.screenshot({ path: '/tmp/opencode/agent-game-table.png', fullPage: true });
  await expect(page.getByText('Replay timeline', { exact: true })).toBeVisible({ timeout: 50_000 });
  await page.getByRole('slider', { name: 'Replay event' }).fill('5');
  await expect(page.getByText(/Event 5 \//)).toBeVisible();
  await page.getByRole('slider', { name: 'Replay event' }).press('End');
  await expect(page.locator('.seat .badge').filter({ hasText: 'overlord' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile arena and live table fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect your agent', exact: true }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: '/tmp/opencode/agent-game-mobile.png', fullPage: true });
  const replay = page.getByRole('link', { name: 'Open replay', exact: true }).first();

  if (await replay.count()) {
    await replay.click();
    await expect(page.locator('.seat')).toHaveCount(10);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});
