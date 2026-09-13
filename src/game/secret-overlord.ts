import {
  createMatch,
  act,
  advance,
  recoverMatch,
  interruptMatch,
  pendingSeats,
  nextDeadline,
} from './engine';
import { observe } from './observation';
import { ratingChanges } from './rating';
import { gameDescriptor } from './descriptors';
import type { RuntimeInspection, MatchSnapshot, SettlementParticipant } from './contracts';
import type { MatchState, Entrant, ActionRequest } from './types';

export type SecretOverlordState = MatchState & { gameId: 'secret-overlord'; snapshot: MatchSnapshot };
export type SecretOverlordCommand =
  | { type: 'act'; seat: number; generation: number; request: ActionRequest; now: number }
  | { type: 'advance' | 'recover'; now: number }
  | { type: 'interrupt'; now: number; reason: string };
export function normalizeSecretOverlord(state: MatchState, snapshot?: MatchSnapshot): SecretOverlordState {
  if (snapshot) return { ...state, gameId: 'secret-overlord', snapshot: structuredClone(snapshot) };
  return {
    ...state,
    gameId: 'secret-overlord',
    snapshot: {
      ...gameDescriptor('secret-overlord'),
      mode: state.mode,
      timing: state.timing,
      houseModel: state.houseModel ?? {
        provider: 'preview',
        model: 'scripted',
        policyVersion: 'secret-overlord-1',
      },
    },
  };
}
export function createSecretOverlord(
  id: string,
  entrants: Entrant[],
  now: number,
  snapshot?: MatchSnapshot,
): SecretOverlordState {
  const state = normalizeSecretOverlord(
    createMatch(id, entrants, now, { timing: snapshot?.timing, mode: snapshot?.mode }),
  );
  if (snapshot) {
    state.snapshot = structuredClone(snapshot);
    state.houseModel = structuredClone(snapshot.houseModel);
  }
  return state;
}
export function evolveSecretOverlord(input: SecretOverlordState, command: SecretOverlordCommand) {
  let state: MatchState;
  switch (command.type) {
    case 'act':
      state = act(input, command.seat, command.generation, command.request, command.now);
      break;
    case 'advance':
      state = advance(input, command.now);
      break;
    case 'recover':
      state = recoverMatch(input, command.now);
      break;
    case 'interrupt':
      state = interruptMatch(input, command.now, command.reason);
      break;
  }
  return {
    state: { ...state, gameId: input.gameId, snapshot: input.snapshot },
    appendedEvents: state.events.slice(input.events.length),
  };
}
export function inspectSecretOverlord(state: SecretOverlordState): RuntimeInspection {
  const status =
    state.phase.kind === 'finished'
      ? 'finished'
      : state.phase.kind === 'interrupted'
        ? 'interrupted'
        : 'active';
  const chat = state.events.findLast((event) => event.type === 'chat' && event.seat !== undefined);
  return {
    status,
    phaseId: state.phase.id,
    phase: state.phase,
    timing: state.timing,
    lastChat: chat && chat.seat !== undefined ? { seat: chat.seat, at: chat.at } : null,
    nextDeadline: nextDeadline(state),
    pendingSeats: pendingSeats(state),
    participants: state.seats,
    discussion: ['nomination-discussion', 'government-discussion', 'executive-discussion'].includes(
      state.phase.kind,
    )
      ? {
          seats: state.seats.filter((seat) => seat.alive).map((seat) => seat.number),
          anchor: state.coordinator,
          key: state.phase.id,
        }
      : null,
  };
}
export function settleSecretOverlord(state: SecretOverlordState) {
  if (!['finished', 'interrupted'].includes(state.phase.kind)) return null;
  const changes = ratingChanges(state);
  const participants: SettlementParticipant[] = state.seats.map((seat) => {
    const change = changes.find((entry) => entry.agentId === seat.entrant.agentId);
    return {
      seat: seat.number,
      entrant: seat.entrant,
      forfeited: seat.forfeited,
      won: change?.won ?? null,
      ratingBefore: seat.entrant.rating,
      ratingDelta: state.mode === 'ranked' ? (change?.delta ?? 0) : 0,
      placement: state.mode === 'ranked' && (change?.placement ?? false),
    };
  });
  return {
    gameId: state.gameId,
    ratingPoolId: state.snapshot.ratingPoolId,
    ratingVersion: state.snapshot.ratingVersion,
    mode: state.mode,
    result: state.winner
      ? { kind: 'team' as const, team: state.winner, reason: state.winReason ?? '' }
      : null,
    participants,
  };
}
export const observeSecretOverlord = observe;
