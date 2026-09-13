import { Schema } from 'effect';

export interface HistoryAnchor2 {
  protocolVersion: '2';
  gameId: 'succession';
  matchId: string;
  visibilityEpoch: string;
  cursor: number | null;
}

export const HistoryAnchor2Schema = Schema.Struct({
  protocolVersion: Schema.Literal('2'),
  gameId: Schema.Literal('succession'),
  matchId: Schema.String,
  visibilityEpoch: Schema.String,
  cursor: Schema.NullOr(Schema.Number),
}) satisfies Schema.Codec<HistoryAnchor2>;

export interface RoundIndex2 {
  protocolVersion: '2';
  gameId: 'succession';
  matchId: string;
  visibilityEpoch: string;
  rounds: { key: string; act: 1 | 2; round: number; through: number; eventKey: string }[];
}

export const RoundIndex2Schema = Schema.Struct({
  protocolVersion: Schema.Literal('2'),
  gameId: Schema.Literal('succession'),
  matchId: Schema.String,
  visibilityEpoch: Schema.String,
  rounds: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        key: Schema.String,
        act: Schema.Literals([1, 2]),
        round: Schema.Number,
        through: Schema.Number,
        eventKey: Schema.String,
      }),
    ),
  ),
}) satisfies Schema.Codec<RoundIndex2>;
