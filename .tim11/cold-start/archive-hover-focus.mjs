/** Append hover-focus evidence while preserving the earlier correction artifacts. */
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const root = '.tim11/cold-start/runs';

const out = 'docs/evidence/TIM-11-corrections/hover-focus';

const summary = [];

await mkdir(out, { recursive: true });

for (const run of ['hover-focus-red-1', 'hover-focus-red-2', 'hover-focus-green-1']) {
  await copyFile(`${root}/${run}/results.json`, `${out}/${run}.json`);

  const transcript = await readFile(`${root}/${run}/controls.log`, 'utf8');
  const report = JSON.parse(await readFile(`${root}/${run}/results.json`, 'utf8'));
  const focus = [];

  await writeFile(`${out}/${run}.txt`, transcript.replace(/[\t ]+$/gm, ''));

  for (const suite of report.suites) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        for (const result of test.results) {
          const attachment = result.attachments.find((item) => item.name === 'final-focus');

          if (attachment) focus.push(JSON.parse(Buffer.from(attachment.body, 'base64').toString()));
        }
      }
    }
  }

  summary.push({ run, stats: report.stats, focus });
}

await cp(`${root}/hover-focus-red-2/interactions`, `${out}/red-interactions`, { recursive: true });

for (const file of await readdir(`${out}/red-interactions`, { recursive: true, withFileTypes: true })) {
  if (file.name !== 'error-context.md') continue;

  const path = `${file.parentPath}/${file.name}`;
  const text = await readFile(path, 'utf8');

  await writeFile(path, text.replace(/[\t ]+$/gm, ''));
}

await copyFile(`${root}/hover-focus-full-green/controls.log`, `${out}/original-controls-green.txt`);

await copyFile(`${root}/hover-focus-full-green/vite-log.json`, `${out}/vite-log.json`);

await writeFile(`${out}/focus-summary.json`, JSON.stringify(summary, null, 2) + '\n');
