/** Cold first-entry reproduction, adapted from the parent's full integration runner. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLogger, createServer, loadConfigFromFile } from 'vite';
import { watch } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');

const out = resolve(process.env.TIM_LEAD_OUT ?? '.tim11/cold-start/runs/red-full-1');

await mkdir(out, { recursive: true });

await mkdir(`${out}/vite-cache`); // Refuse to reuse a warm cache.

let test = await readFile(`${root}/.tim11/foundations.spec.ts`, 'utf8');

test = `import { writeFile as writeEvidence } from 'node:fs/promises';\n` + test;

if (process.env.TIM_COLD_MINIMAL) {
  const start = test.indexOf(
    process.env.TIM_COLD_MINIMAL === 'chapter'
      ? "    const trigger = page.getByRole('button', { name: 'View long identity' });"
      : "    const first = page.getByRole('button', { name: 'Default button' });",
  );

  const end = test.indexOf('    expect(errors).toEqual([]);', start);
  assert.ok(start > 0 && end > start);
  test =
    test.slice(0, start) +
    (process.env.TIM_COLD_MINIMAL === 'chapter'
      ? ''
      : `    await page.getByRole('button', { name: 'Default button' }).click();\n`) +
    test.slice(end);
}

test = test.replace(
  "page.on('pageerror', (error) => errors.push(error.message));",
  `const modules: string[] = [];
    const navigations: string[] = [];
    const responses: Promise<unknown>[] = [];
    page.on('response', response => {
      if (/(react-dom_client|useOpenChangeComplete[^/]*)\\.js\\?/.test(response.url())) {
        responses.push(response.text().then(body => ({url: response.url(), imports: body.slice(0, 1000)})));
      }
    });
    page.on('request', request => { if (/\\.(js|tsx)(\\?|$)/.test(request.url())) modules.push(request.url()); });
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    page.on('console', message => { if (message.type() === 'error') console.error('[DEBUG-tim11-cold]', message.text()); });
    page.on('pageerror', error => { errors.push(error.stack ?? error.message); console.error('[DEBUG-tim11-cold]', error.stack); });`,
);

test = test.replace(
  'expect(errors).toEqual([]);',
  `await writeEvidence(test.info().outputPath('cold-start-modules.json'), JSON.stringify({ errors, modules, navigations, responses: await Promise.all(responses) }, null, 2));
    expect(errors).toEqual([]);`,
);

await writeFile(`${out}/foundations.spec.ts`, test);

let config = await readFile(`${root}/.tim11/interaction.config.ts`, 'utf8');

config = config.replace("testDir: '.'", `testDir: ${JSON.stringify(out)}`);

config = config.replace(
  "'../docs/evidence/TIM-11-foundations/interactions'",
  JSON.stringify(`${out}/interactions`),
);

await writeFile(`${out}/controls.config.ts`, config);

const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, `${root}/vite.config.ts`);

assert.ok(loaded);

const logger = createLogger('info');

const messages = [];

for (const level of ['info', 'warn', 'error']) {
  const original = logger[level];
  logger[level] = (message, options) => {
    messages.push({ level, message });
    original(message, options);
  };
}

const server = await createServer({
  ...loaded.config,
  configFile: false,
  root,
  cacheDir: `${out}/vite-cache`,
  optimizeDeps: process.env.TIM_COLD_LEGACY ? { entries: ['index.html'] } : loaded.config.optimizeDeps,
  server: { host: '127.0.0.1', port: 6191, strictPort: true },
  customLogger: logger,
});

await server.listen();

try {
  if (process.env.TIM_COLD_SCANNED) {
    await new Promise((resolve, reject) => {
      const watcher = watch(`${out}/vite-cache`, { recursive: true }, inspect);

      const timeout = setTimeout(() => {
        watcher.close();
        reject(new Error('Initial optimization did not commit'));
      }, 15000);

      async function inspect() {
        try {
          const metadata = await readFile(`${out}/vite-cache/deps/_metadata.json`, 'utf8');
          clearTimeout(timeout);
          watcher.close();
          await writeFile(`${out}/initial-optimizer.json`, metadata);
          resolve();
        } catch (error) {
          if (error.code !== 'ENOENT') reject(error);
        }
      }

      void inspect();
    });
  }

  const args = [
    `${root}/node_modules/@playwright/test/cli.js`,
    'test',
    '--config',
    `${out}/controls.config.ts`,
  ];

  if (process.env.TIM_COLD_GREP) args.push('--grep', process.env.TIM_COLD_GREP);
  const child = spawn(process.execPath, args, { cwd: root, env: process.env });
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
  assert.equal(code, 0, 'cold first-entry controls');
} finally {
  await server.close();
  await writeFile(`${out}/vite-log.json`, JSON.stringify(messages, null, 2) + '\n');
}
