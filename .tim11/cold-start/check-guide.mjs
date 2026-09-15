/** Run the retained acceptance scripts into a new correction evidence directory. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = '.tim11/cold-start/runs/guide';

await mkdir(out, { recursive: true });

let source = await readFile('.tim11/verify-guide.mjs', 'utf8');

source = source.replace(
  "'docs/evidence/TIM-11-foundations/controls-verified'",
  "'docs/evidence/TIM-11-corrections/guide'",
);

source = source.replace('`.tim11/${name}.generated.mjs`', '`' + out + '/${name}.generated.mjs`');

await writeFile(`${out}/check.mjs`, source);

const child = spawn(process.execPath, [`${out}/check.mjs`], { stdio: 'inherit' });

const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

assert.equal(code, 0);
