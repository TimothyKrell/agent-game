import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GameClient, save } from './agent-game.mjs';
import { gameId } from './current.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const entry = fileURLToPath(new URL('./agent-game.mjs', import.meta.url));

const command = `node ${quote(entry)}`;

const read = async (path) =>
  readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

function locations(harness) {
  if (!['opencode', 'claude'].includes(harness)) throw new Error('Choose --harness opencode or claude.');

  return {
    registry: resolve(homedir(), '.agent-game', `installations-${harness}.json`),
    skill: resolve(
      harness === 'opencode'
        ? resolve(process.env.XDG_CONFIG_HOME ?? `${homedir()}/.config`, 'opencode')
        : (process.env.CLAUDE_CONFIG_DIR ?? `${homedir()}/.claude`),
      'skills/agent-game/SKILL.md',
    ),
  };
}

export async function connections(harness) {
  const { registry } = locations(harness);
  const records = JSON.parse((await read(registry)) ?? '{}').connections ?? [];
  const items = [];

  for (const record of records) {
    const raw = await read(record.configPath);
    const state = JSON.parse(raw ?? '{}');
    items.push({
      configPath: record.configPath,
      server: record.server,
      agentName: state.agentName ?? null,
      agentId: state.agentId ?? null,
      selectedGame: state.selectedGame ?? 'secret-overlord',
      participation: state.participation ?? null,
      expiresAt: state.expiresAt ?? null,
      localStatus: !raw ? 'missing' : state.agentId ? 'paired' : 'unpaired',
      startCommand: `${command} start --config ${quote(record.configPath)}`,
    });
  }

  return {
    connections: items,
    next: 'Choose the requested competitor; if there is exactly one, use it. If ambiguous, ask the owner. Run its startCommand. Paired is local metadata; the arena checks current authority.',
  };
}

export async function setup(flags) {
  const { registry, skill } = locations(flags.harness);

  if (flags.server === undefined) throw new Error('Supply the arena URL with --server.');
  const server = new GameClient(flags.server).server;

  const path = resolve(
    String(
      flags.config ??
        `${homedir()}/.agent-game/connections/${flags.harness}-${digest(server).slice(0, 12)}.json`,
    ),
  );

  const state = JSON.parse((await read(path)) ?? '{}');
  state.selectedGame = gameId(flags.game ?? state.selectedGame);

  if (state.server && state.server !== server)
    throw new Error('This config belongs to another arena. Use a separate --config.');

  if (state.harness && state.harness !== flags.harness)
    throw new Error('This config belongs to another harness installation. Use a separate --config.');
  const manifest = JSON.parse((await read(registry)) ?? '{"connections":[]}');
  const existing = await read(skill);

  if (existing && digest(existing) !== manifest.skillHash)
    throw new Error(
      `A custom or modified skill already exists at ${skill}. Preserve it and move it aside before retrying setup, or add these installation instructions to it yourself.`,
    );
  const source = await readFile(new URL('../skills/agent-game/SKILL.md', import.meta.url), 'utf8');
  const content = `${source}\n## Local installation\n\nUse this command from any directory (Node 22.12+):\n\n\`\`\`sh\n${command} connections --harness ${flags.harness}\n\`\`\`\n\nThis lists saved arena URLs, selected games, actual participation, competitor names, config paths and exact start commands without exposing credentials. Select the requested competitor, or the only connection. Ask if several fit. Use the selected absolute CLI path and append its \`--config\` to every command. Before joining Secret Overlord read ${quote(fileURLToPath(new URL('../public/rules.md', import.meta.url)))}; for Succession read ${quote(fileURLToPath(new URL('../public/games/succession/rules.md', import.meta.url)))}. Read the same game's bundled protocol for history paging and rating-method for credit.\n`;
  await mkdir(dirname(skill), { recursive: true });
  await writeFile(skill, content, { mode: 0o600 });
  state.server = server;
  state.harness = flags.harness;
  state.installation ??= String(flags.name ?? `${flags.harness} installation`);
  await save(path, state);
  manifest.connections = [
    ...manifest.connections.filter((item) => item.configPath !== path),
    { configPath: path, server },
  ];
  manifest.skillHash = digest(content);
  await save(registry, manifest);

  return {
    status: 'ready',
    server,
    selectedGame: state.selectedGame,
    rulesPath: fileURLToPath(
      new URL(
        state.selectedGame === 'succession' ? '../public/games/succession/rules.md' : '../public/rules.md',
        import.meta.url,
      ),
    ),
    configPath: path,
    skillPath: skill,
    startCommand: `${command} start --config ${quote(path)}`,
    next: 'Read the installed skill and bundled rules, then run startCommand now. In a fresh local session, ask Start an Agent Game or use /agent-game. Setup itself does not join a match.',
  };
}
