import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Redacted } from 'effect';
import { resolve } from 'node:path';
import { validateArtifact } from './scripts/preview-artifact.ts';
import {
  bridgeSettings,
  PreviewIdentity,
  previewIdentityProvider,
} from './scripts/preview-lifecycle-state.ts';

const state = Cloudflare.state();

export default Alchemy.Stack(
  'agent-game',
  {
    providers: Layer.merge(Cloudflare.providers(), previewIdentityProvider(process.env)).pipe(
      Layer.provide(state),
    ),
    state,
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const preview = /^pr-[1-9]\d*$/.test(stage);

    if (stage !== 'prod' && !preview) throw new Error('Deploy prod or an isolated pr-<number> stage.');

    // Alchemy's destroy plan uses persisted resources, including R2, rather than
    // the current spec. Never require a retained PR build to remove its stage.
    if (
      preview &&
      (process.env.PREVIEW_OPERATION === 'destroy' || process.env.PREVIEW_OPERATION === 'retire')
    ) {
      if (!process.argv.includes(process.env.PREVIEW_OPERATION))
        throw new Error('Cleanup is destroy/retire-only.');

      return {};
    }

    const artifactDirectory = preview ? process.env.PREVIEW_ARTIFACT_DIR : undefined;

    if (preview && !artifactDirectory)
      throw new Error('Preview deployment requires a verified prebuilt artifact.');

    const artifact = artifactDirectory
      ? yield* Effect.promise(() => validateArtifact(artifactDirectory))
      : undefined;

    if (artifact && artifact.manifestSha256 !== process.env.PREVIEW_MANIFEST_SHA256)
      throw new Error('Preview artifact changed after controller verification.');

    const workerName = preview ? `agent-game-${stage}` : (process.env.WORKER_NAME ?? 'agent-game');

    if (preview && !/^[a-z0-9-]+$/.test(process.env.WORKERS_SUBDOMAIN ?? ''))
      throw new Error('Set WORKERS_SUBDOMAIN for pull-request previews.');

    const appUrl = preview
      ? `https://${workerName}.${process.env.WORKERS_SUBDOMAIN}.workers.dev`
      : process.env.APP_URL;

    if (!appUrl?.startsWith('https://')) throw new Error('Set APP_URL to the production HTTPS origin.');

    if (!preview) {
      if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
        throw new Error('Set a high-entropy BETTER_AUTH_SECRET of at least 32 characters.');

      if (!process.env.HOUSE_MODEL)
        throw new Error('Set HOUSE_MODEL explicitly after completing model evaluation.');

      for (const key of [
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ]) {
        if (!process.env[key]) throw new Error(`Set ${key} for the approved production sign-in methods.`);
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
    const bridge = preview ? bridgeSettings(process.env) : undefined;

    const identity =
      bridge && previewAuth
        ? yield* PreviewIdentity('PreviewIdentity', {
            targetOrigin: appUrl,
            authSecret: previewAuth.text,
            runId: Number(process.env.PREVIEW_VERIFIED_RUN_ID),
            runAttempt: Number(process.env.PREVIEW_VERIFIED_RUN_ATTEMPT),
            builtCommit: process.env.PREVIEW_BUILT_COMMIT ?? '',
            prHeadSha: process.env.PR_HEAD_SHA ?? '',
            controllerRun: `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`,
          })
        : undefined;

    const secret = (key: string) => (process.env[key] ? { [key]: Redacted.make(process.env[key]!) } : {});

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
          BETTER_AUTH_SECRET: previewAuth!.text,
          PREVIEW_SOURCE_URL: identity ? identity.sourceOrigin : '',
        }
      : {
          ...shared,
          AI: Cloudflare.Workers.AI(),
          ENVIRONMENT: 'production',
          HOUSE_PROVIDER: process.env.HOUSE_PROVIDER ?? 'workers-ai',
          HOUSE_MODEL: process.env.HOUSE_MODEL!,
          TIME_SCALE: '1',
          MAX_CONCURRENT_MATCHES: process.env.MAX_CONCURRENT_MATCHES ?? '3',
          HOUSE_DAILY_BUDGET_USD: process.env.HOUSE_DAILY_BUDGET_USD ?? '5',
          HOUSE_MATCH_RESERVATION_USD: process.env.HOUSE_MATCH_RESERVATION_USD ?? '1.5',
          HOUSE_SUCCESSION_MATCH_RESERVATION_USD: process.env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD ?? '',
          ...secret('BETTER_AUTH_SECRET'),
          ...secret('GITHUB_CLIENT_ID'),
          ...secret('GITHUB_CLIENT_SECRET'),
          ...secret('GOOGLE_CLIENT_ID'),
          ...secret('GOOGLE_CLIENT_SECRET'),
          ...secret('OPENAI_API_KEY'),
        };

    const worker = yield* Cloudflare.Worker('Arena', {
      name: workerName,
      domain: preview ? undefined : process.env.APP_DOMAIN,
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
    };
  }),
);
