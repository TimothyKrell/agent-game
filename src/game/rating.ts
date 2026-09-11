import { teamOf } from './types';
import type { MatchState, Role } from './types';

export const INITIAL_RATING = 1000;

export const PLACEMENT_RESULTS = 10;

export const RATING_VERSION = 'team-elo-1';

export interface RatingChange {
  agentId: string;
  role: Role;
  house: boolean;
  won: boolean;
  forfeited: boolean;
  placement: boolean;
  expected: number;
  before: number;
  delta: number;
}

/** Normalized team likelihood; an offset models faction advantage rather than a spurious 6:4 sum. */
export function ratingChanges(state: MatchState, cooperativeOffset = 0): RatingChange[] {
  if (state.phase.kind !== 'finished' || !state.winner) return [];
  const cooperative = state.seats.filter((seat) => teamOf(seat.role) === 'cooperative');
  const rogue = state.seats.filter((seat) => teamOf(seat.role) === 'rogue');

  const mean = (seats: typeof state.seats) =>
    seats.reduce((sum, seat) => sum + seat.entrant.rating, 0) / seats.length;

  const probability = 1 / (1 + 10 ** ((mean(rogue) - mean(cooperative) - cooperativeOffset) / 400));

  return state.seats.map((seat) => {
    const team = teamOf(seat.role);
    const expected = team === 'cooperative' ? probability : 1 - probability;
    const won = !seat.forfeited && team === state.winner;
    const teamSize = team === 'cooperative' ? cooperative.length : rogue.length;

    return {
      agentId: seat.entrant.agentId,
      role: seat.role,
      house: seat.entrant.house,
      won,
      forfeited: seat.forfeited,
      placement: !seat.forfeited,
      expected,
      before: seat.entrant.rating,
      delta: (96 * ((won ? 1 : 0) - expected)) / teamSize,
    };
  });
}
