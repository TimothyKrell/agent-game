import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Run the actual focused tests without npm pack/install or modifying the released archive.
const evidence = resolve(process.env.PROTOCOL_CORRECTION_DIR);

assert.ok(!existsSync(`${evidence}/cli-provenance.json`), 'Use a fresh correction evidence directory');

const installation = `${evidence}/installed`;

mkdirSync(installation);

const archive = resolve('.tim27-playable/accepted/agent-game-cli-0.3.0.tgz');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

assert.equal(sha(readFileSync(archive)), 'a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635');

execFileSync('tar', ['-xzf', archive, '-C', installation]);

const modules = [];

for (const name of readdirSync('cli').filter((name) => name.endsWith('.mjs'))) {
  const bytes = readFileSync(`cli/${name}`);
  assert.deepEqual(readFileSync(`${installation}/package/cli/${name}`), bytes);
  modules.push({ name, sha256: sha(bytes) });
}

writeFileSync(
  `${evidence}/cli-provenance.json`,
  JSON.stringify(
    { archive, archiveSha256: sha(readFileSync(archive)), modules, npmInvocations: 0 },
    null,
    2,
  ) + '\n',
);

export default defineConfig({
  plugins: [
    {
      name: 'local-archive-only-test-bootstrap',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/tests/cli-succession.test.ts')) return;
        const start = code.indexOf('beforeAll(async () => {');
        const end = code.indexOf('\n});', start) + 4;
        const original = code.slice(start, end);
        assert.ok(original.includes("'install'"));
        const replacement = `beforeAll(async () => { installation = ${JSON.stringify(installation)}; bin = ${JSON.stringify(`${installation}/package/cli/agent-game.mjs`)}; });`;
        writeFileSync(`${evidence}/bootstrap-original.txt`, original);
        writeFileSync(`${evidence}/bootstrap-replacement.txt`, replacement);
        writeFileSync(`${evidence}/test-source.sha256`, sha(Buffer.from(code)) + '\n');

        return { code: code.slice(0, start) + replacement + code.slice(end), map: null };
      },
    },
  ],
  test: { include: ['tests/cli-succession.test.ts'], fileParallelism: false, testTimeout: 15000 },
});
