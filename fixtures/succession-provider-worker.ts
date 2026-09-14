import { Schema } from 'effect';
import worker from '../src/server/worker';
import { MatchObject } from '../src/server/match';
import { MatchmakingObject } from '../src/server/matchmaking';
import { HouseSeatObject } from '../src/server/house-seat';
import type { HouseJob } from '../src/server/house-contract';
import type { TransportActionRequest } from '../src/shared/api';

const JobSchema = Schema.Struct({
  gameId: Schema.optional(Schema.Literals(['secret-overlord', 'succession'])),
  rulesVersion: Schema.optional(Schema.Literals(['secret-overlord-1', 'succession-1'])),
  decisionId: Schema.optional(Schema.String),
  id: Schema.String,
  matchId: Schema.String,
  seat: Schema.Number,
  generation: Schema.Number,
  phaseId: Schema.String,
  kind: Schema.Literals(['action', 'chat']),
  dueAt: Schema.Number,
  deadline: Schema.Number,
  model: Schema.Struct({
    provider: Schema.Literals(['preview', 'workers-ai', 'openai']),
    model: Schema.String,
    policyVersion: Schema.String,
  }),
}) satisfies Schema.Codec<HouseJob>;

export class SuccessionProviderMatch extends MatchObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS fixture_faults (kind TEXT PRIMARY KEY, job_id TEXT, remaining INTEGER NOT NULL)',
    );
  }

  override async submitHouse(job: HouseJob, request: TransportActionRequest) {
    const fault = this.ctx.storage.sql
      .exec<{ remaining: number }>("SELECT remaining FROM fixture_faults WHERE kind='delivery'")
      .toArray()[0];

    if (job.kind === 'action' && request.action.type === 'vote' && fault?.remaining) {
      this.ctx.storage.sql.exec(
        "UPDATE fixture_faults SET remaining=0, job_id=? WHERE kind='delivery'",
        job.id,
      );
      throw new Error('Fixture-only one-shot delivery transport failure');
    }

    return super.submitHouse(job, request);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__fixture/fault' && request.method === 'POST') {
      this.ctx.storage.sql.exec(
        "INSERT INTO fixture_faults (kind,remaining) VALUES ('delivery',1) ON CONFLICT(kind) DO UPDATE SET remaining=1,job_id=NULL",
      );

      return Response.json({ ok: true });
    }

    if (url.pathname === '/__fixture/inspect') {
      const game =
        this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').toArray()[0]?.data ??
        null;

      const receipt = url.searchParams.get('receipt');

      return Response.json({
        game,
        outbox: this.ctx.storage.sql
          .exec<{ id: string; data: string; delivered: number }>(
            'SELECT id,data,delivered FROM outbox WHERE id>? ORDER BY id LIMIT 64',
            url.searchParams.get('after') ?? '',
          )
          .toArray(),
        receipts: this.ctx.storage.sql
          .exec<{ id: string; fingerprint: string }>(
            'SELECT id,fingerprint FROM receipts WHERE id=?',
            receipt ?? '',
          )
          .toArray(),
        receiptCount: this.ctx.storage.sql
          .exec<{ count: number }>('SELECT count(*) AS count FROM receipts')
          .one().count,
        faults: this.ctx.storage.sql
          .exec<{ kind: string; job_id: string | null; remaining: number }>(
            'SELECT kind,job_id,remaining FROM fixture_faults',
          )
          .toArray(),
      });
    }

    return super.fetch(request);
  }
}

export class SuccessionProviderHouse extends HouseSeatObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    return Response.json({
      jobs: this.ctx.storage.sql
        .exec<{
          id: string;
          data: string;
          status: string;
          due_at: number;
          deadline: number;
          attempts: number;
          response: string | null;
        }>(
          'SELECT id,data,status,due_at,deadline,attempts,response,outcome,completed_at FROM jobs WHERE id>? ORDER BY id LIMIT 64',
          url.searchParams.get('after') ?? '',
        )
        .toArray(),
      notes: this.ctx.storage.sql
        .exec<{ generation: number; text: string }>('SELECT generation,text FROM notes ORDER BY generation')
        .toArray(),
    });
  }
}

export class SuccessionProviderCoordinator extends MatchmakingObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const matchId = url.searchParams.get('matchId') ?? '';

    return Response.json({
      allocations: this.ctx.storage.sql
        .exec<{ id: string; state: string; game_id: string; reservation: number; snapshot: string }>(
          'SELECT id,state,game_id,reservation,snapshot FROM allocations WHERE id=?',
          matchId,
        )
        .toArray(),
      usage: this.ctx.storage.sql
        .exec<{
          id: string;
          match_id: string;
          created_at: number;
          reserved: number;
          actual: number | null;
          done: number;
        }>(
          'SELECT id,match_id,created_at,reserved,actual,done FROM usage WHERE match_id=? AND id>? ORDER BY id LIMIT 64',
          matchId,
          url.searchParams.get('after') ?? '',
        )
        .toArray(),
      summary: this.inferenceSummary(matchId),
    });
  }
}

export default {
  async fetch(request: Parameters<typeof worker.fetch>[0], env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__fixture/start' && request.method === 'POST')
      return Response.json(await env.MATCHMAKING.getByName('secret-overlord').exhibition('succession'));

    if (url.pathname === '/__fixture/usage')
      return env.MATCHMAKING.getByName('secret-overlord').fetch(
        new Request(`http://fixture/inspect?${url.searchParams}`),
      );

    if (url.pathname === '/__fixture/match')
      return env.MATCHES.getByName(url.searchParams.get('matchId') ?? '').fetch(
        new Request(`http://fixture/__fixture/inspect?${url.searchParams}`),
      );

    if (url.pathname === '/__fixture/delivery-fault' && request.method === 'POST')
      return env.MATCHES.getByName(url.searchParams.get('matchId') ?? '').fetch(
        new Request('http://fixture/__fixture/fault', { method: 'POST' }),
      );

    if (url.pathname === '/__fixture/house')
      return env.HOUSE_SEATS.getByName(
        `${url.searchParams.get('matchId')}:${url.searchParams.get('seat')}`,
      ).fetch(new Request(`http://fixture/inspect?${url.searchParams}`));

    if (url.pathname === '/__fixture/enqueue' && request.method === 'POST') {
      const job = Schema.decodeUnknownSync(JobSchema)(await request.json());
      await env.HOUSE_SEATS.getByName(`${job.matchId}:${job.seat}`).enqueue(job);

      return Response.json({ ok: true });
    }

    return worker.fetch(request, env);
  },
};
