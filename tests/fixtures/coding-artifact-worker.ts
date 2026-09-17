import worker from '../../src/server/worker';
import { MatchObject as ApplicationMatch } from '../../src/server/match';

export { HouseSeatObject, MatchmakingObject, CodingSandbox } from '../../src/server/worker';

/** Archived pre-evidence storage, with no executable runtime bound in this test. */
export class MatchObject extends ApplicationMatch {
  fixtureRows() {
    return this.ctx.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '__cf_*'",
      )
      .toArray()
      .map(({ name }) => ({
        name,
        rows: this.ctx.storage.sql.exec<{ count: number }>(`SELECT count(*) AS count FROM "${name}"`).one()
          .count,
      }));
  }
  fixtureArchive(state: string, program: string) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO game(id,data) VALUES (1,?)', state);
      this.ctx.storage.sql.exec(
        'INSERT INTO coding_programs(sequence,data,started_at) VALUES (1,?,1)',
        program,
      );
    });
  }

  fixtureState(state: string) {
    const parsed: { seats: { entrant: { agentId: string } }[] } = JSON.parse(state);
    this.ctx.storage.sql.exec(
      'INSERT INTO game(id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      state,
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO meta(key,value) VALUES ('grants',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(
        Object.fromEntries(
          parsed.seats.map((seat) => [seat.entrant.agentId, `grant-${seat.entrant.agentId}`]),
        ),
      ),
    );

    for (const name of [
      'archive',
      'public',
      ...Array.from({ length: 10 }, (_, seat) => `seat:${seat}`),
      ...Array.from({ length: 10 }, (_, seat) => `original:${seat}`),
    ])
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO history_heads(name,head,epoch) VALUES (?,0,?)',
        name,
        crypto.randomUUID(),
      );

    for (let seat = 0; seat < 10; seat++)
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO history_original_access(seat,enabled) VALUES (?,1)',
        seat,
      );
  }

  fixtureReclaim(agentId: string, requestId: string, expectedGeneration: number) {
    return this.reclaim(
      { agentId, ownerId: `owner-${agentId}`, grantId: `grant-${agentId}`, expiresAt: Date.now() + 60_000 },
      { requestId, expectedGeneration },
      '3',
    );
  }
}

type FixtureEnv = Omit<Env, 'MATCHES'> & { MATCHES: DurableObjectNamespace<MatchObject> };

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: FixtureEnv) {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS retired_matches (id TEXT PRIMARY KEY, retired_at INTEGER NOT NULL, purged INTEGER NOT NULL DEFAULT 0)',
    ).run();

    if (new URL(request.url).pathname === '/api/__fixture/retire' && request.method === 'POST') {
      const input: { id: string } = await request.json();
      await env.DB.prepare('INSERT OR IGNORE INTO retired_matches(id,retired_at) VALUES (?,?)')
        .bind(input.id, Date.now())
        .run();
      await env.MATCHES.getByName(input.id).purgeRetired(input.id);
      await env.MATCHES.getByName(input.id).purgeRetired(input.id);

      return Response.json(await env.MATCHES.getByName(input.id).fixtureRows());
    }

    if (new URL(request.url).pathname === '/api/__fixture/archive' && request.method === 'POST') {
      const input: { id: string; state: string; program: string } = await request.json();
      await env.MATCHES.getByName(input.id).fixtureArchive(input.state, input.program);

      return Response.json({ stored: true });
    }

    if (new URL(request.url).pathname === '/api/__fixture/state' && request.method === 'POST') {
      const input: { id: string; state: string } = await request.json();
      await env.MATCHES.getByName(input.id).fixtureState(input.state);

      return Response.json({ stored: true });
    }

    if (new URL(request.url).pathname === '/api/__fixture/reclaim' && request.method === 'POST') {
      const input: { id: string; agentId: string; requestId: string; expectedGeneration: number } =
        await request.json();

      const result = await env.MATCHES.getByName(input.id).fixtureReclaim(
        input.agentId,
        input.requestId,
        input.expectedGeneration,
      );

      return Response.json(result, { status: result.ok ? 200 : result.error.status });
    }

    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<FixtureEnv>;
