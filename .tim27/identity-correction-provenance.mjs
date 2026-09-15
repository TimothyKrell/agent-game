import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const baseline = '7f7e447';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

const original = (path) => execFileSync('git', ['show', `${baseline}:${path}`]);

const accepted = JSON.parse(await readFile('.tim27/identity-provenance.json', 'utf8'));

const immutable = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '.tim27'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');

for (const path of immutable) assert.deepEqual(await readFile(path), original(path), `${path} is immutable`);

for (const [path, expected] of Object.entries(accepted.sha256))
  assert.equal(
    hash(path.startsWith('node_modules/') ? await readFile(path) : original(path)),
    expected,
    `Accepted identity provenance: ${path}`,
  );

for (const path of ['package.json', 'package-lock.json'])
  assert.deepEqual(await readFile(path), original(path), `${path} remains parent-owned and unchanged`);

const files = [
  ...Object.keys(accepted.sha256),
  '.gitignore',
  '.tim27/identity-provenance.json',
  'docs/evidence/TIM-27-identity-correction.md',
  '.tim27/identity-correction-provenance.mjs',
  '.tim27/identity-correction-red.json',
  '.tim27/identity-correction/identity-result.json',
  '.tim27/identity-correction/identity-vitest.json',
  '.tim27/identity-correction/identity-browser.png',
  '.tim27/identity-correction/regressions.json',
];

const sha256 = {};

for (const path of files) sha256[path] = hash(await readFile(path));

for (const [path, count] of [
  ['.tim27/identity-correction/identity-vitest.json', 16],
  ['.tim27/identity-correction/regressions.json', 13],
]) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(report.success, true);
  assert.equal(report.numPassedTests, count);
  assert.equal(report.numFailedTests, 0);
}

const red = JSON.parse(await readFile('.tim27/identity-correction-red.json', 'utf8'));

assert.equal(red.numFailedTests, 2);

const failures = red.testResults
  .flatMap((suite) => suite.assertionResults)
  .filter((test) => test.status === 'failed');

assert.match(
  failures.find((test) => test.title.startsWith('suffixes real')).failureMessages.join('\n'),
  /expected 500 to be 200/,
);

assert.match(
  failures.find((test) => test.title.startsWith('restricts signed')).failureMessages.join('\n'),
  /expected 200 to be 401/,
);

const manifestPath = '.tim27/identity-correction-provenance.json';

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.baseline, baseline);
  assert.deepEqual(manifest.immutableArtifacts, immutable);
  assert.deepEqual(manifest.sha256, sha256);
} else {
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        baseline,
        checkedAt: new Date().toISOString(),
        runtime: process.version,
        immutableArtifacts: immutable,
        acceptedIdentityHashesVerified: Object.keys(accepted.sha256).length,
        sha256,
      },
      null,
      2,
    ) + '\n',
  );
}

console.log(
  `PASS: ${files.length} correction hashes; ${immutable.length} immutable artifacts; all 33 accepted identity hashes; 16 identity + 13 regression passes; both pre-fix symptoms reproduced; dependencies unchanged.`,
);
