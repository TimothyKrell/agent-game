import { Schema, Struct } from 'effect';
import type { Card, GameAction, Observation, PublicSeat, Role, Team } from '../game/types';

export type Capability = 'treasurer' | 'thief' | 'assassin' | 'envoy' | 'guard';

export interface InfluenceCard {
  id: string;
  capability: Capability;
}

export type Action2 =
  | GameAction
  | { type: 'income' | 'tax' | 'exchange' | 'challenge' | 'pass' }
  | { type: 'steal' | 'assassinate' | 'coup'; target: number }
  | { type: 'block'; capability: Capability }
  | { type: 'lose-influence'; cardId: string }
  | { type: 'return-influence'; cardIds: [string, string] };

export interface ActionRequest2 {
  gameId: 'succession';
  actionId: string;
  phaseId: string;
  decisionId?: string;
  action: Action2;
}

export interface HistoryMetadata2 {
  visibilityEpoch: string;
  streamHead: number;
}

export type PhaseKind2 =
  | import('../game/types').PhaseKind
  | 'act-2:discussion'
  | 'act-2:action'
  | 'act-2:challenge'
  | 'act-2:block'
  | 'act-2:loss'
  | 'act-2:exchange'
  | 'act-2:finished';

export interface Act1Result2 {
  team: Team;
  reason: string;
  roles: Role[];
  returnedSeats: number[];
  bonuses: (0 | 1)[];
  finalTracks: Observation['tracks'];
}

export interface CapEvidence2 {
  scores: { seat: number; influence: number; coins: number; priority: number }[];
  decisive: 'influence' | 'coins' | 'priority';
}

export interface IndividualResult2 {
  kind: 'individual';
  winnerSeat: number;
  reason: 'last-survivor' | 'round-cap';
  act1: { team: Team; reason: string };
  tieBreak: CapEvidence2 | null;
}

export interface PendingAction2 {
  actor: number;
  action: 'income' | 'tax' | 'steal' | 'assassinate' | 'exchange' | 'coup';
  target: number | null;
  claim: Capability | null;
  paid: number;
  block: { seat: number; capability: Capability } | null;
}

export type Board2 =
  | {
      act: 1;
      coordinator: number;
      executor: number | null;
      power: Observation['power'];
      tracks: Observation['tracks'];
      lastGovernment: Observation['lastGovernment'];
    }
  | {
      act: 2;
      firstSeat: number;
      activeSeat: number;
      tableRound: number;
      slot: number;
      roundCap: 12;
      courtCount: number;
      pending: PendingAction2 | null;
    };

export interface Observation2 {
  protocolVersion: '2';
  gameId: 'succession';
  matchId: string;
  rulesVersion: 'succession-1';
  mode: 'preview' | 'ranked' | 'evaluation';
  createdAt: number;
  finishedAt: number | null;
  status: 'active' | 'finished' | 'interrupted';
  act: 1 | 2;
  round: number;
  phase: { id: string; kind: PhaseKind2; deadline: number | null; graceUntil: number | null };
  seats: (PublicSeat & { generation: number; coins?: number; influence?: number; revealed?: Capability[] })[];
  board: Board2;
  act1Result: Act1Result2 | null;
  chat: Observation['chat'];
  you: Observation['you'];
  private:
    | { act: 1; role: Role; knownRogues: number[]; knownOverlord: number | null; hand: Card[] }
    | { act: 2; hand: InfluenceCard[]; exchangePool: InfluenceCard[]; reaction: 'challenge' | 'pass' | null }
    | null;
  decision: {
    id: string;
    deadline: number;
    graceUntil: number;
    actions: { action: Action2; label: string }[];
  } | null;
  result: IndividualResult2 | null;
  interruptionReason: string | null;
  commitment: { digest: string; reveal: { saltBase64url: string; priority: number[] } | null };
  history: HistoryMetadata2;
}

export interface AuthorizedEvent2 {
  id: number;
  eventKey: string;
  at: number;
  act: 1 | 2;
  round: number;
  type: string;
  text: string;
  seat?: number;
  data?:
    | Record<string, Schema.Json>
    | { type: 'finished'; winner: number; capEvidence: CapEvidence2 | null }
    | AuditFact2;
}

export type PhysicalInfluence2 = InfluenceCard & { physicalId: string };

export type RealizedOutcome2 = { kind: 'index'; size: number; value: number } | { kind: 'id'; value: string };

export type AuditFact2 =
  | { kind: 'initial'; policies: Card[]; roles: Role[]; priority: number[]; saltBase64url: string }
  | { kind: 'random-outcomes'; outcomes: RealizedOutcome2[] }
  | { kind: 'policy-zones'; deck: Card[]; discards: Card[]; hand: Card[] }
  | { kind: 'court-order'; cards: PhysicalInfluence2[] }
  | { kind: 'capability-zones'; seat: number; hand: PhysicalInfluence2[]; revealed: PhysicalInfluence2[] }
  | { kind: 'exchange-buffer'; seat: number; cards: PhysicalInfluence2[] };

// Protocol 2 is self-contained: importing the protocol-1 API here would create a cycle.
const Integer = Schema.Number.check(Schema.makeFilter((value) => Number.isSafeInteger(value) && value >= 0));

const Seat = Integer.check(Schema.isBetween({ minimum: 0, maximum: 9 }));

const CapabilitySchema = Schema.Literals(['treasurer', 'thief', 'assassin', 'envoy', 'guard']);

const RoleSchema = Schema.Literals(['cooperative', 'rogue', 'overlord']);

const TeamSchema = Schema.Literals(['cooperative', 'rogue']);

const ReactionSchema = Schema.Literals(['challenge', 'pass']);

const InfluenceCardSchema = Schema.Struct({ id: Schema.String, capability: CapabilitySchema });

const CardSchema = Schema.Struct({ id: Schema.String, policy: Schema.Literals(['safeguard', 'override']) });

const bytes = (value: Observation2 | AuthorizedEvent2 | HistoryPage2 | ReplayFrame2): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const Act1ActionSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('chat'),
    text: Schema.String.check(Schema.makeFilter((text) => [...text].length <= 1000)),
  }),
  Schema.Struct({
    type: Schema.Literals(['nominate', 'investigate', 'special-election', 'execute']),
    target: Seat,
  }),
  Schema.Struct({ type: Schema.Literals(['vote', 'veto']), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literals(['discard', 'enact']), cardId: Schema.String }),
  Schema.Struct({ type: Schema.Literal('request-veto') }),
]);

const Act2ActionSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literals(['income', 'tax', 'exchange', 'challenge', 'pass']) }),
  Schema.Struct({ type: Schema.Literals(['steal', 'assassinate', 'coup']), target: Seat }),
  Schema.Struct({
    type: Schema.Literal('block'),
    capability: CapabilitySchema.check(
      Schema.makeFilter((capability) => ['thief', 'envoy', 'guard'].includes(capability)),
    ),
  }),
  Schema.Struct({ type: Schema.Literal('lose-influence'), cardId: Schema.String }),
  Schema.Struct({
    type: Schema.Literal('return-influence'),
    cardIds: Schema.mutable(Schema.Tuple([Schema.String, Schema.String])).check(
      Schema.makeFilter(([a, b]) => a !== b),
    ),
  }),
]);

export const Action2Schema = Schema.Union([
  Act1ActionSchema,
  Act2ActionSchema,
]) satisfies Schema.Codec<Action2>;

export const ActionRequest2Schema = Schema.Struct({
  gameId: Schema.Literal('succession'),
  actionId: Schema.String,
  phaseId: Schema.String,
  decisionId: Schema.optional(Schema.String),
  action: Action2Schema,
}) satisfies Schema.Codec<ActionRequest2>;

const Act1ResultSchema = Schema.Struct({
  team: TeamSchema,
  reason: Schema.String,
  roles: Schema.mutable(Schema.Array(RoleSchema)).check(Schema.makeFilter((roles) => roles.length === 10)),
  returnedSeats: Schema.mutable(Schema.Array(Seat)).check(
    Schema.makeFilter((seats) => new Set(seats).size === seats.length),
  ),
  bonuses: Schema.mutable(Schema.Array(Schema.Literals([0, 1]))).check(
    Schema.makeFilter((bonuses) => bonuses.length === 10),
  ),
  finalTracks: Schema.Struct({
    safeguards: Integer,
    overrides: Integer,
    electionTracker: Integer,
    drawCount: Integer,
    discardCount: Integer,
    vetoUnlocked: Schema.Boolean,
  }),
});

const CapEvidenceSchema = Schema.Struct({
  scores: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        seat: Seat,
        influence: Integer.check(Schema.isBetween({ minimum: 1, maximum: 2 })),
        coins: Integer,
        priority: Seat,
      }),
    ),
  ),
  decisive: Schema.Literals(['influence', 'coins', 'priority']),
});

const ResultSchema = Schema.Struct({
  kind: Schema.Literal('individual'),
  winnerSeat: Seat,
  reason: Schema.Literals(['last-survivor', 'round-cap']),
  act1: Schema.Struct({ team: TeamSchema, reason: Schema.String }),
  tieBreak: Schema.NullOr(CapEvidenceSchema),
}).check(Schema.makeFilter((result) => (result.reason === 'round-cap') === (result.tieBreak !== null)));

const PendingSchema = Schema.Struct({
  actor: Seat,
  action: Schema.Literals(['income', 'tax', 'steal', 'assassinate', 'exchange', 'coup']),
  target: Schema.NullOr(Seat),
  claim: Schema.NullOr(CapabilitySchema),
  paid: Integer,
  block: Schema.NullOr(
    Schema.Struct({
      seat: Seat,
      capability: CapabilitySchema.check(
        Schema.makeFilter((capability) => ['thief', 'envoy', 'guard'].includes(capability)),
      ),
    }),
  ),
}).check(
  Schema.makeFilter((pending) => {
    const claims = {
      income: null,
      tax: 'treasurer',
      steal: 'thief',
      assassinate: 'assassin',
      exchange: 'envoy',
      coup: null,
    };

    const targeted = ['steal', 'assassinate', 'coup'].includes(pending.action);

    const costs = { income: 0, tax: 0, steal: 0, assassinate: 3, exchange: 0, coup: 7 };

    return (
      pending.claim === claims[pending.action] &&
      targeted === (pending.target !== null) &&
      pending.target !== pending.actor &&
      pending.paid === costs[pending.action] &&
      (pending.block === null ||
        (pending.block.seat === pending.target &&
          (pending.action === 'steal'
            ? ['thief', 'envoy'].includes(pending.block.capability)
            : pending.action === 'assassinate' && pending.block.capability === 'guard')))
    );
  }),
);

const BoardSchema = Schema.Union([
  Schema.Struct({
    act: Schema.Literal(1),
    coordinator: Seat,
    executor: Schema.NullOr(Seat),
    power: Schema.NullOr(Schema.Literals(['investigate', 'special-election', 'execute'])),
    tracks: Schema.Struct({
      safeguards: Integer.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
      overrides: Integer.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
      electionTracker: Integer.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
      drawCount: Integer,
      discardCount: Integer,
      vetoUnlocked: Schema.Boolean,
    }),
    lastGovernment: Schema.NullOr(Schema.Struct({ coordinator: Seat, executor: Seat })),
  }),
  Schema.Struct({
    act: Schema.Literal(2),
    firstSeat: Seat,
    activeSeat: Seat,
    tableRound: Integer.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
    slot: Seat,
    roundCap: Schema.Literal(12),
    courtCount: Integer.check(Schema.isBetween({ minimum: 0, maximum: 25 })),
    pending: Schema.NullOr(PendingSchema),
  }),
]);

const act1Phases = [
  'nomination-discussion',
  'nomination',
  'government-discussion',
  'voting',
  'coordinator-discard',
  'executor-policy',
  'veto-response',
  'executive-discussion',
  'executive-action',
];

const act2Phases = [
  'act-2:discussion',
  'act-2:action',
  'act-2:challenge',
  'act-2:block',
  'act-2:loss',
  'act-2:exchange',
];

export const PhaseKind2Schema = Schema.Literals([
  'nomination-discussion',
  'nomination',
  'government-discussion',
  'voting',
  'coordinator-discard',
  'executor-policy',
  'veto-response',
  'executive-discussion',
  'executive-action',
  'finished',
  'interrupted',
  'act-2:discussion',
  'act-2:action',
  'act-2:challenge',
  'act-2:block',
  'act-2:loss',
  'act-2:exchange',
  'act-2:finished',
]);

export const Observation2Schema = Schema.Struct({
  protocolVersion: Schema.Literal('2'),
  gameId: Schema.Literal('succession'),
  matchId: Schema.String,
  rulesVersion: Schema.Literal('succession-1'),
  mode: Schema.Literals(['preview', 'ranked', 'evaluation']),
  createdAt: Integer,
  finishedAt: Schema.NullOr(Integer),
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  act: Schema.Literals([1, 2]),
  round: Integer,
  phase: Schema.Struct({
    id: Schema.String,
    kind: PhaseKind2Schema,
    deadline: Schema.NullOr(Integer),
    graceUntil: Schema.NullOr(Integer),
  }),
  seats: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        number: Seat,
        agentId: Schema.String,
        ownerId: Schema.NullOr(Schema.String),
        name: Schema.String,
        house: Schema.Boolean,
        originalHouse: Schema.Boolean,
        alive: Schema.Boolean,
        forfeited: Schema.Boolean,
        rating: Schema.Number.check(Schema.isFinite()),
        role: Schema.optional(RoleSchema),
        vote: Schema.optional(Schema.Boolean),
        generation: Integer,
        coins: Schema.optional(Integer),
        influence: Schema.optional(Integer.check(Schema.isBetween({ minimum: 0, maximum: 2 }))),
        revealed: Schema.optional(
          Schema.mutable(Schema.Array(CapabilitySchema)).check(Schema.isMaxLength(2)),
        ),
      }),
    ),
  ).check(
    Schema.makeFilter(
      (seats) => seats.length === 10 && new Set(seats.map((seat) => seat.number)).size === 10,
    ),
  ),
  board: BoardSchema,
  act1Result: Schema.NullOr(Act1ResultSchema),
  chat: Schema.Struct({
    open: Schema.Boolean,
    maxCharacters: Integer,
    cooldownMs: Integer,
    nextSpeakAt: Schema.NullOr(Integer),
  }),
  you: Schema.NullOr(
    Schema.Struct({
      seat: Seat,
      agentId: Schema.String,
      alive: Schema.Boolean,
      forfeited: Schema.Boolean,
      generation: Integer,
    }),
  ),
  private: Schema.NullOr(
    Schema.Union([
      Schema.Struct({
        act: Schema.Literal(1),
        role: RoleSchema,
        knownRogues: Schema.mutable(Schema.Array(Seat)),
        knownOverlord: Schema.NullOr(Seat),
        hand: Schema.mutable(Schema.Array(CardSchema)).check(Schema.isMaxLength(3)),
      }),
      Schema.Struct({
        act: Schema.Literal(2),
        hand: Schema.mutable(Schema.Array(InfluenceCardSchema)).check(Schema.isMaxLength(2)),
        exchangePool: Schema.mutable(Schema.Array(InfluenceCardSchema)).check(Schema.isMaxLength(4)),
        reaction: Schema.NullOr(ReactionSchema),
      }),
    ]),
  ),
  decision: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      deadline: Integer,
      graceUntil: Integer,
      actions: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            action: Action2Schema,
            label: Schema.String.check(
              Schema.makeFilter((label) => new TextEncoder().encode(label).byteLength <= 80),
            ),
          }),
        ),
      ).check(Schema.isMaxLength(32)),
    }),
  ),
  result: Schema.NullOr(ResultSchema),
  interruptionReason: Schema.NullOr(Schema.String),
  commitment: Schema.Struct({
    digest: Schema.String,
    reveal: Schema.NullOr(
      Schema.Struct({
        saltBase64url: Schema.String,
        priority: Schema.mutable(Schema.Array(Seat)).check(
          Schema.makeFilter((seats) => seats.length === 10 && new Set(seats).size === 10),
        ),
      }),
    ),
  }),
  history: Schema.Struct({ visibilityEpoch: Schema.String, streamHead: Integer }),
}).check(
  Schema.makeFilter((observation) => {
    if (
      observation.act !== observation.board.act ||
      (observation.private !== null && observation.private.act !== observation.act)
    )
      return false;

    if ((observation.act === 2) !== (observation.act1Result !== null)) return false;

    if (observation.status === 'active') {
      if (
        !(observation.act === 1 ? act1Phases : act2Phases).includes(observation.phase.kind) ||
        observation.finishedAt !== null ||
        observation.result !== null ||
        observation.commitment.reveal !== null
      )
        return false;
    } else if (
      (observation.phase.kind !== observation.status &&
        !(
          observation.act === 2 &&
          observation.status === 'finished' &&
          observation.phase.kind === 'act-2:finished'
        )) ||
      observation.finishedAt === null ||
      observation.decision !== null ||
      (observation.status === 'finished'
        ? observation.act !== 2 || observation.result === null
        : observation.result !== null)
    )
      return false;

    return (
      (observation.decision?.actions.every(
        ({ action }) =>
          action.type === 'chat' ||
          Schema.is(observation.act === 1 ? Act1ActionSchema : Act2ActionSchema)(action),
      ) ??
        true) &&
      bytes(observation) <= 14 * 1024
    );
  }),
) satisfies Schema.Codec<Observation2>;

const PhysicalInfluenceSchema = Schema.Struct({ ...InfluenceCardSchema.fields, physicalId: Schema.String });

export const AuditFact2Schema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('initial'),
    policies: Schema.mutable(Schema.Array(CardSchema)),
    roles: Schema.mutable(Schema.Array(RoleSchema)),
    priority: Schema.mutable(Schema.Array(Seat)),
    saltBase64url: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('random-outcomes'),
    outcomes: Schema.mutable(
      Schema.Array(
        Schema.Union([
          Schema.Struct({ kind: Schema.Literal('index'), size: Integer, value: Integer }).check(
            Schema.makeFilter((entry) => entry.size > 0 && entry.value < entry.size),
          ),
          Schema.Struct({ kind: Schema.Literal('id'), value: Schema.String }),
        ]),
      ),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal('policy-zones'),
    deck: Schema.mutable(Schema.Array(CardSchema)),
    discards: Schema.mutable(Schema.Array(CardSchema)),
    hand: Schema.mutable(Schema.Array(CardSchema)),
  }),
  Schema.Struct({
    kind: Schema.Literal('court-order'),
    cards: Schema.mutable(Schema.Array(PhysicalInfluenceSchema)),
  }),
  Schema.Struct({
    kind: Schema.Literal('capability-zones'),
    seat: Seat,
    hand: Schema.mutable(Schema.Array(PhysicalInfluenceSchema)),
    revealed: Schema.mutable(Schema.Array(PhysicalInfluenceSchema)),
  }),
  Schema.Struct({
    kind: Schema.Literal('exchange-buffer'),
    seat: Seat,
    cards: Schema.mutable(Schema.Array(PhysicalInfluenceSchema)),
  }),
]) satisfies Schema.Codec<AuditFact2>;

// Deep JSON retains legacy and nested replay facts without admitting undefined,
// functions, or opaque runtime objects. Event names remain extensible for Act 1.
export const AuthorizedEvent2Schema = Schema.Struct({
  id: Integer.check(Schema.makeFilter((id) => id > 0)),
  eventKey: Schema.String,
  at: Integer,
  act: Schema.Literals([1, 2]),
  round: Integer,
  type: Schema.String,
  text: Schema.String,
  seat: Schema.optional(Seat),
  data: Schema.optional(
    Schema.Union([
      Schema.Record(Schema.String, Schema.Json),
      AuditFact2Schema,
      Schema.Struct({
        type: Schema.Literal('finished'),
        winner: Seat,
        capEvidence: Schema.NullOr(CapEvidenceSchema),
      }),
    ]),
  ),
}).check(
  Schema.makeFilter(
    (event) => bytes(event) <= 8192 && (event.type !== 'audit' || Schema.is(AuditFact2Schema)(event.data)),
  ),
) satisfies Schema.Codec<AuthorizedEvent2>;

export const HistoryPage2Schema = Schema.Struct({
  protocolVersion: Schema.Literal('2'),
  gameId: Schema.Literal('succession'),
  matchId: Schema.String,
  visibilityEpoch: Schema.String,
  streamHead: Integer,
  after: Integer,
  through: Integer,
  cursor: Integer,
  events: Schema.mutable(Schema.Array(AuthorizedEvent2Schema)).check(Schema.isMaxLength(64)),
  hasMore: Schema.Boolean,
  reset: Schema.Boolean,
}).check(
  Schema.makeFilter((page) => {
    if (
      page.after > page.through ||
      page.through > page.streamHead ||
      page.hasMore !== page.cursor < page.through
    )
      return false;

    if (page.reset)
      return (
        page.after === 0 &&
        page.cursor === 0 &&
        page.through === page.streamHead &&
        page.events.length === 0 &&
        bytes(page) <= 1024
      );

    return (
      page.events.every((event, index) => event.id === page.after + index + 1) &&
      page.cursor === (page.events.at(-1)?.id ?? page.after) &&
      page.cursor <= page.through &&
      (page.after === page.through || page.events.length > 0) &&
      bytes(page) <= 32768
    );
  }),
) satisfies Schema.Codec<HistoryPage2>;

export interface HistoryPage2 extends HistoryMetadata2 {
  protocolVersion: '2';
  gameId: 'succession';
  matchId: string;
  after: number;
  through: number;
  cursor: number;
  events: AuthorizedEvent2[];
  hasMore: boolean;
  reset: boolean;
}

export type ReplayFrame2 = Omit<Observation2, 'decision' | 'history' | 'private'> & {
  through: number;
  visibilityEpoch: string;
  private: Observation2['private'];
  archive:
    | { act: 1; deck: Card[]; discards: Card[]; hand: Card[] }
    | {
        act: 2;
        hands: { seat: number; hand: InfluenceCard[] }[];
        court: InfluenceCard[];
        exchangePool?: { seat: number; cards: InfluenceCard[] } | null;
      }
    | null;
};

export const ReplayFrame2Schema = Schema.Struct({
  ...Struct.omit(Observation2Schema.fields, ['decision', 'history']),
  through: Integer,
  visibilityEpoch: Schema.String,
  archive: Schema.NullOr(
    Schema.Union([
      Schema.Struct({
        act: Schema.Literal(1),
        deck: Schema.mutable(Schema.Array(CardSchema)),
        discards: Schema.mutable(Schema.Array(CardSchema)),
        hand: Schema.mutable(Schema.Array(CardSchema)),
      }),
      Schema.Struct({
        act: Schema.Literal(2),
        hands: Schema.mutable(
          Schema.Array(
            Schema.Struct({ seat: Seat, hand: Schema.mutable(Schema.Array(InfluenceCardSchema)) }),
          ),
        ),
        court: Schema.mutable(Schema.Array(InfluenceCardSchema)),
        exchangePool: Schema.optional(
          Schema.NullOr(
            Schema.Struct({ seat: Seat, cards: Schema.mutable(Schema.Array(InfluenceCardSchema)) }),
          ),
        ),
      }),
    ]),
  ),
}).check(
  Schema.makeFilter(
    (frame) =>
      frame.act === frame.board.act &&
      (frame.private === null || frame.private.act === frame.act) &&
      (frame.archive === null || frame.archive.act === frame.act) &&
      (frame.act === 2) === (frame.act1Result !== null) &&
      (frame.status === 'active'
        ? (frame.act === 1 ? act1Phases : act2Phases).includes(frame.phase.kind) &&
          frame.result === null &&
          frame.finishedAt === null
        : (frame.phase.kind === frame.status ||
            (frame.act === 2 && frame.status === 'finished' && frame.phase.kind === 'act-2:finished')) &&
          frame.finishedAt !== null &&
          (frame.status === 'finished' ? frame.act === 2 && frame.result !== null : frame.result === null)) &&
      bytes(frame) <= 32768,
  ),
) satisfies Schema.Codec<ReplayFrame2>;
