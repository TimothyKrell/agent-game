import { createInterface } from 'node:readline';
import { appendFile, readFile } from 'node:fs/promises';
import { commands, executeGame } from './competitor-tool.mjs';

const [configPath, metricsPath, cliPath, gatePath] = process.argv.slice(2);

const tool = {
  name: 'game',
  description: `Your fixed game CLI. Required choices first. ${process.env.AGENT_GAME_EVENT_WAIT === '1' ? 'wait remains pending until a change or decision; idle timeouts are handled internally.' : 'wait blocks up to 60s, waking on changes.'} history uses explicit cursors. Coding payloads are JSON.`,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: commands },
      choice: { type: 'integer', minimum: 0 },
      text: { type: 'string' },
      to: {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 9 },
        maxItems: 3,
        description: 'Publicly address these seats. This is not a private message.',
      },
      replyTo: {
        type: 'object',
        properties: { eventKey: { type: 'string' }, seat: { type: 'integer', minimum: 0, maximum: 9 } },
        required: ['eventKey', 'seat'],
        additionalProperties: false,
        description: 'Reply to this delivered public chat event and its speaker.',
      },
      resetDiscussion: {
        type: 'boolean',
        description: 'On fresh model context, request a recent discussion window.',
      },
      tier: { type: 'integer', enum: [1, 2] },
      epoch: { type: 'string' },
      after: { type: 'integer', minimum: 0 },
      through: { type: 'integer', minimum: 0 },
      payload: {
        type: 'object',
        additionalProperties: true,
        description:
          'Practice {program:{language,source},inputs:[...]}; submit {challengeId,tier,program:{language,source}}.',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
};

async function handle(request) {
  if (request.id === undefined) return;
  let result;

  if (request.method === 'initialize')
    result = {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agent-game', version: '1' },
    };
  else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/list') result = { tools: [tool] };
  else if (request.method === 'tools/call' && request.params.name === 'game') {
    const input = request.params.arguments;

    const admitted = await readFile(gatePath, 'utf8')
      .then((value) => value === 'play')
      .catch(() => false);

    if (!admitted && input.command !== 'status')
      throw new Error('Readiness only: call status. Gameplay has not been admitted.');
    const start = Date.now();
    const text = await executeGame(input, { nodePath: process.execPath, cliPath, configPath });
    const value = JSON.parse(text);
    const view = value.observation ?? value;
    await appendFile(
      metricsPath,
      JSON.stringify({
        at: Date.now(),
        command: input.command,
        milliseconds: Date.now() - start,
        bytes: Buffer.byteLength(text),
        error: value.error?.code,
        status: value.status,
        unchanged: value.unchanged === true,
        decision: !!view.decision,
        act: view.act,
        phase: view.phase?.kind,
        matchId: view.matchId,
      }) + '\n',
      { mode: 0o600 },
    );
    result = { content: [{ type: 'text', text }], isError: !!value.error };
  } else {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' },
      }) + '\n',
    );

    return;
  }

  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}

for await (const line of createInterface({ input: process.stdin })) {
  let request;

  try {
    request = JSON.parse(line);
  } catch {
    continue;
  }

  void handle(request).catch((error) => {
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message } }) +
        '\n',
    );
  });
}
