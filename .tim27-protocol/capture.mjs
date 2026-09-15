import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const run = promisify(execFile);

const destination = resolve(process.argv[2]);

assert.ok(destination.startsWith(resolve('.tim27-protocol') + '/'));

await mkdir(destination);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const evidence = [];

for (const input of process.argv.slice(3)) {
  const source = resolve(input);
  assert.ok(source.startsWith(resolve('.tim27-protocol/runs') + '/'));
  const output = `${destination}/${basename(source)}`;
  await mkdir(output);

  for (const name of await readdir(source)) {
    if (
      !['result.json', 'fixture-input.json', 'vitest.json', 'vitest.log', 'assertion-stack.txt'].includes(
        name,
      )
    )
      continue;
    const bytes = await readFile(`${source}/${name}`);
    await copyFile(`${source}/${name}`, `${output}/${name}`);
    evidence.push({
      source: `${source}/${name}`,
      copy: `${basename(source)}/${name}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
}

const review = '/tmp/opencode/TIM27-cli-spec-review/b42248e-4un18tta/review-evidence';

const archive = '/home/timothykrell/Code/agent-games-archive/TIM-27-cli-2026-09-15';

const original = await readFile(`${review}/regressions.log`);

const provenance = JSON.parse(await readFile(`${review}/provenance.json`, 'utf8'));

assert.equal(sha256(original), provenance.retainedLogs['regressions.log'].sha256);

const originalCopies = [
  { path: `${review}/regressions.log`, sha256: sha256(original), bytes: original.length },
];

for (const [file, member] of [
  ['worktree-evidence.tar.gz', '.tim27-cli/regressions.log'],
  ['lead-review-evidence.tar.gz', 'TIM27-cli-spec-review/b42248e-4un18tta/review-evidence/regressions.log'],
]) {
  const { stdout } = await run('tar', ['-xOzf', `${archive}/${file}`, member], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
  });

  assert.deepEqual(stdout, original);
  originalCopies.push({ path: `${archive}/${file}`, member, sha256: sha256(stdout), bytes: stdout.length });
}

const excerpt = original.toString().split('\n').slice(61, 86).join('\n') + '\n';

await writeFile(`${destination}/historical-error.txt`, excerpt);

const sourceVersions = [];

for (const revision of ['854eeae', 'b42248e', 'f932a0e', '508bbef']) {
  const full = (await run('git', ['rev-parse', revision])).stdout.trim();
  const files = [];

  for (const path of [
    'cli/agent-game.mjs',
    'cli/supervisor.mjs',
    'cli/http-response.mjs',
    'tests/cli-succession.test.ts',
    'package.json',
  ]) {
    const output = await run('git', ['show', `${revision}:${path}`], { encoding: 'buffer' }).catch(
      () => null,
    );

    if (!output) continue;
    files.push({ path, sha256: sha256(output.stdout), bytes: output.stdout.length });
  }

  sourceVersions.push({ revision: full, files });
}

await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify(
    {
      diagnosticBase: '508bbef73cbe8726829752baea3aaab0d78b1905',
      classification:
        'Current failure mode reproduced: unsolicited moshi-hook root request trips a blanket async fixture assertion. Historical request attribution remains unproven because its packet was not recorded.',
      originalCopies,
      originalExcerpt: { lines: [62, 86], sha256: sha256(excerpt) },
      sourceVersions,
      evidence,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  JSON.stringify(
    { destination, evidenceFiles: evidence.length, originalCopiesVerified: originalCopies.length },
    null,
    2,
  ),
);
