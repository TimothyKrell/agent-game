import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const names = new Set([
  'worker-act1-current.json',
  'worker-terminal-current.json',
  'worker-archive-checkpoint.json',
  'worker-history-requests.json',
  'worker-reader-bounds.json',
  'canonical-anchor.json',
]);

for (const run of process.argv.slice(2)) {
  if (!/^[a-z0-9-]+$/.test(run)) throw new Error(`Invalid run name: ${run}`);
  const directory = fileURLToPath(new URL(`./results/${run}/`, import.meta.url));
  const bytes = await readFile(`${directory}report.json`);
  const report = JSON.parse(bytes.toString());

  if (report.stats.expected === 0 && report.stats.unexpected === 0 && report.stats.skipped > 0) {
    throw new Error(`${run} is a collection-only report; it cannot substantiate an executed suite.`);
  }

  const files = {};
  const failures = [];
  const artifacts = [];

  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = (files[spec.file] ??= { passed: 0, failed: 0, skipped: 0, flaky: 0 });

      for (const test of spec.tests) {
        const status = { expected: 'passed', unexpected: 'failed', skipped: 'skipped', flaky: 'flaky' }[
          test.status
        ];

        if (!status) throw new Error(`Unknown test status: ${test.status}`);
        file[status]++;
        const result = test.results.at(-1);

        if (test.status !== 'expected') {
          failures.push({
            file: spec.file,
            line: spec.line,
            title: spec.title,
            status: test.status,
            error: result?.error?.message && stripVTControlCharacters(result.error.message),
          });
        }

        for (const artifact of result?.attachments ?? []) {
          if (names.has(artifact.name) && artifact.body) artifacts.push(artifact);
        }
      }
    }

    for (const child of suite.suites ?? []) visit(child);
  }

  visit(report);
  await mkdir(`${directory}evidence`, { recursive: true });

  for (const artifact of artifacts) {
    await writeFile(`${directory}evidence/${artifact.name}`, Buffer.from(artifact.body, 'base64'));
  }

  const summary = {
    run,
    reportSha256: createHash('sha256').update(bytes).digest('hex'),
    stats: report.stats,
    files,
    failures,
    artifacts: artifacts.map((artifact) => `evidence/${artifact.name}`),
  };

  await writeFile(`${directory}summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${run}: ${JSON.stringify(report.stats)}`);
}
