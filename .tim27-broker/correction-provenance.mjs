import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const base = 'a953a3cb2ce03ed4a2cb7f087db5241e1ce10d3f';

const file = '.tim27-broker/correction-provenance.json';

const tracePath = '.tim27-broker/correction-tim26-20260915-01/trace.json';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const originalBytes = execFileSync('git', ['show', `${base}:.tim27-broker/provenance.json`]);

const original = JSON.parse(originalBytes);

// The old manifest still describes a953a3c, not this correction. Check that original snapshot as such.
for (const [path, hash] of Object.entries(original.hashes)) {
  const bytes = path.startsWith('node_modules/')
    ? readFileSync(path)
    : execFileSync('git', ['show', `${base}:${path}`], { maxBuffer: 32 * 1024 * 1024 });

  if (digest(bytes) !== hash) throw new Error(`Original snapshot mismatch: ${path}`);
}

for (const [path, hash] of Object.entries(original.acceptedHashes))
  if (digest(readFileSync(path)) !== hash) throw new Error(`Accepted identity artifact changed: ${path}`);

for (const path of git('ls-tree', '-r', '--name-only', base, '.tim27-broker').split('\n'))
  if (
    digest(readFileSync(path)) !==
    digest(execFileSync('git', ['show', `${base}:${path}`], { maxBuffer: 32 * 1024 * 1024 }))
  )
    throw new Error(`Original broker artifact changed: ${path}`);

for (const [report, passed, failed] of [
  ['correction-red-20260915-02/vitest.json', 0, 4],
  ['correction-green-20260915-05/native-vitest.json', 19, 0],
  ['correction-green-20260915-01/regressions.json', 58, 0],
  ['correction-tim26-20260915-01/vitest.json', 1, 0],
]) {
  const result = JSON.parse(readFileSync(`.tim27-broker/${report}`, 'utf8'));

  if (
    result.numPassedTests !== passed ||
    result.numFailedTests !== failed ||
    (failed === 0 && result.numTotalTests !== passed)
  )
    throw new Error(`Unexpected validation result: ${report}`);
}

if (
  digest(readFileSync('.tim27-broker/correction-tim26-20260915-01/summary.json')) !==
  digest(readFileSync('.tim27-broker/tim26-baseline/summary.json'))
)
  throw new Error('TIM-26 summary differs from the accepted source baseline');

if (process.argv.includes('--write')) {
  const trace = readFileSync(tracePath);
  writeFileSync(`${tracePath}.gz`, gzipSync(trace, { level: 9 }));

  // Stage new evidence first. The full current source/dependency snapshot remains independently pinned.
  const paths = [
    ...new Set([
      ...Object.keys(original.hashes),
      ...Object.keys(original.acceptedHashes),
      ...git(
        'ls-files',
        '.tim27-broker/correction*',
        'docs/evidence/TIM-27-preview-broker-correction.md',
      ).split('\n'),
      `${tracePath}.gz`,
    ]),
  ]
    .filter((path) => path && path !== file)
    .sort();

  writeFileSync(
    file,
    JSON.stringify(
      {
        reviewedCommit: base,
        implementationCommit: git('rev-parse', 'HEAD'),
        createdAt: new Date().toISOString(),
        paidCalls: 0,
        originalSnapshotHashes: Object.keys(original.hashes).length,
        acceptedIdentityArtifacts: Object.keys(original.acceptedHashes).length,
        traceSha256: digest(trace),
        hashes: Object.fromEntries(paths.map((path) => [path, digest(readFileSync(path))])),
      },
      null,
      2,
    ) + '\n',
  );
}

const manifest = JSON.parse(readFileSync(file, 'utf8'));

for (const [path, hash] of Object.entries(manifest.hashes))
  if (digest(readFileSync(path)) !== hash) throw new Error(`Correction snapshot mismatch: ${path}`);

if (digest(gunzipSync(readFileSync(`${tracePath}.gz`))) !== manifest.traceSha256)
  throw new Error('Correction TIM-26 trace archive mismatch');

console.log(
  JSON.stringify({
    verified: Object.keys(manifest.hashes).length,
    originalSnapshot: Object.keys(original.hashes).length,
    acceptedUnchanged: Object.keys(original.acceptedHashes).length,
    redFailures: 4,
    native: 19,
    regressions: 58,
    tim26: 1,
    tim26SummaryIdentical: true,
    paidCalls: 0,
  }),
);
