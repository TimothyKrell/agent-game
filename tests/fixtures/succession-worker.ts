import { Schema } from 'effect';
import application from '../../src/server/worker';
import { MatchObject as ApplicationMatch } from '../../src/server/match';
import { MatchmakingObject as ApplicationQueue } from '../../src/server/matchmaking';
import { act, createMatch } from '../../src/game/engine';
import type { AnyMatchState } from '../../src/game/registry';
import type { Entrant } from '../../src/game/types';
import { DEFAULT_TIMING } from '../../src/game/types';
import { hashSecret, randomSecret, stableJson } from '../../src/server/http';
import { MatchHistory } from '../../src/server/history';
import { BoundsMeter } from './succession-worker-metrics';

export { HouseSeatObject } from '../../src/server/house-seat';

export interface FixtureController {
  agentId: string;
  ownerId: string;
  grantId: string;
  token: string;
  expiresAt: number;
}

export interface FixtureInspection {
  receiptCount: number;
  eventCount: number;
  released: string | null;
  grants: Record<string, string>;
  socketColumns: string[];
}

/** Production rules, receipts, outbox, projections and alarms run unchanged. Only clocks are controlled. */
export class MatchObject extends ApplicationMatch {
  private readonly meter: BoundsMeter;

  constructor(ctx: DurableObjectState, env: Env) {
    const meter = new BoundsMeter();
    meter.reset();
    super(meter.wrap(ctx), env);
    this.meter = meter;
  }

  fixtureMetrics(reset: boolean) {
    const report = this.meter.report();

    if (reset) this.meter.reset();

    return report;
  }

  async fixtureAlarm() {
    await this.alarm();
  }

  fixturePopulate(offset: number, count: number, escaping: boolean) {
    if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('Invalid bounded batch');
    this.meter.reset(false);
    const history = new MatchHistory(this.ctx.storage.sql);
    const text = escaping ? '\u0000\\"\n'.repeat(250) : '🦊'.repeat(1000);

    const appended = this.ctx.storage.transactionSync(() =>
      history.append(
        Array.from({ length: count }, (_, index) => ({
          eventKey: `bounds-${escaping ? 'escape' : 'unicode'}-${offset + index}`,
          visibility: 'public' as const,
          at: Date.now(),
          act: 1 as const,
          round: 1,
          type: 'chat',
          text,
          data: { seat: (offset + index) % 10 },
        })),
      ),
    );

    return { count, ...appended };
  }

  async fixtureHouseContext(seat: number) {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').one();
    const state: AnyMatchState = JSON.parse(row.data);

    return this.houseObservation(seat, state.seats[seat].generation, state.phase.id);
  }

  async fixtureClock(kind: 'discussion' | 'grace' | 'late-alarm', phaseId: string): Promise<void> {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').one();
    const state: AnyMatchState = JSON.parse(row.data);

    if (state.phase.id !== phaseId) return;

    if (kind === 'late-alarm') {
      this.ctx.storage.sql.exec(
        "INSERT INTO meta(key,value) VALUES ('alarm-due',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        String(Date.now() - 6000),
      );
      await this.ctx.storage.deleteAlarm();

      return;
    }

    if (kind === 'discussion' && !state.phase.kind.includes('discussion')) return;
    const grace = state.gameId === 'succession' ? state.snapshot.timing.grace : state.timing.grace;
    const deadline = Date.now() - (kind === 'grace' ? grace + 1 : 1);
    state.phase.deadline = deadline;

    if (state.gameId === 'succession' && state.stage.act === 1) state.stage.board.phase.deadline = deadline;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE game SET data=? WHERE id=1', JSON.stringify(state));
      this.ctx.storage.sql.exec(
        "INSERT INTO meta(key,value) VALUES ('alarm-due',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        String(Date.now()),
      );
    });
    // Exercise the application's real advance/recovery and durable persistence paths.
    await this.observation(null, 0, state.gameId === 'succession' ? '1,2' : '1');
  }

  fixtureInspect(): FixtureInspection {
    const metadata = this.ctx.storage.sql
      .exec<{ key: string; value: string }>('SELECT key,value FROM meta')
      .toArray();

    const grants: Record<string, string> = JSON.parse(
      metadata.find((row) => row.key === 'grants')?.value ?? '{}',
    );

    return {
      receiptCount: this.ctx.storage.sql
        .exec<{ count: number }>('SELECT count(*) AS count FROM receipts')
        .one().count,
      eventCount: this.ctx.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM events').one()
        .count,
      released: metadata.find((row) => row.key === 'released')?.value ?? null,
      grants,
      socketColumns: this.ctx.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(socket_tickets)')
        .toArray()
        .map((row) => row.name),
    };
  }

  async fixtureLegacy(id: string, controllers: FixtureController[]) {
    if (this.ctx.storage.sql.exec('SELECT id FROM game').toArray().length)
      throw new Error('Fixture match already exists');

    const entrants: Entrant[] = controllers.map((controller) => ({
      agentId: controller.agentId,
      ownerId: controller.ownerId,
      name: controller.agentId.slice('agent_'.length),
      house: false,
      rating: 1000,
    }));

    const now = Date.now();
    const initial = createMatch(id, entrants, now, { mode: 'preview', timing: DEFAULT_TIMING });
    const controller = controllers.find((entry) => entry.agentId === initial.seats[0].entrant.agentId)!;

    const request = {
      actionId: 'legacy-accepted-chat',
      phaseId: initial.phase.id,
      action: { type: 'chat' as const, text: 'A durably accepted legacy message.' },
    };

    const updated = act(initial, 0, 0, request, now + 1);
    const { events, ...record } = updated;
    const ticket = randomSecret();
    const ticketHash = await hashSecret(ticket);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO game(id,data) VALUES (1,?)', JSON.stringify(record));

      for (const event of events)
        this.ctx.storage.sql.exec(
          'INSERT INTO events(id,data) VALUES (?,?)',
          event.id,
          JSON.stringify(event),
        );
      this.ctx.storage.sql.exec(
        "INSERT INTO meta(key,value) VALUES ('grants',?)",
        JSON.stringify(Object.fromEntries(controllers.map((entry) => [entry.agentId, entry.grantId]))),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO meta(key,value) VALUES ('model',?)",
        JSON.stringify({ provider: 'preview', model: 'legacy-scripted', policyVersion: 'house-4' }),
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO receipts(id,fingerprint) VALUES (?,?)',
        `${controller.agentId}:${request.actionId}`,
        stableJson(request),
      );
      // An authentic pre-upgrade socket table. Restart runs the production additive ALTER.
      this.ctx.storage.sql.exec('DROP TABLE socket_tickets');
      this.ctx.storage.sql.exec(
        'CREATE TABLE socket_tickets(hash TEXT PRIMARY KEY,seat INTEGER NOT NULL,grant_id TEXT NOT NULL,grant_expires INTEGER NOT NULL,expires_at INTEGER NOT NULL)',
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO socket_tickets VALUES (?,?,?,?,?)',
        ticketHash,
        0,
        controller.grantId,
        controller.expiresAt,
        now + 120_000,
      );
    });
    await this.ctx.storage.deleteAlarm();

    return { matchId: id, controller, request, ticket, eventCount: events.length, phaseId: updated.phase.id };
  }
}

export class MatchmakingObject extends ApplicationQueue {
  fixtureAllocations() {
    return this.ctx.storage.sql
      .exec<{ id: string; game_id: string; state: string; reservation: number }>(
        'SELECT id,game_id,state,reservation FROM allocations ORDER BY created_at,id',
      )
      .toArray();
  }

  async fixtureFill(): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE tickets SET joined_at=joined_at-31_000 WHERE state='queued'");
    await this.alarm();
  }
}

type FixtureEnv = Env & {
  TEST_MATCHES: DurableObjectNamespace<MatchObject>;
  TEST_QUEUE: DurableObjectNamespace<MatchmakingObject>;
};

const LegacyInput = Schema.Struct({
  controllers: Schema.Array(
    Schema.Struct({
      agentId: Schema.String,
      ownerId: Schema.String,
      grantId: Schema.String,
      token: Schema.String,
      expiresAt: Schema.Number,
    }),
  ),
});

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: FixtureEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__fixture/controllers') {
      const count = Number(url.searchParams.get('count') ?? 10);

      if (!Number.isInteger(count) || count < 1 || count > 10)
        return new Response('Invalid fixture count', { status: 400 });
      const controllers: FixtureController[] = [];

      for (let index = 0; index < count; index++) {
        const id = crypto.randomUUID();

        const controller = {
          agentId: `agent_${id}`,
          ownerId: `owner_${id}`,
          grantId: `grant_${id}`,
          token: `agk_${randomSecret()}`,
          expiresAt: Date.now() + 86_400_000,
        };

        const hash = await hashSecret(controller.token);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES (?,?,?,?,?)').bind(
            id,
            id,
            `${id}@test.invalid`,
            0,
            0,
          ),
          env.DB.prepare('INSERT INTO owners(id,user_id,handle,name,created_at) VALUES (?,?,?,?,?)').bind(
            controller.ownerId,
            id,
            id,
            id,
            0,
          ),
          env.DB.prepare('INSERT INTO agents(id,owner_id,name,name_key,created_at) VALUES (?,?,?,?,?)').bind(
            controller.agentId,
            controller.ownerId,
            id,
            id,
            0,
          ),
          env.DB.prepare(
            'INSERT INTO agent_grants(id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
          ).bind(
            controller.grantId,
            controller.agentId,
            hash,
            'integration',
            Date.now(),
            controller.expiresAt,
          ),
        ]);
        controllers.push(controller);
      }

      return Response.json(controllers);
    }

    if (url.pathname === '/__fixture/fill') {
      await env.TEST_QUEUE.getByName('secret-overlord').fixtureFill();

      return Response.json({ filled: true });
    }

    if (url.pathname === '/__fixture/allocations')
      return Response.json(await env.TEST_QUEUE.getByName('secret-overlord').fixtureAllocations());

    if (url.pathname === '/__fixture/alternate-grant') {
      const agentId = url.searchParams.get('agentId') ?? '';

      const agent = await env.DB.prepare('SELECT owner_id FROM agents WHERE id=?')
        .bind(agentId)
        .first<{ owner_id: string }>();

      if (!agent) return new Response('Missing fixture agent', { status: 404 });

      const controller = {
        agentId,
        ownerId: agent.owner_id,
        grantId: `grant_${crypto.randomUUID()}`,
        token: `agk_${randomSecret()}`,
        expiresAt: Date.now() + 86_400_000,
      };

      await env.DB.prepare(
        'INSERT INTO agent_grants(id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(
          controller.grantId,
          agentId,
          await hashSecret(controller.token),
          'another installation',
          Date.now(),
          controller.expiresAt,
        )
        .run();

      return Response.json(controller);
    }

    if (url.pathname === '/__fixture/legacy') {
      const input = Schema.decodeUnknownSync(LegacyInput)(await request.json());
      const id = `match_${crypto.randomUUID()}`;

      return Response.json(await env.TEST_MATCHES.getByName(id).fixtureLegacy(id, [...input.controllers]));
    }

    const match = url.pathname.match(
      /^\/__fixture\/matches\/(match_[\w-]+)(?:\/(clock|settlement|metrics|populate|alarm|house-context|revoke))?$/,
    );

    if (match) {
      const stub = env.TEST_MATCHES.getByName(match[1]);

      if (match[2] === 'revoke') {
        await stub.revokeGrant(url.searchParams.get('grantId') ?? '');

        return Response.json({ revoked: true });
      }

      if (match[2] === 'metrics')
        return Response.json(await stub.fixtureMetrics(url.searchParams.has('reset')));

      if (match[2] === 'populate')
        return Response.json(
          await stub.fixturePopulate(
            Number(url.searchParams.get('offset')),
            Number(url.searchParams.get('count')),
            url.searchParams.has('escaping'),
          ),
        );

      if (match[2] === 'alarm') {
        await stub.fixtureAlarm();

        return Response.json({ alarm: true });
      }

      if (match[2] === 'house-context')
        return Response.json(await stub.fixtureHouseContext(Number(url.searchParams.get('seat'))));

      if (match[2] === 'clock') {
        const kind = url.searchParams.get('kind');

        if (kind !== 'discussion' && kind !== 'grace' && kind !== 'late-alarm')
          return new Response('Invalid clock kind', { status: 400 });
        await env.TEST_MATCHES.getByName(match[1]).fixtureClock(kind, url.searchParams.get('phaseId') ?? '');

        return Response.json({ clock: kind });
      }

      if (match[2] === 'settlement') {
        const record = await env.DB.prepare(
          'SELECT game_id,status,mode,result_applied,rating_version,result_json FROM matches WHERE id=?',
        )
          .bind(match[1])
          .first();

        const participants = await env.DB.prepare(
          'SELECT agent_id,seat,won,forfeited,rating_delta,act1_json FROM match_participants WHERE match_id=? ORDER BY seat',
        )
          .bind(match[1])
          .all();

        return Response.json({
          record,
          participants: participants.results,
          inference: await env.TEST_QUEUE.getByName('secret-overlord').inferenceSummary(match[1]),
        });
      }

      return Response.json(await env.TEST_MATCHES.getByName(match[1]).fixtureInspect());
    }

    return application.fetch(request, env);
  },
};
