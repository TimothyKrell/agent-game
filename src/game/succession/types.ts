import type { MatchState, Seat, Phase, Entrant } from '../types';
import type { MatchSnapshot } from '../contracts';
import type {
  ActionRequest2,
  Act1Result2,
  IndividualResult2,
  AuthorizedEvent2,
  PhaseKind2,
} from '../../shared/succession';
import type { Act2Board } from './act2';

export type Act1Board = Omit<MatchState, 'events' | 'seats'>;
export interface SuccessionState {
  storageVersion: 1;
  gameId: 'succession';
  rulesVersion: 'succession-1';
  id: string;
  createdAt: number;
  finishedAt: number | null;
  snapshot: MatchSnapshot;
  status: 'active' | 'finished' | 'interrupted';
  seats: Seat[];
  stage: { act: 1; board: Act1Board } | { act: 2; board: Act2Board; archive: Act1Board };
  phase: Omit<Phase, 'kind'> & { kind: PhaseKind2 };
  act1Result: Act1Result2 | null;
  result: IndividualResult2 | null;
  interruptionReason: string | null;
  commitment: { digest: string; saltBase64url: string; priority: number[] };
  lastChat: { seat: number; at: number } | null;
}
export interface RandomContext {
  random(size: number): number;
  id(): string;
}
export type RealizedRandom = { kind: 'index'; size: number; value: number } | { kind: 'id'; value: string };
export type SuccessionCommand =
  | { type: 'act'; seat: number; generation: number; request: ActionRequest2; now: number }
  | { type: 'advance'; now: number }
  | { type: 'recover'; now: number }
  | { type: 'interrupt'; now: number; reason: string };
export type SuccessionEvent = Omit<AuthorizedEvent2, 'id'> & { visibility: 'public' | 'archive' | number };
export type CanonicalEvent2 = SuccessionEvent;
export interface ReplayFact {
  command: SuccessionCommand | { type: 'chat'; seat: number; now: number };
  randomness: RealizedRandom[];
}
export interface Evolution {
  state: SuccessionState;
  appendedEvents: SuccessionEvent[];
  replay: ReplayFact | null;
  replayFrames: { eventKey: string; state: SuccessionState }[];
}
export interface CreateSuccessionOptions {
  snapshot?: MatchSnapshot;
  random?: RandomContext;
  salt?: Uint8Array;
}
export type SuccessionEntrant = Entrant;
