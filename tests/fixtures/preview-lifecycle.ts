import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Schema } from 'effect';
import { applyPlatformMigrations } from '../platform-migrations';
import { sha256, validateArtifact } from '../../scripts/preview-artifact';

export const lifecycleAccount = 'a'.repeat(32);

export const lifecycleSourceId = '11111111-1111-4111-8111-111111111111';

export const lifecycleTargetId = '22222222-2222-4222-8222-222222222222';

export const lifecycleSourceOrigin = 'https://localhost';

export const lifecycleTargetOrigin = 'https://agent-game-pr-27.test.workers.dev';

export const lifecycleAuth = 'local-lifecycle-auth-secret-at-least-32-characters';

const Query = Schema.Struct({
  sql: Schema.String,
  params: Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Null])),
});

export const LifecycleBatch = Schema.Struct({ batch: Schema.Array(Query) });

/** Both unmodified application Workers, real databases and real Cloudflare-shaped transport. */
export async function lifecycleFixture(options: { targetMigrations?: boolean } = {}) {
  await mkdir('.tim27-lifecycle/runs', { recursive: true });
  const directory = await mkdtemp(resolve('.tim27-lifecycle/runs/worker-'));
  const artifactDirectory = resolve(directory, 'artifact');
  execFileSync(process.execPath, ['scripts/produce-preview-artifact.ts', artifactDirectory], {
    timeout: 90_000,
    stdio: 'pipe',
    env: {
      ...process.env,
      GITHUB_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      GITHUB_REPOSITORY: 'TimothyKrell/agent-game',
      GITHUB_RUN_ID: '100',
      GITHUB_RUN_ATTEMPT: '2',
      PR_HEAD_SHA: '1'.repeat(40),
    },
  });
  const artifact = await validateArtifact(artifactDirectory);
  const releasedBytes = await readFile('public/downloads/agent-game-cli-0.3.0.tgz');

  const executable = {
    url: `${lifecycleSourceOrigin}/downloads/agent-game-cli-0.3.0.tgz`,
    version: '0.3.0',
    protocols: [1, 2] as const,
    sha256: sha256(releasedBytes),
    bytes: releasedBytes.length,
  };

  const common = {
    modules: true,
    scriptPath: resolve(artifactDirectory, 'worker/worker.js'),
    compatibilityDate: '2026-09-10',
    compatibilityFlags: ['nodejs_compat'],
    port: 0,
    inspectorPort: 0,
    r2Buckets: ['AGENT_PICTURES'],
    durableObjects: {
      MATCHES: { className: 'MatchObject', useSQLite: true },
      MATCHMAKING: { className: 'MatchmakingObject', useSQLite: true },
      HOUSE_SEATS: { className: 'HouseSeatObject', useSQLite: true },
    },
    assets: {
      directory: resolve(artifactDirectory, 'assets'),
      binding: 'ASSETS',
      run_worker_first: ['/api/*', '/preview', '/preview/*', '/agents.md', '/rules.md'],
      routerConfig: { has_user_worker: true },
    },
  };

  const bindings = {
    HOUSE_PROVIDER: 'preview',
    HOUSE_MODEL: 'scripted',
    TIME_SCALE: '0.1',
    HOUSE_DAILY_BUDGET_USD: '0',
    HOUSE_MATCH_RESERVATION_USD: '0',
    MAX_CONCURRENT_MATCHES: '2',
    QUEUE_WAIT_SECONDS: '30',
    BETTER_AUTH_SECRET: lifecycleAuth,
  };

  const source = new Miniflare(
    convertV4MiniflareOptions({
      ...common,
      d1Databases: { DB: lifecycleSourceId },
      d1Persist: resolve(directory, 'source-db'),
      bindings: {
        ...bindings,
        APP_URL: lifecycleSourceOrigin,
        ENVIRONMENT: 'development',
        PREVIEW_SOURCE_URL: '',
      },
    }),
  );

  const targetOptions = (
    auth: string,
    deployed?: { bindings: Record<string, string>; scriptPath: string; assets: typeof common.assets },
  ) =>
    convertV4MiniflareOptions({
      ...common,
      scriptPath: deployed?.scriptPath ?? common.scriptPath,
      assets: deployed?.assets ?? common.assets,
      d1Databases: { DB: lifecycleTargetId },
      d1Persist: resolve(directory, 'target-db'),
      r2Persist: resolve(directory, 'target-r2'),
      bindings: {
        ...bindings,
        APP_URL: lifecycleTargetOrigin,
        ENVIRONMENT: 'preview',
        PREVIEW_SOURCE_URL: lifecycleSourceOrigin,
        BETTER_AUTH_SECRET: auth,
        ...deployed?.bindings,
      },
      outboundService: async (request) => {
        if (new URL(request.url).origin !== lifecycleSourceOrigin)
          throw new Error('Unexpected target egress');

        return source.dispatchFetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
        });
      },
    });

  const target = new Miniflare(targetOptions(lifecycleAuth));

  const sourceDB = await source.getD1Database('DB');
  let targetDB = await target.getD1Database('DB');
  await applyPlatformMigrations(sourceDB);

  if (options.targetMigrations !== false) await applyPlatformMigrations(targetDB);
  const requests: { databaseId: string; body: typeof LifecycleBatch.Type }[] = [];

  const fetcher: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url));

    if (parsed.origin === lifecycleSourceOrigin || parsed.origin === lifecycleTargetOrigin) {
      const request = new Request(String(url), init);
      const worker = parsed.origin === lifecycleSourceOrigin ? source : target;

      const response = await worker.dispatchFetch(String(url), {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.method === 'GET' ? undefined : await request.text(),
      });

      return new Response(await response.arrayBuffer(), {
        status: response.status,
        headers: Object.fromEntries(response.headers),
      });
    }

    const databaseId = parsed.pathname.split('/')[7];

    const database =
      databaseId === lifecycleSourceId ? sourceDB : databaseId === lifecycleTargetId ? targetDB : undefined;

    if (
      parsed.origin !== 'https://api.cloudflare.com' ||
      !database ||
      String(url) !==
        `https://api.cloudflare.com/client/v4/accounts/${lifecycleAccount}/d1/database/${databaseId}/query`
    )
      throw new Error('Unexpected control-plane egress');

    const body = Schema.decodeUnknownSync(LifecycleBatch)(
      JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body)),
    );

    requests.push({ databaseId, body });

    try {
      const result = await database.batch(
        body.batch.map((query) => database.prepare(query.sql).bind(...query.params)),
      );

      return Response.json({ success: true, errors: [], messages: [], result });
    } catch {
      return Response.json(
        { success: false, errors: [{ code: 1000, message: 'Local D1 rejected query' }], result: [] },
        { status: 400 },
      );
    }
  };

  return {
    artifact,
    artifactDirectory,
    source,
    target,
    sourceDB,
    get targetDB() {
      return targetDB;
    },
    executable,
    fetcher,
    requests,
    setTargetAuth: async (auth: string) => {
      await target.setOptions(targetOptions(auth));
      targetDB = await target.getD1Database('DB');
    },
    deployTarget: async (deployed: NonNullable<Parameters<typeof targetOptions>[1]>) => {
      await target.setOptions(targetOptions(deployed.bindings.BETTER_AUTH_SECRET, deployed));
      targetDB = await target.getD1Database('DB');
    },
    env: {
      ...process.env,
      WORKERS_SUBDOMAIN: 'test',
      PREVIEW_IDENTITY_ENABLED: 'true',
      PREVIEW_SOURCE_RELEASE: JSON.stringify({ sourceOrigin: lifecycleSourceOrigin, executable }),
      CLOUDFLARE_ACCOUNT_ID: lifecycleAccount,
      CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
    },
    dispose: () => Promise.all([source.dispose(), target.dispose()]),
  };
}
