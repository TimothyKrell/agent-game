import { createHash } from 'node:crypto';

// Protocol-2 availability never implies history delivery.
export const terminal = (view) => ['finished', 'interrupted'].includes(view?.status);

export function gameId(value = 'secret-overlord') {
  if (!['secret-overlord', 'succession'].includes(value)) throw new Error(`Unsupported game: ${value}`);

  return value;
}

export function validateIdentity(value) {
  const id = gameId(value.gameId);

  if (id === 'succession' && (value.protocolVersion !== '2' || value.rulesVersion !== 'succession-1'))
    throw new Error('Unsupported Succession protocol/rules. Upgrade the CLI.');

  return id;
}

export function validateCurrent(value) {
  validateIdentity(value);

  if (value.protocolVersion !== '2') return;

  if (
    Buffer.byteLength(JSON.stringify(value)) > 14336 ||
    'events' in value ||
    'cursor' in value ||
    // Dependency-free transport boundary: the package intentionally ships no schema runtime.
    // eslint-disable-next-line anti-slop/no-runtime-typeof
    typeof value.history?.visibilityEpoch !== 'string' ||
    !Number.isSafeInteger(value.history.streamHead) ||
    value.history.streamHead < 0 ||
    (value.decision?.actions.length ?? 0) > 32
  )
    throw new Error('Invalid bounded protocol-2 current observation.');
}

export const notification = (view) => createHash('sha256').update(JSON.stringify(view)).digest('hex');

export function acceptCurrent(previous, next) {
  if (!previous || previous.matchId !== next.matchId) return next;

  if (terminal(previous) && !terminal(next)) return previous;

  if (terminal(previous) && previous.history?.visibilityEpoch !== next.history?.visibilityEpoch)
    return previous;

  if (previous.protocolVersion === '2' && next.protocolVersion === '2') {
    if (previous.act > next.act) return previous;
    const oldGeneration = previous.you?.generation ?? previous.you?.controller?.generation;
    const newGeneration = next.you?.generation ?? next.you?.controller?.generation;

    if (oldGeneration !== undefined && newGeneration !== undefined && newGeneration < oldGeneration)
      return previous;

    if (
      previous.history.visibilityEpoch === next.history.visibilityEpoch &&
      previous.history.streamHead > next.history.streamHead
    )
      return previous;
  }

  return next;
}

export function consumePage(walk, page, current) {
  if (page.matchId !== current.matchId || page.visibilityEpoch !== current.history.visibilityEpoch)
    return walk;

  if (page.reset) return { epoch: page.visibilityEpoch, cursor: 0, through: page.through };
  const cursor = walk?.epoch === page.visibilityEpoch ? walk.cursor : 0;

  if (page.after !== cursor) return walk;

  return { epoch: page.visibilityEpoch, cursor: page.cursor, through: page.through };
}
