import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Redacted } from 'effect';

export default Alchemy.Stack(
  'agent-game',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const preview = /^pr-[1-9]\d*$/.test(stage);

    if (stage !== 'prod' && !preview) throw new Error('Deploy prod or an isolated pr-<number> stage.');

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

    const db = yield* Cloudflare.D1.Database('Identity', { migrations: './migrations' });
    const secret = (key: string) => (process.env[key] ? { [key]: Redacted.make(process.env[key]!) } : {});

    const shared = {
      DB: db,
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
          BETTER_AUTH_SECRET: (yield* Alchemy.Random('PreviewAuth')).text,
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
      main: './src/server/worker.ts',
      compatibility: { date: '2026-09-10', flags: ['nodejs_compat'] },
      assets: {
        directory: './dist/client',
        notFoundHandling: 'single-page-application',
        runWorkerFirst: ['/api/*', '/agents.md', '/rules.md'],
      },
      env: bindings,
      observability: { enabled: true, headSamplingRate: 1 },
    });

    return { url: worker.url, workerName: worker.workerName, databaseId: db.databaseId };
  }),
);
