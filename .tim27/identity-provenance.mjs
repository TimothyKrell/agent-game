import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const source = (await readdir('src/server')).filter(
  (name) => name.startsWith('preview-') && name.endsWith('.ts'),
);

const files = [
  'package.json',
  'package-lock.json',
  'src/shared/preview.ts',
  'src/server/auth.ts',
  'src/server/pairing.ts',
  'src/server/worker.ts',
  ...source.map((name) => `src/server/${name}`),
  'migrations/0004_preview_identity.sql',
  'wrangler.jsonc',
  'worker-configuration.d.ts',
  'tests/preview-identity.test.ts',
  'tests/fixtures/preview-identity-worker.ts',
  'tests/preview-identity.wrangler.jsonc',
  'docs/design/TIM-27-playable-previews.md',
  'docs/evidence/TIM-27-identity-bridge.md',
  '.tim27/identity-provenance.mjs',
  '.tim27/identity-result.json',
  '.tim27/identity-vitest.json',
  '.tim27/identity-worker-regressions.json',
  '.tim27/identity-preview-regression.json',
  '.tim27/identity-browser.png',
  'node_modules/better-auth/package.json',
  'node_modules/better-auth/dist/db/internal-adapter.mjs',
  'node_modules/better-auth/dist/cookies/index.mjs',
  'node_modules/better-call/dist/error.d.mts',
  'node_modules/better-call/dist/endpoint.d.mts',
];

const hashes = {};

for (const path of files)
  hashes[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

for (const path of ['package.json', 'package-lock.json'])
  assert.equal(
    hashes[path],
    createHash('sha256')
      .update(execFileSync('git', ['show', `2066abd:${path}`]))
      .digest('hex'),
    `${path} remains parent-owned and unchanged`,
  );

const oldEvidence = execFileSync('git', ['ls-tree', '-r', '--name-only', '2066abd', '.tim27'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');

for (const path of oldEvidence)
  assert.deepEqual(
    await readFile(path),
    execFileSync('git', ['show', `2066abd:${path}`]),
    `${path} is immutable`,
  );

const tests = JSON.parse(await readFile('.tim27/identity-vitest.json', 'utf8'));

assert.equal(tests.success, true);

assert.equal(tests.numPassedTests, 14);

assert.equal(tests.numFailedTests, 0);

await writeFile(
  '.tim27/identity-provenance.json',
  JSON.stringify(
    {
      baseline: '73ca5627bfcd1a699650cd77d9c4e887a475ab06',
      contractCorrection: 'a104f60',
      checkedAt: new Date().toISOString(),
      runtime: process.version,
      originalEvidenceVerified: oldEvidence,
      sha256: hashes,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `PASS: ${files.length} implementation/evidence hashes; ${oldEvidence.length} original artifacts immutable; no dependency changes.`,
);
