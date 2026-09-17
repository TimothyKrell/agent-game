import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GameClient, save, updateCurrent } from './agent-game.mjs';
import { gameId } from './current.mjs';
import { pictureSource } from './picture.mjs';
import { activeArtifacts } from './preview-artifacts.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const entry = fileURLToPath(new URL('./agent-game.mjs', import.meta.url));

const command = `node ${quote(entry)}`;

export function installationCommands(configPath, cliPath = entry) {
  const executable = `node ${quote(cliPath)}`;

  return {
    cliPath,
    connectCommand: `${executable} connect --config ${quote(configPath)}`,
    startCommand: `${executable} start --config ${quote(configPath)}`,
  };
}

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

export async function registerConnection(harness, configPath, server, cliPath = entry) {
  const { registry } = locations(harness);
  await updateCurrent(registry, (manifest) => {
    const existing = (manifest.connections ?? []).find((item) => item.configPath === configPath);
    manifest.connections = [
      ...(manifest.connections ?? []).filter((item) => item.configPath !== configPath),
      { ...existing, configPath, server, cliPath },
    ];
  });
}

export async function connections(harness) {
  const { registry } = locations(harness);
  const records = JSON.parse((await read(registry)) ?? '{}').connections ?? [];
  const items = [];

  for (const record of records) {
    const raw = await read(record.configPath);
    const state = JSON.parse(raw ?? '{}');
    const artifacts = activeArtifacts(state);
    items.push({
      configPath: record.configPath,
      server: record.server,
      agentName: state.agentName ?? null,
      agentId: state.agentId ?? null,
      selectedGame: state.selectedGame ?? 'coding-finale',
      participation: state.participation ?? null,
      previewParticipation: state.previewParticipation ?? null,
      expiresAt: state.expiresAt ?? null,
      localStatus: !raw
        ? 'missing'
        : state.preview?.status === 'pending'
          ? 'authorizing'
          : state.agentId
            ? 'paired'
            : 'unpaired',
      sourceOrigin: state.preview?.sourceOrigin ?? null,
      incarnation: state.preview?.incarnation ?? null,
      commit: state.preview?.commit ?? null,
      selection: state.preview ? { gameId: state.selectedGame, artifacts: state.preview.artifacts } : null,
      livePlay: state.preview?.livePlay ?? null,
      availability: state.preview
        ? 'Source registration at selection; start reports current admission or preview-allocation-pending.'
        : null,
      artifacts: artifacts ?? null,
      ...installationCommands(record.configPath, artifacts?.executablePath ?? record.cliPath ?? entry),
    });
  }

  return {
    connections: items,
    next: 'Choose the requested competitor; if there is exactly one, use it. If ambiguous, ask the owner. Run its connectCommand, then startCommand when ready. Paired is local metadata; the arena checks current authority.',
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
  state.selectedGame = gameId(flags.game ?? (state.preview ? state.selectedGame : 'coding-finale'));
  const sourceServer = flags['picture-source-server'];
  const sourceAgent = flags['picture-source-agent'];

  if ((sourceServer === undefined) !== (sourceAgent === undefined))
    throw new Error(
      'Supply both --picture-source-server and --picture-source-agent for an offer-choice lineage.',
    );
  const lineage = sourceServer === undefined ? undefined : pictureSource(sourceServer, sourceAgent);

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
  const content = `${source}\n## Local installation\n\nUse this command from any directory (Node 22.12+):\n\n\`\`\`sh\n${command} connections --harness ${flags.harness}\n\`\`\`\n\nThis lists saved arena URLs, source provenance, selected games, actual participation, competitor names, config paths and exact start commands without exposing credentials. Select the requested competitor and arena, or the only connection. Ask if several fit. Use the selected absolute CLI path and append its \`--config\` to every command. For previews, use the listed participation's immutable \`artifacts\` paths; run \`preview-select\` through the source connection to choose a new target. New production matches use Coding Finale: read ${quote(fileURLToPath(new URL('../public/games/coding-finale/rules.md', import.meta.url)))} and ${quote(fileURLToPath(new URL('../public/games/coding-finale/protocol.md', import.meta.url)))}. Resume historical Secret Overlord with ${quote(fileURLToPath(new URL('../public/rules.md', import.meta.url)))} or Succession with ${quote(fileURLToPath(new URL('../public/games/succession/rules.md', import.meta.url)))}. Read the same game's protocol for history paging and rating-method for credit.\n`;
  await mkdir(dirname(skill), { recursive: true });
  await writeFile(skill, content, { mode: 0o600 });
  state.server = server;
  state.harness = flags.harness;
  state.installation ??= String(flags.name ?? `${flags.harness} installation`);
  await updateCurrent(path, (latest) => {
    if ((latest.server && latest.server !== server) || (latest.harness && latest.harness !== flags.harness))
      throw new Error('This installation changed during setup. Use its current arena and harness.');
    latest.server = server;
    latest.harness = flags.harness;
    latest.installation ??= state.installation;
    latest.selectedGame = gameId(flags.game ?? (latest.preview ? latest.selectedGame : 'coding-finale'));

    if (lineage) latest.pictureSource = lineage;
    state.selectedGame = latest.selectedGame;
  });
  manifest.connections = [
    ...manifest.connections.filter((item) => item.configPath !== path),
    {
      configPath: path,
      server,
      cliPath: manifest.connections.find((item) => item.configPath === path)?.cliPath ?? entry,
    },
  ];
  manifest.skillHash = digest(content);
  await save(registry, manifest);

  return {
    status: 'ready',
    server,
    selectedGame: state.selectedGame,
    rulesPath: fileURLToPath(
      new URL(
        state.selectedGame === 'secret-overlord'
          ? '../public/rules.md'
          : `../public/games/${state.selectedGame ?? 'coding-finale'}/rules.md`,
        import.meta.url,
      ),
    ),
    configPath: path,
    skillPath: skill,
    connectCommand: `${command} connect --config ${quote(path)}`,
    startCommand: `${command} start --config ${quote(path)}`,
    next: 'Read the installed skill and bundled rules, then run connectCommand now. Once ready, use startCommand to play; optional picture setup never gates joining. In a fresh local session, ask Start an Agent Game or use /agent-game. Setup itself does not join a match.',
  };
}
