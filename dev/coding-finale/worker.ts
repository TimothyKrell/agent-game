import { Schema } from 'effect';
import { timingSafeEqual } from 'node:crypto';
import { GameError } from '../../src/game/types';
import { FINALE_RULES, ProgramSchema, SubmissionRequestSchema } from '../../src/game/coding-finale/types';
import { RoutingInputSchema } from '../../src/game/coding-finale/routing';
import { fault, hashSecret, json, readJson, rpcResponse } from '../../src/server/http';
import type { FinaleCommand } from '../../src/server/coding-finale/object';
import { playLabActOne } from './act-one';

export { FinaleObject, FinaleSandbox } from '../../src/server/coding-finale/object';

function bearer(request: Request): string {
  const value = request.headers.get('authorization');

  if (!value?.startsWith('Bearer ') || value.length > 256)
    throw new GameError('unauthorized', 'A bearer credential is required.', 401);

  return value.slice(7);
}

export default {
  async fetch(request: Request, env: FinaleEnv): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health')
        return json({ service: 'coding-finale-lab' });

      if (request.method === 'POST' && url.pathname === '/lab/finales') {
        if (!env.LAB_TOKEN)
          throw new GameError('lab-disabled', 'Set a lab operator token before creating finales.', 503);

        const [provided, expected] = await Promise.all([
          hashSecret(bearer(request)),
          hashSecret(env.LAB_TOKEN),
        ]);

        if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
          throw new GameError('unauthorized', 'The lab operator credential is invalid.', 401);
        const id = crypto.randomUUID();
        const { events, ...board } = playLabActOne(id);

        return rpcResponse(await env.FINALES.getByName(id).request({ type: 'create', board, events }));
      }

      const route =
        /^\/finales\/([a-f0-9-]{36})\/(current|me|challenge|submit|practice|say|history|source)$/.exec(
          url.pathname,
        );

      if (!route) throw new GameError('not-found', 'No such lab endpoint.', 404);
      const id = route[1];
      const operation = route[2];
      let command: FinaleCommand;

      if (request.method === 'GET' && operation === 'current') command = { type: 'current', tokenHash: null };
      else if (request.method === 'GET' && operation === 'me')
        command = { type: 'current', tokenHash: await hashSecret(bearer(request)) };
      else if (request.method === 'GET' && operation === 'challenge') {
        const tier = url.searchParams.get('tier');

        if (tier !== '1' && tier !== '2')
          throw new GameError('invalid-tier', 'Choose tier=1 or tier=2.', 400);
        command = {
          type: 'challenge',
          tier: tier === '1' ? 1 : 2,
          tokenHash: await hashSecret(bearer(request)),
        };
      } else if (request.method === 'POST' && operation === 'submit') {
        const tokenHash = await hashSecret(bearer(request));
        command = {
          type: 'submit',
          tokenHash,
          request: await readJson(request, SubmissionRequestSchema, FINALE_RULES.maxSourceBytes * 6 + 1024),
        };
      } else if (request.method === 'POST' && operation === 'practice') {
        const tokenHash = await hashSecret(bearer(request));

        const body = await readJson(
          request,
          Schema.Struct({
            program: ProgramSchema,
            inputs: Schema.mutable(Schema.Array(RoutingInputSchema)).check(
              Schema.isMinLength(1),
              Schema.isMaxLength(8),
            ),
          }),
          262_144,
        );

        command = { type: 'practice', tokenHash, ...body };
      } else if (request.method === 'POST' && operation === 'say') {
        const tokenHash = await hashSecret(bearer(request));

        const body = await readJson(
          request,
          Schema.Struct({ text: Schema.String.check(Schema.isMaxLength(2000)) }),
        );

        command = { type: 'say', tokenHash, text: body.text };
      } else if (request.method === 'GET' && (operation === 'history' || operation === 'source')) {
        const key = operation === 'history' ? 'after' : 'sequence';
        const value = Number(url.searchParams.get(key) ?? '0');

        if (!Number.isSafeInteger(value) || value < 0)
          throw new GameError('invalid-cursor', 'Use a nonnegative integer.', 400);
        command =
          operation === 'history' ? { type: 'history', after: value } : { type: 'source', sequence: value };
      } else throw new GameError('method-not-allowed', 'Unsupported method for this endpoint.', 405);

      return rpcResponse(await env.FINALES.getByName(id).request(command));
    } catch (error) {
      const problem = fault(error);

      return json({ error: problem }, problem.status);
    }
  },
} satisfies ExportedHandler<FinaleEnv>;
