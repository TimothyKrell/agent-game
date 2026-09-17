import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { expect, it } from 'vitest';

it('gates gameplay on readiness and forwards code literally to the fixed CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'claude-game-mcp-'));
  const cli = join(directory, 'fixture.mjs');
  const config = join(directory, 'connection.json');
  const gate = join(directory, 'gate');
  await writeFile(cli, 'console.log(JSON.stringify({status:"idle",argv:process.argv.slice(2)}));');

  const child = spawn(
    process.execPath,
    [resolve('dev/coding-finale/claude-game-mcp.mjs'), config, join(directory, 'metrics.jsonl'), cli, gate],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  const lines = createInterface({ input: child.stdout });
  let id = 0;

  const call = async (method: string, params = {}) => {
    const response = once(lines, 'line');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');

    return JSON.parse((await response)[0]);
  };

  try {
    expect((await call('initialize')).result.capabilities).toEqual({ tools: {} });
    expect((await call('tools/list')).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'game',
    ]);
    const blocked = await call('tools/call', { name: 'game', arguments: { command: 'act', choice: 0 } });
    expect(blocked.error.message).toContain('Readiness only');
    const status = await call('tools/call', { name: 'game', arguments: { command: 'status' } });
    expect(JSON.parse(status.result.content[0].text).status).toBe('idle');
    await writeFile(gate, 'play');

    const payload = {
      challengeId: 'fixture',
      tier: 1,
      program: { language: 'javascript', source: 'export const solve = () => "$(env); `whoami`";' },
    };

    const result = await call('tools/call', {
      name: 'game',
      arguments: { command: 'coding-submit', payload, config: '/somewhere-else' },
    });

    expect(JSON.parse(result.result.content[0].text).argv).toEqual([
      'coding-submit',
      '--config',
      config,
      '--compact',
      '--json',
      JSON.stringify(payload),
    ]);
    expect(
      (await call('tools/call', { name: 'game', arguments: { command: 'join' } })).error.message,
    ).toContain('Unsupported');

    const reply = await call('tools/call', {
      name: 'game',
      arguments: {
        command: 'say',
        text: 'Explain that.',
        to: [2, 4],
        replyTo: { eventKey: 'match:19', seat: 2 },
      },
    });

    expect(JSON.parse(reply.result.content[0].text).argv).toEqual([
      'say',
      '--config',
      config,
      '--compact',
      '--discussion',
      '--text',
      'Explain that.',
      '--to',
      '2,4',
      '--reply-to',
      'match:19',
      '--reply-seat',
      '2',
    ]);
  } finally {
    const exited = once(child, 'close');
    child.kill();
    await exited;
    lines.close();
    await rm(directory, { recursive: true, force: true });
  }
});
