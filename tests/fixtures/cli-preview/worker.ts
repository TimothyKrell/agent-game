import { Schema } from 'effect';
import identity from '../preview-identity-worker';
import { MatchObject as ScriptedMatch } from '../succession-worker';
import { agentSession } from '../../../src/server/auth';
import { hashSecret, isLoopback, json, readJson } from '../../../src/server/http';
import {
  parsePreviewArtifactManifest,
  registerPreviewArtifacts,
} from '../../../src/server/preview-artifacts';
import type { HouseJob } from '../../../src/server/house-contract';
import { previewAction } from '../../../src/game/preview';
import { previewSuccessionAction } from '../../../src/game/succession/preview';
import { completionChoice } from './succession-choice';
import { ObservationSchema } from '../../../src/shared/api';
import { Observation2Schema } from '../../../src/shared/succession';
import { requireGameProtocol, selectedGame } from '../../../src/server/protocol';

export class MatchObject extends ScriptedMatch {
  async fixtureHouseStep() {
    // Drain newly published house-only work before returning to the external CLI.
    // A discussion still needs the next explicit clock RPC; human decisions are never submitted here.
    while (await this.fixtureHouseBatch()) {}
  }

  private async fixtureHouseBatch() {
    const jobs = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM outbox').toArray();
    let submitted = false;

    for (const row of jobs) {
      const job: HouseJob = JSON.parse(row.data);

      if (job.kind !== 'action') continue;
      const context = await this.houseObservation(job.seat, job.generation, job.phaseId);

      if (!context?.observation.decision || context.observation.decision.id !== job.decisionId) continue;

      const succession =
        job.gameId === 'succession'
          ? Schema.decodeUnknownSync(Observation2Schema)(context.observation)
          : null;

      const preferred = succession ? completionChoice(succession) : undefined;

      const action = succession
        ? preferred === undefined
          ? previewSuccessionAction(succession, () => 0)
          : succession.decision!.actions[preferred].action
        : previewAction(Schema.decodeUnknownSync(ObservationSchema)(context.observation));

      if (action) {
        const result = await this.submitHouse(job, {
          gameId: job.gameId,
          actionId: `fixture-${job.id}`,
          phaseId: job.phaseId,
          decisionId: job.decisionId,
          action,
        });

        if (!result.ok) throw new Error(result.error.message);
        submitted = true;
      }
    }

    return submitted;
  }
}

export { MatchmakingObject, HouseSeatObject } from '../../../src/server/worker';

type FixtureEnv = Env & { TEST_MATCHES: DurableObjectNamespace<MatchObject> };

const archives = new Map<string, Uint8Array>();

const traffic: { path: string; method: string; credentialHash: string | null; body?: unknown }[] = [];

let lose = '';

let corruptManifest = false;

let delayedObservation = '';

let completedObservationDelays = 0;

let cancelMode: 'normal' | 'denied' | 'lost' = 'normal';

const assignments = new Map<
  string,
  {
    status: string;
    gameId: string;
    protocolVersion: string;
    rulesVersion: string;
    matchId: string;
    requestId: string;
    joinedAt: number;
  }
>();

/** Loopback-only test entrypoint. Production identity, D1, HTTP entitlement and match DOs remain real. */
export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: FixtureEnv): Promise<Response> {
    if (!isLoopback(request.url)) return new Response('Local fixture only', { status: 403 });
    const url = new URL(request.url);

    if (url.pathname === '/fixture/archive') {
      archives.set(url.searchParams.get('path')!, new Uint8Array(await request.arrayBuffer()));

      return json({ saved: true });
    }

    if (url.pathname === '/fixture/manifest') {
      const value = parsePreviewArtifactManifest(env, await request.text());
      await registerPreviewArtifacts(env, value);

      return json({ saved: true });
    }

    if (url.pathname === '/fixture/traffic') return json(traffic);

    if (url.pathname === '/fixture/observation-delay') {
      if (request.method === 'POST') delayedObservation = await readJson(request, Schema.String);

      return json({ pending: delayedObservation, completed: completedObservationDelays });
    }

    if (url.pathname === '/fixture/cancel-mode') {
      cancelMode = await readJson(request, Schema.Literals(['normal', 'denied', 'lost']));

      return json({ cancelMode });
    }

    if (url.pathname === '/fixture/corrupt-manifest-response') {
      corruptManifest = true;

      return json({ armed: true });
    }

    if (url.pathname === '/fixture/lose') {
      lose = await readJson(request, Schema.String);

      return json({ armed: lose });
    }

    if (url.pathname === '/fixture/match') {
      const input = await readJson(
        request,
        Schema.Struct({
          agentId: Schema.String,
          grantId: Schema.String,
          gameId: Schema.Literals(['secret-overlord', 'succession']),
          requestId: Schema.String,
        }),
      );

      const agent = await env.DB.prepare('SELECT owner_id FROM agents WHERE id=?')
        .bind(input.agentId)
        .first<{ owner_id: string }>();

      if (!agent) throw new Error('Fixture agent missing');
      const matchId = `match_${crypto.randomUUID()}`;
      const stub = env.TEST_MATCHES.getByName(matchId);

      const houses = (
        await env.DB.prepare('SELECT id,name FROM agents WHERE house=1 ORDER BY id LIMIT 9').all<{
          id: string;
          name: string;
        }>()
      ).results;

      await stub.initialize({
        id: matchId,
        gameId: input.gameId,
        grants: { [input.agentId]: input.grantId },
        entrants: [
          {
            agentId: input.agentId,
            ownerId: agent.owner_id,
            name: 'External competitor',
            house: false,
            rating: 1000,
          },
          ...houses.map((house) => ({
            agentId: house.id,
            ownerId: null,
            name: house.name,
            house: true,
            rating: 1000,
          })),
        ],
      });

      const assignment = {
        status: 'matched',
        ...(await stub.identity()),
        matchId,
        requestId: input.requestId,
        joinedAt: Date.now(),
      };

      assignments.set(input.agentId, assignment);

      return json(assignment);
    }

    const clock = url.pathname.match(/^\/fixture\/clock\/(match_[\w-]+)$/);

    if (clock) {
      const phase = url.searchParams.get('phase')!;
      await env.TEST_MATCHES.getByName(clock[1]).fixtureClock('discussion', phase);
      await env.TEST_MATCHES.getByName(clock[1]).fixtureHouseStep();

      return json({ advanced: true });
    }

    if (!url.pathname.startsWith('/fixture/')) {
      const token = request.headers.get('authorization');

      const record: (typeof traffic)[number] = {
        path: url.pathname,
        method: request.method,
        credentialHash: token ? await hashSecret(token) : null,
      };

      if (
        url.pathname.endsWith('agent-handoffs') ||
        url.pathname.endsWith('agent-exchange') ||
        url.pathname.endsWith('/actions') ||
        (url.pathname === '/api/queue' && request.method === 'DELETE')
      ) {
        const body = await request.clone().text();

        if (body) record.body = JSON.parse(body);
      }

      traffic.push(record);
    }

    if (archives.has(url.pathname))
      return new Response(new Uint8Array(archives.get(url.pathname)!), {
        headers: { 'content-type': 'application/gzip' },
      });

    if (url.pathname === '/api/queue' && assignments.size) {
      try {
        const principal = await agentSession(request, env);
        const assignment = assignments.get(principal.agentId);

        if (assignment) {
          requireGameProtocol(
            selectedGame(assignment.gameId),
            request.headers.get('X-Agent-Game-Protocols') ?? '',
            assignment.matchId,
          );

          return json(assignment);
        }
      } catch {
        /* Delegate exact application authority errors. */
      }
    }

    if (url.pathname === '/api/queue' && request.method === 'DELETE' && cancelMode === 'denied')
      return json({ error: { code: 'fixture-denied', message: 'Cancellation not authorized.' } }, 403);

    const response = await identity.fetch(request, env);

    if (request.method === 'GET' && url.pathname === delayedObservation) {
      delayedObservation = '';
      await new Promise((resolve) => setTimeout(resolve, 1100));
      completedObservationDelays++;
    }

    if (url.pathname === '/api/queue' && request.method === 'DELETE' && cancelMode === 'lost' && response.ok)
      return json({ error: { code: 'fixture-lost-ack' } }, 503);

    if (corruptManifest && url.pathname === '/api/preview/artifacts' && response.ok) {
      corruptManifest = false;
      const value = parsePreviewArtifactManifest(env, await response.text());

      return json({ ...value, incarnation: 'incorrect-incarnation' });
    }

    if (lose === url.pathname && response.ok) {
      lose = '';

      return json({ error: { code: 'fixture-lost-ack' } }, 503);
    }

    return response;
  },
} satisfies ExportedHandler<FixtureEnv>;
