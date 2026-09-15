import { Effect, Layer, ConfigProvider } from 'effect';
import * as Plan from 'alchemy/Plan';
import { apply } from 'alchemy/Apply';
import { Stage } from 'alchemy/Stage';
import { AuthProviders } from 'alchemy/Auth/AuthProvider';
import { State } from 'alchemy/State';
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
import { bridgeSettings, retainedIdentity } from './preview-lifecycle-state.ts';
import { registerLifecycle, retireLifecycle } from './preview-lifecycle.ts';
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
    yield* Effect.gen(function* () {
      const state = yield* yield* State;
      const retained = yield* Effect.promise(() => retainedIdentity(state, stage));

      if (retirement) {
        if (
          retained &&
          retained.identity.runId === retirement.runId &&
          retained.identity.runAttempt === retirement.runAttempt &&
          (yield* Effect.promise(() => retirement.shouldRetire(retained.identity.prHeadSha)))
        )
          yield* Effect.promise(() => retireLifecycle(state, stage, retained.identity, env, async () => {}));

        return;
      }

      if (retained && (closure || !bridgeSettings(env))) {
        yield* Effect.promise(() =>
          retireLifecycle(state, stage, retained.identity, env, closure?.recheck ?? delivery!.recheck),
        );
      }

      yield* Effect.promise(closure?.recheck ?? delivery!.recheck);
      const plan = closure ? yield* Plan.destroy(compiled) : yield* Plan.make(compiled);
      yield* apply(plan);

      if (delivery && bridgeSettings(env)) {
        yield* Effect.promise(async () => {
          const publication = await registerLifecycle(
            state,
            delivery.verified,
            delivery.artifact,
            env,
            delivery.recheck,
          );

          // Public manifest only. Readiness is assigned in the following
          // credential-free workflow step after actual source GET readback.
          await mkdir('.agent-game', { recursive: true });
          await writeFile('.agent-game/preview-registration.json', canonical(publication), { mode: 0o600 });
        });
      }
    }).pipe(Effect.provide(compiled.services));
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
