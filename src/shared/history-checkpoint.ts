import { Schema } from 'effect';
import { Observation2Schema, ReplayFrame2Schema } from './succession';
import type { Observation2, ReplayFrame2 } from './succession';

/** A historical reading baseline, never an actionable current-state response. */
export interface HistoryCheckpoint2 {
  protocolVersion: '2';
  gameId: 'succession';
  matchId: string;
  visibilityEpoch: string;
  through: number;
  /** Null explicitly preserves legacy records whose saved checkpoint is unavailable. */
  baseline: Observation2 | ReplayFrame2 | null;
}

export const HistoryCheckpoint2Schema = Schema.Struct({
  protocolVersion: Schema.Literal('2'),
  gameId: Schema.Literal('succession'),
  matchId: Schema.String,
  visibilityEpoch: Schema.String,
  through: Schema.Number.check(Schema.makeFilter((n) => Number.isSafeInteger(n) && n >= 0)),
  baseline: Schema.NullOr(Schema.Union([Observation2Schema, ReplayFrame2Schema])),
}).check(
  Schema.makeFilter((record) => {
    const baseline = record.baseline;

    if (new TextEncoder().encode(JSON.stringify(record)).byteLength > 34_816) return false;

    if (!baseline) return true;

    if (baseline.matchId !== record.matchId || baseline.chat.open) return false;

    return 'history' in baseline
      ? baseline.history.visibilityEpoch === record.visibilityEpoch &&
          baseline.history.streamHead === record.through &&
          baseline.decision === null
      : baseline.visibilityEpoch === record.visibilityEpoch &&
          baseline.through === record.through &&
          baseline.you === null &&
          baseline.private === null;
  }),
) satisfies Schema.Codec<HistoryCheckpoint2>;
