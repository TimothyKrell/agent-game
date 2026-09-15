import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { Schema } from 'effect';
import { AgentProfileSchema } from '../src/shared/api';
import { AgentPictureSchema } from '../src/shared/agent-picture';

const origin = 'http://127.0.0.1:8828';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

async function editorFor(page: Page) {
  const login = await page.request.post('/api/dev/login', {
    headers: { origin },
    data: { name: `Response owner ${randomUUID().slice(0, 6)}` },
  });

  expect(login.ok()).toBe(true);

  const response = await page.request.post('/api/owner/agents', {
    headers: { origin },
    data: { name: 'Response recovery' },
  });

  const profile = Schema.decodeUnknownSync(AgentProfileSchema)(await response.json());
  await page.goto('/dashboard');
  const editor = page.getByLabel('Picture for Response recovery', { exact: true });
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

for (const status of [401, 403]) {
  test(`a non-JSON ${status} refreshes owner state and does not offer an uncertain retry`, async ({
    page,
  }) => {
    const { editor, path } = await editorFor(page);
    await page.route(
      `**${path}`,
      (route) => route.fulfill({ status, contentType: 'text/html', body: '<h1>Denied</h1>' }),
      { times: 1 },
    );
    // Shorter than the dashboard's 10-second polling interval: this must be the failure-driven refresh.
    const refresh = page.waitForRequest(ownerRead, { timeout: 2000 });
    await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
    await refresh;
    await expect(editor.getByRole('alert')).toHaveText(`The request failed (${status}). Please try again.`);
    await expect(editor.getByRole('button', { name: 'Retry picture change' })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Upload picture', exact: true })).toBeEnabled();
  });
}

const uncertainResponses = [
  {
    name: 'non-JSON 503',
    status: 503,
    body: '<h1>Unavailable</h1>',
    message: 'The request failed (503). Please try again.',
  },
  {
    name: 'malformed 200',
    status: 200,
    body: '{',
    message: 'The server returned an unreadable picture response.',
  },
  {
    name: 'wrong-shape 200',
    status: 200,
    body: '{"unexpected":1}',
    message: 'The server returned an unreadable picture response.',
  },
];

for (const fixture of uncertainResponses) {
  test(`${fixture.name} preserves the operation for a same-key retry after a real commit`, async ({
    page,
  }) => {
    const { editor, agentId, path } = await editorFor(page);
    let requestId: string | undefined;
    let revision: string | undefined;
    let ownerReads = 0;
    page.on('request', (request) => {
      if (ownerRead(request)) ownerReads++;
    });
    await page.route(
      `**${path}`,
      async (route) => {
        requestId = route.request().headers()['idempotency-key'];
        revision = route.request().headers()['if-match'];
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        await route.fulfill({ status: fixture.status, contentType: 'text/html', body: fixture.body });
      },
      { times: 1 },
    );
    await editor.getByRole('button', { name: 'Upload picture', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveText(fixture.message);
    await expect(editor.getByRole('button', { name: 'Retry picture change' })).toBeEnabled();
    expect(ownerReads).toBe(0);

    const retry = page.waitForRequest(
      (request) => request.url().endsWith(path) && request.method() === 'PUT',
    );

    await editor.getByRole('button', { name: 'Retry picture change' }).click();
    const headers = (await retry).headers();
    expect(headers['idempotency-key']).toBe(requestId);
    expect(headers['if-match']).toBe(revision);
    await expect(editor.getByRole('status')).toHaveText('Picture saved.');
    await expect(editor.getByRole('alert')).toHaveCount(0);

    const current = Schema.decodeUnknownSync(AgentPictureSchema)(
      await (await page.request.get(`/api/agents/${agentId}/picture`)).json(),
    );

    expect(current).toMatchObject({ state: 'present', revision: 1 });
  });
}

test('a confirmed old receipt requires current metadata and retries only the failed GET after another writer removes the picture', async ({
  page,
}) => {
  const { editor, agentId, path } = await editorFor(page);
  let puts = 0;
  await page.route(`**${path}`, async (route) => {
    puts++;
    const response = await route.fetch();
    const receipt = Schema.decodeUnknownSync(AgentPictureSchema)(await response.json());
    expect(receipt).toMatchObject({ state: 'present', revision: 1 });

    if (puts === 1) await route.abort('failed');
    else await route.fulfill({ response });
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
  const metadataPath = `/api/agents/${agentId}/picture`;
  await page.route(`**${metadataPath}`, (route) =>
    route.fulfill({ status: 503, body: 'Metadata unavailable' }),
  );
  // This exercises the actual dashboard/useLoad failure contract: refresh catches and resolves,
  // retaining its previous roster. A separate result-bearing GET must govern the picture control.
  await page.route('**/api/owner', (route) => route.fulfill({ status: 503, body: 'Roster unavailable' }));
  await editor.getByRole('button', { name: 'Retry picture change' }).click();
  await expect(editor.getByRole('button', { name: 'Retry picture metadata' })).toBeEnabled();
  await expect(editor.getByRole('status')).toContainText('Picture change confirmed.');
  await expect(editor.getByRole('img')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Retry picture change' })).toHaveCount(0);
  expect(puts).toBe(2);
  await editor.screenshot({ path: '.tim28/captures/correction-metadata-required.png' });

  await page.unroute(`**${metadataPath}`);
  await editor.getByRole('button', { name: 'Retry picture metadata' }).click();
  await expect(editor.getByText('No picture uploaded.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('status')).toHaveText('Picture removed.');
  await expect(editor.getByRole('button', { name: 'Retry picture metadata' })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Retry picture change' })).toHaveCount(0);
  await expect(editor.getByRole('img')).toHaveCount(0);
  await expect(page.locator('.roster-page > .error')).toContainText(
    'The request failed (503). Please try again.',
  );
  await expect(editor.getByRole('alert')).toHaveCount(0);
  expect(puts).toBe(2);
  await editor.screenshot({ path: '.tim28/captures/correction-metadata-reconciled.png' });
});
