import { Schema } from 'effect';
import { observeSuccession } from '../../src/game/succession/observation';
import { replayFrameSuccession } from '../../src/game/succession/replay';
import type { SuccessionState } from '../../src/game/succession/types';
import { HistoryCheckpoint2Schema } from '../../src/shared/history-checkpoint';
import type { Observation2 } from '../../src/shared/succession';

/** Encode an engine checkpoint at the requested cursor; current supplies authority, never historical facts. */
export function dossierCheckpoint(
  state: SuccessionState | undefined,
  current: Observation2,
  through: number,
) {
  const epoch = current.history.visibilityEpoch;
  const seat = current.you && !current.you.forfeited ? current.you.seat : null;

  const publicState = state
    ? observeSuccession(state, seat, { visibilityEpoch: epoch, streamHead: through })
    : null;

  if (publicState) {
    publicState.decision = null;
    publicState.chat = { ...publicState.chat, open: false, nextSpeakAt: null };

    if (!current.private || publicState.you?.generation !== current.you?.generation)
      publicState.private = null;
  }

  return Schema.decodeUnknownSync(HistoryCheckpoint2Schema)({
    protocolVersion: '2',
    gameId: 'succession',
    matchId: current.matchId,
    visibilityEpoch: epoch,
    through,
    baseline:
      state && current.status !== 'active' ? replayFrameSuccession(state, through, epoch) : publicState,
  });
}
