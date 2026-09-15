import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const directory = 'docs/evidence/TIM-11-foundations';

const forbidden = [
  'tim-6-replay-prototype',
  'succession-replay-record.prototype',
  'e65fb846-c804-4d8b-ba78-e303119e1847',
  'dp-example-execution-return',
  'dp-prototype',
  'localhost:4747',
  'agentation',
  'TIM-11 production primitive fixture',
];

const files = await readdir('dist/client', { recursive: true, withFileTypes: true });

let scanned = 0;

let stylesheet = '';

for (const file of files) {
  if (!file.isFile()) continue;
  assert.ok(!/prototype|tim-6|dossier/i.test(file.name), file.name);

  if (!/\.(js|css|html|json|svg)$/.test(file.name)) continue;

  const text = await readFile(join(file.parentPath, file.name), 'utf8');

  for (const marker of forbidden) assert.ok(!text.includes(marker), `${file.name}: ${marker}`);

  if (file.name.endsWith('.css')) stylesheet += text;
  scanned++;
}

const layers = [...stylesheet.matchAll(/@layer ([^{};]+)/g)].map((match) => match[1]);

assert.deepEqual(layers, ['theme', 'legacy', 'base', 'components', 'utilities']);

assert.equal(stylesheet.match(/fonts.googleapis.com/g)?.length, 1);

assert.ok(stylesheet.startsWith('@import "https://fonts.googleapis.com/'));

assert.ok(stylesheet.includes('.tw\\:shrink-0'));

assert.ok(!stylesheet.includes('::file-selector-button'));

const server = await preview({
  preview: { host: '127.0.0.1', port: 6192, strictPort: true },
  logLevel: 'error',
});

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

const requests = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: 'Record unavailable' } }),
  );
  await page.goto('http://127.0.0.1:6192/matches/tim-6-replay-prototype?variant=C&sample=examples');
  await page.locator('.resource-state').waitFor();
  assert.ok(requests.some((url) => new URL(url).pathname === '/api/matches/tim-6-replay-prototype'));
  assert.equal(await page.locator('.dp-prototype, .dp-example-index, [data-agentation-toolbar]').count(), 0);
  await page.screenshot({ path: `${directory}/production-direct-route.png` });
  await page.goto('http://127.0.0.1:6192/.tim11/foundations.html');
  assert.equal(await page.getByRole('heading', { name: 'Reading controls' }).count(), 0);
  assert.equal(await page.locator('[data-agentation-toolbar]').count(), 0);
  assert.ok(!requests.some((url) => /:4747|prototype\.(tsx|json)|foundations\.tsx/.test(url)));
  await writeFile(
    `${directory}/production.json`,
    JSON.stringify(
      {
        scanned,
        layers,
        oneHoistedFontImport: true,
        prefixedUtility: true,
        noPreflight: true,
        guideRouteExcluded: true,
        fixtureRouteExcluded: true,
        noDevtoolRequests: true,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
