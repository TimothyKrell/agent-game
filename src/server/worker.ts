import { cliArchive } from '../shared/onboarding';
import { GameError } from '../game/types';
import {
  ActionRequestSchema,
  NameSchema,
  PairApproveSchema,
  PairStartSchema,
  QueueJoinSchema,
} from '../shared/api';
import { agentSession, authProviders, createAuth, developmentLogin, ownerSession } from './auth';
import { checkOrigin, fault, isLoopback, json, nameValue, readJson, rpcResponse } from './http';
import { houseConfigured } from './house-model';
import { approvePairing, pairingDetails, pollPairing, startPairing } from './pairing';
import {
  agentHistory,
  connections,
  createAgent,
  findAgent,
  listAgents,
  matchList,
  ownedAgent,
} from './repository';

export { MatchObject } from './match';

export { MatchmakingObject } from './matchmaking';

export { HouseSeatObject } from './house-seat';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/agents.md' && (method === 'GET' || method === 'HEAD')) {
        // This is a bounded, build-owned Markdown asset, rendered for the requested arena.
        const asset = await env.ASSETS.fetch(new Request(new URL('/agents.md', url), { method: 'GET' }));

        if (!asset.ok) return asset;
        const template = await asset.text();

        return new Response(
          method === 'HEAD'
            ? null
            : template.replaceAll('{{ARENA_ORIGIN}}', url.origin).replaceAll('{{CLI_ARCHIVE}}', cliArchive),
          {
            headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-cache' },
          },
        );
      }

      if (path.startsWith('/api/auth/')) return await createAuth(env).handler(request);

      if (path === '/api/health') return json({ ok: true, protocolVersion: '1' });
      const queue = env.MATCHMAKING.getByName('secret-overlord');
      const evaluation = path.match(/^\/api\/dev\/evaluation\/(match_[\w-]+)$/);

      if (evaluation && method === 'GET' && env.ENVIRONMENT === 'development' && isLoopback(request.url)) {
        const record = await env.DB.prepare('SELECT model FROM matches WHERE id = ?')
          .bind(evaluation[1])
          .first<{ model: string }>();

        return json({
          ...(await queue.inferenceSummary(evaluation[1])),
          // The index stores the configuration captured when this match started.
          houseModel: record ? JSON.parse(record.model) : null,
        });
      }

      if (path === '/api/bootstrap' && method === 'GET') {
        const [owner, live, recent, leaderboard, queueCount] = await Promise.all([
          ownerSession(request, env, false),
          matchList(env, true),
          matchList(env, false, 8),
          listAgents(env, { limit: 12 }),
          queue.count(),
        ]);

        return json({
          name: 'Agent Game',
          mode: env.HOUSE_PROVIDER === 'preview' ? 'preview' : 'ranked',
          owner,
          live,
          recent,
          leaderboard,
          queueCount,
          authProviders: authProviders(env),
          localLogin: env.ENVIRONMENT === 'development' && isLoopback(request.url),
          houseAvailable: houseConfigured(env),
        });
      }

      if (path === '/api/dev/login' && method === 'POST') {
        checkOrigin(request, env);
        const input = await readJson(request, NameSchema);

        return await developmentLogin(request, env, nameValue(input.name));
      }

      if (path === '/api/dev/exhibition' && method === 'POST') {
        checkOrigin(request, env);

        const hostedPreview = env.ENVIRONMENT === 'preview' && env.HOUSE_PROVIDER === 'preview';

        if (!isLoopback(request.url) && !hostedPreview) throw new GameError('not-found', 'Not found.', 404);

        return rpcResponse(await queue.exhibition());
      }

      if (path === '/api/agents' && method === 'GET')
        return json(await listAgents(env, { house: url.searchParams.get('house') === 'true' }));
      const agentRoute = path.match(/^\/api\/agents\/([^/]+)$/);

      if (agentRoute && method === 'GET') {
        const agent = await findAgent(env, agentRoute[1]);

        if (!agent) throw new GameError('not-found', 'Agent not found.', 404);

        return json({ agent, history: await agentHistory(env, agent.id) });
      }

      const ownerRoute = path.match(/^\/api\/owners\/([^/]+)$/);

      if (ownerRoute && method === 'GET') {
        const owner = await env.DB.prepare('SELECT id, handle, name FROM owners WHERE handle = ?')
          .bind(decodeURIComponent(ownerRoute[1]))
          .first<{ id: string; handle: string; name: string }>();

        if (!owner) throw new GameError('not-found', 'Owner not found.', 404);

        return json({ owner, agents: await listAgents(env, { ownerId: owner.id }) });
      }

      if (path.startsWith('/api/owner')) {
        const owner = (await ownerSession(request, env))!;

        if (method !== 'GET') checkOrigin(request, env);

        if (path === '/api/owner' && method === 'GET') {
          const roster = await listAgents(env, { ownerId: owner.id });

          return json({
            owner,
            agents: roster,
            connections: await connections(env, owner.id),
            queue: Object.fromEntries(
              await Promise.all(roster.map(async (agent) => [agent.id, await queue.status(agent.id)])),
            ),
          });
        }

        if (path === '/api/owner/agents' && method === 'POST') {
          const input = await readJson(request, NameSchema);

          return json(await createAgent(env, owner, input.name, input.description), 201);
        }

        const retirement = path.match(/^\/api\/owner\/agents\/([^/]+)\/retire$/);

        if (retirement && method === 'POST') {
          await ownedAgent(env, owner.id, retirement[1]);

          return rpcResponse(await queue.retire(retirement[1], owner.id));
        }

        const revoke = path.match(/^\/api\/owner\/connections\/([^/]+)\/revoke$/);

        if (revoke && method === 'POST') {
          const grant = await env.DB.prepare(
            'SELECT g.id FROM agent_grants g JOIN agents a ON a.id = g.agent_id WHERE g.id = ? AND a.owner_id = ?',
          )
            .bind(revoke[1], owner.id)
            .first();

          if (!grant) throw new GameError('not-found', 'Connection not found.', 404);
          await env.DB.prepare('UPDATE agent_grants SET revoked_at = coalesce(revoked_at, ?) WHERE id = ?')
            .bind(Date.now(), revoke[1])
            .run();
          await queue.revokeGrant(revoke[1]);

          return json({ revoked: true });
        }

        if (path === '/api/owner/pairing' && method === 'GET')
          return json(await pairingDetails(env, url.searchParams.get('code') ?? ''));

        if (path === '/api/owner/pairing/approve' && method === 'POST') {
          const input = await readJson(request, PairApproveSchema);

          return json(await approvePairing(env, owner.id, input.code, input.agentId));
        }
      }

      if (path === '/api/pairing' && method === 'POST') {
        const input = await readJson(request, PairStartSchema);

        return json(await startPairing(env, input.installation, input.tokenHash), 201);
      }

      if (path === '/api/pairing/status' && method === 'GET') return json(await pollPairing(env, request));

      if (path === '/api/queue') {
        const principal = await agentSession(request, env);

        if (method === 'GET') return json(await queue.status(principal.agentId));

        if (method === 'DELETE') return rpcResponse(await queue.cancel(principal.agentId, principal.grantId));

        if (method === 'POST') {
          if (!houseConfigured(env))
            throw new GameError(
              'house-unavailable',
              'House agents are not configured. Match admission is paused.',
              503,
            );
          const input = await readJson(request, QueueJoinSchema);

          return rpcResponse(await queue.join(principal, input.requestId));
        }
      }

      if (path === '/api/matches' && method === 'GET')
        return json(await matchList(env, url.searchParams.get('status') !== 'finished'));
      const matchRoute = path.match(/^\/api\/matches\/(match_[a-zA-Z0-9-]+)(?:\/(actions|ticket|events))?$/);

      if (matchRoute) {
        const match = env.MATCHES.getByName(matchRoute[1]);
        const operation = matchRoute[2];

        if (operation === 'events' && method === 'GET') return await match.fetch(request);

        if (operation === 'ticket' && method === 'POST')
          return rpcResponse(await match.socketTicket(await agentSession(request, env)));

        if (operation === 'actions' && method === 'POST') {
          const principal = await agentSession(request, env);
          const input = await readJson(request, ActionRequestSchema);

          if (!/^[\w:-]{8,160}$/.test(input.actionId))
            throw new GameError(
              'action-id',
              'Use a unique action ID of 8–160 letters, digits, hyphens, underscores or colons.',
              400,
            );

          return rpcResponse(await match.submit(principal, input));
        }

        if (!operation && method === 'GET') {
          const after = Number(url.searchParams.get('after') ?? 0);

          if (!Number.isSafeInteger(after) || after < 0)
            throw new GameError('invalid-cursor', 'Use a nonnegative integer cursor.', 400);

          return rpcResponse(
            await match.observation(
              request.headers.has('authorization') ? await agentSession(request, env) : null,
              after,
            ),
          );
        }
      }

      if (path.startsWith('/api/')) throw new GameError('not-found', 'Endpoint not found.', 404);

      return await env.ASSETS.fetch(request);
    } catch (error) {
      const problem = fault(error);

      if (problem.status === 500)
        console.error(
          JSON.stringify({
            event: 'request_error',
            path,
            errorType: error instanceof Error ? error.name : 'unknown',
            message: error instanceof Error ? error.message : '',
          }),
        );

      return json({ error: problem }, problem.status);
    }
  },
} satisfies ExportedHandler<Env>;
