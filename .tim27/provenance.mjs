import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const files = [
  'package-lock.json',
  'alchemy.run.ts',
  'src/server/auth.ts',
  'src/server/pairing.ts',
  'src/server/worker.ts',
  'src/server/coordinator.ts',
  'src/server/house-seat.ts',
  'migrations/0001_initial.sql',
  'migrations/0002_games.sql',
  'cli/agent-game.mjs',
  'cli/setup.mjs',
  '.tim27/auth-probe.mjs',
  '.tim27/import-probe.mjs',
  '.tim27/runtime.test.mjs',
  '.tim27/vitest.config.mts',
  '.tim27/auth-result.json',
  '.tim27/import-result.json',
  '.tim27/runtime-result.json',
  'node_modules/better-auth/package.json',
  'node_modules/better-auth/dist/plugins/oauth-proxy/index.mjs',
  'node_modules/better-auth/dist/plugins/one-time-token/index.mjs',
  'node_modules/better-auth/dist/db/internal-adapter.mjs',
  'node_modules/better-auth/dist/cookies/index.mjs',
];

const hashes = {};

for (const path of files)
  hashes[path] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

await writeFile(
  '.tim27/provenance.json',
  JSON.stringify(
    {
      baseline: execFileSync('git', ['rev-parse', '73ca562'], { encoding: 'utf8' }).trim(),
      checkedAt: '2026-09-14',
      runtime: process.version,
      sha256: hashes,
    },
    null,
    2,
  ) + '\n',
);

console.log('PASS: recorded source/package/probe/result provenance without credentials.');
