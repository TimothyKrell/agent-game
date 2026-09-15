/** Preserve the original exclusion evidence and use only the owned port. Run after npm run build. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = process.env.TIM_PRODUCTION_OUT ?? '.tim11/cold-start/runs/production';

const evidence = process.env.TIM_PRODUCTION_EVIDENCE ?? 'docs/evidence/TIM-11-corrections';

await mkdir(out, { recursive: true });

await mkdir(evidence, { recursive: true });

let source = await readFile('.tim11/production.mjs', 'utf8');

source = source.replace("'docs/evidence/TIM-11-foundations'", JSON.stringify(evidence));

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
