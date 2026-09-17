import { Schema } from 'effect';
import application, { MatchmakingObject, MatchObject } from '../../src/server/worker';
import identity from './preview-identity-worker';
import type { MatchInitialization } from '../../src/server/coordinator';
import type { PreviewBrokerIntent, PreviewInference } from '../../src/shared/preview-broker';
import { configurePreviewBroker } from '../../src/server/preview-broker-config';
import { isLoopback, json, readJson } from '../../src/server/http';

export { HouseSeatObject } from '../../src/server/worker';

export class BrokerTestCoordinator extends MatchmakingObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS broker_fixture(key TEXT PRIMARY KEY,value TEXT)');
  }
  fixtureQuery(sql: string, values: (string | number | null)[]) {
    return this.ctx.storage.sql.exec(sql, ...values).toArray();
  }
  private crash(point: string): void {
    const row = this.ctx.storage.sql
      .exec("SELECT value FROM broker_fixture WHERE key='fault' AND value=?", point)
      .toArray()[0];

    if (row) {
      this.ctx.storage.sql.exec("DELETE FROM broker_fixture WHERE key='fault'");
      throw new Error(`Fixture lost acknowledgement after real ${point}`);
    }
  }
  async allocatePreview(intent: PreviewBrokerIntent, fingerprint: string, revision: string) {
    const receipt = await super.allocatePreview(intent, fingerprint, revision);
    this.crash('allocation');

    return receipt;
  }
  beginPreviewInference(input: PreviewInference, fingerprint: string) {
    const receipt = super.beginPreviewInference(input, fingerprint);

    if (receipt.ok && receipt.value.dispatch) this.crash('dispatch');

    return receipt;
  }
  async alarm(): Promise<void> {
    const automatic =
      this.ctx.storage.sql.exec("SELECT key FROM broker_fixture WHERE key='automatic-alarms'").toArray()
        .length > 0;

    if (automatic) await super.alarm();
    else await this.ctx.storage.deleteAlarm();
  }
  fixtureAlarmTime() {
    return this.ctx.storage.getAlarm();
  }
  fixtureWake() {
    return this.ctx.storage.setAlarm(Date.now() + 1);
  }
  async fixtureAlarm(): Promise<void> {
    await super.alarm();
    await this.ctx.storage.deleteAlarm();
  }
  fixtureReconcile(input: Pick<PreviewInference, 'allocationId' | 'jobId' | 'attempt'>) {
    const id = JSON.stringify([input.allocationId, input.jobId, input.attempt]);

    const row = this.ctx.storage.sql
      .exec<{ fingerprint: string }>('SELECT fingerprint FROM preview_broker_calls WHERE id=?', id)
      .one();

    super.finishPreviewInference(input, row.fingerprint, { state: 'failed' }, null);
  }
}

export class BrokerTestMatch extends MatchObject {
  fixtureAlarm() {
    return this.alarm();
  }
  async initialize(input: MatchInitialization): Promise<void> {
    if (
      await this.env.DB.prepare("SELECT key FROM broker_test_controls WHERE key='initialize-before'").first()
    )
      throw new Error('Fixture interruption before Match initialize');
    await super.initialize(input);
    // Fixtures inspect the committed game before explicitly enabling its normal runtime.
    await this.ctx.storage.deleteAlarm();

    const fault = await this.env.DB.prepare(
      "SELECT value FROM broker_test_controls WHERE key='initialize-ack'",
    ).first<{ value: string }>();

    if (fault?.value === '1') {
      await this.env.DB.prepare("DELETE FROM broker_test_controls WHERE key='initialize-ack'").run();
      throw new Error('Fixture lost acknowledgement after real Match initialize');
    }
  }
  fixtureQuery(sql: string, values: (string | number | null)[]) {
    return this.ctx.storage.sql.exec(sql, ...values).toArray();
  }
}

type FixtureEnv = Omit<Env, 'MATCHMAKING' | 'MATCHES'> & {
  MATCHMAKING: DurableObjectNamespace<BrokerTestCoordinator>;
  MATCHES: DurableObjectNamespace<BrokerTestMatch>;
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/') return new Response('Broker fixture');

    if (isLoopback(request.url) && path.startsWith('/fixture/')) {
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS broker_test_controls(key TEXT PRIMARY KEY,value TEXT)',
      ).run();
      const queue = env.MATCHMAKING.getByName('secret-overlord');

      if (path === '/fixture/broker-config') {
        await configurePreviewBroker(
          env,
          await readJson(request, Schema.Struct({ enabled: Schema.Boolean, revision: Schema.String })),
        );

        return json({ ready: true });
      }

      if (path === '/fixture/coordinator') {
        const input = await readJson(
          request,
          Schema.Struct({
            sql: Schema.String,
            values: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
          }),
        );

        return json(await queue.fixtureQuery(input.sql, [...input.values]));
      }

      if (path === '/fixture/queue-alarm') {
        await queue.fixtureAlarm();

        return json({ done: true });
      }

      if (path === '/fixture/alarm-time') return json({ at: await queue.fixtureAlarmTime() });

      if (path === '/fixture/wake') {
        await queue.fixtureWake();

        return json({ done: true });
      }

      if (path === '/fixture/reconcile') {
        const input = await readJson(
          request,
          Schema.Struct({
            allocationId: Schema.String,
            jobId: Schema.String,
            attempt: Schema.Literals([1, 2]),
          }),
        );

        await queue.fixtureReconcile(input);

        return json({ done: true });
      }

      if (path === '/fixture/production') return json(await queue.exhibition('secret-overlord'));

      if (path === '/fixture/reserve') {
        const input = await readJson(
          request,
          Schema.Struct({
            id: Schema.String,
            matchId: Schema.String,
            estimate: Schema.Number,
            deadline: Schema.Number,
            mandatory: Schema.Boolean,
            optionalKind: Schema.optional(Schema.Literals(['initial', 'followup'])),
          }),
        );

        return json(await queue.reserveInference(input));
      }

      if (path === '/fixture/record') {
        const input = await readJson(
          request,
          Schema.Struct({ id: Schema.String, actual: Schema.NullOr(Schema.Number) }),
        );

        await queue.recordInference(input.id, input.actual);

        return json({ done: true });
      }

      if (path === '/fixture/complete') {
        const input = await readJson(request, Schema.Struct({ matchId: Schema.String }));
        await queue.complete(input.matchId);

        return json({ done: true });
      }

      if (path === '/fixture/match') {
        const input = await readJson(
          request,
          Schema.Struct({
            matchId: Schema.String,
            sql: Schema.String,
            values: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
          }),
        );

        return json(await env.MATCHES.getByName(input.matchId).fixtureQuery(input.sql, [...input.values]));
      }

      if (path === '/fixture/match-alarm') {
        const input = await readJson(request, Schema.Struct({ matchId: Schema.String }));
        await env.MATCHES.getByName(input.matchId).fixtureAlarm();

        return json({ done: true });
      }

      return identity.fetch(request, env);
    }

    // A real source request can wait while the target cancels/revokes its durable creating intent.
    if (path === '/api/preview/broker/allocate') {
      const delay = await env.DB.prepare(
        "SELECT value FROM broker_test_controls WHERE key='allocate-delay'",
      ).first<{ value: string }>();

      if (delay) await new Promise((resolve) => setTimeout(resolve, Number(delay.value)));
    }

    return application.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<FixtureEnv>;
