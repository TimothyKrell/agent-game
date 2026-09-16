import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Redacted } from 'effect';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateArtifact } from './scripts/preview-artifact.ts';
import {
  bridgeSettings,
  PreviewIdentity,
  previewIdentityProvider,
} from './scripts/preview-lifecycle-state.ts';

// The same graph is exercised with local provider transports in lifecycle tests.
// Production always supplies the fixed Cloudflare providers/state below.
export const arenaResources = (env: NodeJS.ProcessEnv, commandArguments = process.argv) =>
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const preview = /^pr-[1-9]\d*$/.test(stage);

    if (stage !== 'prod' && !preview) throw new Error('Deploy prod or an isolated pr-<number> stage.');

    // Alchemy's destroy plan uses persisted resources, including R2, rather than
    // the current spec. Never require a retained PR build to remove its stage.
    if (preview && (env.PREVIEW_OPERATION === 'destroy' || env.PREVIEW_OPERATION === 'retire')) {
      if (!commandArguments.includes(env.PREVIEW_OPERATION))
        throw new Error('Cleanup is destroy/retire-only.');

      return {};
    }

    const artifactDirectory = preview ? env.PREVIEW_ARTIFACT_DIR : undefined;

    if (preview && !artifactDirectory)
      throw new Error('Preview deployment requires a verified prebuilt artifact.');

    const artifact = artifactDirectory
      ? yield* Effect.promise(() => validateArtifact(artifactDirectory))
      : undefined;

    if (artifact && artifact.manifestSha256 !== env.PREVIEW_MANIFEST_SHA256)
      throw new Error('Preview artifact changed after controller verification.');

    const workerName = preview ? `agent-game-${stage}` : (env.WORKER_NAME ?? 'agent-game');

    if (preview && !/^[a-z0-9-]+$/.test(env.WORKERS_SUBDOMAIN ?? ''))
      throw new Error('Set WORKERS_SUBDOMAIN for pull-request previews.');

    const appUrl = preview ? `https://${workerName}.${env.WORKERS_SUBDOMAIN}.workers.dev` : env.APP_URL;

    if (!appUrl?.startsWith('https://')) throw new Error('Set APP_URL to the production HTTPS origin.');

    if (!preview) {
      if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
        throw new Error('Set a high-entropy BETTER_AUTH_SECRET of at least 32 characters.');

      if (!env.HOUSE_MODEL) throw new Error('Set HOUSE_MODEL explicitly after completing model evaluation.');

      for (const key of [
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ]) {
        if (!env[key]) throw new Error(`Set ${key} for the approved production sign-in methods.`);
      }
    }

    const db = yield* Cloudflare.D1.Database('Identity', {
      migrations: artifactDirectory ? resolve(artifactDirectory, 'migrations') : './migrations',
    });

    const pictures = yield* Cloudflare.R2.Bucket('AgentPictures', {
      publicAccess: false,
      forceDestroy: preview ? true : undefined,
    });

    const previewAuth = preview ? yield* Alchemy.Random('PreviewAuth') : undefined;
    const bridge = preview ? bridgeSettings(env) : undefined;

    const identity =
      bridge && previewAuth
        ? yield* PreviewIdentity('PreviewIdentity', {
            targetOrigin: appUrl,
            authSecret: previewAuth.text,
            runId: Number(env.PREVIEW_VERIFIED_RUN_ID),
            runAttempt: Number(env.PREVIEW_VERIFIED_RUN_ATTEMPT),
            builtCommit: env.PREVIEW_BUILT_COMMIT ?? '',
            prHeadSha: env.PR_HEAD_SHA ?? '',
            controllerRun: `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`,
            targetDatabaseId: db.databaseId,
          })
        : undefined;

    const secret = (key: string) => (env[key] ? { [key]: Redacted.make(env[key]!) } : {});
    const codingConcurrency = Number(env.CODING_MAX_CONCURRENT_MATCHES ?? '1');

    if (!Number.isInteger(codingConcurrency) || codingConcurrency < 1 || codingConcurrency > 3)
      throw new Error('CODING_MAX_CONCURRENT_MATCHES must be an integer from 1 to 3.');

    const codingSandboxes = preview
      ? undefined
      : Cloudflare.Container('CodingSandboxes', {
          className: 'CodingSandbox',
          context: './dev/coding-finale',
          dockerfile: './dev/coding-finale/Dockerfile',
          instanceType: 'standard-1',
          // Six finalists, each with isolated practice and hidden-judge containers.
          maxInstances: codingConcurrency * 12,
        });

    const shared = {
      DB: db,
      AGENT_PICTURES: pictures,
      MATCHES: Cloudflare.DurableObject('Matches', { className: 'MatchObject' }),
      MATCHMAKING: Cloudflare.DurableObject('Matchmaking', { className: 'MatchmakingObject' }),
      HOUSE_SEATS: Cloudflare.DurableObject('HouseSeats', { className: 'HouseSeatObject' }),
      APP_URL: appUrl,
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      QUEUE_WAIT_SECONDS: '30',
    };

    const bindings = preview
      ? {
          ...shared,
          ENVIRONMENT: 'preview',
          HOUSE_PROVIDER: 'preview',
          HOUSE_MODEL: 'scripted',
          TIME_SCALE: '0.1',
          MAX_CONCURRENT_MATCHES: '2',
          HOUSE_DAILY_BUDGET_USD: '0',
          HOUSE_MATCH_RESERVATION_USD: '0',
          HOUSE_SUCCESSION_MATCH_RESERVATION_USD: '',
          HOUSE_CODING_MATCH_RESERVATION_USD: '0',
          CODING_MAX_CONCURRENT_MATCHES: '0',
          BETTER_AUTH_SECRET: previewAuth!.text,
          PREVIEW_SOURCE_URL: identity ? identity.sourceOrigin : '',
        }
      : {
          ...shared,
          AI: Cloudflare.Workers.AI(),
          ENVIRONMENT: 'production',
          HOUSE_PROVIDER: env.HOUSE_PROVIDER ?? 'workers-ai',
          HOUSE_MODEL: env.HOUSE_MODEL!,
          TIME_SCALE: '1',
          MAX_CONCURRENT_MATCHES: env.MAX_CONCURRENT_MATCHES ?? '3',
          HOUSE_DAILY_BUDGET_USD: env.HOUSE_DAILY_BUDGET_USD ?? '5',
          HOUSE_MATCH_RESERVATION_USD: env.HOUSE_MATCH_RESERVATION_USD ?? '1.5',
          HOUSE_SUCCESSION_MATCH_RESERVATION_USD: env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD ?? '',
          HOUSE_CODING_MATCH_RESERVATION_USD: env.HOUSE_CODING_MATCH_RESERVATION_USD ?? '2.5',
          CODING_MAX_CONCURRENT_MATCHES: String(codingConcurrency),
          CODING_SANDBOXES: codingSandboxes!,
          ...secret('BETTER_AUTH_SECRET'),
          ...secret('GITHUB_CLIENT_ID'),
          ...secret('GITHUB_CLIENT_SECRET'),
          ...secret('GOOGLE_CLIENT_ID'),
          ...secret('GOOGLE_CLIENT_SECRET'),
          ...secret('OPENAI_API_KEY'),
        };

    const worker = yield* Cloudflare.Worker('Arena', {
      name: workerName,
      domain: preview ? undefined : env.APP_DOMAIN,
      main: artifactDirectory ? resolve(artifactDirectory, 'worker/worker.js') : './src/server/worker.ts',
      bundle: artifact ? false : undefined,
      rules: artifact
        ? [
            {
              globs: artifact.manifest.files.flatMap((file) =>
                file.path.startsWith('worker/') ? [file.path.slice('worker/'.length)] : [],
              ),
            },
          ]
        : undefined,
      compatibility: { date: '2026-09-10', flags: ['nodejs_compat'] },
      assets: {
        directory: artifactDirectory ? resolve(artifactDirectory, 'assets') : './dist/client',
        notFoundHandling: 'single-page-application',
        runWorkerFirst: ['/api/*', '/preview', '/preview/*', '/agents.md', '/rules.md'],
      },
      env: bindings,
      crons: ['17 * * * *'],
      observability: { enabled: true, headSamplingRate: 1 },
    });

    return {
      url: worker.url,
      workerName: worker.workerName,
      databaseId: db.databaseId,
      sourceOrigin: preview ? undefined : appUrl,
      previewBridgeVersion: preview ? undefined : 1,
      sourceCommit: preview
        ? undefined
        : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    };
  });

const state = Cloudflare.state();

export default Alchemy.Stack(
  'agent-game',
  {
    providers: Layer.merge(Cloudflare.providers(), previewIdentityProvider(process.env)).pipe(
      Layer.provide(state),
    ),
    state,
  },
  arenaResources(process.env),
);
