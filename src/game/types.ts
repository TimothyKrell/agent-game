export type Team = 'cooperative' | 'rogue';

export type Role = Team | 'overlord';

export type Policy = 'safeguard' | 'override';

export type Power = 'investigate' | 'special-election' | 'execute';

export type PhaseKind =
  | 'nomination-discussion'
  | 'nomination'
  | 'government-discussion'
  | 'voting'
  | 'coordinator-discard'
  | 'executor-policy'
  | 'veto-response'
  | 'executive-discussion'
  | 'executive-action'
  | 'finished'
  | 'interrupted';

export interface Entrant {
  agentId: string;
  ownerId: string | null;
  name: string;
  house: boolean;
  rating: number;
  persona?: string;
}

export interface Seat {
  number: number;
  entrant: Entrant;
  role: Role;
  alive: boolean;
  forfeited: boolean;
  generation: number;
  houseProfile: string | null;
  lastChatAt: number | null;
  /** Present only for matches whose snapshot enables recoverable house coverage. */
  recoveryCount?: number;
  maxRecoveries?: number;
}

export type Card = { id: string; policy: Policy };

type JsonScalar = string | number | boolean | null;

export type JsonValue = JsonScalar | JsonScalar[] | Record<string, JsonScalar> | Record<string, JsonScalar>[];

export interface Timing {
  nomination: number;
  debate: number;
  executive: number;
  action: number;
  grace: number;
  chatCooldown: number;
}

export interface Phase {
  id: string;
  kind: PhaseKind;
  startedAt: number;
  deadline: number | null;
  graceAnnounced: boolean;
  replacements: Record<string, number>;
}

export interface GameEvent {
  id: number;
  at: number;
  round: number;
  type: string;
  text: string;
  visibility: 'public' | number;
  seat?: number;
  data?: Record<string, JsonValue>;
}

export interface MatchState {
  id: string;
  rulesVersion: 'secret-overlord-1';
  createdAt: number;
  finishedAt: number | null;
  mode: 'preview' | 'ranked' | 'evaluation';
  houseModel?: { provider: string; model: string; policyVersion: string };
  timing: Timing;
  seats: Seat[];
  round: number;
  phase: Phase;
  coordinator: number;
  executor: number | null;
  lastGovernment: { coordinator: number; executor: number } | null;
  specialResumeAfter: number | null;
  votes: Record<string, boolean>;
  lastVotes: Record<string, boolean> | null;
  electionTracker: number;
  safeguards: number;
  overrides: number;
  deck: Card[];
  discards: Card[];
  hand: Card[];
  vetoRejected: boolean;
  power: Power | null;
  investigated: number[];
  winner: Team | null;
  winReason: string | null;
  events: GameEvent[];
}

export type GameAction =
  | { type: 'chat'; text: string; to?: number[]; replyTo?: { eventKey: string; seat: number } }
  | { type: 'nominate'; target: number }
  | { type: 'vote'; approve: boolean }
  | { type: 'discard'; cardId: string }
  | { type: 'enact'; cardId: string }
  | { type: 'request-veto' }
  | { type: 'veto'; approve: boolean }
  | { type: 'investigate'; target: number }
  | { type: 'special-election'; target: number }
  | { type: 'execute'; target: number };

export interface ActionRequest {
  actionId: string;
  phaseId: string;
  decisionId?: string;
  action: GameAction;
}

export interface LegalAction {
  action: GameAction;
  label: string;
}

export interface Decision {
  id: string;
  deadline: number;
  graceUntil: number;
  actions: LegalAction[];
}

export interface PublicSeat {
  number: number;
  agentId: string;
  ownerId: string | null;
  name: string;
  house: boolean;
  originalHouse: boolean;
  alive: boolean;
  forfeited: boolean;
  rating: number;
  role?: Role;
  vote?: boolean;
  control?: 'entrant' | 'temporary-house' | 'permanent-house' | 'house-entrant';
  recoveryCount?: number;
  recoveryLimit?: number;
  recoverable?: boolean;
}

export function seatRecovery(seat: Seat) {
  if (seat.maxRecoveries === undefined) return {};
  const recoveryCount = seat.recoveryCount ?? 0;
  const maxRecoveries = seat.maxRecoveries;

  const control: PublicSeat['control'] = seat.entrant.house
    ? 'house-entrant'
    : seat.houseProfile === null
      ? 'entrant'
      : seat.forfeited
        ? 'permanent-house'
        : 'temporary-house';

  return {
    control,
    recoveryCount,
    recoveryLimit: maxRecoveries,
    recoverable: control === 'temporary-house' && recoveryCount <= maxRecoveries,
  };
}

export interface Observation {
  protocolVersion: '1';
  matchId: string;
  rulesVersion: string;
  mode: MatchState['mode'];
  createdAt: number;
  finishedAt: number | null;
  status: 'active' | 'finished' | 'interrupted';
  phase: { id: string; kind: PhaseKind; deadline: number | null; graceUntil: number | null };
  round: number;
  coordinator: number;
  executor: number | null;
  power: Power | null;
  seats: PublicSeat[];
  tracks: {
    safeguards: number;
    overrides: number;
    electionTracker: number;
    drawCount: number;
    discardCount: number;
    vetoUnlocked: boolean;
  };
  lastGovernment: MatchState['lastGovernment'];
  winner: Team | null;
  winReason: string | null;
  chat: { open: boolean; maxCharacters: number; cooldownMs: number; nextSpeakAt: number | null };
  you: {
    seat: number;
    agentId: string;
    alive: boolean;
    forfeited: boolean;
    generation: number;
    control?: PublicSeat['control'];
    recoveryCount?: number;
    recoveryLimit?: number;
    recoverable?: boolean;
    canReclaim?: boolean;
  } | null;
  private: { role: Role; knownRogues: number[]; knownOverlord: number | null; hand: Card[] } | null;
  decision: Decision | null;
  cursor: number;
  reset: boolean;
  events: Omit<GameEvent, 'visibility'>[];
  reveal?: { deck: Card[]; discards: Card[]; hand: Card[] };
}

export const DEFAULT_TIMING: Timing = {
  nomination: 20_000,
  debate: 30_000,
  executive: 15_000,
  action: 30_000,
  grace: 30_000,
  chatCooldown: 5_000,
};

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function teamOf(role: Role): Team {
  return role === 'cooperative' ? 'cooperative' : 'rogue';
}

export function terminal(state: MatchState): boolean {
  return state.phase.kind === 'finished' || state.phase.kind === 'interrupted';
}

export function chatOpen(state: MatchState): boolean {
  return (
    !terminal(state) &&
    !['coordinator-discard', 'executor-policy', 'veto-response'].includes(state.phase.kind)
  );
}
