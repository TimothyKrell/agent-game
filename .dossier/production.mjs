import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const directory = 'docs/evidence/TIM-19-22-components';

const forbidden = [
  'tim-6-replay-prototype',
  'succession-replay-record.prototype',
  'e65fb846-c804-4d8b-ba78-e303119e1847',
  'dp-prototype',
  'dossier-example-execution-return',
  'localhost:4747',
  'agentation',
  'LongUnbrokenIdentity',
  'Canonical component fixture ready',
  'production-components',
  'captured-initial',
];

const assets = await readdir('dist/client', { recursive: true, withFileTypes: true });

let scanned = 0;

for (const asset of assets) {
  if (!asset.isFile()) continue;
  assert.ok(!/prototype|tim-6/i.test(asset.name));

  if (!/\.(js|css|html|json)$/.test(asset.name)) continue;
  const text = await readFile(join(asset.parentPath, asset.name), 'utf8');

  for (const marker of forbidden) assert.ok(!text.includes(marker), `${asset.name}: ${marker}`);
  scanned++;
}

// The actual match route is integrated by TIM-23's owner. Independently bundle this production
// entry now to prove its complete import graph excludes guide/scenario/raw-capture modules.
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: '/tmp/opencode/dossier-component-build',
    lib: { entry: 'src/client/succession-dossier.tsx', formats: ['es'], fileName: () => 'dossier.js' },
    rollupOptions: { external: ['react', 'react/jsx-runtime', 'react-dom'] },
  },
});

const component = await readFile('/tmp/opencode/dossier-component-build/dossier.js', 'utf8');

for (const marker of forbidden) assert.ok(!component.includes(marker), marker);

assert.ok(component.includes('SuccessionDossier'));

const server = await preview({
  preview: { host: '127.0.0.1', port: 6292, strictPort: true },
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
  await page.goto('http://127.0.0.1:6292/matches/tim-6-replay-prototype?variant=C&sample=components');
  await page.locator('.resource-state').waitFor();
  assert.equal(
    await page.locator('[data-dossier-guide], .dp-prototype, [data-agentation-toolbar]').count(),
    0,
  );
  await page.screenshot({ path: `${directory}/production-direct-route.png` });
  await page.goto('http://127.0.0.1:6292/.dossier/browser.html');
  assert.equal(await page.getByText('Canonical component fixture ready').count(), 0);
  assert.equal(await page.getByRole('navigation', { name: 'Fixture controls' }).count(), 0);
  assert.ok(!requests.some((url) => /:4747|prototype\.(tsx|json)|dossier-controls/.test(url)));
  await writeFile(
    `${directory}/production.json`,
    JSON.stringify(
      {
        scannedAssets: scanned,
        entryBundleBytes: Buffer.byteLength(component),
        productionComponentImportGraphClean: true,
        directGuideExcluded: true,
        directFixtureExcluded: true,
        noPrototypeOrAgentationRequests: true,
        integratedProductionRoute: false,
        integrationBoundary:
          'Parent wires TIM-23 bounded historical reader to the Dossier chapter render slot.',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
