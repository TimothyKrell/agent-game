import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { Match, Schema } from 'effect';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

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
        entry: resolve('e2e/fixtures/agent-pictures-lifecycle.tsx'),
        name: 'PictureLifecycleProbe',
        formats: ['iife'],
      },
    },
  });

  const output = Array.isArray(bundle) ? bundle[0] : bundle;

  if (!('output' in output)) throw new Error('Expected one fixture bundle');
  const chunk = output.output.find((entry) => entry.type === 'chunk');

  if (!chunk) throw new Error('Missing fixture JavaScript');
  html = `<meta charset="utf-8"><div id="root"></div><script>${chunk.code.replaceAll('</script', '<\\/script')}</script>`;
});

async function transport(page: Page, path: string) {
  const requests: { key: string; attempt: number; aborted: boolean; respond: (revision: number) => void }[] =
    [];

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '', 'http://localhost');

    if (!url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html);

      return;
    }

    const ids = url.searchParams.getAll('agentId');
    const key = ids.join(',');
    let responded = false;

    const record = {
      key,
      attempt: requests.filter((item) => item.key === key).length + 1,
      aborted: false,
      respond: (revision: number) => {
        responded = true;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify(
            ids.map((agentId) => ({
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
            })),
          ),
        );
      },
    };

    response.on('close', () => {
      if (!responded) record.aborted = true;
    });
    requests.push(record);

    if ((key === 'alpha,beta' && record.attempt === 1) || (key === 'a' && record.attempt === 2)) return;
    record.respond(
      Match.value(key).pipe(
        Match.when('b', () => 8),
        Match.when('a', () => 3),
        Match.orElse(() => 2),
      ),
    );
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  await page.goto(`http://127.0.0.1:${address.port}${path}`);

  return {
    requests,
    close: async () => {
      await page.close();
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
      expect(errors).toEqual([]);
    },
  };
}

test('overlapping active rosters retain a provided removal against a held older lookup and retire it only after the last reader', async ({
  page,
}) => {
  const run = await transport(page, '/overlap');

  try {
    await expect.poll(() => run.requests.length).toBe(1);
    await page.getByRole('button', { name: 'Provide removal' }).click();
    await expect(page.getByLabel('Provided', { exact: true })).toContainText('"missing","revision":9');
    run.requests[0].respond(2);
    await expect(page.getByLabel('Current fetching')).toHaveText('false');
    await expect(page.getByLabel('Current', { exact: true })).toContainText(
      '["alpha",{"state":"missing","revision":9}]',
    );
    await page.getByRole('button', { name: 'Toggle provided' }).click();
    await page.getByRole('button', { name: 'Refresh Current', exact: true }).click();
    await expect.poll(() => run.requests.length).toBe(2);
    await expect(page.getByLabel('Current fetching')).toHaveText('false');
    await expect(page.getByLabel('Current', { exact: true })).toContainText('"missing","revision":9');
    await expect(page.getByLabel('Isolated', { exact: true })).toContainText('"missing","revision":1');
    await page.getByRole('button', { name: 'Toggle current' }).click();
    await expect(page.getByLabel('Queries')).toHaveText('0');
    await page.getByRole('button', { name: 'Toggle current' }).click();
    await expect(page.getByLabel('Current', { exact: true })).toContainText('"present","revision":2');
    await expect(page.getByLabel('Current', { exact: true })).not.toContainText('"revision":9');
  } finally {
    await run.close();
  }
});

test('lookup results publish newer shared revisions to provided overlaps without crossing QueryClients', async ({
  page,
}) => {
  const run = await transport(page, '/overlap');

  try {
    await expect.poll(() => run.requests.length).toBe(1);
    run.requests[0].respond(10);
    await expect(page.getByLabel('Current', { exact: true })).toContainText('"revision":10');
    await expect(page.getByLabel('Provided', { exact: true })).toContainText('"revision":10');
    await expect(page.getByLabel('Isolated', { exact: true })).toContainText('"revision":1');
    expect(run.requests).toHaveLength(1);
  } finally {
    await run.close();
  }
});

test('a refresh rejects retirement instead of resolving reverted or cached destination data, including A-B-A', async ({
  page,
}) => {
  const run = await transport(page, '/refresh');

  try {
    await expect(page.getByLabel('Source', { exact: true })).toContainText('"revision":3');
    await expect(page.getByLabel('Destination', { exact: true })).toContainText('"revision":8');
    await page.getByRole('button', { name: 'Start refresh', exact: true }).click();
    await expect.poll(() => run.requests.some((item) => item.key === 'a' && item.attempt === 2)).toBe(true);
    await page.getByRole('button', { name: 'Switch source' }).click();
    await expect(page.getByLabel('Source', { exact: true })).toContainText('["b",');
    await expect
      .poll(() => run.requests.find((item) => item.key === 'a' && item.attempt === 2)?.aborted)
      .toBe(true);
    await expect(page.getByLabel('Answer')).toHaveText('{"resolved":false,"name":"AbortError"}');
    await page.getByRole('button', { name: 'Switch source' }).click();
    await expect(page.getByLabel('Source', { exact: true })).toContainText('["a",');
    await page.getByRole('button', { name: 'Call captured refresh' }).click();
    await expect(page.getByLabel('Answer')).toHaveText('{"resolved":false,"name":"AbortError"}');
  } finally {
    await run.close();
  }
});

for (const retirement of ['switch', 'unmount']) {
  test(`${retirement} of one same-ID reader rejects its refresh but preserves the shared native request for the remaining reader`, async ({
    page,
  }) => {
    const run = await transport(page, '/refresh?shared');

    try {
      await expect(page.getByLabel('Source', { exact: true })).toContainText('"revision":3');
      await expect(page.getByLabel('Shared', { exact: true })).toContainText('"revision":3');
      await page.getByRole('button', { name: 'Start refresh', exact: true }).click();
      await expect.poll(() => run.requests.some((item) => item.key === 'a' && item.attempt === 2)).toBe(true);
      await page
        .getByRole('button', { name: retirement === 'switch' ? 'Switch source' : 'Toggle source' })
        .click();
      await expect(page.getByLabel('Answer')).toHaveText('{"resolved":false,"name":"AbortError"}');
      const held = run.requests.find((item) => item.key === 'a' && item.attempt === 2);
      expect(held?.aborted).toBe(false);

      if (retirement === 'switch') {
        await page.getByRole('button', { name: 'Switch source' }).click();
        await page.getByRole('button', { name: 'Call captured refresh' }).click();
        await expect(page.getByLabel('Answer')).toHaveText('{"resolved":false,"name":"AbortError"}');
      }

      held?.respond(4);
      await expect(page.getByLabel('Shared', { exact: true })).toContainText('"revision":4');

      if (retirement === 'switch')
        await expect(page.getByLabel('Source', { exact: true })).toContainText('"revision":4');
      else await expect(page.getByLabel('Source', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Answer')).toHaveText('{"resolved":false,"name":"AbortError"}');
    } finally {
      await run.close();
    }
  });
}
