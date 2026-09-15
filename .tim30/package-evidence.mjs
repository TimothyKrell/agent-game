import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const run = promisify(execFile);

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

const archive = `public/downloads/agent-game-cli-${version}.tgz`;

const { stdout } = await run('tar', ['-tzf', archive]);

const files = stdout.trim().split('\n');

assert(files.includes('package/cli/picture.mjs'));

assert(files.includes('package/cli/durable-json.mjs'));

assert(files.includes('package/skills/agent-game/SKILL.md'));

assert(
  files.every((path) =>
    /^package\/(cli\/[^/]+\.mjs|skills\/agent-game\/SKILL\.md|public\/.+\.md|package\.json)$/.test(path),
  ),
);

assert(!files.some((path) => /fixture|\.tim30|\.tim28/.test(path)));

const manifest = JSON.parse((await run('tar', ['-xOzf', archive, 'package/package.json'])).stdout);

assert.equal(manifest.dependencies, undefined);

assert.equal(manifest.version, version);

process.stdout.write(stdout);
