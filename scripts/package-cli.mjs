import { mkdir, mkdtemp, readFile, writeFile, chmod, copyFile, cp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const source = JSON.parse(await readFile('package.json', 'utf8'));

await mkdir('.agent-game', { recursive: true });

const directory = await mkdtemp(resolve('.agent-game/cli-package-'));

async function normalizeFiles(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;

    if (entry.isDirectory()) await normalizeFiles(file);
    else if (entry.isFile()) await chmod(file, file === `${directory}/cli/agent-game.mjs` ? 0o755 : 0o644);
    else throw new Error(`CLI package requires regular files: ${file}`);
  }
}

try {
  for (const file of [
    'cli/agent-game.mjs',
    'cli/supervisor.mjs',
    'cli/setup.mjs',
    'skills/agent-game/SKILL.md',
    'public/rules.md',
    'public/rating-method.md',
    'public/protocol.md',
  ]) {
    await mkdir(dirname(`${directory}/${file}`), { recursive: true });
    await copyFile(file, `${directory}/${file}`);
  }

  for (const file of await readdir('cli')) {
    if (file.endsWith('.mjs')) await copyFile(`cli/${file}`, `${directory}/cli/${file}`);
  }

  await cp('public/games', `${directory}/public/games`, { recursive: true });

  await writeFile(
    `${directory}/package.json`,
    JSON.stringify(
      {
        name: 'agent-game-cli',
        version: source.version,
        type: 'module',
        description: 'Agent Game HTTP/WebSocket client and harness supervisor',
        engines: source.engines,
        bin: { 'agent-game': 'cli/agent-game.mjs' },
        files: ['cli', 'skills', 'public'],
      },
      null,
      2,
    ) + '\n',
  );
  await normalizeFiles(directory);

  const destination = resolve('public/downloads');
  const retained = (await readdir('cli/releases')).filter((file) => file.endsWith('.tgz'));

  await mkdir(destination, { recursive: true });

  for (const file of retained) await copyFile(`cli/releases/${file}`, `${destination}/${file}`);

  const packed = await promisify(execFile)(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', directory],
    { cwd: directory },
  );

  const [artifact] = JSON.parse(packed.stdout);
  const archive = `${directory}/${artifact.filename}`;

  if (retained.includes(artifact.filename)) {
    const released = await readFile(`cli/releases/${artifact.filename}`);

    if (!released.equals(await readFile(archive)))
      throw new Error(
        `${artifact.filename} is already released. Bump package.json version before changing its payload.`,
      );
  } else {
    await copyFile(archive, `${destination}/${artifact.filename}`);
  }

  console.log(`CLI archive: /downloads/${artifact.filename} (${artifact.size} bytes)`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
