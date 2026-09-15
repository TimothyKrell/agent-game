import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const guide = [
  'succession-dossier.prototype.tsx',
  'succession-dossier.prototype.css',
  'succession-dossier-rules.prototype.tsx',
  'succession-dossier-profiles.prototype.tsx',
  'succession-dossier-data.prototype.ts',
  'succession-replay.prototype.tsx',
  'succession-replay.prototype.css',
  'succession-replay-fixture.prototype.ts',
  'succession-replay-record.prototype.json',
];

const guideHashes = {};

for (const name of guide) {
  const path = `src/client/${name}`;
  const source = await readFile(path);
  assert.deepEqual(source, execFileSync('git', ['show', `6b83e92:${path}`]), `Preserved guide: ${name}`);
  guideHashes[name] = createHash('sha256').update(source).digest('hex');
}

const forbidden = [
  'tim-6-replay-prototype',
  'succession-replay-record.prototype',
  'e65fb846-c804-4d8b-ba78-e303119e1847',
  'dp-example-execution-return',
  'dp-prototype',
  'localhost:4747',
  'agentation',
  'TIM-11 production primitive fixture',
  'tim11-collapse',
  'Persistent coins rules',
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
  preview: { host: '127.0.0.1', port: 6374, strictPort: true },
  logLevel: 'error',
});

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

await mkdir('.tim29/captures', { recursive: true });

const requests = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: 'Record unavailable' } }),
  );
  await page.goto('http://127.0.0.1:6374/matches/tim-6-replay-prototype?variant=C&sample=examples');
  await page.locator('.resource-state').waitFor();
  assert.ok(requests.some((url) => new URL(url).pathname === '/api/matches/tim-6-replay-prototype'));
  assert.equal(await page.locator('.dp-prototype, .dp-example-index, [data-agentation-toolbar]').count(), 0);
  await page.screenshot({ path: '.tim29/captures/production-direct-route.png' });
  await page.goto('http://127.0.0.1:6374/.tim11/foundations.html');
  assert.equal(await page.getByRole('heading', { name: 'Reading controls' }).count(), 0);
  assert.equal(await page.locator('[data-agentation-toolbar]').count(), 0);
  assert.ok(!requests.some((url) => /:4747|prototype\.(tsx|json)|foundations\.tsx/.test(url)));

  const result = {
    scanned,
    layers,
    preservedGuideBaseline: '6b83e92: 20 groups / 36 terms',
    guideHashes,
    oneHoistedFontImport: true,
    noPreflight: true,
    guideRouteExcluded: true,
    fixtureRouteExcluded: true,
    noDevtoolRequests: true,
  };

  await writeFile('.tim29/production.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
