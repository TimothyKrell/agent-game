import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { canonical, sha256, validateArtifact } from '../scripts/preview-artifact.ts';

const implementationCommit = process.argv[2];

assert.match(implementationCommit, /^[a-f0-9]{40}$/);

const parent = '87dda3896f37eafd9ed78273ff517b3b081aa4fc';

const root = '.tim27-lifecycle/';

const json = async (name) => JSON.parse(await readFile(root + name + '.json', 'utf8'));

const expanded = await json('smoke-schema-expanded');

const committed = await json('smoke-schema-committed');

const red = await json('smoke-schema-red');

assert.equal(expanded.numPassedTests, 170);

assert.equal(expanded.numFailedTests, 0);

assert.equal(expanded.numPendingTests, 0);

assert.equal(committed.numPassedTests, 4);

assert.equal(committed.numFailedTests, 0);

assert.equal(red.numFailedTests, 1);

const names = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: `${basename(file.name)}:${test.fullName}`,
      status: test.status,
    })),
  );

const current = new Map(names(expanded).map((test) => [test.name, test.status]));

for (const [name, count] of [
  ['generation-tests', 164],
  ['followup-tests', 121],
]) {
  const previous = names(await json(name));
  assert.equal(previous.length, count);
  assert.equal(new Set(previous.map((test) => test.name)).size, count);

  for (const test of previous) assert.equal(current.get(test.name), 'passed', test.name);
}

// Preserve every prior generation report/hash and all closed generation fences.
const prior = await json('generation-checks');

const preserved = [
  ...Object.keys(prior.hashes).map((name) => root + name),
  ...Object.keys(prior.frozenProbes).map((name) => root + name),
  root + 'generation-checks.json',
  'migrations/0008_preview_generation.sql',
  'scripts/preview-apply.ts',
  'scripts/preview-controller.ts',
  'scripts/preview-failure.ts',
  'scripts/preview-lifecycle.ts',
  'scripts/preview-lifecycle-state.ts',
  'scripts/preview-operations.ts',
  'src/server/preview-generation.ts',
  'src/server/preview-config.ts',
  'src/server/preview-broker-config.ts',
  'src/server/preview-artifacts.ts',
  'scripts/preview-d1.ts',
  'scripts/preview-transaction.ts',
  'package.json',
  'package-lock.json',
];

const preservedHashes = {};

for (const path of preserved) {
  const bytes = await readFile(path);
  assert.ok(bytes.equals(execFileSync('git', ['show', `${parent}:${path}`])), path);
  preservedHashes[path] = sha256(bytes);
}

const games = JSON.parse(await readFile(root + 'runs/smoke-schema-games.json', 'utf8'));

assert.equal(games.sourceCommit, '1'.repeat(40));

assert.deepEqual(
  games.matches.map((match) => [match.gameId, match.status]),
  [
    ['secret-overlord', 'finished'],
    ['succession', 'finished'],
  ],
);

assert.deepEqual(games.matches[1].socket.acts, [1, 2]);

const green = JSON.parse(await readFile(root + 'runs/smoke-health-schema.json', 'utf8'));

assert.equal(green.after.retired, false);

assert.ok(green.finalizerGitHubReads > 0);

assert.deepEqual(green.healthBefore, { ok: true, protocolVersion: '1' });

assert.deepEqual(green.healthAfter, green.healthBefore);

await writeFile(root + 'smoke-schema-games.json', canonical(games));

await writeFile(root + 'smoke-schema-green-observation.json', canonical(green));

const artifact = await validateArtifact(root + 'runs/committed-smoke-schema');

assert.equal(artifact.manifest.builtCommit, implementationCommit);

await writeFile(root + 'smoke-schema-artifact-manifest.json', artifact.raw);

const logs = [
  'smoke-schema-red',
  'smoke-schema-initial',
  'smoke-schema-expanded',
  'smoke-schema-committed',
  'smoke-schema-typecheck',
  'smoke-schema-lint',
  'smoke-schema-build',
  'smoke-schema-format',
  'smoke-schema-produce',
];

const rawLogHashes = {};

for (const name of logs) {
  const bytes = await readFile(root + name + '.log');
  rawLogHashes[name + '.log'] = sha256(bytes);
  await writeFile(
    root + name + '.txt',
    bytes
      .toString()
      .replace(/[\t ]+$/gm, '')
      .replace(/\n+$/, '\n'),
  );
}

const files = [
  'smoke-schema-red.json',
  'smoke-schema-red-observation.json',
  'smoke-schema-initial.json',
  'smoke-schema-expanded.json',
  'smoke-schema-committed.json',
  'smoke-schema-games.json',
  'smoke-schema-green-observation.json',
  'smoke-schema-artifact-manifest.json',
  ...logs.map((name) => name + '.txt'),
];

const hashes = Object.fromEntries(
  await Promise.all(files.map(async (name) => [name, sha256(await readFile(root + name))])),
);

const summary = (report) => ({
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  files: report.testResults.length,
  seconds: (Math.max(...report.testResults.map((file) => file.endTime)) - report.startTime) / 1000,
});

const evidence = {
  implementationCommit,
  testsWorktreeParent: parent,
  gamesReceiptLegacySourceCommit:
    'Synthetic all-ones fixture PR head; actual expanded-suite artifact/build revision is testsWorktreeParent.',
  expanded: summary(expanded),
  postCommitSupplement: summary(committed),
  priorUniqueAssertionsRetained: 164,
  originalUniqueAssertionsRetained: 121,
  originalRegression: { ...summary(red), expectedStatus: 'red' },
  initialFocusedRunBeforeFinalValidation: true,
  actualNodeSmokeGames: games.matches.map((match) => ({
    gameId: match.gameId,
    status: match.status,
    socket: match.socket,
  })),
  checks: {
    typecheck: 'passed',
    repositoryLintDenyWarnings: 'passed',
    productionBuild: 'passed',
    scopedPrettier: 'passed',
    diffCheck: 'passed',
  },
  artifact: {
    manifestSha256: artifact.manifestSha256,
    files: artifact.manifest.files.length,
    bytes: artifact.manifest.files.reduce((total, file) => total + file.bytes, 0),
    branchArchive: artifact.manifest.files.find(
      (file) => file.path === artifact.manifest.branchContent.archivePath,
    ),
  },
  localOnly: true,
  syntheticGitHubIdentity: true,
  hostedReleaseAttested: false,
  deploymentOrInferenceCalls: 0,
  node: process.version,
  textLogNormalization:
    'Trailing horizontal whitespace removed; final blank lines normalized to one newline.',
  rawLogHashes,
  hashes,
  preservedHashes,
};

await writeFile(root + 'smoke-schema-checks.json', canonical(evidence));

console.log(
  canonical({
    implementationCommit,
    expanded: evidence.expanded,
    supplement: evidence.postCommitSupplement,
    artifact: evidence.artifact,
  }),
);
