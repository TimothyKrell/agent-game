import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import { AgentProfileSchema } from '../../../src/shared/api';

const origin = 'http://127.0.0.1:8828';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

test('owner chooses, uploads, retries a lost receipt, replaces and removes through the real API', async ({
  page,
}) => {
  const login = await page.request.post('/api/dev/login', {
    headers: { origin },
    data: { name: `Picture owner ${randomUUID().slice(0, 6)}` },
  });

  expect(login.ok()).toBe(true);

  const created = await page.request.post('/api/owner/agents', {
    headers: { origin },
    data: { name: 'Portrait test' },
  });

  const profile = Schema.decodeUnknownSync(AgentProfileSchema)(await created.json());
  await page.goto('/dashboard');
  const editor = page.getByLabel('Picture for Portrait test', { exact: true });
  await editor.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(editor.getByText('No picture uploaded.')).toBeVisible();
  const input = editor.locator('input[type=file]');
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await expect(editor.getByRole('alert')).toHaveText('Pictures must be at most 2 MiB.');
  await expect(editor.getByRole('button', { name: 'Upload picture', exact: true })).toBeDisabled();
  await input.setInputFiles({ name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<svg/>') });
  await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('complete PNG or JPEG');
  await expect(editor.getByText('No picture uploaded.')).toBeVisible();

  // Deliberately lose the response only after the real Worker has committed it.
  const uploadPath = `/api/owner/agents/${profile.id}/picture`;
  let lostKey: string | undefined;
  let releaseReceipt = () => {};

  const holdReceipt = new Promise<void>((resolve) => {
    releaseReceipt = resolve;
  });

  await page.route(
    `**${uploadPath}`,
    async (route) => {
      lostKey = route.request().headers()['idempotency-key'];
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await holdReceipt;
      await route.abort('failed');
    },
    { times: 1 },
  );
  await input.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: png });
  await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
  await expect(editor.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  releaseReceipt();
  await expect(editor.getByRole('button', { name: 'Retry picture change' })).toBeVisible();

  const retryRequest = page.waitForRequest(
    (request) => request.url().endsWith(uploadPath) && request.method() === 'PUT',
  );

  await editor.getByRole('button', { name: 'Retry picture change' }).click();
  expect((await retryRequest).headers()['idempotency-key']).toBe(lostKey);
  await expect(editor.getByRole('status')).toHaveText('Picture saved.');
  const image = editor.getByRole('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1);
  await expect(editor.getByRole('link', { name: /Enlarge Portrait test/ })).toHaveAttribute(
    'target',
    '_blank',
  );
  await mkdir('test-results/agent-pictures/captures', { recursive: true });
  await editor.screenshot({ path: 'test-results/agent-pictures/captures/owner-upload-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.screenshot({ path: 'test-results/agent-pictures/captures/owner-upload-narrow.png' });

  const originalUrl = await image.getAttribute('src');
  await input.setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html>invalid</html>'),
  });
  await editor.getByRole('button', { name: 'Replace picture', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('complete PNG or JPEG');
  await expect(image).toHaveAttribute('src', originalUrl!);

  await input.setInputFiles('tests/fixtures/agent-pictures/fixture.jpg');
  await editor.getByRole('button', { name: 'Replace picture', exact: true }).click();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(8);
  await expect(editor.getByRole('alert')).toHaveCount(0);

  const retirement = await page.request.post(`/api/owner/agents/${profile.id}/retire`, {
    headers: { origin },
    data: {},
  });

  expect(retirement.ok()).toBe(true);
  await page.reload();
  await editor.locator('summary').click();
  await expect(
    editor.getByText('This agent is retired. Its current picture can still be removed.'),
  ).toBeVisible();
  await expect(editor.locator('input[type=file]')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Remove picture', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Picture removed.');
  await expect(editor.getByText('No picture uploaded.')).toBeVisible();
  await editor.screenshot({ path: 'test-results/agent-pictures/captures/owner-removed.png' });
});
