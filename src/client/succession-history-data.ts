import { HistoryPage2Schema } from '../shared/succession';
import { api } from './api';
import type { MatchReadScope } from './succession-replay-data';
import { historyPath, SuccessionHistory } from './succession-stream';

export class HistoryReset extends Error {
  constructor(readonly scope: MatchReadScope) {
    super('The record visibility changed. Retry loading the current record.');
    this.name = 'HistoryReset';
  }
}

/** Shared authorized cursor walk. Callers own Query keys and any sibling checkpoint/frame request. */
export async function readAuthorizedHistory(
  scope: MatchReadScope,
  range: { after: number; through: number },
  signal: AbortSignal,
  maxEvents: number,
) {
  signal.throwIfAborted();
  const history = new SuccessionHistory();
  const { after, through } = range;

  if (
    !Number.isSafeInteger(maxEvents) ||
    maxEvents < 1 ||
    maxEvents > history.maxCachedEvents ||
    !Number.isSafeInteger(after) ||
    !Number.isSafeInteger(through) ||
    after < 0 ||
    through < after ||
    through - after > maxEvents
  )
    throw new Error('Invalid authorized history range.');
  history.observe({ visibilityEpoch: scope.epoch, streamHead: through });
  history.seek(after, through);

  // Byte-short pages may deliver only one record, but every page must make progress.
  for (let requests = 0; history.cursor < through && requests < maxEvents; requests++) {
    signal.throwIfAborted();
    const walk = { epoch: scope.epoch, after: history.cursor, through };
    const page = await api(historyPath(scope.matchId, walk), HistoryPage2Schema, undefined, { signal });

    if (page.matchId !== scope.matchId) throw new Error('The history page belongs to a different match.');

    if (page.reset) throw new HistoryReset(scope);

    if (
      page.events.length > 32 ||
      new TextEncoder().encode(JSON.stringify(page)).byteLength > 16_384 ||
      !history.accept(page, walk)
    )
      throw new Error('The history page is incomplete or out of order. Retry this window.');
  }

  if (history.cursor !== through) throw new Error('The selected history window is incomplete.');

  return history.events;
}
