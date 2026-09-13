import type { ActionRequest, Observation, Entrant } from './types';
import { Schema } from 'effect';
import type { GameId, MatchSnapshot } from './contracts';
import type { ActionRequest2, Observation2, HistoryMetadata2 } from '../shared/succession';
import {
  createSecretOverlord,
  evolveSecretOverlord,
  inspectSecretOverlord,
  observeSecretOverlord,
  settleSecretOverlord,
  normalizeSecretOverlord,
} from './secret-overlord';
import type { SecretOverlordState, SecretOverlordCommand } from './secret-overlord';
import { createSuccession, evolveSuccession } from './succession/engine';
import { observeSuccession, inspectSuccession } from './succession/observation';
import { settleSuccession } from './succession/rating';
import type { SuccessionState, SuccessionCommand, RandomContext } from './succession/types';
import { decodeSuccessionState, LegacyStateSchema } from './succession/persistence';
import { replayFrameSuccession, replaySuccession, verifyReplayArchive } from './succession/replay';
import { replayFrame } from './replay';
import { gameDescriptor } from './descriptors';
import { previewAction, previewSpeech } from './preview';
import { previewSuccessionAction, previewSuccessionSpeech } from './succession/preview';

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
    replay: replayFrame,
    decode: decodeSecretOverlord,
    summary: summarySecretOverlord,
    previewAction,
    previewSpeech,
  },
  succession: {
    create: createSuccession,
    evolve: evolveSuccession,
    inspect: inspectSuccession,
    observe: observeSuccession,
    settle: settleSuccession,
    replay: replaySuccession,
    replayFrame: replayFrameSuccession,
    verifyReplayArchive,
    decode: decodeSuccessionState,
    summary: summarySuccession,
    previewAction: previewSuccessionAction,
    previewSpeech: previewSuccessionSpeech,
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

/** Only the known legacy version may omit gameId; unknown identities fail closed. */
export function decodeGameState(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the registry persistence decoder.
  value: unknown,
  legacyHouseModel?: MatchSnapshot['houseModel'],
): AnyMatchState {
  const identity = Schema.decodeUnknownSync(
    Schema.Struct({ gameId: Schema.optional(Schema.String), rulesVersion: Schema.String }),
  )(value);

  if (identity.gameId === 'succession') return decodeSuccessionState(value);

  if (
    (identity.gameId === undefined || identity.gameId === 'secret-overlord') &&
    identity.rulesVersion === 'secret-overlord-1'
  ) {
    return decodeSecretOverlord(value, legacyHouseModel);
  }

  throw new Error('Unsupported persisted game identity.');
}

function decodeSecretOverlord(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Known legacy persistence is validated here before normalization.
  value: unknown,
  legacyHouseModel?: MatchSnapshot['houseModel'],
): SecretOverlordState {
  const legacy = Schema.decodeUnknownSync(LegacyStateSchema, { onExcessProperty: 'error' })(value);

  const snapshot = legacy.snapshot ?? {
    ...gameDescriptor('secret-overlord'),
    mode: legacy.mode,
    timing: legacy.timing,
    housePolicyVersion: legacy.houseModel?.policyVersion ?? legacyHouseModel?.policyVersion ?? 'house-4',
    houseModel: legacy.houseModel ??
      legacyHouseModel ?? { provider: 'legacy', model: 'unknown', policyVersion: 'house-4' },
  };

  return normalizeSecretOverlord(legacy, snapshot);
}

export function summarySecretOverlord(state: SecretOverlordState) {
  return {
    gameId: state.gameId,
    id: state.id,
    status: inspectSecretOverlord(state).status,
    mode: state.mode,
    round: state.round,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    safeguards: state.safeguards,
    overrides: state.overrides,
    houseCount: state.seats.filter((seat) => seat.houseProfile !== null).length,
    winner: state.winner,
    winReason: state.winReason,
    names: state.seats.map((seat) => seat.entrant.name),
  };
}

export function summarySuccession(state: SuccessionState) {
  const view = observeSuccession(state);

  return {
    gameId: state.gameId,
    id: state.id,
    status: state.status,
    mode: state.snapshot.mode,
    round: view.round,
    act: view.act,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    houseCount: state.seats.filter((seat) => seat.houseProfile !== null).length,
    names: state.seats.map((seat) => seat.entrant.name),
    result: state.result,
    act1Result: state.act1Result,
    act1Winner: state.act1Result?.team ?? null,
    livingCount: state.seats.filter((seat) => seat.alive).length,
    winReason: state.interruptionReason ?? state.result?.reason ?? null,
    board: view.board,
    seats: view.seats,
  };
}

export interface SummaryByGame {
  'secret-overlord': ReturnType<typeof summarySecretOverlord>;
  succession: ReturnType<typeof summarySuccession>;
}

export type ResultByGame = {
  [G in GameId]: NonNullable<ReturnType<(typeof gameRegistry)[G]['settle']>>['result'];
};

export function summaryGame(state: AnyMatchState) {
  return state.gameId === 'succession' ? summarySuccession(state) : summarySecretOverlord(state);
}
