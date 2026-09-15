import { Schema } from 'effect';
import application, { MatchmakingObject } from '../src/server/worker';
import identity from '../tests/fixtures/preview-identity-worker';
import { MatchObject as ClockMatch } from '../tests/fixtures/succession-worker';
import { configurePreviewBroker } from '../src/server/preview-broker-config';
import { previewCapabilities } from '../src/server/preview-broker-client';
import { parsePreviewArtifactManifest, registerPreviewArtifacts } from '../src/server/preview-artifacts';
import { hashSecret, isLoopback, json, readJson } from '../src/server/http';
import type { PreviewBrokerIntent } from '../src/shared/preview-broker';
import type { MatchInitialization } from '../src/server/coordinator';
import { HouseSeatObject as ApplicationHouseSeat } from '../src/server/house-seat';
import type { HouseJob } from '../src/server/house-contract';

export class HouseSeatObject extends ApplicationHouseSeat {
  private fixtureRunning = false;

  async alarm() {
    this.fixtureRunning = true;

    try {
      await super.alarm();
    } finally {
      this.fixtureRunning = false;
    }
  }

  fixtureJob(id: string) {
    const row = this.ctx.storage.sql
      .exec<{
        status: string;
        outcome: string | null;
        admission_reason: string | null;
        due_at: number;
      }>('SELECT status,outcome,admission_reason,due_at FROM jobs WHERE id=?', id)
      .toArray()[0];

    // A returned source admission deferral is not active inference. The logical discussion may expire
    // that optional retry; the production next-phase checks retire it. Never wait out its rate window.
    const deferred = row?.status === 'pending' && row.admission_reason !== null && row.due_at > Date.now();

    return {
      status: row?.status ?? 'undelivered',
      outcome: row?.outcome ?? null,
      admissionReason: row?.admission_reason ?? null,
      deferred,
      running: this.fixtureRunning,
      complete: !this.fixtureRunning && (row?.status === 'done' || deferred),
    };
  }
}

// Production scheduler is inherited unchanged: no alarm override or deleteAlarm on admission.
export class PlayableCoordinator extends MatchmakingObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS playable_faults(key TEXT PRIMARY KEY,value TEXT)');
  }
  fixtureQuery(sql: string, values: (string | number | null)[]) {
    return this.ctx.storage.sql.exec(sql, ...values).toArray();
  }
  fixtureAlarm() {
    return super.alarm();
  }
  fixtureScheduled() {
    return this.ctx.storage.getAlarm();
  }
  fixtureInitialization(id: string): MatchInitialization {
    const row = this.ctx.storage.sql
      .exec<{
        entries: string;
        grants: string;
        game_id: 'secret-overlord' | 'succession';
        snapshot: string;
        reservation: number;
      }>('SELECT * FROM allocations WHERE id=?', id)
      .one();

    return {
      id,
      entrants: JSON.parse(row.entries),
      grants: JSON.parse(row.grants),
      gameId: row.game_id,
      snapshot: JSON.parse(row.snapshot),
      reservationUsd: row.reservation,
    };
  }
  async allocatePreview(intent: PreviewBrokerIntent, fingerprint: string, revision: string) {
    const receipt = await super.allocatePreview(intent, fingerprint, revision);

    if (
      this.ctx.storage.sql.exec("SELECT key FROM playable_faults WHERE key='allocation-ack'").toArray().length
    )
      throw new Error('Fixture withholds acknowledgement after actual source allocation commit');

    return receipt;
  }
}

// Reuses accepted clock-only controls. Normal initialize/arm/house outbox all run in production code.
export class PlayableMatch extends ClockMatch {
  async fixtureDiscussion(
    phaseId: string,
  ): Promise<{ complete: boolean; jobs: ({ id: string } & ReturnType<HouseSeatObject['fixtureJob']>)[] }> {
    const rows = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM outbox WHERE json_extract(data,'$.phaseId')=? AND id LIKE '%:chat:0'",
        phaseId,
      )
      .toArray();

    const jobs = await Promise.all(
      rows.map(async (row) => {
        const job: HouseJob = JSON.parse(row.data);

        // SAFETY: the playable config binds this production-derived test class under HOUSE_SEATS.
        const seat = this.env.HOUSE_SEATS.getByName(
          `${job.matchId}:${job.seat}`,
        ) as DurableObjectStub<HouseSeatObject>;

        const result = await seat.fixtureJob(job.id);

        return { id: job.id, ...result };
      }),
    );

    return { complete: jobs.every((job) => job.complete), jobs };
  }
  fixtureQuery(sql: string, values: (string | number | null)[]) {
    return this.ctx.storage.sql.exec(sql, ...values).toArray();
  }
  async initialize(input: MatchInitialization) {
    await super.initialize(input);

    const fault = await this.env.DB.prepare(
      "SELECT value FROM playable_controls WHERE key='initialize-ack'",
    ).first();

    if (fault) throw new Error('Fixture withholds acknowledgement after actual Match initialization commit');
  }
}

type FixtureEnv = Omit<Env, 'MATCHMAKING' | 'MATCHES' | 'HOUSE_SEATS'> & {
  MATCHMAKING: DurableObjectNamespace<PlayableCoordinator>;
  MATCHES: DurableObjectNamespace<PlayableMatch>;
  HOUSE_SEATS: DurableObjectNamespace<HouseSeatObject>;
};

const SqlSchema = Schema.Struct({
  sql: Schema.String,
  values: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
});

const traffic: {
  at: number;
  completedAt?: number;
  path: string;
  method: string;
  credentialHash: string | null;
  cookie: boolean;
  protocol: string | null;
  status?: number;
}[] = [];

let holdAction: 'chat' | 'required' | null = null;

const heldActions: { phaseId: string; type: string }[] = [];

const activeActions = new Map<string, number>();

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (!isLoopback(request.url)) return new Response('Loopback fixture only', { status: 403 });

    // No AI binding exists. Source inference must terminate at the explicit fake local HTTP provider.
    if (
      env.HOUSE_PROVIDER === 'openai' &&
      (!env.OPENAI_BASE_URL ||
        !isLoopback(env.OPENAI_BASE_URL) ||
        !env.OPENAI_BASE_URL.startsWith('http://127.0.0.1:'))
    )
      throw new Error('Playable fixture refuses non-loopback provider');
    const url = new URL(request.url);

    if (url.pathname === '/') return new Response('Playable loopback fixture');
    const queue = env.MATCHMAKING.getByName('secret-overlord');

    if (url.pathname.startsWith('/fixture/')) {
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS playable_controls(key TEXT PRIMARY KEY,value TEXT)',
      ).run();

      if (url.pathname === '/fixture/archive') {
        await env.AGENT_PICTURES.put(`fixture${url.searchParams.get('path')}`, request.body);

        return json({ saved: true });
      }

      if (url.pathname === '/fixture/manifest') {
        await registerPreviewArtifacts(env, parsePreviewArtifactManifest(env, await request.text()));

        return json({ saved: true });
      }

      if (url.pathname === '/fixture/traffic') return json(traffic);

      if (url.pathname === '/fixture/action-hold') {
        const input = await readJson(
          request,
          Schema.Struct({ action: Schema.NullOr(Schema.Literals(['chat', 'required'])) }),
        );

        holdAction = input.action;

        return json({ holding: holdAction });
      }

      if (url.pathname === '/fixture/held-actions')
        return json(heldActions.map(({ phaseId, type }) => ({ phaseId, type })));

      if (url.pathname === '/fixture/broker-config') {
        await configurePreviewBroker(
          env,
          await readJson(request, Schema.Struct({ enabled: Schema.Boolean, revision: Schema.String })),
        );

        return json({ ready: true });
      }

      if (url.pathname === '/fixture/coordinator') {
        const input = await readJson(request, SqlSchema);

        return json(await queue.fixtureQuery(input.sql, [...input.values]));
      }

      if (url.pathname === '/fixture/queue-alarm') {
        await queue.fixtureAlarm();

        return json({ done: true });
      }

      if (url.pathname === '/fixture/scheduled') return json({ at: await queue.fixtureScheduled() });

      if (url.pathname === '/fixture/source-status') return json(await previewCapabilities(env));

      if (url.pathname === '/fixture/production') return json(await queue.exhibition());

      if (url.pathname === '/fixture/reserve') {
        const input = await readJson(
          request,
          Schema.Struct({
            id: Schema.String,
            matchId: Schema.String,
            estimate: Schema.Number,
            deadline: Schema.Number,
            mandatory: Schema.Boolean,
          }),
        );

        return json(await queue.reserveInference(input));
      }

      if (url.pathname === '/fixture/retire-waiter') {
        const input = await readJson(request, Schema.Struct({ id: Schema.String, matchId: Schema.String }));
        await queue.retireInferenceWaiter(input);

        return json({ done: true });
      }

      if (url.pathname === '/fixture/record-unknown') {
        const input = await readJson(request, Schema.Struct({ id: Schema.String }));
        await queue.recordInference(input.id, null);

        return json({ done: true });
      }

      if (url.pathname === '/fixture/initialization-receipt') {
        const input = await readJson(request, Schema.Struct({ matchId: Schema.String }));
        const initialization = await queue.fixtureInitialization(input.matchId);

        return json({
          initialized: await env.MATCHES.getByName(input.matchId).initializationReceipt(initialization),
          initialization,
        });
      }

      if (url.pathname === '/fixture/complete') {
        const input = await readJson(request, Schema.Struct({ matchId: Schema.String }));
        await queue.complete(input.matchId);

        return json({ done: true });
      }

      if (url.pathname === '/fixture/match') {
        const input = await readJson(request, Schema.Struct({ ...SqlSchema.fields, matchId: Schema.String }));

        return json(await env.MATCHES.getByName(input.matchId).fixtureQuery(input.sql, [...input.values]));
      }

      if (url.pathname === '/fixture/clock') {
        const input = await readJson(
          request,
          Schema.Struct({
            matchId: Schema.String,
            phaseId: Schema.String,
            kind: Schema.Literals(['discussion', 'grace']),
          }),
        );

        if (activeActions.get(input.matchId)) return json({ advanced: false, reason: 'native-http-pending' });

        const house =
          input.kind === 'discussion'
            ? await env.MATCHES.getByName(input.matchId).fixtureDiscussion(input.phaseId)
            : null;

        if (house && !house.complete) return json({ advanced: false, reason: 'house-pending', house });

        if (activeActions.get(input.matchId)) return json({ advanced: false, reason: 'native-http-pending' });
        await env.MATCHES.getByName(input.matchId).fixtureClock(input.kind, input.phaseId);
        await env.MATCHES.getByName(input.matchId).fixtureAlarm();

        return json({ advanced: true, house });
      }

      return identity.fetch(request, env);
    }

    const token = request.headers.get('authorization');

    const record: (typeof traffic)[number] = {
      at: Date.now(),
      path: url.pathname + url.search,
      method: request.method,
      credentialHash: token ? await hashSecret(token) : null,
      cookie: request.headers.has('cookie'),
      protocol: request.headers.get('X-Agent-Game-Protocols'),
    };

    traffic.push(record);

    const actionMatch =
      request.method === 'POST' && url.pathname.match(/^\/api\/matches\/([^/]+)\/actions$/)?.[1];

    if (url.pathname.startsWith('/downloads/')) {
      const archive = await env.AGENT_PICTURES.get(`fixture${url.pathname}`);

      return archive
        ? new Response(archive.body, { headers: { 'content-type': 'application/gzip' } })
        : new Response('Unpublished fixture archive', { status: 404 });
    }

    if (actionMatch) activeActions.set(actionMatch, (activeActions.get(actionMatch) ?? 0) + 1);

    try {
      if (actionMatch && holdAction !== null) {
        const input = await request.clone().json<{ phaseId: string; action: { type: string } }>();
        const kind = input.action.type === 'chat' ? 'chat' : 'required';

        if (holdAction === kind) {
          const held = { phaseId: input.phaseId, type: input.action.type };
          heldActions.push(held);
          const until = Date.now() + 5000;

          while (holdAction === kind && Date.now() < until) await new Promise((done) => setTimeout(done, 10));
          heldActions.splice(heldActions.indexOf(held), 1);
        }
      }

      const response = await application.fetch(request, env, ctx);
      record.status = response.status;
      record.completedAt = Date.now();

      return response;
    } finally {
      if (actionMatch) activeActions.set(actionMatch, activeActions.get(actionMatch)! - 1);
    }
  },
} satisfies ExportedHandler<FixtureEnv>;
