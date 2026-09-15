import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { Schema } from 'effect';
import { AgentProfileSchema } from '../../../src/shared/api';
import { AgentPictureSchema } from '../../../src/shared/agent-picture';

const origin = 'http://127.0.0.1:6372';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

async function editorFor(page: Page) {
  const login = await page.request.post('/api/dev/login', {
    headers: { origin },
    data: { name: `Portrait owner ${randomUUID().slice(0, 6)}` },
  });

  expect(login.ok()).toBe(true);

  const response = await page.request.post('/api/owner/agents', {
    headers: { origin },
    data: { name: 'Portrait recovery' },
  });

  const profile = Schema.decodeUnknownSync(AgentProfileSchema)(await response.json());
  await page.goto('/dashboard');
  const editor = page.getByLabel('Picture for Portrait recovery', { exact: true });
  await editor.locator('summary').click();
  await editor
    .locator('input[type=file]')
    .setInputFiles({ name: 'picture.png', mimeType: 'image/png', buffer: png });

  return { editor, agentId: profile.id, path: `/api/owner/agents/${profile.id}/picture` };
}

function ownerRead(request: Request) {
  const url = new URL(request.url());

  return request.method() === 'GET' && url.pathname === '/api/owner' && !url.search;
}

// Retain the accepted TIM-28 status-classification scenarios against the newly adopted owner UI.
for (const status of [401, 403]) {
  test(`non-JSON ${status} refreshes owner state without an uncertain mutation retry`, async ({ page }) => {
    const { editor, path } = await editorFor(page);
    await page.route(`**${path}`, (route) => route.fulfill({ status, body: 'Denied' }), { times: 1 });
    const refreshed = page.waitForRequest(ownerRead, { timeout: 2000 });
    await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
    await refreshed;
    await expect(editor.getByRole('alert')).toHaveText(`The request failed (${status}). Please try again.`);
    await expect(editor.getByRole('button', { name: 'Retry picture change' })).toHaveCount(0);
  });
}

for (const response of [
  { status: 503, body: 'Unavailable' },
  { status: 200, body: '{' },
  { status: 200, body: '{"unexpected":1}' },
]) {
  test(`uncertain ${response.status}/${response.body} reuses its operation after a real commit`, async ({
    page,
  }) => {
    const { editor, agentId, path } = await editorFor(page);
    let key: string | undefined;
    let revision: string | undefined;
    await page.route(
      `**${path}`,
      async (route) => {
        key = route.request().headers()['idempotency-key'];
        revision = route.request().headers()['if-match'];
        expect((await route.fetch()).ok()).toBe(true);
        await route.fulfill(response);
      },
      { times: 1 },
    );
    await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Retry picture change' })).toBeEnabled();

    const retry = page.waitForRequest(
      (request) => request.url().endsWith(path) && request.method() === 'PUT',
    );

    await editor.getByRole('button', { name: 'Retry picture change' }).click();
    expect((await retry).headers()).toMatchObject({ 'idempotency-key': key, 'if-match': revision });
    await expect(editor.getByRole('status')).toHaveText('Picture saved.');
    await expect(page.locator(`[data-entrant-id="${agentId}"] img`)).toHaveCount(2);

    const current = Schema.decodeUnknownSync(AgentPictureSchema)(
      await (await page.request.get(`/api/agents/${agentId}/picture`)).json(),
    );

    expect(current).toMatchObject({ state: 'present', revision: 1 });
  });
}

test('lost receipt, newer removal and failed GET retain metadata-only recovery and update every owner portrait', async ({
  page,
}) => {
  const { editor, agentId, path } = await editorFor(page);
  let puts = 0;
  await page.route(`**${path}`, async (route) => {
    puts++;
    const receipt = await route.fetch();
    expect(Schema.decodeUnknownSync(AgentPictureSchema)(await receipt.json())).toMatchObject({
      state: 'present',
      revision: 1,
    });

    if (puts === 1) await route.abort('failed');
    else await route.fulfill({ response: receipt });
  });
  await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Retry picture change' })).toBeEnabled();

  const removed = await page.request.delete(path, {
    headers: { origin, 'if-match': '"1"', 'idempotency-key': randomUUID() },
  });

  expect(Schema.decodeUnknownSync(AgentPictureSchema)(await removed.json())).toEqual({
    state: 'missing',
    revision: 2,
  });
  const metadata = `/api/agents/${agentId}/picture`;
  await page.route(`**${metadata}`, (route) => route.fulfill({ status: 503, body: 'Metadata unavailable' }));
  await page.route('**/api/owner', (route) => route.fulfill({ status: 503, body: 'Roster unavailable' }));
  await editor.getByRole('button', { name: 'Retry picture change' }).click();
  await expect(editor.getByRole('button', { name: 'Retry picture metadata' })).toBeEnabled();
  await expect(editor.getByRole('status')).toContainText('Picture change confirmed.');
  await expect(editor.locator('img')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Retry picture change' })).toHaveCount(0);
  await page.unroute(`**${metadata}`);
  await editor.getByRole('button', { name: 'Retry picture metadata' }).click();
  await expect(editor.getByRole('status')).toHaveText('Picture removed.');
  await expect(page.locator(`[data-entrant-id="${agentId}"] img`)).toHaveCount(0);
  await expect(page.locator('.roster-page > .error')).toContainText(
    'The request failed (503). Please try again.',
  );
  expect(puts).toBe(2);
});

test('confirmed current GET publishes a new picture to header and editor even when roster refresh fails', async ({
  page,
}) => {
  const { editor, agentId } = await editorFor(page);
  await page.route('**/api/owner', (route) => route.fulfill({ status: 503, body: 'Roster unavailable' }));
  await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Picture saved.');
  const portraits = page.locator(`[data-entrant-id="${agentId}"]`);
  await expect(portraits.locator('img')).toHaveCount(2);

  for (const image of await portraits.locator('img').all()) {
    await expect
      .poll(() =>
        image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
  }

  await portraits.first().click();
  const dialog = page.getByRole('dialog', { name: 'Portrait recovery', exact: true });
  await expect(dialog.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(portraits.first()).toBeFocused();
  await editor.getByRole('button', { name: 'Remove picture', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Picture removed.');
  await expect(portraits.locator('img')).toHaveCount(0);
  await expect(page.locator('.roster-page > .error')).toContainText(
    'The request failed (503). Please try again.',
  );
});
