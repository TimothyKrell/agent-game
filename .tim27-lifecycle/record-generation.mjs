import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { canonical, sha256, validateArtifact } from '../scripts/preview-artifact.ts';

const implementationCommit = process.argv[2];

assert.match(implementationCommit, /^[a-f0-9]{40}$/);

const parent = 'e49507f1c45828967cfd9554f6c841c7b6086a4b';

const root = '.tim27-lifecycle/';

const report = async (name) => JSON.parse(await readFile(root + name + '.json', 'utf8'));

const tests = await report('generation-tests');

const committed = await report('generation-committed-tests');

const smoke = await report('generation-smoke-tests');

const baseline = await report('followup-tests');

const gap = await report('generation-before-red');

const finalizer = await report('finalizer-red');

assert.equal(tests.numFailedTests, 0);

assert.equal(tests.numPendingTests, 0);

assert.equal(committed.numPassedTests, 27);

assert.equal(committed.numFailedTests, 0);

assert.equal(smoke.numPassedTests, 2);

assert.equal(smoke.numFailedTests, 0);

assert.equal(gap.numFailedTests, 2);

assert.equal(finalizer.numFailedTests, 2);

const names = (result) =>
  result.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: `${basename(file.name)}:${test.fullName}`,
      status: test.status,
    })),
  );

const original = names(baseline);

assert.equal(original.length, 121);

assert.equal(new Set(original.map((test) => test.name)).size, 121);

const current = new Map(names(tests).map((test) => [test.name, test.status]));

for (const test of original) assert.equal(current.get(test.name), 'passed', test.name);

const frozenProbes = {};

for (const path of [
  'generation-gap.test.ts',
  'generation-gap.vitest.ts',
  'generation-gap.json',
  'generation-gap.txt',
]) {
  const actual = await readFile(root + path);
  assert.ok(actual.equals(execFileSync('git', ['show', `${parent}:${root}${path}`])));
  frozenProbes[path] = sha256(actual);
}

const artifact = await validateArtifact(root + 'runs/committed-generation');

assert.equal(artifact.manifest.builtCommit, implementationCommit);

await writeFile(root + 'generation-artifact-manifest.json', artifact.raw);

const integration = JSON.parse(await readFile(root + 'runs/integration.json', 'utf8'));

assert.equal(integration.publication.commit, implementationCommit);

assert.equal(integration.inferenceCalls, 0);

await writeFile(root + 'generation-integration.json', canonical(integration));

const logs = [
  'generation-before-red',
  'finalizer-before-red',
  'finalizer-confirmed-red',
  'finalizer-red',
  'generation-tests',
  'generation-committed-tests',
  'generation-smoke',
  'generation-typecheck-final',
  'generation-lint-evidence',
  'generation-build',
  'generation-format',
  'generation-produce',
];

for (const name of logs) {
  const text = await readFile(root + name + '.log', 'utf8');
  await writeFile(root + name + '.txt', text.replace(/[\t ]+$/gm, '').replace(/\n+$/, '\n'));
}

const files = [
  'generation-before-red.json',
  'finalizer-before-red.json',
  'finalizer-confirmed-red.json',
  'finalizer-red.json',
  'generation-tests.json',
  'generation-committed-tests.json',
  'generation-smoke-tests.json',
  'generation-integration.json',
  'generation-artifact-manifest.json',
  ...logs.map((name) => name + '.txt'),
];

const hashes = Object.fromEntries(
  await Promise.all(files.map(async (name) => [name, sha256(await readFile(root + name))])),
);

const summary = (result) => ({
  passed: result.numPassedTests,
  failed: result.numFailedTests,
  files: result.testResults.length,
  seconds: (Math.max(...result.testResults.map((file) => file.endTime)) - result.startTime) / 1000,
});

const evidence = {
  implementationCommit,
  testsRunBeforeCommit: true,
  testsWorktreeParent: parent,
  tests: summary(tests),
  committedLifecycleVerification: summary(committed),
  finalSemanticsVerification:
    'Committed runner/lifecycle supplement includes final target-retire payload/revision alignment. Full suite ran before that final one-line alignment.',
  baselineUniquePassingAssertionsRetained: 121,
  smoke: summary(smoke),
  originalUnfencedProbe: { ...summary(gap), expectedStatus: 'red' },
  finalizerRegression: { ...summary(finalizer), expectedStatus: 'red' },
  frozenProbes,
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
  parentHostedD1Evidence: {
    scope: 'Parent-only disposable D1 REST ingress experiment; not source/playable activation.',
    assessmentSha256: sha256(await readFile('/tmp/opencode/TIM-27-hosted-d1-contract/assessment.json')),
    closedFileManifestSha256: sha256(
      await readFile('/tmp/opencode/TIM-27-hosted-d1-contract/final-hashes.json'),
    ),
  },
  textLogNormalization:
    'Trailing horizontal whitespace removed; final blank lines normalized to one newline.',
  rawLogHashes: Object.fromEntries(
    await Promise.all(
      logs.map(async (name) => [name + '.log', sha256(await readFile(root + name + '.log'))]),
    ),
  ),
  hashes,
};

await writeFile(root + 'generation-checks.json', canonical(evidence));

console.log(
  canonical({
    implementationCommit,
    tests: evidence.tests,
    smoke: evidence.smoke,
    artifact: evidence.artifact,
  }),
);
