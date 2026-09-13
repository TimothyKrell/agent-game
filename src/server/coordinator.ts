/** Both logical game queues share the deployed coordinator and its global limits. */
export function platformCoordinator(env: Pick<Env, 'MATCHMAKING'>) {
  return env.MATCHMAKING.getByName('secret-overlord');
}
