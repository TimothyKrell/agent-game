import type { Card, Policy, Power, Role, Team } from '../game/types';
import type {
  Act1Result2,
  AuthorizedEvent2,
  CapEvidence2,
  Capability,
  IndividualResult2,
  InfluenceCard,
  Observation2,
  PendingAction2,
  ReplayFrame2,
} from '../shared/succession';
import type { StoryRule } from './succession-story-rules';

export interface StoryScope {
  matchId: string;
  visibilityEpoch: string;
}

/** Cursor is entitlement-local; only matchId + eventKey is an enduring reading anchor. */
export type StorySource = StoryScope &
  ({ kind: 'event'; cursor: number; eventKey: string } | { kind: 'checkpoint' | 'current'; cursor: number });

export type StoryValue<T> =
  | { status: 'known'; value: T; sources: readonly StorySource[] }
  | { status: 'derived'; value: T; sources: readonly StorySource[]; rule: string }
  | {
      status: 'unavailable';
      reason:
        | 'missing-baseline'
        | 'history-gap'
        | 'not-recorded'
        | 'not-disclosed'
        | 'not-applicable'
        | 'not-yet-resolved'
        | 'cards-changed';
    };

export interface StoryEntrant {
  agentId: string;
  ownerId: string | null;
  name: string;
  originalHouse: boolean;
}

export interface StoryController {
  house: boolean;
  generation: StoryValue<number>;
  forfeited: boolean;
  /** The wire records house authority, not a replacement competitor/profile identity. */
  identity: StoryValue<string>;
}

export interface StoryHand {
  visibility: 'private' | 'archive';
  cards: readonly InfluenceCard[];
}

export interface StorySeat {
  seat: number;
  entrant: StoryValue<StoryEntrant>;
  controller: StoryValue<StoryController>;
  alive: StoryValue<boolean>;
  coins: StoryValue<number>;
  influence: StoryValue<number>;
  revealed: StoryValue<readonly Capability[]>;
  /** A supplied role is historical/private evidence, never proof of a later capability claim. */
  role: StoryValue<{ role: Role; visibility: 'public' | 'private' | 'archive' }>;
  hand: StoryValue<StoryHand>;
  exchangeDraw: StoryValue<StoryHand>;
}

export interface StoryChange {
  seat: number;
  before: StorySeat;
  after: StorySeat;
}

export interface StoryAction {
  actor: number;
  action: PendingAction2['action'];
  target: number | null;
  claim: Capability | null;
  paid: number;
  declaration: StoryValue<StorySource>;
}

export type StoryResolution = 'applied' | 'blocked' | 'cancelled';

/** Typed mechanical payloads. Source text is retained separately, verbatim, on every row. */
export type StoryFact =
  | { kind: 'speech' }
  | { kind: 'nomination'; target: number }
  | { kind: 'ballot'; approve: boolean }
  | {
      kind: 'election';
      approved: boolean;
      votes: Readonly<Record<string, boolean>>;
      coordinator: number;
      executor: number;
    }
  | { kind: 'policy'; policy: Policy; chaos: boolean; safeguards: number; overrides: number }
  | { kind: 'tracker'; tracker: number }
  | { kind: 'investigation' | 'special-election' | 'execution'; target: number }
  | { kind: 'investigation-result'; target: number; team: Team }
  | { kind: 'cleared-executor' | 'veto-request' }
  | { kind: 'veto-response'; approved: boolean }
  | { kind: 'act-ended'; team: Team; reason: string }
  | {
      kind: 'act-started';
      team: Team;
      reason: string;
      roles: readonly Role[];
      returnedSeats: readonly number[];
      bonuses: readonly (0 | 1)[];
      firstSeat: number;
    }
  | {
      kind: 'declaration';
      actor: number;
      action: { type: PendingAction2['action']; target?: number };
      claim: Capability | null;
      payment: number;
    }
  | {
      kind: 'challenge-resolved';
      claimant: number;
      capability: Capability;
      block: boolean;
      responses: Readonly<Record<string, 'challenge' | 'pass'>>;
      challenger: number | null;
      outcome: 'unchallenged' | 'proved' | 'disproved';
    }
  | { kind: 'proof' | 'block'; capability: Capability }
  | { kind: 'influence-lost'; capability: Capability; eliminated: boolean }
  | { kind: 'coins'; coins: number }
  | { kind: 'exchange-completed' }
  | { kind: 'turn-ended'; round: number; slot: number }
  | { kind: 'finished'; winner: number; capEvidence: CapEvidence2 | null }
  | { kind: 'takeover'; agentId: string; generation?: number }
  | { kind: 'interrupted' }
  | {
      kind: 'phase';
      phase: string;
      activeSeat?: number;
      coordinator?: number;
      executor?: number | null;
      slot?: number;
    }
  | {
      kind: 'private-cards';
      operation: 'capability-deal' | 'hand-updated' | 'exchange-draw';
      cards: readonly InfluenceCard[];
    }
  | {
      kind: 'private-policies';
      operation: 'draw' | 'received-policies' | 'discard' | 'executor-discard';
      cards: readonly Card[];
      discarded: readonly Card[];
    }
  | { kind: 'role'; role: Role }
  | { kind: 'rogue-knowledge'; rogues: readonly number[]; overlord: number }
  | { kind: 'reaction'; choice: 'challenge' | 'pass' }
  | { kind: 'audit'; data: AuthorizedEvent2['data'] }
  | { kind: 'system'; type: 'started' | 'commitment' | 'grace' | 'recovered' | 'reshuffle' }
  | { kind: 'unavailable'; type: string; reason: 'unsupported-event' | 'incomplete-payload' };

export interface StoryRow {
  /** Stable across terminal stream renumbering. Use source to address the current epoch. */
  key: string;
  source: StorySource & { kind: 'event' };
  position: { act: 1 | 2; round: number; order: number; at: number };
  text: string;
  fact: StoryFact;
  visibility: 'public' | 'private' | 'archive' | 'unavailable';
  actor: StoryValue<number | null>;
  target: StoryValue<number | null>;
  turnOwner: StoryValue<number | null>;
  executivePower: StoryValue<Power | null>;
  action: StoryValue<StoryAction>;
  resolution: StoryValue<StoryResolution>;
  lossReason: StoryValue<'failed-claim' | 'failed-challenge' | 'action-effect'>;
  affected: readonly StoryChange[];
  /** Present on execution/loss, captured immediately after this event, never a final roster. */
  remaining: StoryValue<readonly StorySeat[]>;
  rules: readonly StoryRule[];
}

export interface StoryReturn {
  seat: number;
  entrant: StoryValue<StoryEntrant>;
  role: Role;
  returnedAfterExecution: boolean;
  bonus: 0 | 1;
  coins: 2 | 3;
  influence: 2;
}

export interface StoryOutcome {
  result: IndividualResult2;
  winner: StorySeat;
  /** Mechanical champion and original entrant credit are separate facts. */
  credit: StoryValue<'win' | 'forfeit-loss'>;
}

export interface StoryChapters {
  act1: StoryValue<{ team: Team; reason: string }>;
  finalTracks: StoryValue<Act1Result2['finalTracks']>;
  returns: StoryValue<readonly StoryReturn[]>;
  outcome: StoryValue<StoryOutcome>;
  interruption: StoryValue<string>;
}

export interface StoryWindow {
  scope: StoryScope;
  /** Exclusive start / frozen inclusive requested end, not inferred from the tail. */
  after: number;
  through: number;
  events: readonly AuthorizedEvent2[];
  /** Exact state at `after`, from this same audience/epoch. Never the final frame. */
  baseline?: ReplayFrame2 | Observation2;
  /** Optional authoritative chapter/outcome source. Never used to reconstruct earlier rows. */
  current?: Observation2;
}

export interface StoryModel {
  scope: StoryScope;
  after: number;
  through: number;
  delivered: number;
  rows: readonly StoryRow[];
  chapters: StoryChapters;
  end: readonly StorySeat[];
  issues: readonly {
    kind: 'missing-baseline' | 'history-gap' | 'incomplete-payload';
    after: number;
    through: number;
  }[];
}
