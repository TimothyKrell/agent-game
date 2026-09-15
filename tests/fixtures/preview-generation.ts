import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPairSync } from 'node:crypto';
import { Schema } from 'effect';
import { applyPlatformMigrations } from '../platform-migrations';
import { previewD1 } from '../../scripts/preview-d1';
import {
  LifecycleBatch,
  lifecycleAccount,
  lifecycleSourceId,
  lifecycleTargetId,
  lifecycleSourceOrigin,
  lifecycleTargetOrigin,
  lifecycleAuth,
} from './preview-lifecycle';
import { parsePreviewArtifactManifest } from '../../src/server/preview-artifacts';
import type { PreviewGenerationIntent } from '../../src/server/preview-generation';
import type { PreviewDatabase } from '../../src/server/preview-config';
import {
  configurePreviewTarget,
  registerPreviewTarget,
  closePreviewTarget,
} from '../../src/server/preview-config';
import { configurePreviewBroker } from '../../src/server/preview-broker-config';

export async function generationFixture(generationMigration = true) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("local generation fixture"); } };',
      compatibilityDate: '2026-09-10',
      port: 0,
      inspectorPort: 0,
      d1Databases: { SOURCE: lifecycleSourceId, TARGET: lifecycleTargetId },
    }),
  );

  const source = await runtime.getD1Database('SOURCE');
  const target = await runtime.getD1Database('TARGET');

  const previous = [
    '0001_initial.sql',
    '0002_games.sql',
    '0003_agent_pictures.sql',
    '0004_preview_identity.sql',
    '0005_preview_broker.sql',
    '0006_preview_artifacts.sql',
    '0007_preview_retirement.sql',
  ];

  await Promise.all(
    [source, target].map((db) => applyPlatformMigrations(db, generationMigration ? undefined : previous)),
  );
  const requests: { databaseId: string; body: typeof LifecycleBatch.Type }[] = [];

  const fetcher: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const id = parsed.pathname.split('/')[7];

    if (
      String(url) !==
        `https://api.cloudflare.com/client/v4/accounts/${lifecycleAccount}/d1/database/${id}/query` ||
      ![lifecycleSourceId, lifecycleTargetId].includes(id)
    )
      throw new Error('Unexpected generation fixture egress');

    const body = Schema.decodeUnknownSync(LifecycleBatch)(
      JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body)),
    );

    requests.push({ databaseId: id, body });
    const DB = id === lifecycleSourceId ? source : target;

    try {
      return Response.json({
        success: true,
        errors: [],
        result: await DB.batch(body.batch.map(({ sql, params }) => DB.prepare(sql).bind(...params))),
      });
    } catch {
      return Response.json(
        {
          success: false,
          errors: [{ code: 1000, message: 'Native generation transaction rejected' }],
          result: [],
        },
        { status: 400 },
      );
    }
  };

  const database = (phase: 'source' | 'target', transport = fetcher) =>
    previewD1(
      lifecycleAccount,
      phase === 'source' ? lifecycleSourceId : lifecycleTargetId,
      'synthetic',
      transport,
    );

  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

  const identity = {
    origin: lifecycleTargetOrigin,
    incarnation: crypto.randomUUID(),
    commit: 'a'.repeat(40),
    publicKey,
  };

  const targetEnv = {
    DB: database('target'),
    ENVIRONMENT: 'preview',
    APP_URL: lifecycleTargetOrigin,
    PREVIEW_SOURCE_URL: lifecycleSourceOrigin,
    BETTER_AUTH_SECRET: lifecycleAuth,
  };

  const sourceEnv = {
    DB: database('source'),
    ENVIRONMENT: 'production',
    APP_URL: lifecycleSourceOrigin,
    PREVIEW_SOURCE_URL: '',
  };

  const intent = (
    phase: 'source' | 'target',
    commit = identity.commit,
    incarnation = identity.incarnation,
  ): PreviewGenerationIntent =>
    phase === 'source'
      ? { ...identity, commit, incarnation, kind: 'source-register' }
      : {
          ...identity,
          commit,
          incarnation,
          kind: 'target-configure',
          sourceOrigin: lifecycleSourceOrigin,
          enabled: false,
          sourceRevision: 'e'.repeat(40),
        };

  const write = async (DB: PreviewDatabase, desired: PreviewGenerationIntent) => {
    if (desired.kind === 'source-register') await registerPreviewTarget({ ...sourceEnv, DB }, desired);
    else if (desired.kind === 'target-configure')
      await configurePreviewTarget({ ...targetEnv, DB }, desired.incarnation, desired.commit, privateKey);
    else if (desired.kind === 'source-retire')
      await closePreviewTarget({ DB }, desired.origin, desired.incarnation);
    else if (desired.kind === 'target-retire')
      await configurePreviewBroker({ DB }, { enabled: false, revision: desired.commit });
    else throw new Error('Unsupported fixture write');
  };

  const manifest = (commit = identity.commit) => {
    const archive = {
      url: `${identity.origin}/downloads/previews/${commit}/${'b'.repeat(64)}.tgz`,
      sha256: 'b'.repeat(64),
      bytes: 1024,
    };

    const text = (path: string) => ({ path, bytes: 100, sha256: 'c'.repeat(64) });

    return parsePreviewArtifactManifest(
      sourceEnv,
      JSON.stringify({
        version: 1,
        sourceOrigin: lifecycleSourceOrigin,
        targetOrigin: identity.origin,
        incarnation: identity.incarnation,
        commit,
        executable: {
          url: `${lifecycleSourceOrigin}/downloads/agent-game-cli-0.3.0.tgz`,
          sha256: 'd'.repeat(64),
          bytes: 50000,
          version: '0.3.0',
          protocols: [1, 2],
        },
        games: ['secret-overlord', 'succession'].map((gameId, index) => {
          const directory = index === 0 ? 'package/public' : 'package/public/games/succession';

          return {
            gameId,
            protocol: index + 1,
            rulesVersion: `${gameId}-1`,
            archive,
            rules: text(`${directory}/rules.md`),
            protocolFile: text(`${directory}/protocol.md`),
            skill: text('package/skills/agent-game/SKILL.md'),
          };
        }),
      }),
    );
  };

  return {
    source,
    target,
    database,
    fetcher,
    requests,
    identity,
    intent,
    write,
    manifest,
    targetEnv,
    sourceEnv,
    privateKey,
    dispose: () => runtime.dispose(),
  };
}

export function holdGenerationWrites(fetcher: typeof fetch, count = 1) {
  let release!: () => void;
  let captured!: () => void;
  let writes = 0;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const waiting = new Promise<void>((resolve) => {
    captured = resolve;
  });

  const transport: typeof fetch = async (url, init) => {
    if (String(init?.body ?? '').includes('INSERT INTO preview_generation_operations')) {
      if (++writes === count) captured();
      await gate;
    }

    return fetcher(url, init);
  };

  return { transport, waiting, release: () => release() };
}
