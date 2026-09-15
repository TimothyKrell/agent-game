import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2]);

const entries = await readdir(directory, { withFileTypes: true });

const root = entries.some((entry) => entry.name === 'evidence' && entry.isDirectory())
  ? `${directory}/evidence`
  : directory;

const cases = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('case-'))
  .map((entry) => `${root}/${entry.name}`);

const records = await Promise.all(
  (cases.length ? cases : [root]).map(async (path) =>
    JSON.parse(await readFile(`${path}/results.json`, 'utf8')),
  ),
);

const results = {
  upstream: records[0].upstream,
  sourceArchiveSha256: records[0].sourceArchiveSha256,
  fixtureDirectory: records.map((record) => record.fixtureDirectory),
  providerUrl: records[0].providerUrl,
  providerCalls: records.flatMap((record) => record.providerCalls),
  captures: records.flatMap((record) => record.captures),
  paidCalls: records.reduce((sum, record) => sum + record.paidCalls, 0),
};

assert.ok(
  records.every(
    (record) =>
      record.upstream === results.upstream && record.sourceArchiveSha256 === results.sourceArchiveSha256,
  ),
);

const tests = JSON.parse(await readFile(`${directory}/vitest.json`, 'utf8'));

const journeys = tests.testResults.find((file) => file.name.endsWith('/tests/preview-playable.test.ts'));

assert.equal(journeys.assertionResults.length, 5);

assert.ok(journeys.assertionResults.every((test) => test.status === 'passed'));

assert.equal(tests.numFailedTests, 0);

assert.equal(tests.numPendingTests, 0);

const digest = async (path) => {
  const bytes = await readFile(path);

  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};

const evidence = [];

for (const path of [directory, ...cases]) {
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isFile() || entry.name === 'verification.json') continue;
    evidence.push(await digest(`${path}/${entry.name}`));
  }
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
      verificationLogs: evidence.flatMap((entry) => (entry.path.endsWith('.log') ? [entry.path] : [])),
      code,
      evidence,
    },
    null,
    2,
  ),
);
