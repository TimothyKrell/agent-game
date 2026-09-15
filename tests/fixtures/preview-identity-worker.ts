import { Schema } from 'effect';
import application from '../../src/server/worker';
import { createAuth } from '../../src/server/auth';
import {
  closePreviewTarget,
  configurePreviewTarget,
  registerPreviewTarget,
  openPreview,
} from '../../src/server/preview-config';
import { isLoopback, json, readJson } from '../../src/server/http';

export { MatchObject, MatchmakingObject, HouseSeatObject } from '../../src/server/worker';

type Crash = 'none' | 'pending' | 'session' | 'lineage' | 'grant' | 'redeem';

const CrashSchema = Schema.Literals(['none', 'pending', 'session', 'lineage', 'grant', 'redeem']);

let nextCrash: Crash = 'none';

/** Actual D1 persists writes. Only the acknowledgement/next operation is interrupted. */
class InterruptedDatabase implements D1Database {
  private interrupted = false;
  private committingAuthority = false;

  constructor(
    private readonly database: D1Database,
    private readonly crash: Crash,
  ) {}

  prepare(query: string): D1PreparedStatement {
    if (this.interrupted) throw new Error(`Fixture interruption after committed ${this.crash}`);

    if (
      (this.crash === 'pending' && /INSERT OR IGNORE INTO preview_pending/.test(query)) ||
      (this.crash === 'session' && /insert into ["`]?session["`]? /i.test(query)) ||
      (this.crash === 'redeem' && /UPDATE preview_handoffs SET redeemed_at/.test(query))
    )
      this.interrupted = true;
    const statement = this.database.prepare(query);

    if (
      (this.crash === 'lineage' && query.includes("preview_authorities VALUES ('session'")) ||
      (this.crash === 'grant' && query.includes("preview_authorities VALUES ('grant'"))
    )
      this.committingAuthority = true;

    return statement;
  }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (this.interrupted) throw new Error(`Fixture interruption after committed ${this.crash}`);
    const result = await this.database.batch<T>(statements);

    if (this.committingAuthority) this.interrupted = true;

    return result;
  }
  exec(query: string) {
    return this.database.exec(query);
  }
  dump() {
    return this.database.dump();
  }
  withSession(bookmark?: string) {
    return this.database.withSession(bookmark);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/') return new Response('Identity fixture');

    if (path.startsWith('/fixture/') && isLoopback(request.url)) {
      if (path === '/fixture/db') {
        const input = await readJson(
          request,
          Schema.Struct({
            sql: Schema.String,
            values: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
          }),
        );

        return json(
          (
            await env.DB.prepare(input.sql)
              .bind(...input.values)
              .all()
          ).results,
        );
      }

      if (path === '/fixture/register') {
        const input = await readJson(
          request,
          Schema.Struct({
            origin: Schema.String,
            incarnation: Schema.String,
            commit: Schema.String,
            publicKey: Schema.String,
          }),
        );

        await registerPreviewTarget(env, input);

        return json({ ready: true });
      }

      if (path === '/fixture/configure') {
        const input = await readJson(
          request,
          Schema.Struct({ incarnation: Schema.String, commit: Schema.String, privateKey: Schema.String }),
        );

        await configurePreviewTarget(env, input.incarnation, input.commit, input.privateKey);

        return json({ ready: true });
      }

      if (path === '/fixture/close') {
        const input = await readJson(
          request,
          Schema.Struct({ origin: Schema.String, incarnation: Schema.String }),
        );

        await closePreviewTarget(env, input.origin, input.incarnation);

        return json({ closed: true });
      }

      if (path === '/fixture/crash') {
        nextCrash = await readJson(request, CrashSchema);

        return json({ armed: nextCrash });
      }

      if (path === '/fixture/stale-session-insert') {
        const input = await readJson(request, Schema.Struct({ requestId: Schema.String }));

        const pending = await env.DB.prepare(
          `SELECT p.encrypted_token,o.user_id FROM preview_pending p
          JOIN preview_imports i ON i.handoff_id=p.id JOIN owners o ON o.id=i.owner_id WHERE p.id=?`,
        )
          .bind(input.requestId)
          .first<{ encrypted_token: string; user_id: string }>();

        if (!pending) return json({ missing: true }, 404);
        // Resume exactly the library insertion a stale completion could attempt after another request signed out.
        await (
          await createAuth(env).$context
        ).internalAdapter.createSession(
          pending.user_id,
          false,
          { token: await openPreview(env, pending.encrypted_token), previewRequestId: input.requestId },
          true,
        );

        return json({ created: true });
      }
    }

    const crash = nextCrash;
    nextCrash = 'none';

    return application.fetch(
      request,
      crash === 'none' ? env : { ...env, DB: new InterruptedDatabase(env.DB, crash) },
    );
  },
} satisfies ExportedHandler<Env>;
