/** Copy selected immutable diagnostics without committing optimizer caches. */
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = '.tim11/cold-start/runs';

const out = 'docs/evidence/TIM-11-corrections';

const summary = [];

for (const run of [
  'red-first-2',
  'red-scanned-5',
  'red-scanned-6',
  'green-scanned-7',
  'red-control-9',
  'green-scanned-10',
  'green-scanned-11',
  'green-scanned-12',
  'green-full-13',
]) {
  const target = `${out}/cold/${run}`;
  await mkdir(target, { recursive: true });
  await copyFile(`${root}/${run}/controls.log`, `${target}/controls.txt`);
  await copyFile(`${root}/${run}/vite-cache/deps/_metadata.json`, `${target}/final-optimizer.json`);

  for (const file of ['initial-optimizer.json', 'vite-log.json']) {
    try {
      await copyFile(`${root}/${run}/${file}`, `${target}/${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  try {
    const source = `${root}/${run}/interactions/foundations-native-controls-chapter-and-modal-at-1440/cold-start-modules.json`;
    const modules = JSON.parse(await readFile(source, 'utf8'));
    await copyFile(source, `${target}/modules.json`);
    const reactURLs = [...new Set(modules.modules.filter((url) => /\/react\.js\?/.test(url)))];

    if (run.startsWith('green')) {
      assert.equal(modules.errors.length, 0);
      assert.equal(modules.navigations.length, 1);
      assert.equal(reactURLs.length, 1);
    }

    summary.push({ run, errors: modules.errors.length, navigations: modules.navigations.length, reactURLs });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

for (const run of ['rules-red', 'rules-red-controlled']) {
  await cp(`${root}/${run}`, `${out}/${run}`, { recursive: true });
}

await copyFile(`${root}/rules-final/results.json`, `${out}/rules-green.json`);

await copyFile(`${root}/rules-final/controls.log`, `${out}/rules-green.txt`);

await writeFile(`${out}/cold/summary.json`, JSON.stringify(summary, null, 2) + '\n');

// Remove reporter trailing spaces only in the committed copies; retain original run artifacts.
for (const file of await readdir(out, { recursive: true, withFileTypes: true })) {
  if (!file.isFile() || !['controls.txt', 'error-context.md'].includes(file.name)) continue;

  const path = `${file.parentPath}/${file.name}`;
  const text = await readFile(path, 'utf8');

  await writeFile(path, text.replace(/[\t ]+$/gm, ''));
}
