import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('.tim27-protocol/runs', { recursive: true });

const directory = await mkdtemp(resolve('.tim27-protocol/runs/negotiation-'));

console.log(`Evidence: ${directory}`);

await build({
  entryPoints: ['src/server/protocol.ts'],
  outfile: `${directory}/protocol.mjs`,
  platform: 'node',
  format: 'esm',
  bundle: true,
  packages: 'external',
});

const { requireGameProtocol } = await import(pathToFileURL(`${directory}/protocol.mjs`));

const results = [];

for (const game of ['secret-overlord', 'succession']) {
  for (const header of [null, '1', '2', '1,2']) {
    let outcome;

    try {
      requireGameProtocol(game, header, 'match_diagnostic');
      outcome = { accepted: true };
    } catch (error) {
      outcome = {
        accepted: false,
        status: error.status,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    const accepted = game === 'secret-overlord' || header?.includes('2');
    assert.equal(outcome.accepted, !!accepted);

    if (!accepted) {
      assert.equal(outcome.status, 426);
      assert.equal(outcome.code, 'protocol-upgrade-required');
    }

    results.push({ game, header, outcome });
  }
}

await writeFile(
  `${directory}/result.json`,
  JSON.stringify(
    { source: '508bbef73cbe8726829752baea3aaab0d78b1905', requests: 0, providerCalls: 0, results },
    null,
    2,
  ) + '\n',
);
