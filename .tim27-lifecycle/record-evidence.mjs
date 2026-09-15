import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { validateArtifact, canonical, sha256 } from '../scripts/preview-artifact.ts';

const implementationCommit = '1a7d537d6fe213ec008c5c4456efa3fdb501d3fa';

const artifact = await validateArtifact('.tim27-lifecycle/runs/committed-1a7d537');

assert.equal(artifact.manifest.builtCommit, implementationCommit);

const tests = JSON.parse(await readFile('.tim27-lifecycle/tests.json', 'utf8'));

const smoke = JSON.parse(await readFile('.tim27-lifecycle/smoke-tests.json', 'utf8'));

const integration = JSON.parse(await readFile('.tim27-lifecycle/integration.json', 'utf8'));

assert.equal(tests.numFailedTests, 0);

assert.equal(tests.numPassedTests, 118);

assert.equal(smoke.numFailedTests, 0);

assert.equal(smoke.numPassedTests, 2);

assert.equal(integration.publication.commit, implementationCommit);

assert.equal(integration.inferenceCalls, 0);

for (const [input, output] of [
  ['refresh-red.log', 'refresh-red.txt'],
  ['refresh-green.log', 'refresh-green.txt'],
  ['smoke-tests.log', 'smoke.txt'],
]) {
  const text = await readFile(`.tim27-lifecycle/${input}`, 'utf8');
  await writeFile(`.tim27-lifecycle/${output}`, text.replace(/\n+$/, '\n'));
}

const files = [
  'tests.json',
  'smoke-tests.json',
  'integration.json',
  'tests.log',
  'smoke-tests.log',
  'typecheck-final.log',
  'lint-final.log',
  'build-final.log',
  'format-final.log',
  'refresh-red.log',
  'refresh-green.log',
  'refresh-red.txt',
  'refresh-green.txt',
  'smoke.txt',
];

const hashes = Object.fromEntries(
  await Promise.all(files.map(async (file) => [file, sha256(await readFile(`.tim27-lifecycle/${file}`))])),
);

const versions = Object.fromEntries(
  await Promise.all(
    ['alchemy', 'wrangler', 'miniflare', 'typescript', 'effect'].map(async (name) => [
      name,
      JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version,
    ]),
  ),
);

const summary = (result) => ({
  passed: result.numPassedTests,
  failed: result.numFailedTests,
  files: result.testResults.length,
  seconds: (Math.max(...result.testResults.map((test) => test.endTime)) - result.startTime) / 1000,
});

const archive = artifact.manifest.files.find(
  (file) => file.path === artifact.manifest.branchContent.archivePath,
);

assert.ok(archive);

const evidence = {
  implementationCommit,
  checkpointCommit: '55d92a7',
  brokerOriginalCommit: 'a953a3cb2ce03ed4a2cb7f087db5241e1ce10d3f',
  brokerLocalIntegration: '170125852f4ba12c46466548c98b9bad7d8f4884',
  localOnly: true,
  syntheticGitHubIdentity: true,
  hostedReleaseAttested: false,
  retainedTextLogNormalization:
    'Final blank lines normalized to one newline; original log hashes retained separately.',
  deploymentOrInferenceCalls: 0,
  node: process.version,
  versions,
  tests: summary(tests),
  scriptedRegression: {
    ...summary(smoke),
    ranBeforeImplementationCommit: true,
    runtimeUnchangedByFinalProviderFix: true,
  },
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
  localSourceExecutable: integration.publication.executable,
  hashes,
};

await writeFile('.tim27-lifecycle/artifact-manifest.json', artifact.raw);

await writeFile('.tim27-lifecycle/checks.json', canonical(evidence));

console.log(canonical(evidence));
