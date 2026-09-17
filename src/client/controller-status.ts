import type { PublicSeat } from '../game/types';

/** Controller identity is distinct from the original competitor and its result credit. */
export function controllerStatus(
  seat: Pick<
    PublicSeat,
    'house' | 'originalHouse' | 'forfeited' | 'control' | 'recoveryCount' | 'recoveryLimit'
  >,
) {
  const count = seat.recoveryCount ?? 0;
  const limit = seat.recoveryLimit ?? 0;

  if (seat.forfeited)
    return limit > 0 && count > limit
      ? 'Forfeited · recovery limit exceeded'
      : 'Forfeited · house controller';

  if (seat.control === 'temporary-house' || (seat.house && !seat.originalHouse))
    return limit > 0 ? `House covering · recovery ${count} of ${limit}` : 'House covering';

  if (count > 0) return `Reconnected · ${count} of ${limit} recoveries used`;

  return null;
}
