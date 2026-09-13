import type { ActionRequest, Observation, Entrant } from './types';
import type { GameId, MatchSnapshot } from './contracts';
import type { ActionRequest2, Observation2, HistoryMetadata2 } from '../shared/succession';
import {
  createSecretOverlord,
  evolveSecretOverlord,
  inspectSecretOverlord,
  observeSecretOverlord,
  settleSecretOverlord,
} from './secret-overlord';
import type { SecretOverlordState, SecretOverlordCommand } from './secret-overlord';
import { createSuccession, evolveSuccession } from './succession/engine';
import { observeSuccession, inspectSuccession } from './succession/observation';
import { settleSuccession } from './succession/rating';
import type { SuccessionState, SuccessionCommand, RandomContext } from './succession/types';

export { GAME_DESCRIPTORS, gameDescriptor } from './descriptors';
export type {
  GameId,
  GameDescriptor,
  MatchSnapshot,
  RuntimeInspection,
  SettlementParticipant,
} from './contracts';
export interface StateByGame {
  'secret-overlord': SecretOverlordState;
  succession: SuccessionState;
}
export interface ActionByGame {
  'secret-overlord': ActionRequest;
  succession: ActionRequest2;
}
export interface ObservationByGame {
  'secret-overlord': Observation;
  succession: Observation2;
}
export interface CommandByGame {
  'secret-overlord': SecretOverlordCommand;
  succession: SuccessionCommand;
}
export type AnyMatchState = StateByGame[GameId];
export type GameEvolutionInput = {
  [G in GameId]: { gameId: G; state: StateByGame[G]; command: CommandByGame[G] };
}[GameId];

/** Closed two-adapter registry; hosts own authentication, history, and persistence transactions. */
export const gameRegistry = {
  'secret-overlord': {
    create: createSecretOverlord,
    evolve: evolveSecretOverlord,
    inspect: inspectSecretOverlord,
    observe: observeSecretOverlord,
    settle: settleSecretOverlord,
  },
  succession: {
    create: createSuccession,
    evolve: evolveSuccession,
    inspect: inspectSuccession,
    observe: observeSuccession,
    settle: settleSuccession,
  },
};
export function inspectGame(state: AnyMatchState) {
  return state.gameId === 'succession' ? inspectSuccession(state) : inspectSecretOverlord(state);
}
export function settleGame(state: AnyMatchState) {
  return state.gameId === 'succession' ? settleSuccession(state) : settleSecretOverlord(state);
}
export function evolveGame(input: GameEvolutionInput, random?: RandomContext) {
  return input.gameId === 'succession'
    ? evolveSuccession(input.state, input.command, random)
    : evolveSecretOverlord(input.state, input.command);
}
export function observeGame(
  state: AnyMatchState,
  seat: number | null = null,
  options: { history?: HistoryMetadata2; after?: number; houseController?: boolean } = {},
) {
  return state.gameId === 'succession'
    ? observeSuccession(state, seat, options.history, options.houseController)
    : observeSecretOverlord(state, seat, options.after, options.houseController);
}
export async function createGame(id: string, entrants: Entrant[], now: number, snapshot: MatchSnapshot) {
  if (snapshot.gameId === 'succession') return createSuccession(id, entrants, now, { snapshot });
  const state = createSecretOverlord(id, entrants, now, snapshot);
  return { state, appendedEvents: state.events, replay: null };
}
