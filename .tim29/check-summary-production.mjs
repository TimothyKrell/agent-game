import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Reuse the accepted boundary checks while preserving every c3bc4ef capture/hash artifact.
const directory = '.tim29/runs/summary-production';

await mkdir(directory, { recursive: true });

const original = await readFile('.tim29/check-production.mjs', 'utf8');

const source = original
  .replaceAll('.tim29/captures', '.tim29/summary-captures')
  .replaceAll('.tim29/production.json', '.tim29/summary-production.json')
  .replace(
    'const forbidden = [',
    "const forbidden = ['summary-original-', '/__probe/seed', 'Summary/metadata requests must not probe R2',",
  );

assert.notEqual(source, original);

await writeFile(`${directory}/check.mjs`, source);

const child = spawn(process.execPath, [`${directory}/check.mjs`], { stdio: 'inherit' });

const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

assert.equal(code, 0);
