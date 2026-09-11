import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('runs help through the symlink used by npm bin installations and stays inert when imported', async () => {
  const directory = await mkdtemp('/tmp/opencode/agent-game-bin-');
  const run = promisify(execFile);

  try {
    const bin = `${directory}/agent-game`;
    await symlink(resolve('cli/agent-game.mjs'), bin);
    expect((await run(process.execPath, [bin, 'help'])).stdout).toContain('Agent Game');
    expect((await run(process.execPath, [bin, '--help'])).stdout).toContain('Commands:');
    expect(
      (await run(process.execPath, ['--input-type=module', '-e', "import './cli/agent-game.mjs'"])).stdout,
    ).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rejects missing string flag values at the CLI boundary', async () => {
  const run = promisify(execFile);

  for (const flag of ['server', 'model', 'config']) {
    await expect(run(process.execPath, ['cli/agent-game.mjs', 'help', `--${flag}`])).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('ERR_PARSE_ARGS_INVALID_OPTION_VALUE'),
    });
  }
});

it('installs the real archive, saves discoverable skills for both harnesses, and preserves existing identities', async () => {
  const directory = await mkdtemp('/tmp/opencode/agent-game-install-');
  const run = promisify(execFile);

  const env = {
    ...process.env,
    HOME: directory,
    XDG_CONFIG_HOME: `${directory}/config`,
    CLAUDE_CONFIG_DIR: `${directory}/claude`,
  };

  try {
    await run(process.execPath, ['scripts/package-cli.mjs']);
    await run(
      'npm',
      [
        'install',
        '--prefix',
        directory,
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        resolve('public/downloads/agent-game-cli-0.1.1.tgz'),
      ],
      { env },
    );
    const bin = `${directory}/node_modules/.bin/agent-game`;

    const cli = async (...args: string[]) =>
      JSON.parse((await run(process.execPath, [bin, ...args], { env, cwd: directory })).stdout);

    expect((await run(bin, ['help'], { env })).stdout).toContain('Setup:');
    const first = await cli('setup', '--server', 'https://arena.example.test/', '--harness', 'opencode');
    expect(first.skillPath).toBe(`${directory}/config/opencode/skills/agent-game/SKILL.md`);

    const config = {
      ...JSON.parse(await readFile(first.configPath, 'utf8')),
      token: 'private-test-token',
      agentId: 'agent_existing',
      agentName: 'Existing competitor',
      cursor: 25,
    };

    await writeFile(first.configPath, JSON.stringify(config));
    await cli('setup', '--server', 'https://arena.example.test', '--harness', 'opencode');
    expect(JSON.parse(await readFile(first.configPath, 'utf8'))).toEqual(config);
    expect((await stat(first.configPath)).mode & 0o777).toBe(0o600);
    const skill = await readFile(first.skillPath, 'utf8');
    expect(skill).toContain('Start an Agent Game');
    expect(skill).toContain('connections --harness opencode');
    expect(skill).toContain(`${directory}/node_modules/agent-game-cli/cli/agent-game.mjs`);
    expect(skill).not.toContain(config.token);
    const second = await cli('setup', '--server', 'https://arena.example.test', '--harness', 'claude');
    expect(second.skillPath).toBe(`${directory}/claude/skills/agent-game/SKILL.md`);
    expect(second.configPath).not.toBe(first.configPath);
    await cli('setup', '--server', 'https://another.example.test', '--harness', 'opencode');
    const listing = await cli('connections', '--harness', 'opencode');
    expect(listing.connections).toHaveLength(2);
    expect(listing.connections[0]).toMatchObject({
      server: 'https://arena.example.test',
      agentName: 'Existing competitor',
      configPath: first.configPath,
    });
    expect(JSON.stringify(listing)).not.toContain(config.token);
    await expect(
      cli(
        'setup',
        '--server',
        'https://another.example.test',
        '--harness',
        'opencode',
        '--config',
        first.configPath,
      ),
    ).rejects.toThrow();
    await writeFile(first.skillPath, 'My custom strategy');
    await expect(
      cli('setup', '--server', 'https://arena.example.test', '--harness', 'opencode'),
    ).rejects.toThrow();
    expect(await readFile(first.skillPath, 'utf8')).toBe('My custom strategy');
    expect(JSON.parse(await readFile(first.configPath, 'utf8'))).toEqual(config);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
