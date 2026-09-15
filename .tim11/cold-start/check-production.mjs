/** Preserve the original exclusion evidence and use only the owned port. Run after npm run build. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = '.tim11/cold-start/runs/production';

await mkdir(out, { recursive: true });

await mkdir('docs/evidence/TIM-11-corrections', { recursive: true });

let source = await readFile('.tim11/production.mjs', 'utf8');

source = source.replace("'docs/evidence/TIM-11-foundations'", "'docs/evidence/TIM-11-corrections'");

source = source.replaceAll('6192', '6191');

source = source.replace(
  "  'TIM-11 production primitive fixture',",
  "  'TIM-11 production primitive fixture',\n  'tim11-collapse',\n  'Persistent coins rules',",
);

await writeFile(`${out}/check.mjs`, source);

const child = spawn(process.execPath, [`${out}/check.mjs`], { stdio: 'inherit' });

const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

assert.equal(code, 0);
