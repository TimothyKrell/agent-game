import { cliArchive } from '../shared/onboarding';
import { PICTURE_BATCH_LIMIT } from '../shared/agent-picture';
import { agentPictures, collectAgentPictures } from './agent-picture-data';
import { changeAgentPicture, readAgentPicture } from './agent-pictures';
import { GameError } from '../game/types';
import { GAME_DESCRIPTORS } from '../game/descriptors';
import { platformCoordinator } from './coordinator';
import { requireGameProtocol, requireQueueProtocol, selectedGame } from './protocol';
import {
  TransportActionRequestSchema,
  CodingPracticeSchema,
  NameSchema,
  PairApproveSchema,
  PairStartSchema,
  QueueJoinSchema,
  QueueCancelSchema,
  GameSelectionSchema,
} from '../shared/api';
import {
  agentSession,
  authProviders,
  createAuth,
  developmentLogin,
  ownerSession,
  ownerPreviewAuthority,
} from './auth';
import {
  checkOrigin,
  fault,
  isLoopback,
  json,
  nameValue,
  readJson,
  readOptionalJson,
  rpcResponse,
} from './http';
import { houseConfigured } from './house-model';
import { sourcePreviewRoute } from './preview-source';
import { sourceBrokerRoute } from './preview-inference';
import { targetPreviewRoute } from './preview-target';
import { previewEnabled } from './preview-config';
import { previewPage } from './preview-pages';
import { PreviewOwnerCompleteSchema } from '../shared/preview';
import { previewBrowserOrigin } from './preview-transport';
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

export { CodingSandbox } from './coding-runtime';

export { MatchmakingObject } from './matchmaking';

export { HouseSeatObject } from './house-seat';

export default {
  async scheduled(_controller, env) {
    await collectAgentPictures(env);
  },
  async fetch(request, env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/preview' || path.startsWith('/preview/')) {
        const page = await previewPage(request, env);

        if (page) return page;
      }

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

      if (path.startsWith('/api/preview/')) {
        const preview =
          (await targetPreviewRoute(request, env)) ??
          (await sourcePreviewRoute(request, env)) ??
          (await sourceBrokerRoute(request, env, ctx));

        if (preview) return preview;
      }

      if (path === '/api/auth/preview/complete' && method === 'POST' && previewEnabled(env)) {
        previewBrowserOrigin(request, env);
        const input = await readJson(request, PreviewOwnerCompleteSchema, 4096);

        return await createAuth(env).handler(
          new Request(request, { method: 'POST', body: JSON.stringify(input) }),
        );
      }

      if (path.startsWith('/api/auth/')) return await createAuth(env).handler(request);

      if (path === '/api/health') return json({ ok: true, protocolVersion: '1' });

      if (path === '/api/games' && method === 'GET') return json([GAME_DESCRIPTORS['coding-finale']]);

      if (path === '/api/agent-pictures' && method === 'GET') {
        const ids = url.searchParams.getAll('agentId');

        if (!ids.length || ids.length > PICTURE_BATCH_LIMIT || ids.some((id) => !/^[\w-]{1,100}$/.test(id)))
          throw new GameError('picture-agent-ids', 'Supply 1–50 stable agentId query parameters.', 400);

        return json(await agentPictures(env, ids));
      }

      const pictureRoute = path.match(/^\/api\/agents\/([\w-]{1,100})\/picture(?:\/([\w-]{1,100}))?$/);

      if (pictureRoute) {
        if (method === 'GET' || method === 'HEAD')
          return await readAgentPicture(request, env, pictureRoute[1], pictureRoute[2]);

        if (!pictureRoute[2] && (method === 'PUT' || method === 'DELETE')) {
          const principal = await agentSession(request, env);

          if (principal.agentId !== pictureRoute[1])
            throw new GameError('agent-not-found', 'Agent not found.', 404);

          return await changeAgentPicture(request, env, principal.agentId, principal);
        }
      }

      const queue = platformCoordinator(env);
      const protocols = request.headers.get('X-Agent-Game-Protocols') ?? '';
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
        const gameId = selectedGame(url.searchParams.get('gameId'));

        const [owner, live, recent, leaderboard, queueCount] = await Promise.all([
          ownerSession(request, env, false),
          matchList(env, true, 20, gameId),
          matchList(env, false, 8, gameId),
          listAgents(env, { limit: 12, gameId }),
          queue.count(gameId),
        ]);

        return json({
          name: 'Agent Game',
          gameId,
          games: [GAME_DESCRIPTORS['coding-finale']],
          mode: env.HOUSE_PROVIDER === 'preview' ? 'preview' : 'ranked',
          owner,
          live,
          recent,
          leaderboard,
          queueCount,
          authProviders: authProviders(env),
          localLogin: !previewEnabled(env) && env.ENVIRONMENT === 'development' && isLoopback(request.url),
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

        const input = await readOptionalJson(request, GameSelectionSchema);
        const gameId = selectedGame(input?.gameId ?? url.searchParams.get('gameId'));

        if (gameId !== 'coding-finale')
          throw new GameError('game-unavailable', 'New matches use Coding Finale.', 409);
        requireGameProtocol(gameId, protocols);

        return rpcResponse(await queue.exhibition(gameId));
      }

      if (path === '/api/agents' && method === 'GET')
        return json(
          await listAgents(env, {
            house: url.searchParams.get('house') === 'true',
            gameId: selectedGame(url.searchParams.get('gameId')),
          }),
        );
      const agentRoute = path.match(/^\/api\/agents\/([^/]+)$/);

      if (agentRoute && method === 'GET') {
        const gameId = selectedGame(url.searchParams.get('gameId'));
        const agent = await findAgent(env, agentRoute[1], gameId);

        if (!agent) throw new GameError('not-found', 'Agent not found.', 404);

        return json({ agent, history: await agentHistory(env, agent.id, gameId) });
      }

      const ownerRoute = path.match(/^\/api\/owners\/([^/]+)$/);

      if (ownerRoute && method === 'GET') {
        const owner = await env.DB.prepare('SELECT id, handle, name FROM owners WHERE handle = ?')
          .bind(decodeURIComponent(ownerRoute[1]))
          .first<{ id: string; handle: string; name: string }>();

        if (!owner) throw new GameError('not-found', 'Owner not found.', 404);

        return json({
          owner,
          agents: await listAgents(env, {
            ownerId: owner.id,
            gameId: selectedGame(url.searchParams.get('gameId')),
          }),
        });
      }

      if (path.startsWith('/api/owner')) {
        const owner = (await ownerSession(request, env))!;

        if (method !== 'GET') checkOrigin(request, env);

        if (path === '/api/owner' && method === 'GET') {
          const roster = await listAgents(env, {
            ownerId: owner.id,
            gameId: selectedGame(url.searchParams.get('gameId')),
          });

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

        const picture = path.match(/^\/api\/owner\/agents\/([\w-]{1,100})\/picture$/);

        if (picture && (method === 'PUT' || method === 'DELETE')) {
          const agent = await ownedAgent(env, owner.id, picture[1]);

          if (agent.retired && method === 'PUT')
            throw new GameError(
              'agent-retired',
              'Retired agents can have their picture removed, but cannot upload a new one.',
              409,
            );

          return await changeAgentPicture(request, env, agent.id, { ownerId: owner.id, grantId: null });
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

          return json(
            await approvePairing(
              env,
              owner.id,
              input.code,
              input.agentId,
              await ownerPreviewAuthority(request, env, input.agentId),
            ),
          );
        }
      }

      if (path === '/api/pairing' && method === 'POST') {
        const input = await readJson(request, PairStartSchema);

        return json(await startPairing(env, input.installation, input.tokenHash), 201);
      }

      if (path === '/api/pairing/status' && method === 'GET') return json(await pollPairing(env, request));

      if (path === '/api/queue') {
        const principal = await agentSession(request, env);
        const current = await queue.status(principal.agentId);
        requireQueueProtocol(current, protocols);

        if (
          url.searchParams.has('gameId') &&
          current.gameId &&
          current.gameId !== selectedGame(url.searchParams.get('gameId'))
        )
          return json(
            {
              error: {
                code: 'game-mismatch',
                message: 'This agent has participation in another game.',
                status: 409,
                gameId: current.gameId,
                matchId: current.matchId,
              },
            },
            409,
          );

        if (method === 'GET') return json(current);

        if (method === 'DELETE') {
          const expected = await readOptionalJson(request, QueueCancelSchema);
          const result = await queue.cancel(principal.agentId, principal.grantId, expected);

          if (result.ok) requireQueueProtocol(result.value, protocols);

          return rpcResponse(result);
        }

        if (method === 'POST') {
          if (!previewEnabled(env) && !houseConfigured(env))
            throw new GameError(
              'house-unavailable',
              'House agents are not configured. Match admission is paused.',
              503,
            );
          const input = await readJson(request, QueueJoinSchema);
          const gameId = selectedGame(input.gameId);

          if (gameId !== 'coding-finale' && current.status === 'idle')
            throw new GameError('game-unavailable', 'New matches use Coding Finale.', 409);
          requireGameProtocol(gameId, protocols);
          const result = await queue.join(principal, input.requestId, gameId);

          if (result.ok) requireQueueProtocol(result.value, protocols);

          return rpcResponse(result);
        }
      }

      if (path === '/api/matches' && method === 'GET')
        return json(
          await matchList(
            env,
            url.searchParams.get('status') !== 'finished',
            20,
            selectedGame(url.searchParams.get('gameId')),
          ),
        );

      const codingRoute = path.match(
        /^\/api\/matches\/(match_[a-zA-Z0-9-]+)\/coding\/(challenge|practice|source)$/,
      );

      if (codingRoute) {
        const match = env.MATCHES.getByName(codingRoute[1]);

        if (codingRoute[2] === 'source' && method === 'GET') {
          const sequence = Number(url.searchParams.get('sequence'));

          if (!url.searchParams.has('sequence') || !Number.isSafeInteger(sequence) || sequence < 1)
            throw new GameError('invalid-sequence', 'Supply a positive integer sequence.', 400);
          const principal = request.headers.has('authorization') ? await agentSession(request, env) : null;

          return rpcResponse(await match.codingSource(principal, sequence, protocols));
        }

        const principal = await agentSession(request, env);

        if (codingRoute[2] === 'challenge' && method === 'GET') {
          const tier = Number(url.searchParams.get('tier'));

          if (tier !== 1 && tier !== 2) throw new GameError('invalid-tier', 'Supply tier 1 or 2.', 400);

          return rpcResponse(await match.codingChallenge(principal, tier, protocols));
        }

        if (codingRoute[2] === 'practice' && method === 'POST') {
          const input = await readJson(request, CodingPracticeSchema, 204800);

          return rpcResponse(await match.codingPractice(principal, input.program, input.inputs, protocols));
        }
      }

      const matchRoute = path.match(
        /^\/api\/matches\/(match_[a-zA-Z0-9-]+)(?:\/(actions|ticket|events|history|history-anchor|checkpoint|replay|rounds))?$/,
      );

      if (matchRoute) {
        const match = env.MATCHES.getByName(matchRoute[1]);
        const operation = matchRoute[2];

        if (operation === 'events' && method === 'GET') {
          if (previewEnabled(env) && url.searchParams.has('ticket'))
            throw new GameError(
              'preview-public-wakeup',
              'Use public event wakeups and authenticated HTTP observations.',
              403,
            );

          return await match.fetch(request);
        }

        if (operation === 'ticket' && method === 'POST') {
          const principal = await agentSession(request, env);

          if (previewEnabled(env))
            throw new GameError(
              'preview-public-wakeup',
              'Use public event wakeups and authenticated HTTP observations.',
              403,
            );

          return rpcResponse(await match.socketTicket(principal, protocols));
        }

        if (
          ['history', 'history-anchor', 'checkpoint', 'replay', 'rounds'].includes(operation) &&
          method === 'GET'
        ) {
          const principal = request.headers.has('authorization') ? await agentSession(request, env) : null;
          const epoch = url.searchParams.get('epoch') ?? undefined;

          if (operation === 'history-anchor')
            return rpcResponse(
              await match.historyAnchor(principal, epoch, url.searchParams.get('eventKey') ?? '', protocols),
            );

          if (operation === 'replay')
            return rpcResponse(
              await match.replay(principal, epoch, Number(url.searchParams.get('through') ?? 0), protocols),
            );

          if (operation === 'checkpoint')
            return rpcResponse(
              await match.checkpoint(
                principal,
                epoch,
                Number(url.searchParams.get('through') ?? 0),
                protocols,
              ),
            );

          if (operation === 'rounds') return rpcResponse(await match.rounds(principal, epoch, protocols));

          return rpcResponse(
            await match.historyPage(
              principal,
              {
                epoch,
                after: url.searchParams.has('after') ? Number(url.searchParams.get('after')) : undefined,
                through: url.searchParams.has('through')
                  ? Number(url.searchParams.get('through'))
                  : undefined,
                limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
                maxBytes: url.searchParams.has('maxBytes')
                  ? Number(url.searchParams.get('maxBytes'))
                  : undefined,
              },
              protocols,
            ),
          );
        }

        if (operation === 'actions' && method === 'POST') {
          const principal = await agentSession(request, env);
          const input = await readJson(request, TransportActionRequestSchema, 204800);

          if (!/^[\w:-]{8,160}$/.test(input.actionId))
            throw new GameError(
              'action-id',
              'Use a unique action ID of 8–160 letters, digits, hyphens, underscores or colons.',
              400,
            );

          return rpcResponse(await match.submit(principal, input, protocols));
        }

        if (!operation && method === 'GET') {
          const after = Number(url.searchParams.get('after') ?? 0);

          if (!Number.isSafeInteger(after) || after < 0)
            throw new GameError('invalid-cursor', 'Use a nonnegative integer cursor.', 400);

          return rpcResponse(
            await match.observation(
              request.headers.has('authorization') ? await agentSession(request, env) : null,
              after,
              protocols,
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
