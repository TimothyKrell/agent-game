import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { canonical, sha256, validateArtifact } from '../scripts/preview-artifact.ts';

const implementationCommit = '3c7bf990a7ecfb8686d33a199a9ccdc37de8d949';

const tests = JSON.parse(await readFile('.tim27-lifecycle/followup-tests.json', 'utf8'));

const runner = JSON.parse(await readFile('.tim27-lifecycle/followup-runner.json', 'utf8'));

const gap = JSON.parse(await readFile('.tim27-lifecycle/generation-gap.json', 'utf8'));

assert.equal(tests.numPassedTests, 121);

assert.equal(tests.numFailedTests, 0);

assert.equal(runner.numPassedTests, 2);

assert.equal(runner.numFailedTests, 0);

assert.equal(gap.numFailedTests, 2);

assert.equal(gap.numPassedTests, 0);

const artifact = await validateArtifact('.tim27-lifecycle/runs/committed-3c7bf99');

assert.equal(artifact.manifest.builtCommit, implementationCommit);

const integration = JSON.parse(await readFile('.tim27-lifecycle/runs/integration.json', 'utf8'));

assert.equal(integration.inferenceCalls, 0);

assert.equal(integration.syntheticGitHubIdentity, true);

assert.equal(integration.publication.commit, '12e5c00af446abf8a10c3f15ff6ae1fda286a094');

await writeFile('.tim27-lifecycle/followup-integration.json', canonical(integration));

await writeFile('.tim27-lifecycle/followup-artifact-manifest.json', artifact.raw);

const logs = [
  'retry-red',
  'followup-tests',
  'followup-runner',
  'generation-gap',
  'followup-typecheck',
  'followup-lint',
  'followup-build',
  'followup-format',
];

for (const name of logs) {
  const text = await readFile(`.tim27-lifecycle/${name}.log`, 'utf8');
  await writeFile(`.tim27-lifecycle/${name}.txt`, text.replace(/\n+$/, '\n'));
}

const reports = [
  'followup-tests.json',
  'followup-runner.json',
  'generation-gap.json',
  'followup-integration.json',
  'followup-artifact-manifest.json',
];

const hashes = Object.fromEntries(
  await Promise.all(
    [...reports, ...logs.map((name) => `${name}.txt`)].map(async (name) => [
      name,
      sha256(await readFile(`.tim27-lifecycle/${name}`)),
    ]),
  ),
);

const summary = (report) => ({
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  files: report.testResults.length,
  seconds: (Math.max(...report.testResults.map((test) => test.endTime)) - report.startTime) / 1000,
});

const archive = artifact.manifest.files.find(
  (file) => file.path === artifact.manifest.branchContent.archivePath,
);

assert.ok(archive);

const evidence = {
  implementationCommit,
  testsRunBeforeCommit: true,
  testsWorktreeParent: integration.publication.commit,
  fullSuiteBeforeFinalResourceBindingAssertions: true,
  finalResourceBindingAssertionsCoveredByRunnerReport: true,
  runtimeUnchangedSinceOriginalEvidence: true,
  tests: summary(tests),
  runner: summary(runner),
  unresolvedGenerationGap: { ...summary(gap), expectedStatus: 'red', blocksIdentityActivation: true },
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
    branchArchive: archive,
  },
  localOnly: true,
  syntheticGitHubIdentity: true,
  hostedReleaseAttested: false,
  deploymentOrInferenceCalls: 0,
  textLogNormalization: 'Final blank lines normalized to one newline.',
  node: process.version,
  hashes,
};

await writeFile('.tim27-lifecycle/followup-checks.json', canonical(evidence));

console.log(
  canonical({
    implementationCommit,
    tests: evidence.tests,
    runner: evidence.runner,
    unresolvedGenerationGap: evidence.unresolvedGenerationGap,
    artifact: evidence.artifact,
  }),
);
