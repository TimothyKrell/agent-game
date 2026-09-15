import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = 'docs/evidence/TIM-11-foundations';

const before = JSON.parse(await readFile(`${root}/before/cascade.json`, 'utf8'));

const after = JSON.parse(await readFile(`${root}/cascade/cascade.json`, 'utf8'));

assert.deepEqual(
  before.filter((row) => row.metrics),
  after.filter((row) => row.metrics),
);

const differences = [];

for (const file of (await readdir(`${root}/before`)).filter((file) => file.endsWith('.png'))) {
  const a = await sharp(`${root}/before/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(`${root}/cascade/${file}`).ensureAlpha().raw().toBuffer();
  let count = 0;
  let content = 0;

  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.subarray(i, i + 4).equals(b.subarray(i, i + 4))) continue;
    count++;
    const x = (i / 4) % a.info.width;
    const y = Math.floor(i / 4 / a.info.width);

    // Agentation asynchronously mounts its floating dev toolbar in this corner.
    if (x < a.info.width - 90 || y < a.info.height - 90) content++;
  }

  assert.equal(content, 0, `${file}: content changed`);
  differences.push({ file, changedPixels: count, changedOutsideToolbar: content });
}

await writeFile(
  `${root}/cascade/comparison.json`,
  JSON.stringify({ computedStylesIdentical: true, differences }, null, 2) + '\n',
);

console.log(differences);
