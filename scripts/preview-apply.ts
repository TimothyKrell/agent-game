import { Effect } from 'effect';
import * as Plan from 'alchemy/Plan';
import { apply } from 'alchemy/Apply';
import type { CompiledStack } from 'alchemy/Stack';
import { State } from 'alchemy/State';
import type { controllerClosure, controllerDelivery, controllerRetirement } from './preview-controller.ts';
import { bridgeSettings, retainedIdentity } from './preview-lifecycle-state.ts';
import { registerLifecycle, retireLifecycle } from './preview-lifecycle.ts';
import { requireCondition } from './preview-artifact.ts';

export type PreviewOperation =
  | { operation: 'deploy'; authority: Awaited<ReturnType<typeof controllerDelivery>> }
  | { operation: 'destroy'; authority: Awaited<ReturnType<typeof controllerClosure>> }
  | { operation: 'retire'; authority: Awaited<ReturnType<typeof controllerRetirement>> };

/** The fixed runner and local transports share this entire Plan/Apply/lifecycle
 * boundary. Publication returned here is data, never a readiness claim. */
export const applyPreview = <A>(
  compiled: CompiledStack<A>,
  invocation: PreviewOperation,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
) =>
  Effect.gen(function* () {
    const stage = compiled.stage;

    const number =
      invocation.operation === 'deploy'
        ? invocation.authority.verified.prNumber
        : invocation.authority.number;

    requireCondition(
      compiled.name === 'agent-game' && stage === `pr-${number}`,
      'Runner stage differs from controller authority',
    );
    const state = yield* yield* State;
    const retained = yield* Effect.promise(() => retainedIdentity(state, stage));

    if (invocation.operation === 'retire') {
      const retirement = invocation.authority;

      if (
        retained &&
        retained.identity.runId === retirement.runId &&
        retained.identity.runAttempt === retirement.runAttempt &&
        (yield* Effect.promise(() => retirement.shouldRetire(retained.identity.prHeadSha)))
      )
        yield* Effect.promise(() =>
          retireLifecycle(state, stage, retained.identity, env, async () => {}, fetcher),
        );

      return;
    }

    const recheck = invocation.authority.recheck;

    if (retained && (invocation.operation === 'destroy' || !bridgeSettings(env)))
      yield* Effect.promise(() => retireLifecycle(state, stage, retained.identity, env, recheck, fetcher));
    yield* Effect.promise(recheck);

    const plan =
      invocation.operation === 'destroy' ? yield* Plan.destroy(compiled) : yield* Plan.make(compiled);

    yield* apply(plan);

    if (invocation.operation === 'deploy' && bridgeSettings(env)) {
      const delivery = invocation.authority;

      return yield* Effect.promise(() =>
        registerLifecycle(state, delivery.verified, delivery.artifact, env, recheck, fetcher),
      );
    }
  }).pipe(Effect.provide(compiled.services));
