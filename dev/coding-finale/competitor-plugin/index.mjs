import { appendFile } from 'node:fs/promises';
import { commands, executeGame } from '../competitor-tool.mjs';

/** Location-scoped local tournament harness. No prompts, credentials, or source are written to metrics. */
export default {
  id: 'coding-finale-competitor',
  async setup(ctx) {
    const record = async (entry) => {
      await appendFile(ctx.options.metricsPath, JSON.stringify({ at: Date.now(), ...entry }) + '\n', {
        mode: 0o600,
      });
    };

    await ctx.skill.transform((editor) => {
      for (const skill of editor.list()) editor.remove(skill.id);
    });
    await ctx.mcp.transform((editor) => {
      for (const [name] of editor.list())
        editor.update(name, (server) => {
          server.disabled = true;
        });
    });
    await ctx.tool.transform((editor) => {
      for (const tool of editor.list()) editor.remove(tool.id);
      editor.add({
        name: 'game',
        options: { codemode: false },
        description:
          'Call your own game CLI. Prioritize decision.actions via act(choice). wait blocks up to 60 seconds and wakes on changes. history reads explicit bounded pages. Coding payloads are JSON, never shell code.',
        input: {
          type: 'object',
          properties: {
            command: { type: 'string', enum: commands },
            choice: { type: 'integer', minimum: 0 },
            text: { type: 'string', maxLength: 1000 },
            to: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 9 }, maxItems: 3 },
            replyTo: {
              type: 'object',
              properties: { eventKey: { type: 'string' }, seat: { type: 'integer', minimum: 0, maximum: 9 } },
              required: ['eventKey', 'seat'],
              additionalProperties: false,
            },
            resetDiscussion: { type: 'boolean' },
            tier: { type: 'integer', enum: [1, 2] },
            epoch: { type: 'string' },
            after: { type: 'integer', minimum: 0 },
            through: { type: 'integer', minimum: 0 },
            payload: {
              type: 'object',
              description:
                'Practice: {program:{language,source},inputs:[...]}. Submit: {challengeId,tier,program:{language,source}}.',
            },
          },
          required: ['command'],
          additionalProperties: false,
        },
        execute: async (input) => {
          const started = performance.now();
          const content = await executeGame(input, ctx.options);
          const output = JSON.parse(content);
          await record({
            kind: 'tool',
            command: input.command,
            milliseconds: Math.round(performance.now() - started),
            bytes: Buffer.byteLength(content),
            unchanged: output.unchanged === true,
            hasDecision: !!(output.decision ?? output.observation?.decision),
            error: output.error?.code,
            history:
              input.command === 'history'
                ? { after: input.after, through: input.through, cursor: output.cursor }
                : undefined,
          });

          return { content };
        },
      });
    });
    await ctx.session.hook('context', async (event) => {
      await record({
        kind: 'context',
        sessionId: event.sessionID,
        systemBytes: Buffer.byteLength(JSON.stringify(event.system)),
        messageBytes: Buffer.byteLength(JSON.stringify(event.messages)),
        toolBytes: Buffer.byteLength(JSON.stringify(event.tools)),
        tools: Object.keys(event.tools),
      });
    });
    await ctx.session.hook(
      'http.request',
      async (event) => {
        const body = await event.request.clone().json();
        await record({
          kind: 'request',
          sessionId: event.sessionID,
          bytes: Buffer.byteLength(JSON.stringify(body)),
          instructionBytes: Buffer.byteLength(JSON.stringify(body.instructions ?? '')),
          tools: body.tools?.map((tool) => tool.name ?? tool.type) ?? [],
        });
      },
      { providerID: 'xai' },
    );
    await ctx.session.hook(
      'http.response',
      async (event) => {
        if (event.response.ok) return;

        const body = await event.response
          .clone()
          .json()
          .catch(() => ({}));

        // Record only the provider's machine-readable code, never arbitrary response bodies.
        await record({
          kind: 'provider-error',
          sessionId: event.sessionID,
          status: event.response.status,
          code: body.code,
        });
      },
      { providerID: 'xai' },
    );
  },
};
