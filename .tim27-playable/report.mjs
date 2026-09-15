import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2]);

const results = JSON.parse(await readFile(`${directory}/results.json`, 'utf8'));

const tests = JSON.parse(await readFile(`${directory}/vitest.json`, 'utf8'));

assert.equal(tests.numPassedTests, 5);

assert.equal(tests.numFailedTests, 0);

assert.equal(tests.numPendingTests, 0);

const digest = async (path) => {
  const bytes = await readFile(path);

  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};

const evidence = [];

for (const name of (await readdir(directory)).sort()) {
  if (name === 'verification.json') continue;
  evidence.push(await digest(`${directory}/${name}`));
}

const code = [];

for (const name of (await readdir('.tim27-playable')).sort()) {
  if (!/\.(ts|mjs|cjs|sh|jsonc)$/.test(name) && name !== 'tsconfig.json') continue;
  code.push(await digest(`.tim27-playable/${name}`));
}

code.push(await digest('tests/preview-playable.test.ts'));

const completed = results.captures
  .filter((capture) => capture.sourceUsage)
  .map((capture) => ({
    harness: capture.harness,
    game: capture.game,
    matchId: capture.assigned.matchId,
    allocationId: capture.receipt.allocationId,
    reportedFillMs: capture.joined.fillAt - capture.joined.joinedAt,
    actualQueueMs: capture.result.queueDurationMs,
    status: capture.result.status,
    invocations: capture.result.invocations,
    restarts: capture.result.restarts,
    originalAgentForfeited: capture.originalAgentForfeited,
    logicalDiscussionWindows: capture.logicalDiscussionWindows,
    sourceUsageRows: capture.sourceUsage.length,
    accountedUsd: capture.sourceUsage.reduce((sum, row) => sum + row.actual, 0),
  }));

assert.equal(completed.length, 2);

console.log(
  JSON.stringify(
    {
      upstream: results.upstream,
      brokerHandoff: ['6ec2fc8', '7987815'],
      localHandoff: ['8e4947d', 'f7f99c4'],
      sourceArchiveSha256: results.sourceArchiveSha256,
      retainedFixtureDirectory: results.fixtureDirectory,
      evidenceDirectory: directory,
      passedTests: tests.numPassedTests,
      paidCalls: results.paidCalls,
      providerUrl: results.providerUrl,
      providerHttpRequests: results.providerCalls.length,
      completed,
      boundaries: results.captures.filter((capture) => !capture.sourceUsage),
      verification: [
        'build',
        'typecheck',
        'fixture-typecheck',
        'lint',
        'fixture-lint',
        'format',
        'asset-exclusion',
        'git diff --check',
      ],
      code,
      evidence,
    },
    null,
    2,
  ),
);
