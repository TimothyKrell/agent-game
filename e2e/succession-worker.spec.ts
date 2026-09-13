import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import { Observation2Schema } from '../src/shared/succession';

if (process.env.SUCCESSION_WORKER_URL) test.use({ baseURL: process.env.SUCCESSION_WORKER_URL });

test('real Worker exhibition plays both acts and opens the bounded archive in the browser', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/?gameId=succession');
  await expect(page.getByRole('button', { name: 'Succession', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Start local exhibition', exact: true }).click();
  await expect(page).toHaveURL(/\/matches\//);
  await expect(page.getByRole('heading', { name: /^Succession/ })).toBeVisible();
  const matchId = new URL(page.url()).pathname.split('/')[2];
  const response = await page.request.get(`/api/matches/${matchId}`, {
    headers: { 'X-Agent-Game-Protocols': '1,2' },
  });
  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  expect(bytes.byteLength).toBeLessThanOrEqual(14_336);
  const raw: unknown = JSON.parse(bytes.toString());
  const current = Schema.decodeUnknownSync(Observation2Schema)(raw);
  expect(current.gameId).toBe('succession');
  expect(current.protocolVersion).toBe('2');
  expect(raw).not.toHaveProperty('events');
  expect(raw).not.toHaveProperty('cursor');
  await expect(page.getByRole('heading', { name: 'Act 2 begins.' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.returned-marker')).toHaveCount(10);
  await expect(page.locator('.legal-actions')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/opencode/succession-ui/real-worker-act2.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole('region', { name: 'Archive disclosure at selected event' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('slider', { name: 'Replay event' }).fill('0');
  await expect(page.getByRole('region', { name: 'Act 1 board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One champion.' })).toBeVisible();
  await page.screenshot({ path: '/tmp/opencode/succession-ui/real-worker-replay.png', fullPage: true });
});
