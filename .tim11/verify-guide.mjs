import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const directory = 'docs/evidence/TIM-11-foundations/controls-verified';

await mkdir(directory, { recursive: true });

for (const name of ['dossier', 'annotations', 'moments']) {
  let source = await readFile(`scripts/capture-tim-6-${name}.prototype.mjs`, 'utf8');

  // Same assertions, wait for Base UI's semantic dialog and queued focus restoration.
  if (name === 'dossier') {
    source = source.replace(
      "await page.waitForFunction(() => !document.querySelector('dialog'));",
      `await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      await page.waitForFunction(element => document.activeElement === element, await guard.elementHandle());`,
    );
    source = source.replace(
      "await page.keyboard.press('Tab');",
      `await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.activeElement?.closest('[role=dialog]'));`,
    );
  }

  if (name === 'annotations') {
    source = source.replace(
      "await dialog.waitFor({ state: 'hidden' });",
      `await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(element => document.activeElement === element, await portrait.elementHandle());`,
    );
    source = source.replace(
      "await page.keyboard.press('Shift+Tab');",
      `await page.keyboard.press('Shift+Tab');
      await page.waitForFunction(() => document.activeElement?.closest('[role=dialog]'));`,
    );
    const close = "await page.getByRole('button', { name: 'Close profile picture' }).click();";
    assert.ok(source.includes(close));
    source = source.replace(
      close,
      `${close}
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View Vesper profile picture');`,
    );
  }

  const generated = `.tim11/${name}.generated.mjs`;
  await writeFile(generated, source);

  try {
    const child = spawn(process.execPath, [generated], {
      env: { ...process.env, TIM6_ORIGIN: 'http://127.0.0.1:6191', TIM6_CAPTURE_DIR: directory },
    });

    let output = '';
    child.stdout.on('data', (bytes) => {
      output += bytes;
    });
    child.stderr.on('data', (bytes) => {
      output += bytes;
    });

    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    await writeFile(`${directory}/${name}.log`, output);
    console.log(name, output);
    assert.equal(code, 0);
  } finally {
    await rm(generated);
  }
}
