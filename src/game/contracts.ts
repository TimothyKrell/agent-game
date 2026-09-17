import type { Timing, Entrant } from './types';

export type GameId = 'secret-overlord' | 'succession' | 'coding-finale';

export type MatchMode = 'preview' | 'ranked' | 'evaluation';

export interface GameDescriptor {
  gameId: GameId;
  displayName: string;
  rulesVersion: 'secret-overlord-1' | 'succession-1' | 'coding-finale-1';
  ratingPoolId: 'secret-overlord-1' | 'succession-1' | 'coding-finale-1';
  ratingVersion: 'team-elo-1' | 'winner-softmax-1';
  protocolVersion: '1' | '2' | '3';
  playerCount: 10;
  rulesUrl: string;
  ratingUrl: string;
  timing: Timing;
  housePolicyVersion: string;
  controllerRecovery?: 'recoverable-house-1';
}

export interface MatchSnapshot extends GameDescriptor {
  mode: MatchMode;
  houseModel: { provider: string; model: string; policyVersion: string };
}

export interface SettlementParticipant {
  seat: number;
  entrant: Entrant;
  forfeited: boolean;
  won: boolean | null;
  ratingBefore: number;
  ratingDelta: number;
  placement: boolean;
}

export interface RuntimeInspection {
  status: 'active' | 'finished' | 'interrupted';
  phaseId: string;
  nextDeadline: number | null;
  phase: {
    id: string;
    kind: string;
    startedAt: number;
    deadline: number | null;
    graceAnnounced: boolean;
    replacements: Record<string, number>;
  };
  timing: Timing;
  lastChat: { seat: number; at: number } | null;
  pendingSeats: number[];
  discussion: { seats: number[]; anchor: number; key: string } | null;
  participants: {
    number: number;
    entrant: Entrant;
    alive: boolean;
    forfeited: boolean;
    generation: number;
    houseProfile: string | null;
  }[];
}
