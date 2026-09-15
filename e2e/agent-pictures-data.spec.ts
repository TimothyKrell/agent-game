import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

let html = '';

test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [react()],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('e2e/fixtures/agent-pictures.tsx'),
        name: 'PictureLookupProbe',
        formats: ['iife'],
      },
    },
  });

  const output = Array.isArray(bundle) ? bundle[0] : bundle;

  if (!('output' in output)) throw new Error('Expected one in-memory fixture bundle');
  const chunk = output.output.find((entry) => entry.type === 'chunk');

  if (!chunk) throw new Error('Missing fixture JavaScript');
  html = `<meta charset="utf-8"><div id="root"></div><script>${chunk.code.replaceAll('</script', '<\\/script')}</script>`;
});

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.route('**/tim29-lookup*', (route) => route.fulfill({ contentType: 'text/html', body: html }));
});

function metadata(url: string, revision: number) {
  return new URL(url).searchParams.getAll('agentId').map((agentId) => ({
    agentId,
    picture: {
      state: 'present',
      revision,
      version: `v${revision}`,
      url: `/api/agents/${agentId}/picture/v${revision}`,
      contentType: 'image/png',
      width: 32,
      height: 32,
      bytes: 200,
    },
  }));
}

async function expectSharedMap(page: Page, revision: number) {
  await expect(page.getByLabel('Seats', { exact: true })).toContainText(`"revision":${revision}`);
  const seats = await page.getByLabel('Seats', { exact: true }).textContent();
  await expect(page.getByLabel('Mentions', { exact: true })).toHaveText(seats ?? '');
  await expect(page.getByLabel('Results', { exact: true })).toHaveText(seats ?? '');
}

test('one parent lookup feeds seats, mentions and results through rename and takeover', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/agent-pictures?*', (route) => {
    requests.push(route.request().url());

    return route.fulfill({ json: metadata(route.request().url(), requests.length) });
  });
  await page.goto('/tim29-lookup');
  await expectSharedMap(page, 1);
  await page.getByRole('button', { name: 'Rename and take over' }).click();
  await expect(page.getByLabel('Controller', { exact: true })).toHaveText('replacement-controller');
  await expectSharedMap(page, 1);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.getAll('agentId')).toEqual(
    Array.from({ length: 10 }, (_, index) => `original-${index}`),
  );
  await page.getByRole('button', { name: 'Refresh metadata', exact: true }).click();
  await expectSharedMap(page, 2);
  expect(requests).toHaveLength(2);
});

test('profile fields and newer removals render without initial or per-row metadata requests', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/agent-pictures?*', (route) => {
    requests.push(route.request().url());

    return route.fulfill({ json: metadata(route.request().url(), 2) });
  });
  await page.goto('/tim29-lookup?provided');
  await expectSharedMap(page, 1);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Report unavailable pictures' }).click();
  await expectSharedMap(page, 2);
  await page.getByRole('button', { name: 'Provide newer removal' }).click();
  await expect(page.getByLabel('Seats', { exact: true })).toContainText(
    '["original-0",{"state":"missing","revision":9}]',
  );
  expect(requests).toHaveLength(1);
});

test('image-failure recovery has one whole-roster budget even when each GET returns a different bad version', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/api/agent-pictures?*', (route) => {
    reads++;

    return route.fulfill({ json: metadata(route.request().url(), reads) });
  });
  await page.goto('/tim29-lookup');
  await expectSharedMap(page, 1);
  await page.getByRole('button', { name: 'Report unavailable pictures' }).click();
  await expectSharedMap(page, 2);
  await page.getByRole('button', { name: 'Report unavailable pictures' }).click();
  await page.getByRole('button', { name: 'Rename and take over' }).click();
  await expectSharedMap(page, 2);
  expect(reads).toBe(2);
});

test('failed optional metadata keeps missing fallbacks and recovers only on explicit refresh', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/api/agent-pictures?*', (route) => {
    reads++;

    return route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await page.goto('/tim29-lookup');
  await expect(page.getByLabel('Lookup error')).toHaveText('The request failed (503). Please try again.');
  await expectSharedMap(page, 0);
  await page.getByRole('button', { name: 'Rename and take over' }).click();
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Refresh metadata', exact: true }).click();
  await expect(page.getByLabel('Refresh status')).toHaveText('Failed');
  expect(reads).toBe(2);
  await page.unroute('**/api/agent-pictures?*');
  await page.route('**/api/agent-pictures?*', (route) =>
    route.fulfill({ json: metadata(route.request().url(), 3) }),
  );
  await page.getByRole('button', { name: 'Refresh metadata', exact: true }).click();
  await expectSharedMap(page, 3);
  await expect(page.getByLabel('Lookup error')).toBeEmpty();
});

test('roster replacement aborts the retired read and never shows its metadata in the next roster', async ({
  page,
}) => {
  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.route('**/api/agent-pictures?*', async (route) => {
    if (route.request().url().includes('other-'))
      await route.fulfill({ json: metadata(route.request().url(), 8) });
    // Keep the original response pending until the actual hook replaces its query scope.
  });
  await page.goto('/tim29-lookup');
  await expect(page.getByLabel('Fetching')).toHaveText('true');
  await page.getByRole('button', { name: 'Switch roster' }).click();
  await expectSharedMap(page, 8);
  await expect.poll(() => failed.some((url) => url.includes('original-0'))).toBe(true);
  await expect(page.getByLabel('Seats', { exact: true })).not.toContainText('original-');
  await expect(page.getByLabel('Cache entries')).toHaveText('1');
  await page.getByRole('button', { name: 'Unmount roster' }).click();
  await expect(page.getByLabel('Cache entries')).toHaveText('0');
});
