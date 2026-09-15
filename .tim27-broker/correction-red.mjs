import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reproduce against the immutable reviewed implementation, with the correction's current probes.
// No worktree mutation, shared dependency cache, or hosted provider access is involved.
const base = 'a953a3cb2ce03ed4a2cb7f087db5241e1ce10d3f';

const evidence = resolve(process.argv[2]);

mkdirSync(evidence); // Refuse to overwrite a previous capture.

const scratch = mkdtempSync('/tmp/opencode/tim27-broker-reviewed-');

const archive = execFileSync('git', ['archive', base], { maxBuffer: 128 * 1024 * 1024 });

execFileSync('tar', ['-x', '-C', scratch], { input: archive });

symlinkSync(resolve('node_modules'), `${scratch}/node_modules`, 'dir');

const verified = execFileSync(process.execPath, ['.tim27-broker/provenance.mjs', '--check'], {
  cwd: scratch,
  encoding: 'utf8',
});

writeFileSync(`${evidence}/original-provenance.json`, verified);

for (const path of [
  'tests/preview-broker.test.ts',
  'tests/preview-broker-ledger.test.ts',
  'tests/fixtures/preview-broker-worker.ts',
])
  copyFileSync(path, `${scratch}/${path}`);

const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--no-cache',
    'tests/preview-broker.test.ts',
    'tests/preview-broker-ledger.test.ts',
    '-t',
    '\\[correction\\]',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${evidence}/vitest.json`,
  ],
  {
    cwd: scratch,
    env: { ...process.env, TIM27_BROKER_EVIDENCE_DIR: evidence },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  },
);

writeFileSync(`${evidence}/run.log`, result.stdout + result.stderr);

const report = JSON.parse(readFileSync(`${evidence}/vitest.json`, 'utf8'));

if (result.status !== 1 || report.numFailedTests !== 4 || report.numPassedTests !== 0)
  throw new Error(`Expected four pre-fix probe failures; inspect ${evidence}/run.log`);

console.log(JSON.stringify({ base, scratch, evidence, failedAsExpected: 4, original: JSON.parse(verified) }));
