import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Schema } from 'effect';
import { previewD1 } from '../scripts/preview-d1';
import { configurePreviewTarget, openPreview, registerPreviewTarget } from '../src/server/preview-config';
import {
  parsePreviewArtifactManifest,
  registerPreviewArtifacts,
  readPreviewArtifacts,
} from '../src/server/preview-artifacts';
import { applyPlatformMigrations } from './platform-migrations';

const account = 'a'.repeat(32);

const sourceId = '11111111-1111-4111-8111-111111111111';

const targetId = '22222222-2222-4222-8222-222222222222';

const token = 'synthetic-d1-token';

const sourceOrigin = 'https://source.example.test';

const targetOrigin = 'https://agent-game-pr-27.example.workers.dev';

const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const publicKey = key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const privateKey = key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const payload = Schema.Struct({
  batch: Schema.Array(
    Schema.Struct({
      sql: Schema.String,
      params: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
    }),
  ),
});

const calls: { databaseId: string; body: typeof payload.Type }[] = [];

let runtime: Miniflare;

let databases: Map<string, D1Database>;

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("unused")}}',
      port: 0,
      inspectorPort: 0,
      d1Databases: ['SOURCE', 'TARGET'],
    }),
  );
  databases = new Map([
    [sourceId, await runtime.getD1Database('SOURCE')],
    [targetId, await runtime.getD1Database('TARGET')],
  ]);

  for (const db of databases.values()) await applyPlatformMigrations(db);
});

afterAll(async () => runtime?.dispose());

const transport: typeof fetch = async (url, init) => {
  const databaseId = new URL(String(url)).pathname.split('/')[7];
  const database = databases.get(databaseId);
  expect(String(url)).toBe(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/query`,
  );
  expect(database).toBeDefined();
  expect(init?.method).toBe('POST');
  expect(init?.redirect).toBe('error');
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);

  const body = Schema.decodeUnknownSync(payload)(
    JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body)),
  );

  calls.push({ databaseId, body });

  try {
    const result = await database!.batch(
      body.batch.map((query) => database!.prepare(query.sql).bind(...query.params)),
    );

    return Response.json({ success: true, errors: [], messages: [], result });
  } catch {
    return Response.json(
      { success: false, errors: [{ code: 1000, message: 'synthetic error' }], result: [] },
      { status: 400 },
    );
  }
};

it('runs accepted source/target helpers through parameterized REST into independent actual D1 databases', async () => {
  const source = {
    DB: previewD1(account, sourceId, token, transport),
    APP_URL: sourceOrigin,
    PREVIEW_SOURCE_URL: '',
    ENVIRONMENT: 'production',
  };

  const target = {
    DB: previewD1(account, targetId, token, transport),
    APP_URL: targetOrigin,
    PREVIEW_SOURCE_URL: sourceOrigin,
    ENVIRONMENT: 'preview',
    BETTER_AUTH_SECRET: 'local-lifecycle-auth-secret-longer-than-32-characters',
  };

  const commit = '1'.repeat(40);
  const incarnation = 'test_incarnation';
  await configurePreviewTarget(target, incarnation, commit, privateKey);

  const encrypted = await target.DB.prepare('SELECT encrypted_key FROM preview_runtime WHERE id=1').first<{
    encrypted_key: string;
  }>();

  expect(await openPreview(target, encrypted!.encrypted_key)).toBe(privateKey);
  expect(JSON.stringify(calls)).not.toContain(privateKey);
  await registerPreviewTarget(source, { origin: targetOrigin, incarnation, commit, publicKey });

  const archive = {
    url: `${targetOrigin}/downloads/previews/${commit}/${'b'.repeat(64)}.tgz`,
    bytes: 1000,
    sha256: 'b'.repeat(64),
  };

  const text = (path: string) => ({ path, bytes: 100, sha256: 'c'.repeat(64) });

  const manifest = parsePreviewArtifactManifest(
    source,
    JSON.stringify({
      version: 1,
      sourceOrigin,
      targetOrigin,
      incarnation,
      commit,
      executable: {
        url: `${sourceOrigin}/downloads/agent-game-cli-0.3.0.tgz`,
        version: '0.3.0',
        protocols: [1, 2],
        bytes: 40000,
        sha256: 'd'.repeat(64),
      },
      games: [
        {
          gameId: 'secret-overlord',
          protocol: 1,
          rulesVersion: 'secret-overlord-1',
          archive,
          rules: text('package/public/rules.md'),
          protocolFile: text('package/public/protocol.md'),
          skill: text('package/skills/agent-game/SKILL.md'),
        },
        {
          gameId: 'succession',
          protocol: 2,
          rulesVersion: 'succession-1',
          archive,
          rules: text('package/public/games/succession/rules.md'),
          protocolFile: text('package/public/games/succession/protocol.md'),
          skill: text('package/skills/agent-game/SKILL.md'),
        },
      ],
    }),
  );

  const before = calls.length;
  await registerPreviewArtifacts(source, manifest);
  expect(calls).toHaveLength(before + 1);
  expect(calls.at(-1)?.body.batch).toHaveLength(2);
  expect(calls.at(-1)?.databaseId).toBe(sourceId);
  expect(calls.at(-1)?.body.batch[0].params).toEqual([
    JSON.stringify(manifest),
    targetOrigin,
    incarnation,
    commit,
  ]);
  expect(await readPreviewArtifacts(source, targetOrigin, commit)).toEqual(manifest);
  expect(
    await databases.get(targetId)!.prepare('SELECT count(*) AS n FROM preview_artifacts').first('n'),
  ).toBe(0);

  const selected = await source.DB.prepare('SELECT ? AS value')
    .bind("' ; DROP TABLE owners; --")
    .run<{ value: string }>();

  expect(selected.results).toEqual([{ value: "' ; DROP TABLE owners; --" }]);
  expect(selected.meta.rows_read).toBeGreaterThanOrEqual(0);
  expect(selected.meta.served_by).toBeDefined();
});

it('rejects cross-database statements and invalid resource IDs before any request', async () => {
  const source = previewD1(account, sourceId, token, transport);
  const target = previewD1(account, targetId, token, transport);
  const before = calls.length;
  await expect(source.batch([target.prepare('SELECT 1')])).rejects.toThrow('another database');
  expect(() => previewD1(account, 'prod/../../attacker', token, transport)).toThrow('resource');
  expect(() => previewD1('../another-account', targetId, token, transport)).toThrow('resource');
  expect(calls).toHaveLength(before);
});

it('rolls back a failed actual batch rather than reporting partial success', async () => {
  const db = previewD1(account, sourceId, token, transport);
  await expect(
    db.batch([
      db
        .prepare('INSERT INTO preview_retired_arenas (origin,incarnation) VALUES (?,?)')
        .bind(targetOrigin, 'rolled_back'),
      db.prepare('SELECT missing_column FROM preview_arenas'),
    ]),
  ).rejects.toThrow('failed');
  expect(
    await db
      .prepare('SELECT incarnation FROM preview_retired_arenas WHERE incarnation=?')
      .bind('rolled_back')
      .first(),
  ).toBeNull();
});

it.each([
  ['HTTP error', () => new Response('do not leak parameter values', { status: 500 })],
  ['malformed JSON', () => new Response('{')],
  ['partial batch', () => Response.json({ success: true, errors: [], result: [] })],
  ['top-level failure', () => Response.json({ success: false, errors: [], result: [] })],
  [
    'missing metadata',
    () => Response.json({ success: true, errors: [], result: [{ success: true, results: [] }] }),
  ],
  [
    'failed member',
    () => Response.json({ success: true, errors: [], result: [{ success: false, results: [], meta: {} }] }),
  ],
  ['oversize response', () => new Response('x'.repeat(1024 * 1024 + 1))],
] as const)('rejects %s with a bounded redacted error', async (_name, response) => {
  const db = previewD1(account, sourceId, token, async () => response());
  await expect(db.prepare('SELECT 1').run()).rejects.toThrow(/D1/);
});
