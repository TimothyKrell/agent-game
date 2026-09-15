import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const file = '.tim27-broker/provenance.json';

const base = '546bb8b';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (process.argv.includes('--write')) {
  const trace = readFileSync('.tim27-broker/tim26-baseline/trace.json');
  writeFileSync('.tim27-broker/tim26-baseline/trace.json.gz', gzipSync(trace, { level: 9 }));

  const tracked = git(
    'ls-files',
    'src',
    'tests',
    'migrations',
    'package.json',
    'package-lock.json',
    'wrangler.jsonc',
    'worker-configuration.d.ts',
    'vitest*.ts',
    'tsconfig*.json',
    '.oxlintrc.json',
    'oxlint',
    'docs/evidence/TIM-27-preview-broker.md',
    '.gitignore',
  );

  const artifacts = git('ls-files', '.tim27-broker')
    .split('\n')
    .filter((path) => path && path !== file);

  // --write is intentionally explicit; stage the new source/evidence before capturing it.
  const paths = [
    ...new Set([
      ...tracked.split('\n'),
      ...artifacts,
      '.tim27-broker/tim26-baseline/trace.json.gz',
      'node_modules/better-auth/package.json',
      'node_modules/effect/package.json',
      'node_modules/@effect/ai-openai/package.json',
      'node_modules/wrangler/package.json',
      'node_modules/vitest/package.json',
    ]),
  ]
    .filter(Boolean)
    .sort();

  const accepted = git('ls-tree', '-r', '--name-only', base, '.tim27').split('\n').filter(Boolean);

  const acceptedHashes = Object.fromEntries(
    accepted.map((path) => {
      const original = execFileSync('git', ['show', `${base}:${path}`]);

      if (digest(readFileSync(path)) !== digest(original))
        throw new Error(`Accepted evidence changed: ${path}`);

      return [path, digest(original)];
    }),
  );

  writeFileSync(
    file,
    JSON.stringify(
      {
        base: git('rev-parse', base),
        createdAt: new Date().toISOString(),
        paidCalls: 0,
        inference: 'Local HTTP fixture through real source generateHouse; no external provider calls',
        originalTraceSha256: digest(trace),
        hashes: Object.fromEntries(paths.map((path) => [path, digest(readFileSync(path))])),
        acceptedHashes,
      },
      null,
      2,
    ) + '\n',
  );
}

const manifest = JSON.parse(readFileSync(file, 'utf8'));

for (const [report, count] of Object.entries({
  'native-vitest.json': 16,
  'identity-vitest.json': 18,
  'regressions.json': 56,
  'smoke-vitest.json': 2,
  'tim26-vitest.json': 1,
})) {
  const result = JSON.parse(readFileSync(`.tim27-broker/${report}`, 'utf8'));

  if (result.numTotalTests !== count || result.numPassedTests !== count || result.numFailedTests !== 0)
    throw new Error(`Incomplete validation: ${report}`);
}

for (const [path, expected] of Object.entries({ ...manifest.hashes, ...manifest.acceptedHashes })) {
  if (digest(readFileSync(path)) !== expected) throw new Error(`Provenance mismatch: ${path}`);
}

if (
  digest(gunzipSync(readFileSync('.tim27-broker/tim26-baseline/trace.json.gz'))) !==
  manifest.originalTraceSha256
)
  throw new Error('TIM-26 trace archive mismatch');

const summary = JSON.parse(readFileSync('.tim27-broker/tim26-baseline/summary.json', 'utf8'));

if (
  summary.status !== 'finished' ||
  summary.inference.funding.find((row) => row.kind === 'required').calls !== 392 ||
  Math.abs(summary.inference.accountedUsd - 1.28047) > 1e-10
)
  throw new Error('Production TIM-26 baseline changed');

console.log(
  JSON.stringify({
    verified: Object.keys(manifest.hashes).length,
    acceptedUnchanged: Object.keys(manifest.acceptedHashes).length,
    tim26Required: 392,
    tim26AccountedUsd: summary.inference.accountedUsd,
    paidCalls: 0,
  }),
);
