// Local-only fault/provenance probes. This entry point is never used by production configuration.
import worker from '../src/server/worker';
import { collectAgentPictures } from '../src/server/agent-picture-data';
import { readPicture } from '../src/server/agent-picture-upload';
import { fault, json } from '../src/server/http';
import { PICTURE_MAX_BYTES } from '../src/shared/agent-picture';
import { Schema } from 'effect';
import { readJson } from '../src/server/http';

export { MatchObject, MatchmakingObject, HouseSeatObject } from '../src/server/worker';

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === '/__probe/identity') {
      const identity = await readJson(
        request,
        Schema.Struct({ agentId: Schema.String, ownerId: Schema.String }),
      );

      await env.DB.batch([
        env.DB.prepare(
          'INSERT OR IGNORE INTO user (id,name,email,createdAt,updatedAt) VALUES (?, ?, ?, 0, 0)',
        ).bind(identity.ownerId, 'Local fixture', `${identity.ownerId}@example.test`),
        env.DB.prepare(
          'INSERT OR IGNORE INTO owners (id,user_id,handle,name,created_at) VALUES (?, ?, ?, ?, 0)',
        ).bind(identity.ownerId, identity.ownerId, identity.ownerId, 'Local fixture'),
        env.DB.prepare(
          'INSERT OR IGNORE INTO agents (id,owner_id,name,name_key,created_at) VALUES (?, ?, ?, ?, 0)',
        ).bind(identity.agentId, identity.ownerId, 'Local fixture', identity.agentId),
      ]);

      return json({ ok: true });
    }

    const revoke = request.headers.get('x-tim28-revoke-on-read');
    const retire = request.headers.get('x-tim28-retire-on-read');

    if ((revoke || retire) && request.body) {
      const reader = request.body.getReader();

      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            if (revoke)
              await env.DB.prepare('UPDATE agent_grants SET revoked_at=1 WHERE agent_id=?')
                .bind(revoke)
                .run();

            if (retire) await env.DB.prepare('UPDATE agents SET retired_at=1 WHERE id=?').bind(retire).run();
            const next = await reader.read();

            if (next.done) controller.close();
            else controller.enqueue(next.value);
          },
        },
        { highWaterMark: 0 },
      );

      const forwarded = new Request(request, { method: request.method, body });

      // SAFETY: the Request-copy constructor retains the incoming cf metadata; only method/body change.
      return worker.fetch(forwarded as Request<unknown, IncomingRequestCfProperties>, env);
    }

    if (url.pathname === '/__probe/bounded') {
      let cancelled = false;
      let chunks = 0;

      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks++;
          controller.enqueue(new Uint8Array(65_536));
        },
        cancel() {
          cancelled = true;
        },
      });

      const headers = new Headers({ 'content-type': 'image/png' });

      if (url.searchParams.has('lying')) headers.set('content-length', '1');

      try {
        await readPicture(
          new Request(url, {
            method: 'PUT',
            body,
            headers,
          }),
        );
      } catch (error) {
        return json({ ...fault(error), cancelled, chunks, limit: PICTURE_MAX_BYTES });
      }
    }

    if (url.pathname === '/__probe/collect') {
      await env.DB.prepare("UPDATE agent_picture_assets SET expires_at=0 WHERE state='pending'").run();
      await collectAgentPictures(env);
      const assets = await env.AGENT_PICTURES.list();

      return json({ keys: assets.objects.map((asset) => asset.key) });
    }

    if (url.pathname === '/__probe/fail-commit') {
      await env.DB.exec(
        `CREATE TRIGGER fail_picture_commit BEFORE INSERT ON agent_picture_operations BEGIN SELECT RAISE(ABORT, 'local-injected-failure'); END;`,
      );

      return json({ ok: true });
    }

    if (url.pathname === '/__probe/restore-commit') {
      await env.DB.exec('DROP TRIGGER fail_picture_commit;');

      return json({ ok: true });
    }

    if (url.pathname === '/__probe/counts') {
      return json({
        assets: (await env.AGENT_PICTURES.list()).objects.length,
        current: (await env.DB.prepare('SELECT agent_id, revision, version FROM agent_pictures').all())
          .results,
        operations: await env.DB.prepare('SELECT count(*) AS count FROM agent_picture_operations').first(),
      });
    }

    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
