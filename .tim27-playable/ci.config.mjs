import { defineConfig } from 'vitest/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Diagnostic bootstrap only: execute the retained packaged CLI without an npm install.
// The test's journeys, native adapters and normal clock controls remain the actual source.
export default defineConfig({
  plugins: [
    {
      name: 'playable-local-archive-bootstrap',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/.tim27-playable/harness.ts')) return;
        const start = code.indexOf("  await run(process.execPath, ['scripts/package-cli.mjs']);");
        const end = code.indexOf('  bin = ', start);
        assert.ok(start > 0 && end > start);

        const replacement = `  archive = await readFile('.tim27-playable/accepted/agent-game-cli-0.3.0.tgz');
  expect(hash(archive)).toBe('a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635');
  await mkdir(directory + '/node_modules/agent-game-cli', { recursive: true });
  await run('tar', ['-xzf', resolve('.tim27-playable/accepted/agent-game-cli-0.3.0.tgz'), '--strip-components=1', '-C', directory + '/node_modules/agent-game-cli']);
  for (const name of (await (await import('node:fs/promises')).readdir('cli')).filter((name) => name.endsWith('.mjs'))) {
    expect(await readFile(directory + '/node_modules/agent-game-cli/cli/' + name)).toEqual(await readFile('cli/' + name));
  }
  await writeFile(evidence + '/bootstrap.json', JSON.stringify({ archiveSha256: hash(archive), npmInvocations: 0, testedHarnessSha256: '${hashText(code)}' }, null, 2));
`;

        return { code: code.slice(0, start) + replacement + code.slice(end), map: null };
      },
    },
  ],
  test: {
    include: ['tests/preview-playable.test.ts', '.tim27-playable/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15000,
  },
});

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}
