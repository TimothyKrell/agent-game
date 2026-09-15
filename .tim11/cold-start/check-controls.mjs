/** Exercise correction regressions against the actual dev-served production wrappers. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const out = resolve(process.env.TIM_RULE_OUT ?? '.tim11/cold-start/runs/rules-final');

await mkdir(out, { recursive: true });

const server = await createServer({
  cacheDir: `${out}/vite-cache`,
  server: { host: '127.0.0.1', port: 6191, strictPort: true },
});

try {
  await server.listen();

  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      '.tim11/cold-start/interaction.config.ts',
      '--reporter=list,json',
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        TIM_RULE_OUT: `${out}/interactions`,
        PLAYWRIGHT_JSON_OUTPUT_FILE: `${out}/results.json`,
      },
    },
  );

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

  await writeFile(`${out}/controls.log`, output);
  console.log(output);
  assert.equal(code, 0);
} finally {
  await server.close();
}
