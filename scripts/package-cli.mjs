import { mkdir, readFile, writeFile, chmod, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const source = JSON.parse(await readFile('package.json', 'utf8'));

const directory = resolve('.agent-game/cli-package');

for (const file of [
  'cli/agent-game.mjs',
  'cli/supervisor.mjs',
  'cli/setup.mjs',
  'skills/agent-game/SKILL.md',
  'public/rules.md',
  'public/protocol.md',
]) {
  await mkdir(dirname(`${directory}/${file}`), { recursive: true });
  await copyFile(file, `${directory}/${file}`);
}

await chmod(`${directory}/cli/agent-game.mjs`, 0o755);

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

const destination = resolve('public/downloads');

await mkdir(destination, { recursive: true });

const packed = await promisify(execFile)(
  'npm',
  ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
  { cwd: directory },
);

const [artifact] = JSON.parse(packed.stdout);

console.log(`CLI archive: /downloads/${artifact.filename} (${artifact.size} bytes)`);
