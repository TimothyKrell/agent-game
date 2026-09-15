import { Effect, Layer, ConfigProvider } from 'effect';
import { Stage } from 'alchemy/Stage';
import { AuthProviders } from 'alchemy/Auth/AuthProvider';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { CredentialsStoreLive } from 'alchemy/Auth/Credentials';
import { ProfileLive } from 'alchemy/Auth/Profile';
import { PlatformServices } from 'alchemy/Util/PlatformServices';
import { LoggingCli } from '../node_modules/alchemy/lib/Cli/LoggingCli.js';
import { provideFreshArtifactStore } from 'alchemy/Artifacts';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import stack from '../alchemy.run.ts';
import { controllerClosure, controllerDelivery, controllerRetirement } from './preview-controller.ts';
import { applyPreview } from './preview-apply.ts';
import { canonical, requireCondition } from './preview-artifact.ts';

/** Fixed default-branch Alchemy API runner; keys never leave this process. */
async function main() {
  const operation = process.argv[2];
  const env = process.env;
  env.ALCHEMY_PROFILE = 'agent-game';
  const stage = `pr-${env.PR_NUMBER}`;
  requireCondition(
    ['deploy', 'destroy', 'retire'].includes(operation) &&
      canonical(process.argv.slice(3)) === canonical(['--stage', stage, '--profile', 'agent-game', '--yes']),
    'Invalid fixed Alchemy invocation',
  );
  requireCondition(
    !!env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? ''),
    'Missing protected preview credentials',
  );
  const delivery = operation === 'deploy' ? await controllerDelivery(env) : undefined;
  const closure = operation === 'destroy' ? await controllerClosure(env) : undefined;
  const retirement = operation === 'retire' ? await controllerRetirement(env) : undefined;

  if (delivery) {
    env.PREVIEW_VERIFIED_RUN_ID = String(delivery.verified.runId);
    env.PREVIEW_VERIFIED_RUN_ATTEMPT = String(delivery.verified.runAttempt);
    env.PREVIEW_BUILT_COMMIT = delivery.verified.builtCommit;
    env.PR_HEAD_SHA = delivery.verified.prHeadSha;
  }

  const engine = Effect.gen(function* () {
    const compiled = yield* stack;

    const invocation = delivery
      ? { operation: 'deploy' as const, authority: delivery }
      : closure
        ? { operation: 'destroy' as const, authority: closure }
        : { operation: 'retire' as const, authority: retirement! };

    const publication = yield* applyPreview(compiled, invocation, env);

    if (publication)
      yield* Effect.promise(async () => {
        await mkdir('.agent-game', { recursive: true });
        await writeFile('.agent-game/preview-registration.json', canonical(publication), { mode: 0o600 });
      });
  }).pipe(Effect.provideService(Stage, stage), Effect.provideService(AuthProviders, {}));

  // Mirrors the locked CLI's platform/profile setup, with an environment-only
  // token, fixed profile, no dynamic stack import and no output/secret printing.
  const services = Layer.mergeAll(
    Layer.succeed(AlchemyContext, {
      dotAlchemy: resolve('.alchemy'),
      dev: false,
      adopt: false,
      updateStateStore: false,
    }),
    Layer.provide(ProfileLive, PlatformServices),
    Layer.provide(CredentialsStoreLive, PlatformServices),
    PlatformServices,
    FetchHttpClient.layer,
    LoggingCli,
    ConfigProvider.layer(ConfigProvider.fromEnv()),
  );

  await Effect.runPromise(engine.pipe(provideFreshArtifactStore, Effect.provide(services), Effect.scoped));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    await main();
  } catch {
    // Effect/provider errors may contain resource props. Never print causes
    // from a process that handles target auth or private signing material.
    console.error('Trusted preview lifecycle failed; retained identity enables safe retry.');
    process.exitCode = 1;
  }
}
