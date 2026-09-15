import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;

const archive = `public/downloads/agent-game-cli-${version}.tgz`;

const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');

assert(
  files.every((file) =>
    /^package\/(cli\/[^/]+\.mjs|skills\/agent-game\/SKILL\.md|public\/.+\.md|package\.json)$/.test(file),
  ),
);

assert(files.includes('package/cli/preview-select.mjs'));

const worker = await build({
  entryPoints: ['src/server/worker.ts'],
  bundle: true,
  write: false,
  metafile: true,
  format: 'esm',
  platform: 'neutral',
  packages: 'external',
  logLevel: 'silent',
});

const inputs = Object.keys(worker.metafile.inputs);

assert(
  inputs.every(
    (path) =>
      !path.startsWith('tests/') &&
      !path.startsWith('dev/') &&
      !path.startsWith('e2e/') &&
      !path.startsWith('.tim'),
  ),
);

for (const output of worker.outputFiles)
  assert(!/PlayableCoordinator|playable_faults|PLAYABLE_BRANCH_A|PLAYABLE_NATIVE_MODE/.test(output.text));

let checkedAssets = 0;

for (const entry of await readdir('dist/client/assets')) {
  if (!/\.(js|css|map)$/.test(entry)) continue;
  assert(
    !/PlayableCoordinator|playable_faults|PLAYABLE_BRANCH_A|PLAYABLE_NATIVE_MODE/.test(
      await readFile(`dist/client/assets/${entry}`, 'utf8'),
    ),
  );
  checkedAssets++;
}

console.log(
  JSON.stringify(
    { archive, archiveFiles: files, workerInputs: inputs.length, checkedAssets, fixtureExcluded: true },
    null,
    2,
  ),
);
