import type { Card, GameAction, Observation, PublicSeat, Role, Team } from '../game/types';

export type Capability = 'treasurer' | 'thief' | 'assassin' | 'envoy' | 'guard';
export interface InfluenceCard { id: string; capability: Capability }
export type Action2 = GameAction
  | { type: 'income' | 'tax' | 'exchange' | 'challenge' | 'pass' }
  | { type: 'steal' | 'assassinate' | 'coup'; target: number }
  | { type: 'block'; capability: Capability }
  | { type: 'lose-influence'; cardId: string }
  | { type: 'return-influence'; cardIds: [string, string] };
export interface ActionRequest2 {
  gameId: 'succession'; actionId: string; phaseId: string; decisionId?: string; action: Action2;
}
export interface HistoryMetadata2 { visibilityEpoch: string; streamHead: number }
export interface Act1Result2 { team: Team; reason: string; roles: Role[]; returnedSeats: number[]; bonuses: number[] }
export interface CapEvidence2 {
  scores: { seat: number; influence: number; coins: number; priority: number }[];
  decisive: 'influence' | 'coins' | 'priority';
}
export interface IndividualResult2 {
  kind: 'individual'; winnerSeat: number; reason: 'last-survivor' | 'round-cap';
  act1: { team: Team; reason: string }; tieBreak: CapEvidence2 | null;
}
export interface PendingAction2 {
  actor: number; action: 'income' | 'tax' | 'steal' | 'assassinate' | 'exchange' | 'coup';
  target: number | null; claim: Capability | null; paid: number;
  block: { seat: number; capability: Capability } | null;
}
export type Board2 =
  | { act: 1; coordinator: number; executor: number | null; power: Observation['power']; tracks: Observation['tracks']; lastGovernment: Observation['lastGovernment'] }
  | { act: 2; firstSeat: number; activeSeat: number; tableRound: number; slot: number; roundCap: 12; courtCount: number; pending: PendingAction2 | null };
export interface Observation2 {
  protocolVersion: '2'; gameId: 'succession'; matchId: string; rulesVersion: 'succession-1';
  mode: 'preview' | 'ranked' | 'evaluation'; createdAt: number; finishedAt: number | null;
  status: 'active' | 'finished' | 'interrupted'; act: 1 | 2; round: number;
  phase: { id: string; kind: string; deadline: number | null; graceUntil: number | null };
  seats: (PublicSeat & { generation: number; coins?: number; influence?: number; revealed?: Capability[] })[];
  board: Board2; act1Result: Act1Result2 | null;
  chat: Observation['chat']; you: Observation['you'];
  private: { act: 1; role: Role; knownRogues: number[]; knownOverlord: number | null; hand: Card[] }
    | { act: 2; hand: InfluenceCard[]; exchangePool: InfluenceCard[]; reaction: 'challenge' | 'pass' | null }
    | null;
  decision: { id: string; deadline: number; graceUntil: number; actions: { action: Action2; label: string }[] } | null;
  result: IndividualResult2 | null; interruptionReason: string | null;
  commitment: { digest: string; reveal: { saltBase64url: string; priority: number[] } | null };
  history: HistoryMetadata2;
}
export interface AuthorizedEvent2 {
  id: number; eventKey: string; at: number; act: 1 | 2; round: number;
  type: string; text: string; seat?: number;
  data?: Record<string, unknown>;
}
export interface HistoryPage2 extends HistoryMetadata2 {
  protocolVersion: '2'; gameId: 'succession'; matchId: string;
  after: number; through: number; cursor: number; events: AuthorizedEvent2[]; hasMore: boolean; reset: boolean;
}
