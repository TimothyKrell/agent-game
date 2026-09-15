// Local-only fixtures/measurement. Production requests still execute the actual Worker and D1 queries.
import { Buffer } from 'node:buffer';
import worker from '../src/server/worker';
import { seedSummaryEntrants, summaryAgentIds } from '../tests/fixtures/summary-entrants';
import { pictureAssetKey } from '../src/server/agent-picture-data';
import type { AgentPicture } from '../src/shared/agent-picture';

export { MatchObject, MatchmakingObject, HouseSeatObject } from '../src/server/worker';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;

    if (path === '/__probe/seed' && request.method === 'POST') {
      await seedSummaryEntrants(env.DB, 3, true);

      for (const id of [...summaryAgentIds(0), ...summaryAgentIds(1)]) {
        const picture: AgentPicture = {
          state: 'present',
          revision: 7,
          version: `summary-v7-${id}`,
          url: `/api/agents/${id}/picture/summary-v7-${id}`,
          contentType: 'image/png',
          width: 1,
          height: 1,
          bytes: png.length,
        };

        await env.AGENT_PICTURES.put(pictureAssetKey(id, picture.version), png, {
          httpMetadata: { contentType: 'image/png' },
        });
        await env.DB.prepare(
          'INSERT OR REPLACE INTO agent_pictures (agent_id,revision,version,picture_json) VALUES (?,7,?,?)',
        )
          .bind(id, picture.version, JSON.stringify(picture))
          .run();
      }

      return Response.json({ ok: true });
    }

    const metadataOnly = ['/api/bootstrap', '/api/matches', '/api/agent-pictures'].includes(path);

    if (!metadataOnly) return worker.fetch(request, env);

    const bindings: number[] = [];

    const db = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch') return target.batch.bind(target);

        if (property === 'exec') return target.exec.bind(target);

        if (property === 'withSession') return target.withSession.bind(target);

        if (property === 'dump') return target.dump.bind(target);

        if (property === 'prepare')
          return (sql: string) => {
            const statement = target.prepare(sql);

            if (!sql.includes('FROM match_participants')) return statement;

            return new Proxy(statement, {
              get(prepared, key) {
                if (key === 'bind')
                  return (...values: unknown[]) => {
                    bindings.push(values.length);

                    return prepared.bind(...values);
                  };

                throw new Error(`Unexpected participant statement method: ${String(key)}`);
              },
            });
          };

        throw new Error(`Unexpected summary database method: ${String(property)}`);
      },
    });

    const pictures = new Proxy(env.AGENT_PICTURES, {
      get() {
        throw new Error('Summary/metadata requests must not probe R2');
      },
    });

    const matches = new Proxy(env.MATCHES, {
      get() {
        throw new Error('Summary/metadata requests must not fetch Match DOs');
      },
    });

    const response = await worker.fetch(request, {
      ...env,
      DB: db,
      AGENT_PICTURES: pictures,
      MATCHES: matches,
    });

    const result = new Response(response.body, response);
    result.headers.set('x-summary-participant-bindings', JSON.stringify(bindings));

    return result;
  },
};
