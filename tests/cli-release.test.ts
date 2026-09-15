import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve('.');

const evidence = process.env.TIM27_RELEASE_EVIDENCE_DIR ?? (await mkdtemp('/tmp/opencode/TIM-27-release-'));

const script = resolve('scripts/package-cli.mjs');

await mkdir(evidence, { recursive: true });

if ((await readdir(evidence)).length) throw new Error(`Use a fresh release evidence directory: ${evidence}`);

async function fixture(name: string) {
  const directory = resolve(evidence, name);
  await mkdir(directory, { recursive: true });
  await cp(`${root}/cli`, `${directory}/cli`, {
    recursive: true,
    filter: (path) => path === `${root}/cli` || path.endsWith('.mjs') || path.includes('/releases'),
  });
  await cp(`${root}/public/games`, `${directory}/public/games`, { recursive: true });

  for (const file of [
    'public/rules.md',
    'public/protocol.md',
    'public/rating-method.md',
    'skills/agent-game/SKILL.md',
  ]) {
    await mkdir(dirname(`${directory}/${file}`), { recursive: true });
    await copyFile(`${root}/${file}`, `${directory}/${file}`);
  }

  await writeFile(
    `${directory}/package.json`,
    JSON.stringify({ version: '1.0.0', engines: { node: '>=22.12.0' } }),
  );
  await mkdir(`${directory}/home`);

  return directory;
}

async function pack(directory: string, name: string) {
  const env = { ...process.env };

  for (const key of Object.keys(env)) if (key !== 'PATH') delete env[key];
  env.HOME = `${directory}/home`;
  env.npm_config_ignore_scripts = 'true';

  const child = spawn(process.execPath, [script], {
    cwd: directory,
    env,
  });

  let text = '';
  child.stdout.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });

  const code = await new Promise<number | null>((yes, no) => {
    child.once('error', no);
    child.once('close', yes);
  });

  await writeFile(`${directory}/${name}.log`, text);

  return { code, text };
}

async function hash(path: string) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

it('packages identical inputs identically despite local permission differences', async () => {
  const directory = await fixture('permissions');
  const archive = `${directory}/public/downloads/agent-game-cli-1.0.0.tgz`;
  const doc = `${directory}/public/games/succession/rules.md`;
  await chmod(doc, 0o600);
  expect((await pack(directory, 'private-mode')).code).toBe(0);
  const before = await hash(archive);
  await copyFile(archive, `${directory}/private-mode.tgz`);
  await chmod(doc, 0o644);
  expect((await pack(directory, 'public-mode')).code).toBe(0);
  const after = await hash(archive);
  await writeFile(`${directory}/hashes.json`, JSON.stringify({ before, after }, null, 2));
  expect(after).toBe(before);
}, 30_000);

it('preserves a released filename and requires a new version for changed payloads', async () => {
  const directory = await fixture('immutable');
  const archive = `${directory}/public/downloads/agent-game-cli-1.0.0.tgz`;
  expect((await pack(directory, 'initial')).code).toBe(0);
  const released = await readFile(archive);
  await writeFile(`${directory}/cli/releases/agent-game-cli-1.0.0.tgz`, released);
  expect((await pack(directory, 'unchanged-release')).code).toBe(0);
  expect(await readFile(archive)).toEqual(released);

  await writeFile(`${directory}/cli/release-change.mjs`, 'export const releaseChange = true;\n');
  const rejected = await pack(directory, 'changed-release');
  await writeFile(
    `${directory}/changed-result.json`,
    JSON.stringify(
      {
        code: rejected.code,
        releasedSha256: createHash('sha256').update(released).digest('hex'),
        publishedSha256: await hash(archive),
      },
      null,
      2,
    ),
  );
  expect(rejected.code).not.toBe(0);
  expect(rejected.text).toContain('agent-game-cli-1.0.0.tgz is already released');
  expect(await readFile(archive)).toEqual(released);

  await writeFile(
    `${directory}/package.json`,
    JSON.stringify({ version: '1.0.1', engines: { node: '>=22.12.0' } }),
  );
  expect((await pack(directory, 'next-version')).code).toBe(0);
  expect(await readFile(archive)).toEqual(released);
  expect(await hash(`${directory}/public/downloads/agent-game-cli-1.0.1.tgz`)).not.toBe(await hash(archive));

  for (const name of await readdir(`${root}/cli/releases`)) {
    if (name.endsWith('.tgz'))
      expect(await readFile(`${directory}/public/downloads/${name}`)).toEqual(
        await readFile(`${root}/cli/releases/${name}`),
      );
  }
}, 30_000);
