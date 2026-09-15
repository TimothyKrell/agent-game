import { Effect, Layer, Redacted, Schema } from 'effect';
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Provider from 'alchemy/Provider';
import { Random, RandomProvider } from 'alchemy/Random';
import { State, InMemoryService } from 'alchemy/State';
import type { StateService } from 'alchemy/State';
import { encodeState, reviveState } from 'alchemy/State/StateEncoding';
import { Stage } from 'alchemy/Stage';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { PlatformServices } from 'alchemy/Util/PlatformServices';
import { LoggingCli } from '../../node_modules/alchemy/lib/Cli/LoggingCli.js';
import { provideFreshArtifactStore } from 'alchemy/Artifacts';
import { readPrebuiltWorkerBundle } from '../../node_modules/alchemy/lib/Cloudflare/Workers/Sources/Prebuilt.js';
import { expect } from 'vitest';
import { arenaResources } from '../../alchemy.run';
import { applyPreview } from '../../scripts/preview-apply';
import type { PreviewOperation } from '../../scripts/preview-apply';
import { previewIdentityProvider, retainedIdentity } from '../../scripts/preview-lifecycle-state';
import { deliveryProof } from '../../scripts/preview-controller';
import { verifyRecords } from '../../scripts/preview-github';
import { sha256 } from '../../scripts/preview-artifact';
import { applyPlatformMigrations } from '../platform-migrations';
import { records, expected } from './preview-github';
import {
  lifecycleFixture,
  lifecycleAccount,
  lifecycleSourceId,
  lifecycleSourceOrigin,
  lifecycleTargetId,
  lifecycleTargetOrigin,
} from './preview-lifecycle';

/** Real graph, Plan/Apply and data plane; local substitutes only for cloud
 * resource CRUD and protected remote state. No Cloudflare provider is installed. */
export async function runnerFixture() {
  const worker = await lifecycleFixture({ targetMigrations: false });

  let state = await Effect.runPromise(
    InMemoryService(
      {},
      {
        'agent-game': {
          prod: {
            databaseId: lifecycleSourceId,
            sourceOrigin: lifecycleSourceOrigin,
            previewBridgeVersion: 1,
            sourceCommit: 'e'.repeat(40),
          },
        },
      },
    ),
  );

  let failUpload = false;
  const deleted: string[] = [];

  const verified = {
    ...verifyRecords(records(), expected),
    builtCommit: worker.artifact.manifest.builtCommit,
  };

  const env: NodeJS.ProcessEnv = {
    ...worker.env,
    PREVIEW_ARTIFACT_DIR: worker.artifactDirectory,
    PREVIEW_MANIFEST_SHA256: worker.artifact.manifestSha256,
    PREVIEW_VERIFIED_RUN_ID: String(verified.runId),
    PREVIEW_VERIFIED_RUN_ATTEMPT: String(verified.runAttempt),
    PREVIEW_BUILT_COMMIT: verified.builtCommit,
    PR_HEAD_SHA: verified.prHeadSha,
    GITHUB_RUN_ID: '200',
    GITHUB_RUN_ATTEMPT: '1',
    PREVIEW_BROKER_ENABLED: 'false',
  };

  const remove = (name: string) =>
    Effect.promise(async () => {
      // Every destructive provider operation must see the source tombstone first.
      expect(
        await worker.sourceDB.prepare('SELECT COUNT(*) AS count FROM preview_retired_arenas').first('count'),
      ).toBeGreaterThan(0);
      deleted.push(name);
    });

  const database = Provider.succeed(Cloudflare.D1.Database, {
    read: ({ output }) => Effect.succeed(output),
    reconcile: ({ news }) =>
      Effect.promise(async () => {
        const migrations = Schema.decodeUnknownSync(Schema.String)(news.migrations);
        expect(migrations).toBe(`${worker.artifactDirectory}/migrations`);
        await applyPlatformMigrations(worker.targetDB, undefined, migrations);

        return {
          databaseId: lifecycleTargetId,
          databaseName: 'local-preview',
          jurisdiction: 'default' as const,
          readReplication: undefined,
          accountId: lifecycleAccount,
          migrationsDir: migrations,
          migrationsTable: undefined,
          migrationsHashes: {},
          importHashes: {},
        };
      }),
    delete: () => remove('database'),
  });

  const bucket = Provider.succeed(Cloudflare.R2.Bucket, {
    read: ({ output }) => Effect.succeed(output),
    reconcile: ({ news }) => {
      expect(news.forceDestroy).toBe(true);

      return Effect.succeed({
        bucketName: 'local-preview-pictures',
        storageClass: 'Standard',
        jurisdiction: 'default',
        location: undefined,
        accountId: lifecycleAccount,
        domains: [],
        lifecycleRules: [],
        cors: [],
        publicDomain: undefined,
      });
    },
    delete: ({ olds }) =>
      Effect.gen(function* () {
        yield* remove('bucket');
        expect(olds.forceDestroy).toBe(true);
        yield* Effect.promise(async () => {
          const r2 = await worker.target.getR2Bucket('AGENT_PICTURES');

          for (;;) {
            const page = await r2.list();

            if (!page.objects.length) break;
            await r2.delete(page.objects.map((object) => object.key));
          }
        });
      }),
  });

  const arena = Provider.effect(
    Cloudflare.Worker,
    Effect.succeed({
      read: ({ output }) => Effect.succeed(output),
      reconcile: ({ news }) =>
        Effect.gen(function* () {
          expect(news.bundle).toBe(false);
          expect(news.name).toBe('agent-game-pr-27');
          const identity = yield* Effect.promise(() => retainedIdentity(state, 'pr-27'));
          expect(identity?.identity.retired).toBe(false);

          if (failUpload) throw new Error('Synthetic prebuilt upload failure');
          const main = Schema.decodeUnknownSync(Schema.String)(news.main);
          const bundle = yield* readPrebuiltWorkerBundle({ main, rules: news.rules });

          for (const file of bundle.files)
            expect(sha256(file.content)).toBe(
              worker.artifact.manifest.files.find((entry) => entry.path === `worker/${file.path}`)?.sha256,
            );
          const bindings = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(news.env);
          expect(bindings.DB).toMatchObject({ databaseId: lifecycleTargetId });
          expect(bindings.AGENT_PICTURES).toMatchObject({ bucketName: 'local-preview-pictures' });

          const strings = Object.fromEntries(
            Object.entries(bindings).flatMap(([key, value]) =>
              Schema.is(Schema.String)(value)
                ? [[key, value]]
                : Redacted.isRedacted(value)
                  ? [[key, Schema.decodeUnknownSync(Schema.String)(Redacted.value(value))]]
                  : [],
            ),
          );

          expect(strings).toMatchObject({
            ENVIRONMENT: 'preview',
            PREVIEW_SOURCE_URL: lifecycleSourceOrigin,
            HOUSE_PROVIDER: 'preview',
            HOUSE_MODEL: 'scripted',
            TIME_SCALE: '0.1',
            HOUSE_DAILY_BUDGET_USD: '0',
            HOUSE_MATCH_RESERVATION_USD: '0',
          });
          expect(bindings).not.toHaveProperty('AI');
          expect(bindings).not.toHaveProperty('OPENAI_API_KEY');

          const assets = Schema.decodeUnknownSync(
            Schema.Struct({ directory: Schema.String, runWorkerFirst: Schema.Array(Schema.String) }),
          )(news.assets);

          expect(assets.runWorkerFirst).toContain('/preview');
          expect(assets.runWorkerFirst).toContain('/preview/*');
          yield* Effect.promise(() =>
            worker.deployTarget({
              bindings: strings,
              scriptPath: main,
              assets: {
                directory: assets.directory,
                binding: 'ASSETS',
                run_worker_first: [...assets.runWorkerFirst],
                routerConfig: { has_user_worker: true },
              },
            }),
          );

          return {
            workerId: 'local-preview-worker',
            workerName: news.name!,
            namespace: undefined,
            logpush: undefined,
            url: lifecycleTargetOrigin,
            urls: [lifecycleTargetOrigin],
            domain: undefined,
            tags: undefined,
            durableObjectNamespaces: {},
            accountId: lifecycleAccount,
            routes: [],
            crons: [],
          };
        }),
      delete: () => remove('worker'),
    }),
  );

  const cloud = Layer.effect(
    Cloudflare.Providers,
    Provider.collection([Cloudflare.D1.Database, Cloudflare.R2.Bucket, Cloudflare.Worker, Random]),
  ).pipe(Layer.provide(Layer.mergeAll(database, bucket, arena, RandomProvider())));

  const delivery = (recheck = async () => {}): PreviewOperation => ({
    operation: 'deploy',
    authority: {
      verified,
      artifact: worker.artifact,
      proof: deliveryProof(
        verified,
        worker.artifact.manifestSha256,
        'e'.repeat(40),
        'test',
        worker.artifact.branchContent,
      ),
      recheck,
    },
  });

  const run = (invocation: PreviewOperation, fetcher = worker.fetcher) => {
    const storage = Layer.succeed(State, Effect.succeed(state));
    const operationEnv = { ...env, PREVIEW_OPERATION: invocation.operation };

    const stack = Alchemy.Stack(
      'agent-game',
      {
        state: storage,
        providers: Layer.merge(cloud, previewIdentityProvider(operationEnv, fetcher)).pipe(
          Layer.provide(storage),
        ),
      },
      arenaResources(operationEnv, [invocation.operation]),
    );

    return Effect.runPromise(
      Effect.gen(function* () {
        const compiled = yield* stack;

        return yield* applyPreview(compiled, invocation, operationEnv, fetcher);
      }).pipe(
        provideFreshArtifactStore,
        Effect.provideService(Stage, 'pr-27'),
        Effect.provideService(AlchemyContext, {
          dotAlchemy: 'test-results/preview-lifecycle/runner',
          dev: false,
          adopt: false,
        }),
        Effect.provide(LoggingCli),
        Effect.provide(PlatformServices),
        Effect.scoped,
      ),
    );
  };

  return {
    worker,
    env,
    deleted,
    delivery,
    run,
    get state() {
      return state;
    },
    set failUpload(value: boolean) {
      failUpload = value;
    },
    restart: async () => {
      state = await coldState(state);
    },
    dispose: worker.dispose,
  };
}

async function coldState(previous: StateService) {
  const state = await Effect.runPromise(InMemoryService());

  for (const stage of new Set(['prod', ...(await Effect.runPromise(previous.listStages('agent-game')))])) {
    const address = { stack: 'agent-game', stage };
    const output = await Effect.runPromise(previous.getOutput(address));
    await Effect.runPromise(state.setOutput({ ...address, value: output }));

    for (const fqn of await Effect.runPromise(previous.list(address))) {
      const value = await Effect.runPromise(previous.get({ ...address, fqn }));

      if (value)
        await Effect.runPromise(
          state.set({ ...address, fqn, value: JSON.parse(JSON.stringify(encodeState(value)), reviveState) }),
        );
    }
  }

  return state;
}
