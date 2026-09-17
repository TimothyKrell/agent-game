import { Schema } from 'effect';
import { assertAct2Integrity } from './act2';
import type { Act2Board } from './act2';
import type { Act1Board, ReplayFact, SuccessionState } from './types';
import type { MatchState, Timing as MatchTiming } from '../types';

const Integer = Schema.Number.check(Schema.makeFilter((n) => Number.isSafeInteger(n) && n >= 0));

const Positive = Integer.check(Schema.makeFilter((n) => n > 0));

const Time = Schema.Number.check(Schema.makeFilter((n) => Number.isFinite(n) && n >= 0));

const Text = Schema.String.check(Schema.isMinLength(1));

const SeatNumber = Integer.check(Schema.isBetween({ minimum: 0, maximum: 9 }));

type SeatRecord = Record<string, number | boolean | 'challenge' | 'pass'>;

const seatKeys = (value: SeatRecord): boolean => Object.keys(value).every((key) => /^[0-9]$/.test(key));

const SeatTimes = Schema.Record(Schema.String, Time).check(Schema.makeFilter(seatKeys));

const Ballots = Schema.Record(Schema.String, Schema.Boolean).check(Schema.makeFilter(seatKeys));

const Role = Schema.Literals(['cooperative', 'rogue', 'overlord']);

const Team = Schema.Literals(['cooperative', 'rogue']);

const Capability = Schema.Literals(['treasurer', 'thief', 'assassin', 'envoy', 'guard']);

const Mode = Schema.Literals(['preview', 'ranked', 'evaluation']);

const Seats = Schema.mutable(Schema.Array(SeatNumber)).check(
  Schema.makeFilter((seats) => new Set(seats).size === seats.length),
);

const Timing = Schema.Struct({
  nomination: Time,
  debate: Time,
  executive: Time,
  action: Time,
  grace: Time,
  chatCooldown: Time,
});

const HouseModel = Schema.Struct({ provider: Text, model: Text, policyVersion: Text });

const snapshotFields = {
  displayName: Text,
  playerCount: Schema.Literal(10),
  rulesUrl: Text,
  ratingUrl: Text,
  timing: Timing,
  housePolicyVersion: Text,
  mode: Mode,
  houseModel: HouseModel,
};

const Snapshot = Schema.Struct({
  ...snapshotFields,
  gameId: Schema.Literal('succession'),
  rulesVersion: Schema.Literal('succession-1'),
  ratingPoolId: Schema.Literal('succession-1'),
  ratingVersion: Schema.Literal('winner-softmax-1'),
  protocolVersion: Schema.Literal('2'),
});

const LegacySnapshot = Schema.Struct({
  ...snapshotFields,
  gameId: Schema.Literal('secret-overlord'),
  rulesVersion: Schema.Literal('secret-overlord-1'),
  ratingPoolId: Schema.Literal('secret-overlord-1'),
  ratingVersion: Schema.Literal('team-elo-1'),
  protocolVersion: Schema.Literal('1'),
});

const phaseFields = {
  id: Text,
  startedAt: Time,
  deadline: Schema.NullOr(Time),
  graceAnnounced: Schema.Boolean,
  replacements: SeatTimes,
};

const PhaseKind = Schema.Literals([
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
]);

const LegacyPhase = Schema.Struct({ ...phaseFields, kind: PhaseKind });

const SuccessionPhaseKind = Schema.Union([
  PhaseKind,
  Schema.Literals([
    'act-2:discussion',
    'act-2:action',
    'act-2:challenge',
    'act-2:block',
    'act-2:loss',
    'act-2:exchange',
    'act-2:finished',
  ]),
]);

const SeatSchema = Schema.Struct({
  number: SeatNumber,
  entrant: Schema.Struct({
    agentId: Text,
    ownerId: Schema.NullOr(Text),
    name: Text,
    house: Schema.Boolean,
    rating: Schema.Number.check(Schema.isFinite()),
    persona: Schema.optional(Schema.String),
  }),
  role: Role,
  alive: Schema.Boolean,
  forfeited: Schema.Boolean,
  generation: Integer,
  houseProfile: Schema.NullOr(Text),
  lastChatAt: Schema.NullOr(Time),
  recoveryCount: Schema.optional(Integer),
  maxRecoveries: Schema.optional(Integer),
});

const Roster = Schema.mutable(Schema.Array(SeatSchema)).check(
  Schema.makeFilter((seats) => {
    const external = seats.filter((seat) => !seat.entrant.house);

    return (
      seats.length === 10 &&
      seats.every((seat, i) => seat.number === i) &&
      new Set(seats.map((seat) => seat.entrant.agentId)).size === 10 &&
      external.every((seat) => seat.entrant.ownerId !== null) &&
      new Set(external.map((seat) => seat.entrant.ownerId)).size === external.length &&
      seats.filter((seat) => seat.role === 'cooperative').length === 6 &&
      seats.filter((seat) => seat.role === 'rogue').length === 3 &&
      seats.filter((seat) => seat.role === 'overlord').length === 1
    );
  }),
);

const PolicyCard = Schema.Struct({ id: Text, policy: Schema.Literals(['safeguard', 'override']) });

const PolicyCards = Schema.mutable(Schema.Array(PolicyCard)).check(Schema.isMaxLength(17));

const Government = Schema.Struct({ coordinator: SeatNumber, executor: SeatNumber }).check(
  Schema.makeFilter((government) => government.coordinator !== government.executor),
);

const legacyBoardFields = {
  id: Text,
  rulesVersion: Schema.Literal('secret-overlord-1'),
  createdAt: Time,
  finishedAt: Schema.NullOr(Time),
  mode: Mode,
  timing: Timing,
  houseModel: Schema.optional(HouseModel),
  round: Positive,
  phase: LegacyPhase,
  coordinator: SeatNumber,
  executor: Schema.NullOr(SeatNumber),
  lastGovernment: Schema.NullOr(Government),
  specialResumeAfter: Schema.NullOr(SeatNumber),
  votes: Ballots,
  lastVotes: Schema.NullOr(Ballots),
  electionTracker: Integer.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  safeguards: Integer.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  overrides: Integer.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
  deck: PolicyCards,
  discards: PolicyCards,
  hand: PolicyCards.check(Schema.isMaxLength(3)),
  vetoRejected: Schema.Boolean,
  power: Schema.NullOr(Schema.Literals(['investigate', 'special-election', 'execute'])),
  investigated: Seats,
  winner: Schema.NullOr(Team),
  winReason: Schema.NullOr(Schema.String),
};

function validAct1(board: Act1Board): boolean {
  const cards = [...board.deck, ...board.discards, ...board.hand];
  const terminal = board.phase.kind === 'finished' || board.phase.kind === 'interrupted';

  return (
    new Set(cards.map((card) => card.id)).size === cards.length &&
    cards.filter((card) => card.policy === 'safeguard').length + board.safeguards === 6 &&
    cards.filter((card) => card.policy === 'override').length + board.overrides === 11 &&
    terminal === (board.finishedAt !== null) &&
    terminal === (board.phase.deadline === null) &&
    (board.phase.kind === 'finished'
      ? board.winner !== null && board.winReason !== null
      : board.winner === null) &&
    (board.phase.kind !== 'interrupted' || board.winReason !== null) &&
    board.executor !== board.coordinator &&
    (!['government-discussion', 'voting', 'coordinator-discard', 'executor-policy', 'veto-response'].includes(
      board.phase.kind,
    ) ||
      board.executor !== null) &&
    (board.phase.kind !== 'coordinator-discard' || board.hand.length === 3) &&
    (!['executor-policy', 'veto-response'].includes(board.phase.kind) || board.hand.length === 2)
  );
}

export const Act1BoardSchema = Schema.Struct(legacyBoardFields)
  .check(Schema.makeFilter(validAct1))
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<Act1Board>;

const CapabilityCard = Schema.Struct({ id: Text, physicalId: Text, capability: Capability });

const CapabilityCards = Schema.mutable(Schema.Array(CapabilityCard)).check(Schema.isMaxLength(25));

const Declaration = Schema.Union([
  Schema.Struct({ type: Schema.Literals(['income', 'tax', 'exchange']) }),
  Schema.Struct({ type: Schema.Literals(['steal', 'assassinate', 'coup']), target: SeatNumber }),
]);

const CapEvidence = Schema.Struct({
  scores: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        seat: SeatNumber,
        influence: Integer.check(Schema.isBetween({ minimum: 1, maximum: 2 })),
        coins: Integer,
        priority: SeatNumber,
      }),
    ),
  ).check(
    Schema.makeFilter(
      (scores) =>
        scores.length >= 2 &&
        scores.length <= 10 &&
        new Set(scores.map((score) => score.seat)).size === scores.length &&
        new Set(scores.map((score) => score.priority)).size === scores.length,
    ),
  ),
  decisive: Schema.Literals(['influence', 'coins', 'priority']),
});

const Pending = Schema.Struct({
  actor: SeatNumber,
  action: Declaration,
  claim: Schema.NullOr(Capability),
  payment: Integer,
  block: Schema.NullOr(Capability),
  challenge: Schema.NullOr(
    Schema.Struct({
      claimant: SeatNumber,
      capability: Capability,
      block: Schema.Boolean,
      eligible: Seats,
      responses: Schema.Record(Schema.String, Schema.Literals(['challenge', 'pass'])).check(
        Schema.makeFilter(seatKeys),
      ),
    }),
  ),
  loss: Schema.NullOr(
    Schema.Struct({
      seat: SeatNumber,
      continuation: Schema.Literals(['cancel', 'after-claim', 'effect', 'end']),
    }),
  ),
  exchange: Schema.NullOr(CapabilityCards),
});

function validAct2(board: Act2Board): boolean {
  try {
    assertAct2Integrity(board);
  } catch {
    return false;
  }

  const current = board.pending;

  if (board.phase === 'finished')
    return board.winner !== null && current === null && board.resources[board.winner].hand.length > 0;

  if (
    board.winner !== null ||
    board.capEvidence !== null ||
    board.activeSeat !== (board.firstSeat + board.slot) % 10
  )
    return false;

  if (board.phase === 'discussion' || board.phase === 'action')
    return current === null && board.resources[board.activeSeat].hand.length > 0;

  if (!current || current.actor !== board.activeSeat || !board.resources[current.actor].hand.length)
    return false;

  const claims = {
    income: null,
    tax: 'treasurer',
    exchange: 'envoy',
    steal: 'thief',
    assassinate: 'assassin',
    coup: null,
  };

  const payments = { income: 0, tax: 0, exchange: 0, steal: 0, assassinate: 3, coup: 7 };

  if (
    current.claim !== claims[current.action.type] ||
    current.payment !== payments[current.action.type] ||
    ('target' in current.action && current.action.target === current.actor) ||
    (current.block !== null &&
      !(current.action.type === 'steal'
        ? ['thief', 'envoy'].includes(current.block)
        : current.action.type === 'assassinate' && current.block === 'guard'))
  )
    return false;

  if (
    (board.phase === 'challenge') !== (current.challenge !== null) ||
    (board.phase === 'loss') !== (current.loss !== null) ||
    (board.phase === 'exchange') !== (current.exchange !== null)
  )
    return false;

  if (current.challenge) {
    const window = current.challenge;

    const expected = board.resources.flatMap((resource, seat) =>
      resource.hand.length && seat !== window.claimant ? [seat] : [],
    );

    if (
      window.block !== (current.block !== null) ||
      !board.resources[window.claimant].hand.length ||
      window.eligible.length !== expected.length ||
      !expected.every((seat) => window.eligible.includes(seat)) ||
      Object.keys(window.responses).some((seat) => !window.eligible.includes(Number(seat))) ||
      Object.keys(window.responses).length >= window.eligible.length ||
      (window.block
        ? !('target' in current.action) ||
          window.claimant !== current.action.target ||
          window.capability !== current.block
        : window.claimant !== current.actor || window.capability !== current.claim)
    )
      return false;
  }

  if (current.loss && !board.resources[current.loss.seat].hand.length) return false;

  if (board.phase === 'exchange' && current.action.type !== 'exchange') return false;

  return (
    board.phase !== 'block' ||
    ((current.action.type === 'steal' || current.action.type === 'assassinate') &&
      current.block === null &&
      board.resources[current.action.target].hand.length > 0)
  );
}

export const Act2BoardSchema = Schema.Struct({
  resources: Schema.mutable(
    Schema.Array(Schema.Struct({ hand: CapabilityCards, revealed: CapabilityCards, coins: Integer })),
  ).check(Schema.makeFilter((values) => values.length === 10)),
  court: CapabilityCards,
  firstSeat: SeatNumber,
  slot: SeatNumber,
  round: Positive.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
  activeSeat: SeatNumber,
  phase: Schema.Literals(['discussion', 'action', 'challenge', 'block', 'loss', 'exchange', 'finished']),
  phaseId: Text,
  pending: Schema.NullOr(Pending),
  winner: Schema.NullOr(SeatNumber),
  capEvidence: Schema.NullOr(CapEvidence),
})
  .check(Schema.makeFilter(validAct2))
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<Act2Board>;

const Act1Result = Schema.Struct({
  team: Team,
  reason: Text,
  roles: Schema.mutable(Schema.Array(Role)).check(Schema.makeFilter((values) => values.length === 10)),
  returnedSeats: Seats,
  bonuses: Schema.mutable(Schema.Array(Schema.Literals([0, 1]))).check(
    Schema.makeFilter((values) => values.length === 10),
  ),
  finalTracks: Schema.Struct({
    safeguards: Integer.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
    overrides: Integer.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
    electionTracker: Integer.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
    drawCount: Integer,
    discardCount: Integer,
    vetoUnlocked: Schema.Boolean,
  }),
});

const Result = Schema.Struct({
  kind: Schema.Literal('individual'),
  winnerSeat: SeatNumber,
  reason: Schema.Literals(['last-survivor', 'round-cap']),
  act1: Schema.Struct({ team: Team, reason: Text }),
  tieBreak: Schema.NullOr(CapEvidence),
}).check(Schema.makeFilter((result) => (result.reason === 'round-cap') === (result.tieBreak !== null)));

function sameTiming(left: MatchTiming, right: MatchTiming): boolean {
  return (
    left.nomination === right.nomination &&
    left.debate === right.debate &&
    left.executive === right.executive &&
    left.action === right.action &&
    left.grace === right.grace &&
    left.chatCooldown === right.chatCooldown
  );
}

function validState(state: SuccessionState): boolean {
  const board = state.stage.act === 1 ? state.stage.board : state.stage.archive;

  if (
    board.id !== state.id ||
    board.createdAt !== state.createdAt ||
    board.mode !== state.snapshot.mode ||
    !sameTiming(board.timing, state.snapshot.timing)
  )
    return false;

  if (
    (state.status === 'active') !== (state.finishedAt === null) ||
    (state.status === 'active') !== (state.phase.deadline !== null) ||
    (state.status === 'interrupted') !== (state.interruptionReason !== null) ||
    (state.status === 'finished') !== (state.result !== null)
  )
    return false;

  if (state.stage.act === 1)
    return (
      state.act1Result === null &&
      state.result === null &&
      state.status !== 'finished' &&
      JSON.stringify(state.phase) === JSON.stringify(state.stage.board.phase) &&
      state.finishedAt === board.finishedAt &&
      (state.status !== 'interrupted' || state.interruptionReason === board.winReason)
    );
  const result = state.act1Result;
  const current = state.stage.board;

  if (
    !result ||
    board.phase.kind !== 'finished' ||
    result.team !== board.winner ||
    result.reason !== board.winReason ||
    result.finalTracks.safeguards !== board.safeguards ||
    result.finalTracks.overrides !== board.overrides ||
    result.finalTracks.electionTracker !== board.electionTracker ||
    result.finalTracks.drawCount !== board.deck.length ||
    result.finalTracks.discardCount !== board.discards.length ||
    result.finalTracks.vetoUnlocked !== board.overrides >= 5 ||
    !state.seats.every(
      (seat, i) =>
        result.roles[i] === seat.role &&
        result.bonuses[i] === ((seat.role === 'overlord' ? 'rogue' : seat.role) === result.team ? 1 : 0) &&
        seat.alive === current.resources[i].hand.length > 0,
    )
  )
    return false;

  if (state.status === 'interrupted')
    return state.phase.kind === 'interrupted' && current.phase !== 'finished';

  if (
    state.phase.id !== current.phaseId ||
    state.phase.kind !== `act-2:${current.phase}` ||
    (state.status === 'finished') !== (current.phase === 'finished')
  )
    return false;

  if (!state.result) return true;

  const survivors = current.resources.flatMap((resource, seat) =>
    resource.hand.length
      ? [
          {
            seat,
            influence: resource.hand.length,
            coins: resource.coins,
            priority: state.commitment.priority.indexOf(seat),
          },
        ]
      : [],
  );

  const evidence = current.capEvidence;

  if (evidence === null) {
    if (survivors.length !== 1 || survivors[0].seat !== current.winner) return false;
  } else {
    survivors.sort((a, b) => b.influence - a.influence || b.coins - a.coins || a.priority - b.priority);

    if (
      current.round !== 12 ||
      survivors.length < 2 ||
      survivors[0].seat !== current.winner ||
      evidence.scores.length !== survivors.length ||
      !evidence.scores.every((score, i) => {
        const expected = survivors[i];

        return (
          score.seat === expected.seat &&
          score.influence === expected.influence &&
          score.coins === expected.coins &&
          score.priority === expected.priority
        );
      }) ||
      evidence.decisive !==
        (survivors[0].influence !== survivors[1].influence
          ? 'influence'
          : survivors[0].coins !== survivors[1].coins
            ? 'coins'
            : 'priority')
    )
      return false;
  }

  return (
    state.result.winnerSeat === current.winner &&
    state.result.act1.team === result.team &&
    state.result.act1.reason === result.reason &&
    JSON.stringify(state.result.tieBreak) === JSON.stringify(current.capEvidence)
  );
}

export const SuccessionStateSchema = Schema.Struct({
  storageVersion: Schema.Literal(1),
  gameId: Schema.Literal('succession'),
  rulesVersion: Schema.Literal('succession-1'),
  id: Text,
  createdAt: Time,
  finishedAt: Schema.NullOr(Time),
  snapshot: Snapshot,
  status: Schema.Literals(['active', 'finished', 'interrupted']),
  seats: Roster,
  stage: Schema.Union([
    Schema.Struct({ act: Schema.Literal(1), board: Act1BoardSchema }),
    Schema.Struct({ act: Schema.Literal(2), board: Act2BoardSchema, archive: Act1BoardSchema }),
  ]),
  phase: Schema.Struct({ ...phaseFields, kind: SuccessionPhaseKind }),
  act1Result: Schema.NullOr(Act1Result),
  result: Schema.NullOr(Result),
  interruptionReason: Schema.NullOr(Schema.String),
  commitment: Schema.Struct({
    digest: Schema.String.check(Schema.makeFilter((value) => /^[a-f0-9]{64}$/.test(value))),
    saltBase64url: Schema.String.check(
      Schema.makeFilter((value) => /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)),
    ),
    priority: Seats.check(Schema.makeFilter((values) => values.length === 10)),
  }),
  lastChat: Schema.NullOr(Schema.Struct({ seat: SeatNumber, at: Time })),
})
  .check(Schema.makeFilter(validState))
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<SuccessionState>;

const ReplayAction = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(['nominate', 'investigate', 'special-election', 'execute']),
    target: SeatNumber,
  }),
  Schema.Struct({ type: Schema.Literals(['vote', 'veto']), approve: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literals(['discard', 'enact', 'lose-influence']), cardId: Text }),
  Schema.Struct({
    type: Schema.Literals(['request-veto', 'income', 'tax', 'exchange', 'challenge', 'pass']),
  }),
  Schema.Struct({ type: Schema.Literals(['steal', 'assassinate', 'coup']), target: SeatNumber }),
  Schema.Struct({ type: Schema.Literal('block'), capability: Schema.Literals(['thief', 'envoy', 'guard']) }),
  Schema.Struct({
    type: Schema.Literal('return-influence'),
    cardIds: Schema.mutable(Schema.Tuple([Text, Text])).check(Schema.makeFilter(([a, b]) => a !== b)),
  }),
]);

export const ReplayFactSchema = Schema.Struct({
  command: Schema.Union([
    Schema.Struct({ type: Schema.Literal('chat'), seat: SeatNumber, now: Time }),
    Schema.Struct({ type: Schema.Literals(['advance', 'recover']), now: Time }),
    Schema.Struct({ type: Schema.Literal('interrupt'), now: Time, reason: Schema.String }),
    Schema.Struct({
      type: Schema.Literal('act'),
      seat: SeatNumber,
      generation: Integer,
      now: Time,
      request: Schema.Struct({
        gameId: Schema.Literal('succession'),
        actionId: Text,
        phaseId: Text,
        decisionId: Schema.optional(Text),
        action: ReplayAction,
      }),
    }),
  ]),
  randomness: Schema.mutable(
    Schema.Array(
      Schema.Union([
        Schema.Struct({ kind: Schema.Literal('index'), size: Positive, value: Integer }).check(
          Schema.makeFilter((fact) => fact.value < fact.size),
        ),
        Schema.Struct({ kind: Schema.Literal('id'), value: Text }),
      ]),
    ),
  ),
})
  .check(Schema.makeFilter((fact) => fact.command.type !== 'chat' || fact.randomness.length === 0))
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<ReplayFact>;

const JsonScalar = Schema.Union([
  Schema.String,
  Schema.Number.check(Schema.isFinite()),
  Schema.Boolean,
  Schema.Null,
]);

const JsonValue = Schema.Union([
  JsonScalar,
  Schema.mutable(Schema.Array(JsonScalar)),
  Schema.Record(Schema.String, JsonScalar),
  Schema.mutable(Schema.Array(Schema.Record(Schema.String, JsonScalar))),
]);

const LegacyEvent = Schema.Struct({
  id: Positive,
  at: Time,
  round: Positive,
  type: Text,
  text: Schema.String,
  visibility: Schema.Union([Schema.Literal('public'), SeatNumber]),
  seat: Schema.optional(SeatNumber),
  data: Schema.optional(Schema.Record(Schema.String, JsonValue)),
});

export const LegacyStateSchema = Schema.Struct({
  ...legacyBoardFields,
  seats: Roster,
  events: Schema.mutable(Schema.Array(LegacyEvent)),
  gameId: Schema.optional(Schema.Literal('secret-overlord')),
  snapshot: Schema.optional(LegacySnapshot),
})
  .check(
    Schema.makeFilter(
      (state) =>
        validAct1(state) &&
        state.events.every((event, i) => event.id === i + 1) &&
        (state.snapshot === undefined ||
          (state.snapshot.mode === state.mode && sameTiming(state.timing, state.snapshot.timing))),
    ),
  )
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<MatchState>;

/** Unknown properties are errors, including event histories nested in either stage. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the storage decoding boundary.
export function decodeSuccessionState(value: unknown): SuccessionState {
  return Schema.decodeUnknownSync(SuccessionStateSchema, { onExcessProperty: 'error' })(value);
}

const CheckpointPolicyBoard = Schema.Struct({
  ...legacyBoardFields,
  phase: Schema.Struct({ ...phaseFields, id: Schema.String, kind: PhaseKind }),
});

function checkpointPolicies(board: Act1Board): boolean {
  const cards = [...board.deck, ...board.discards, ...board.hand];

  return (
    new Set(cards.map((card) => card.id)).size === cards.length &&
    cards.filter((card) => card.policy === 'safeguard').length + board.safeguards === 6 &&
    cards.filter((card) => card.policy === 'override').length + board.overrides === 11
  );
}

function validReplayCheckpoint(state: SuccessionState): boolean {
  const policy = state.stage.act === 1 ? state.stage.board : state.stage.archive;

  if (
    policy.id !== state.id ||
    policy.createdAt !== state.createdAt ||
    policy.mode !== state.snapshot.mode ||
    !sameTiming(policy.timing, state.snapshot.timing) ||
    !checkpointPolicies(policy)
  )
    return false;

  if (
    (state.status === 'finished') !== (state.result !== null) ||
    (state.status === 'interrupted') !== (state.interruptionReason !== null) ||
    (state.status === 'active') !== (state.finishedAt === null)
  )
    return false;

  if (state.stage.act === 1) {
    const initializing =
      policy.phase.id === '' &&
      policy.round === 1 &&
      policy.safeguards === 0 &&
      policy.overrides === 0 &&
      policy.deck.length === 17 &&
      policy.phase.kind === 'nomination-discussion';

    return (
      state.status !== 'finished' &&
      state.act1Result === null &&
      state.result === null &&
      JSON.stringify(state.phase) === JSON.stringify(policy.phase) &&
      (state.phase.id !== '' || initializing) &&
      (state.status !== 'active' || state.phase.deadline !== null || initializing)
    );
  }

  const board = state.stage.board;
  const pool = board.pending?.exchange ?? [];

  const cards = [
    ...board.court,
    ...pool,
    ...board.resources.flatMap((resource) => [...resource.hand, ...resource.revealed]),
  ];

  if (
    cards.length !== 25 ||
    new Set(cards.map((card) => card.physicalId)).size !== 25 ||
    new Set(cards.map((card) => card.id)).size !== 25 ||
    ['treasurer', 'thief', 'assassin', 'envoy', 'guard'].some(
      (capability) => cards.filter((card) => card.capability === capability).length !== 5,
    ) ||
    board.court.length + pool.length !== 5 ||
    board.resources.some((resource) => resource.hand.length + resource.revealed.length !== 2)
  )
    return false;

  return validState(state);
}

/** Event checkpoints are nonactionable snapshots inside an atomic mutation, not resumable current states. */
export const ReplayCheckpointSchema = Schema.Struct({
  ...SuccessionStateSchema.fields,
  phase: Schema.Struct({ ...phaseFields, id: Schema.String, kind: SuccessionPhaseKind }),
  stage: Schema.Union([
    Schema.Struct({ act: Schema.Literal(1), board: CheckpointPolicyBoard }),
    Schema.Struct({
      act: Schema.Literal(2),
      board: Schema.Struct(Act2BoardSchema.fields),
      archive: Act1BoardSchema,
    }),
  ]),
})
  .check(Schema.makeFilter(validReplayCheckpoint))
  .annotate({ parseOptions: { onExcessProperty: 'error' } }) satisfies Schema.Codec<SuccessionState>;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the private historical checkpoint decoder, never the live-state decoder.
export function decodeReplayCheckpoint(value: unknown): SuccessionState {
  return Schema.decodeUnknownSync(ReplayCheckpointSchema, { onExcessProperty: 'error' })(value);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the replay decoding boundary.
export function decodeReplayFact(value: unknown): ReplayFact {
  return Schema.decodeUnknownSync(ReplayFactSchema, { onExcessProperty: 'error' })(value);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the legacy storage decoding boundary.
export function decodeLegacyState(value: unknown): MatchState {
  return Schema.decodeUnknownSync(LegacyStateSchema, { onExcessProperty: 'error' })(value);
}
