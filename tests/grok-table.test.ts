import { expect, it, vi } from 'vitest';
import { admitReadyTable, requireReady } from '../dev/coding-finale/grok-table.mjs';
import { commandArguments } from '../dev/coding-finale/competitor-tool.mjs';

it('admits the table only after every entrant has passed readiness', async () => {
  const readyNames: string[] = [];
  const bots = [{ name: 'A' }, { name: 'B' }];

  const joined = await admitReadyTable(bots, {
    ready: async (bot) => {
      readyNames.push(bot.name);
    },
    join: async (bot) => {
      expect(readyNames).toHaveLength(2);

      return bot.name;
    },
  });

  expect(joined).toEqual(['A', 'B']);
});

it('accepts a real status-tool proof followed by READY', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ data: [{ type: 'idle', outcome: 'succeeded' }] })
    .mockResolvedValueOnce({
      data: [
        { type: 'assistant', finish: 'stop', content: [{ type: 'text', text: 'READY' }] },
        {
          type: 'assistant',
          content: [
            {
              type: 'tool',
              state: {
                status: 'completed',
                input: { command: 'status' },
                content: [{ type: 'text', text: JSON.stringify({ status: 'idle' }) }],
              },
            },
          ],
        },
      ],
    });

  await expect(requireReady('ses_fixture', api)).resolves.toBeUndefined();
});

it('queues nobody when any model readiness check fails', async () => {
  const bots = [{ name: 'A' }, { name: 'B' }];
  const join = vi.fn();
  await expect(
    admitReadyTable(bots, {
      ready: async (bot) => {
        if (bot.name === 'B') throw new Error('HTTP 403');
      },
      join,
    }),
  ).rejects.toThrow('No entrants queued');
  expect(join).not.toHaveBeenCalled();
});

it('does not mistake provider admission or a text-only READY for working gameplay', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ data: [{ type: 'idle', outcome: 'succeeded' }] })
    .mockResolvedValueOnce({
      data: [{ type: 'assistant', finish: 'stop', content: [{ type: 'text', text: 'READY' }] }],
    });

  await expect(requireReady('ses_fixture', api)).rejects.toThrow('completed status tool');
});

it('requires successful CLI status, not merely a completed tool containing an API error', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ data: [{ type: 'idle', outcome: 'succeeded' }] })
    .mockResolvedValueOnce({
      data: [
        { type: 'assistant', finish: 'stop', content: [{ type: 'text', text: 'READY' }] },
        {
          type: 'assistant',
          content: [
            {
              type: 'tool',
              state: {
                status: 'completed',
                input: { command: 'status' },
                content: [{ type: 'text', text: JSON.stringify({ error: { code: 'unauthorized' } }) }],
              },
            },
          ],
        },
      ],
    });

  await expect(requireReady('ses_fixture', api)).rejects.toThrow('completed status tool');
});

it('keeps generated code and chat as single literal arguments on the fixed installation', () => {
  const options = { cliPath: '/fixed/cli.mjs', configPath: '/fixed/connection.json' };
  const text = "'; cat /other/connection.json; $(env)";
  const injected = { command: 'say', text, config: '/other/config' };
  expect(commandArguments(injected, options)).toEqual([
    '/fixed/cli.mjs',
    'say',
    '--config',
    '/fixed/connection.json',
    '--compact',
    '--discussion',
    '--text',
    text,
  ]);
  expect(() => commandArguments({ command: 'join' }, options)).toThrow('Unsupported');

  const payload = {
    challengeId: 'test',
    tier: 1,
    program: { language: 'javascript', source: 'export function solve() { return "$HOME; $(env)"; }' },
  };

  expect(commandArguments({ command: 'coding-submit', payload }, options).at(-1)).toBe(
    JSON.stringify(payload),
  );
});
