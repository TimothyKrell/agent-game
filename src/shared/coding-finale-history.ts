import { Schema } from 'effect';
import { Observation3Schema, type Observation3 } from './coding-finale';
import { HistoryPage2Schema, type HistoryPage2 } from './succession';
import { HistoryAnchor2Schema, RoundIndex2Schema, type HistoryAnchor2, type RoundIndex2 } from './history';

type CodingIdentity = { gameId: 'coding-finale'; protocolVersion: '3' };

const identity = { gameId: Schema.Literal('coding-finale'), protocolVersion: Schema.Literal('3') };

export type HistoryPage3 = Omit<HistoryPage2, 'gameId' | 'protocolVersion'> & CodingIdentity;

export type HistoryAnchor3 = Omit<HistoryAnchor2, 'gameId' | 'protocolVersion'> & CodingIdentity;

export type RoundIndex3 = Omit<RoundIndex2, 'gameId' | 'protocolVersion'> & CodingIdentity;

export interface HistoryCheckpoint3 extends CodingIdentity {
  matchId: string;
  visibilityEpoch: string;
  through: number;
  baseline: Observation3 | null;
}

export const HistoryPage3Schema = Schema.Struct({ ...HistoryPage2Schema.fields, ...identity }).check(
  Schema.makeFilter(
    (page) =>
      Schema.is(HistoryPage2Schema)({ ...page, gameId: 'succession', protocolVersion: '2' }) &&
      new TextEncoder().encode(JSON.stringify(page)).length <= (page.reset ? 1024 : 32768),
  ),
) satisfies Schema.Codec<HistoryPage3>;

export const HistoryAnchor3Schema = Schema.Struct({
  ...HistoryAnchor2Schema.fields,
  ...identity,
}) satisfies Schema.Codec<HistoryAnchor3>;

export const RoundIndex3Schema = Schema.Struct({
  ...RoundIndex2Schema.fields,
  ...identity,
}) satisfies Schema.Codec<RoundIndex3>;

export const HistoryCheckpoint3Schema = Schema.Struct({
  ...identity,
  matchId: Schema.String,
  visibilityEpoch: Schema.String,
  through: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  baseline: Schema.NullOr(Observation3Schema),
}) satisfies Schema.Codec<HistoryCheckpoint3>;
