import type { SettlementParticipant } from '../contracts';
import type { SuccessionState } from './types';

export function winnerProbabilities(ratings: number[]): number[] {
  if (ratings.length !== 10 || ratings.some((rating) => !Number.isFinite(rating)))
    throw new Error('Succession rating requires ten finite starting ratings.');
  const max = Math.max(...ratings);
  const weights = ratings.map((rating) => 10 ** ((rating - max) / 400));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map((weight) => weight / sum);
}

export function settleSuccession(state: SuccessionState) {
  if (state.status === 'active') return null;
  const probabilities = winnerProbabilities(state.seats.map((seat) => seat.entrant.rating));
  const participants: SettlementParticipant[] = state.seats.map((seat, index) => {
    const won =
      state.status === 'interrupted' ? null : seat.number === state.result?.winnerSeat && !seat.forfeited;
    const rated = state.snapshot.mode === 'ranked' && won !== null;
    return {
      seat: seat.number,
      entrant: seat.entrant,
      forfeited: seat.forfeited,
      won,
      ratingBefore: seat.entrant.rating,
      ratingDelta: rated ? 32 * (Number(won) - probabilities[index]) : 0,
      placement: rated && !seat.forfeited,
    };
  });
  return {
    gameId: state.gameId,
    ratingPoolId: state.snapshot.ratingPoolId,
    ratingVersion: state.snapshot.ratingVersion,
    mode: state.snapshot.mode,
    result: state.result,
    participants,
  };
}
