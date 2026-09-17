import { Match } from 'effect';
import { shuffle, randomIndex } from './random';
import { DEFAULT_TIMING, GameError, chatOpen, teamOf, terminal } from './types';
import type {
  ActionRequest,
  Card,
  Entrant,
  GameAction,
  GameEvent,
  LegalAction,
  MatchState,
  PhaseKind,
  Role,
  Team,
  Timing,
} from './types';

function emit(
  state: MatchState,
  context: LegacyContext,
  now: number,
  type: string,
  text: string,
  extra: Partial<Pick<GameEvent, 'visibility' | 'seat' | 'data'>> = {},
): void {
  const event: GameEvent = {
    id: state.events.length + 1,
    at: now,
    round: state.round,
    type,
    text,
    visibility: 'public',
    ...extra,
  };

  state.events.push(event);

  if (context.onEvent) {
    const { events: _events, ...board } = state;
    context.onEvent(structuredClone(board), event);
  }
}

export type LegacyBoard = Omit<MatchState, 'events'>;

export interface LegacyContext {
  random(size: number): number;
  id(): string;
  /** Receives an isolated, history-free board at the instant each event is appended. */
  onEvent?(board: LegacyBoard, event: GameEvent): void;
}

export type LegacyCommand =
  | { type: 'act'; seat: number; generation: number; request: ActionRequest; now: number }
  | { type: 'advance' | 'recover'; now: number }
  | { type: 'interrupt'; now: number; reason: string };

export type LegacyRandomFact = { kind: 'index'; size: number; value: number } | { kind: 'id'; value: string };

const defaultContext: LegacyContext = { random: randomIndex, id: () => crypto.randomUUID() };

export interface LegacyEvolution {
  state: LegacyBoard;
  appendedEvents: GameEvent[];
  randomFacts: LegacyRandomFact[];
}

/** Event IDs are local to this append (1-based); the caller assigns durable sequence IDs. */
export function evolveLegacy(
  board: LegacyBoard,
  command: LegacyCommand,
  context: LegacyContext,
): LegacyEvolution {
  const randomFacts: LegacyRandomFact[] = [];

  const recorded: LegacyContext = {
    onEvent: context.onEvent,
    random(size) {
      const value = context.random(size);
      randomFacts.push({ kind: 'index', size, value });

      return value;
    },
    id() {
      const value = context.id();
      randomFacts.push({ kind: 'id', value });

      return value;
    },
  };

  const input: MatchState = { ...board, events: [] };
  let output: MatchState;

  switch (command.type) {
    case 'act':
      output = act(input, command.seat, command.generation, command.request, command.now, recorded);
      break;
    case 'advance':
      output = advance(input, command.now, recorded);
      break;
    case 'recover':
      output = recoverMatch(input, command.now, recorded);
      break;
    case 'interrupt':
      output = interruptMatch(input, command.now, command.reason, recorded);
      break;
  }

  const { events: appendedEvents, ...state } = output;

  return { state, appendedEvents, randomFacts };
}

function enter(
  state: MatchState,
  kind: PhaseKind,
  now: number,
  duration: number | null,
  context: LegacyContext,
): void {
  state.phase = {
    id: context.id(),
    kind,
    startedAt: now,
    deadline: duration === null ? null : now + duration,
    graceAnnounced: false,
    replacements: {},
  };
  emit(state, context, now, 'phase', phaseLabel(kind), {
    data: {
      phase: kind,
      deadline: state.phase.deadline,
      coordinator: state.coordinator,
      executor: state.executor,
    },
  });
}

export function phaseLabel(kind: PhaseKind): string {
  const labels: Record<PhaseKind, string> = {
    'nomination-discussion': 'The floor is open. Discuss the next government.',
    nomination: 'The Coordinator candidate must nominate an Executor.',
    'government-discussion': 'Debate the proposed government.',
    voting: 'Cast a sealed ballot. All votes will be revealed together.',
    'coordinator-discard': 'Private legislation: the Coordinator discards one policy.',
    'executor-policy': 'Private legislation: the Executor chooses a policy.',
    'veto-response': 'The Coordinator must respond to the veto request.',
    'executive-discussion': 'Discuss the executive power before it is used.',
    'executive-action': 'The Coordinator must exercise the executive power.',
    finished: 'The match is complete. All roles and private events are revealed.',
    interrupted: 'The match was interrupted. No ratings are awarded.',
  };

  return labels[kind];
}

export function createMatch(
  id: string,
  entrants: Entrant[],
  now: number,
  options: {
    timing?: Timing;
    mode?: MatchState['mode'];
    random?: (size: number) => number;
    id?: () => string;
    onEvent?: LegacyContext['onEvent'];
  } = {},
): MatchState {
  if (entrants.length !== 10)
    throw new GameError('invalid-roster', 'Secret Overlord requires ten seats.', 400);
  const owners = entrants.flatMap((entry) => (entry.house ? [] : [entry.ownerId]));

  if (
    owners.some((owner) => !owner) ||
    new Set(owners).size !== owners.length ||
    new Set(entrants.map((entry) => entry.agentId)).size !== 10
  ) {
    throw new GameError(
      'invalid-roster',
      'Each external seat must have a different owner and each agent must be distinct.',
      400,
    );
  }

  const random = options.random ?? randomIndex;
  const context: LegacyContext = { random, id: options.id ?? defaultContext.id, onEvent: options.onEvent };

  const roles: Role[] = shuffle(
    [
      'cooperative',
      'cooperative',
      'cooperative',
      'cooperative',
      'cooperative',
      'cooperative',
      'rogue',
      'rogue',
      'rogue',
      'overlord',
    ],
    random,
  );

  const seats = shuffle(entrants, random).map((entrant, number) => ({
    number,
    entrant,
    role: roles[number],
    alive: true,
    forfeited: false,
    generation: 0,
    houseProfile: entrant.house ? entrant.agentId : null,
    lastChatAt: null,
  }));

  const deck: Card[] = Array.from({ length: 17 }, (_, i) => ({
    id: context.id(),
    policy: i < 6 ? 'safeguard' : 'override',
  }));

  const timing = options.timing ?? DEFAULT_TIMING;

  const state: MatchState = {
    id,
    rulesVersion: 'secret-overlord-1',
    createdAt: now,
    finishedAt: null,
    mode: options.mode ?? 'ranked',
    timing,
    seats,
    round: 1,
    phase: {
      id: '',
      kind: 'nomination-discussion',
      startedAt: now,
      deadline: null,
      graceAnnounced: false,
      replacements: {},
    },
    coordinator: random(10),
    executor: null,
    lastGovernment: null,
    specialResumeAfter: null,
    votes: {},
    lastVotes: null,
    electionTracker: 0,
    safeguards: 0,
    overrides: 0,
    deck: shuffle(deck, random),
    discards: [],
    hand: [],
    vetoRejected: false,
    power: null,
    investigated: [],
    winner: null,
    winReason: null,
    events: [],
  };

  emit(state, context, now, 'started', 'Ten agents. Two allegiances. One hidden Overlord.');

  for (const seat of seats) {
    emit(state, context, now, 'role', `Your secret role is ${seat.role}.`, {
      seat: seat.number,
      visibility: seat.number,
      data: { role: seat.role },
    });

    if (seat.role === 'rogue') {
      emit(state, context, now, 'rogue-knowledge', 'You recognize the ordinary rogues and the Overlord.', {
        seat: seat.number,
        visibility: seat.number,
        data: {
          rogues: seats.filter((s) => s.role === 'rogue').map((s) => s.number),
          overlord: seats.find((s) => s.role === 'overlord')!.number,
        },
      });
    }
  }

  enter(state, 'nomination-discussion', now, timing.nomination, context);

  return state;
}

export function eligibleExecutors(state: MatchState): number[] {
  const alive = state.seats.filter((seat) => seat.alive);

  return alive
    .filter(
      (seat) =>
        seat.number !== state.coordinator &&
        seat.number !== state.lastGovernment?.executor &&
        (alive.length <= 5 || seat.number !== state.lastGovernment?.coordinator),
    )
    .map((seat) => seat.number);
}

export function pendingSeats(state: MatchState): number[] {
  switch (state.phase.kind) {
    case 'nomination':
    case 'coordinator-discard':
    case 'veto-response':
    case 'executive-action':
      return [state.coordinator];
    case 'executor-policy':
      return state.executor === null ? [] : [state.executor];
    case 'voting':
      return state.seats
        .filter((seat) => seat.alive && state.votes[String(seat.number)] === undefined)
        .map((seat) => seat.number);
    default:
      return [];
  }
}

export function decisionId(state: MatchState, seat: number): string {
  return `${state.phase.id}:${seat}:${state.seats[seat].generation}`;
}

export function legalActions(state: MatchState, seat: number): LegalAction[] {
  if (!pendingSeats(state).includes(seat)) return [];
  const named = (target: number) => state.seats[target].entrant.name;

  switch (state.phase.kind) {
    case 'nomination':
      return eligibleExecutors(state).map((target) => ({
        action: { type: 'nominate', target },
        label: `Nominate ${named(target)}`,
      }));
    case 'voting':
      return [
        { action: { type: 'vote', approve: true }, label: 'Approve government' },
        { action: { type: 'vote', approve: false }, label: 'Reject government' },
      ];
    case 'coordinator-discard':
      return state.hand.map((card) => ({
        action: { type: 'discard', cardId: card.id },
        label: `Discard ${card.policy}`,
      }));
    case 'executor-policy':
      return [
        ...state.hand.map((card): LegalAction => ({
          action: { type: 'enact', cardId: card.id },
          label: `Enact ${card.policy}`,
        })),
        ...(state.overrides >= 5 && !state.vetoRejected
          ? [{ action: { type: 'request-veto' } as const, label: 'Request a veto' }]
          : []),
      ];
    case 'veto-response':
      return [
        { action: { type: 'veto', approve: true }, label: 'Agree to veto' },
        { action: { type: 'veto', approve: false }, label: 'Refuse veto' },
      ];
    case 'executive-action': {
      const power = state.power;

      if (!power) return [];

      const verb = Match.value(power).pipe(
        Match.when('investigate', () => 'Investigate'),
        Match.when('execute', () => 'Execute'),
        Match.when('special-election', () => 'Appoint'),
        Match.exhaustive,
      );

      return state.seats
        .filter(
          (s) =>
            s.alive &&
            (power !== 'special-election' || s.number !== seat) &&
            (power !== 'investigate' || !state.investigated.includes(s.number)),
        )
        .map((target) => ({
          action: { type: power, target: target.number },
          label: `${verb} ${named(target.number)}`,
        }));
    }

    default:
      return [];
  }
}

function finish(state: MatchState, team: Team, reason: string, now: number, context: LegacyContext): void {
  state.winner = team;
  state.winReason = reason;
  state.finishedAt = now;
  emit(
    state,
    context,
    now,
    'victory',
    `${team === 'cooperative' ? 'Cooperative agents' : 'Rogue agents'} win: ${reason}.`,
    { data: { team, reason } },
  );
  enter(state, 'finished', now, null, context);
}

export function interruptMatch(
  input: MatchState,
  now: number,
  reason: string,
  context: LegacyContext = defaultContext,
): MatchState {
  if (terminal(input)) return input;
  const state = structuredClone(input);
  state.finishedAt = now;
  state.winReason = reason;
  emit(state, context, now, 'interrupted', reason);
  enter(state, 'interrupted', now, null, context);

  return state;
}

/** A demonstrably late platform alarm reissues the phase, rather than charging agents for downtime. */
export function recoverMatch(
  input: MatchState,
  now: number,
  context: LegacyContext = defaultContext,
): MatchState {
  if (terminal(input)) return input;
  const state = structuredClone(input);

  const duration = Match.value(state.phase.kind).pipe(
    Match.when('nomination-discussion', () => state.timing.nomination),
    Match.when('government-discussion', () => state.timing.debate),
    Match.when('executive-discussion', () => state.timing.executive),
    Match.orElse(() => state.timing.action),
  );

  const replacements = Object.keys(state.phase.replacements);
  emit(
    state,
    context,
    now,
    'recovered',
    'The platform recovered a delayed game clock. The current phase has a fresh decision window.',
  );
  enter(state, state.phase.kind, now, duration, context);

  for (const seat of replacements) state.phase.replacements[seat] = now + state.timing.action;

  return state;
}

function nextAlive(state: MatchState, after: number): number {
  for (let step = 1; step <= 10; step++) {
    const candidate = (after + step) % 10;

    if (state.seats[candidate].alive) return candidate;
  }

  throw new Error('A match must have living seats');
}

function nextRound(state: MatchState, now: number, context: LegacyContext, special?: number): void {
  if (special !== undefined) {
    state.specialResumeAfter = state.coordinator;
    state.coordinator = special;
  } else if (state.specialResumeAfter !== null) {
    state.coordinator = nextAlive(state, state.specialResumeAfter);
    state.specialResumeAfter = null;
  } else state.coordinator = nextAlive(state, state.coordinator);
  state.round++;
  state.executor = null;
  state.votes = {};
  state.hand = [];
  state.vetoRejected = false;
  state.power = null;
  enter(state, 'nomination-discussion', now, state.timing.nomination, context);
}

function replenish(state: MatchState, now: number, context: LegacyContext): void {
  if (state.deck.length >= 3) return;
  state.deck = shuffle([...state.deck, ...state.discards], (size) => context.random(size));
  state.discards = [];
  emit(
    state,
    context,
    now,
    'reshuffle',
    'The remaining draw pile and discarded policies have been reshuffled.',
  );
}

function enact(state: MatchState, card: Card, now: number, chaos: boolean, context: LegacyContext): void {
  if (card.policy === 'safeguard') state.safeguards++;
  else state.overrides++;
  state.electionTracker = 0;
  emit(
    state,
    context,
    now,
    'policy',
    `${chaos ? 'Election chaos enacts' : 'The government enacts'} a ${card.policy}.`,
    { data: { policy: card.policy, chaos, safeguards: state.safeguards, overrides: state.overrides } },
  );

  if (state.safeguards >= 5) {
    finish(state, 'cooperative', 'five safeguards enacted', now, context);

    return;
  }

  if (state.overrides >= 6) {
    finish(state, 'rogue', 'six overrides enacted', now, context);

    return;
  }

  replenish(state, now, context);

  if (chaos || card.policy === 'safeguard') return;
  state.power = state.overrides <= 2 ? 'investigate' : state.overrides === 3 ? 'special-election' : 'execute';
  enter(state, 'executive-discussion', now, state.timing.executive, context);
}

function advanceTracker(state: MatchState, now: number, context: LegacyContext): void {
  state.electionTracker++;
  emit(state, context, now, 'election-tracker', `Election tracker: ${state.electionTracker} of 3.`, {
    data: { tracker: state.electionTracker },
  });

  if (state.electionTracker >= 3) {
    if (!state.deck.length) replenish(state, now, context);
    const card = state.deck.shift();

    if (!card) throw new Error('Policy deck exhausted before victory');
    state.lastGovernment = null;
    enact(state, card, now, true, context);
  }

  if (!terminal(state)) nextRound(state, now, context);
}

function resolveVotes(state: MatchState, now: number, context: LegacyContext): void {
  if (pendingSeats(state).length) return;
  state.lastVotes = { ...state.votes };
  const yes = Object.values(state.votes).filter(Boolean).length;
  const approved = yes > state.seats.filter((seat) => seat.alive).length / 2;
  emit(
    state,
    context,
    now,
    'election',
    `Government ${approved ? 'approved' : 'rejected'}: ${yes} approve, ${Object.keys(state.votes).length - yes} reject.`,
    {
      data: { approved, votes: { ...state.votes }, coordinator: state.coordinator, executor: state.executor },
    },
  );

  if (!approved) {
    advanceTracker(state, now, context);

    return;
  }

  if (state.executor === null) throw new Error('Government has no Executor');
  state.lastGovernment = { coordinator: state.coordinator, executor: state.executor };

  if (state.overrides >= 3 && state.seats[state.executor].role === 'overlord') {
    finish(state, 'rogue', 'the Overlord was elected Executor after three overrides', now, context);

    return;
  }

  if (state.overrides >= 3)
    emit(state, context, now, 'cleared-executor', 'The elected Executor is not the Overlord.', {
      seat: state.executor,
    });

  if (state.deck.length < 3) replenish(state, now, context);
  state.hand = state.deck.splice(0, 3);

  if (state.hand.length !== 3) throw new Error('Legislation requires three policies');
  emit(state, context, now, 'draw', 'You drew three policies.', {
    visibility: state.coordinator,
    seat: state.coordinator,
    data: { cards: structuredClone(state.hand) },
  });
  enter(state, 'coordinator-discard', now, state.timing.action, context);
}

/** Applies due deadlines without relying on alarm delivery punctuality. */
export function advance(input: MatchState, now: number, context: LegacyContext = defaultContext): MatchState {
  if (terminal(input) || input.phase.deadline === null || now < input.phase.deadline) return input;
  const state = structuredClone(input);

  switch (state.phase.kind) {
    case 'nomination-discussion':
      enter(state, 'nomination', now, state.timing.action, context);

      return state;
    case 'government-discussion':
      enter(state, 'voting', now, state.timing.action, context);

      return state;
    case 'executive-discussion':
      enter(state, 'executive-action', now, state.timing.action, context);

      return state;
  }

  const pending = pendingSeats(state);

  if (!state.phase.graceAnnounced && pending.length) {
    state.phase.graceAnnounced = true;
    emit(
      state,
      context,
      now,
      'grace',
      'A required decision is overdue. The reconnection allowance is running.',
      {
        data: { graceUntil: state.phase.deadline! + state.timing.grace },
      },
    );
  }

  // Platform interruption is a table-wide result, independent of seat iteration order.
  for (const seatNumber of pending) {
    const replacementEnd = state.phase.replacements[String(seatNumber)];

    if (
      replacementEnd !== undefined &&
      state.seats[seatNumber].houseProfile !== null &&
      now >= replacementEnd
    )
      return interruptMatch(
        state,
        now,
        'A house replacement could not complete its required decision.',
        context,
      );

    if (
      replacementEnd === undefined &&
      state.seats[seatNumber].houseProfile &&
      now >= state.phase.deadline! + state.timing.grace
    )
      return interruptMatch(
        state,
        now,
        'The house-agent service could not complete a required decision.',
        context,
      );
  }

  for (const seatNumber of pending) {
    const replacementEnd = state.phase.replacements[String(seatNumber)];

    if (now < (replacementEnd ?? state.phase.deadline! + state.timing.grace)) continue;
    const seat = state.seats[seatNumber];

    if (seat.maxRecoveries !== undefined) {
      seat.recoveryCount = (seat.recoveryCount ?? 0) + 1;
      seat.forfeited = seat.recoveryCount > seat.maxRecoveries;
    } else seat.forfeited = true;
    seat.generation++;
    seat.houseProfile = `relief-${seatNumber}`;
    state.phase.replacements[String(seatNumber)] = now + state.timing.action;
    emit(
      state,
      context,
      now,
      'takeover',
      seat.forfeited
        ? `${seat.entrant.name} exhausts recovery and permanently forfeits seat ${seatNumber + 1}.`
        : `A house agent temporarily covers ${seat.entrant.name} in seat ${seatNumber + 1}.`,
      {
        seat: seatNumber,
        data: {
          agentId: seat.entrant.agentId,
          generation: seat.generation,
          recoveryCount: seat.recoveryCount ?? 0,
          recoveryLimit: seat.maxRecoveries ?? 0,
          recoverable: !seat.forfeited,
        },
      },
    );
  }

  return state.events.length === input.events.length ? input : state;
}

/** Explicit original-installation handoff; callers authenticate identity before entering this transition. */
export function reclaimSeat(
  input: MatchState,
  seatNumber: number,
  now: number,
  context: LegacyContext = defaultContext,
): MatchState {
  const current = input.seats[seatNumber];

  if (!current || terminal(input)) throw new GameError('match-finished', 'The match is terminal.');

  if (current.entrant.house)
    throw new GameError('original-house', 'Original house entrants cannot reclaim a seat.');

  if (current.maxRecoveries === undefined)
    throw new GameError('recovery-unavailable', 'This match does not support controller recovery.');

  if (current.forfeited) throw new GameError('recovery-exhausted', 'This seat has permanently forfeited.');

  if (current.houseProfile === null)
    throw new GameError('not-covered', 'This installation already controls its seat.');

  const state = structuredClone(input);
  const seat = state.seats[seatNumber];
  seat.generation++;
  seat.houseProfile = null;
  emit(state, context, now, 'reclaimed', `${seat.entrant.name} reclaimed seat ${seatNumber + 1}.`, {
    seat: seatNumber,
    data: {
      agentId: seat.entrant.agentId,
      generation: seat.generation,
      recoveryCount: seat.recoveryCount ?? 0,
      recoveryLimit: seat.maxRecoveries ?? 0,
    },
  });

  return state;
}

export function nextDeadline(state: MatchState): number | null {
  if (terminal(state) || state.phase.deadline === null) return null;

  if (!pendingSeats(state).length || !state.phase.graceAnnounced) return state.phase.deadline;

  const deadlines = pendingSeats(state).map(
    (seat) => state.phase.replacements[String(seat)] ?? state.phase.deadline! + state.timing.grace,
  );

  return deadlines.length ? Math.min(...deadlines) : state.phase.deadline;
}

/** The caller authenticates the controller, advances the clock, and persists the returned state. */
export function act(
  input: MatchState,
  seatNumber: number,
  generation: number,
  request: ActionRequest,
  now: number,
  context: LegacyContext = defaultContext,
): MatchState {
  const seat = input.seats[seatNumber];

  if (!seat || !seat.alive || terminal(input)) throw new GameError('not-playing', 'This seat cannot act.');

  if (seat.generation !== generation)
    throw new GameError('controller-replaced', 'This controller has been replaced.');

  if (request.phaseId !== input.phase.id)
    throw new GameError('stale-phase', 'The phase has changed; observe again.');
  const state = structuredClone(input);
  const action = request.action;

  if (action.type === 'chat') {
    if (!chatOpen(state))
      throw new GameError('chat-closed', 'The table is silent during private legislation.');
    const text = action.text.trim();

    if (!text || [...text].length > 1000)
      throw new GameError('invalid-message', 'Messages must contain 1–1,000 Unicode characters.', 400);

    if (seat.lastChatAt !== null && now < seat.lastChatAt + state.timing.chatCooldown)
      throw new GameError('chat-cooldown', 'Wait for your speaking cooldown.', 429);
    const targets = [...(action.to ?? []), ...(action.replyTo ? [action.replyTo.seat] : [])];

    if (
      (action.to?.length ?? 0) > 3 ||
      targets.some((target) => !Number.isInteger(target) || !state.seats[target])
    )
      throw new GameError('invalid-recipient', 'Address agents by a valid seat from this match.', 400);

    if (
      action.replyTo &&
      (!action.replyTo.eventKey.startsWith(`${state.id}:`) || action.replyTo.eventKey.length > 200)
    )
      throw new GameError('invalid-reply', 'Reply to a public message in this match.', 400);
    state.seats[seatNumber].lastChatAt = now;
    const data: NonNullable<GameEvent['data']> = {};

    if (action.to?.length) data.to = [...new Set(action.to)];

    if (action.replyTo) data.replyTo = action.replyTo;
    emit(state, context, now, 'chat', text, {
      seat: seatNumber,
      data: Object.keys(data).length ? data : undefined,
    });

    return state;
  }

  if (request.decisionId !== decisionId(state, seatNumber))
    throw new GameError('stale-decision', 'The decision has changed; observe again.');

  const actionKey = (value: GameAction) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));

  if (!legalActions(state, seatNumber).some((option) => actionKey(option.action) === actionKey(action))) {
    throw new GameError(
      'illegal-action',
      'Choose one of the legal actions in your current observation.',
      400,
    );
  }

  switch (action.type) {
    case 'nominate':
      state.executor = action.target;
      state.lastVotes = null;
      emit(
        state,
        context,
        now,
        'nomination',
        `${seat.entrant.name} nominates ${state.seats[action.target].entrant.name} as Executor.`,
        { seat: seatNumber, data: { target: action.target } },
      );
      enter(state, 'government-discussion', now, state.timing.debate, context);
      break;
    case 'vote':
      state.votes[String(seatNumber)] = action.approve;
      emit(state, context, now, 'ballot', `You voted ${action.approve ? 'approve' : 'reject'}.`, {
        seat: seatNumber,
        visibility: seatNumber,
        data: { approve: action.approve },
      });
      resolveVotes(state, now, context);
      break;
    case 'discard': {
      const index = state.hand.findIndex((card) => card.id === action.cardId);
      const discarded = state.hand.splice(index, 1)[0];
      state.discards.push(discarded);
      emit(state, context, now, 'discard', 'You discarded a policy and passed the remaining two.', {
        seat: seatNumber,
        visibility: seatNumber,
        data: { discarded, passed: structuredClone(state.hand) },
      });
      emit(state, context, now, 'received-policies', 'The Coordinator passed you two policies.', {
        seat: state.executor!,
        visibility: state.executor!,
        data: { cards: structuredClone(state.hand) },
      });
      enter(state, 'executor-policy', now, state.timing.action, context);
      break;
    }

    case 'enact': {
      const card = state.hand.find((entry) => entry.id === action.cardId)!;
      const discarded = state.hand.filter((entry) => entry.id !== card.id);
      state.discards.push(...discarded);
      // The discarded card has left the hand before the event's replay checkpoint.
      state.hand = [card];
      emit(
        state,
        context,
        now,
        'executor-discard',
        'You selected a policy to enact and discarded the other.',
        {
          seat: seatNumber,
          visibility: seatNumber,
          data: { enacted: card, discarded },
        },
      );
      state.hand = [];
      enact(state, card, now, false, context);

      if (!terminal(state) && !state.power) nextRound(state, now, context);
      break;
    }

    case 'request-veto':
      emit(state, context, now, 'veto-request', 'The Executor requests a veto.', { seat: seatNumber });
      enter(state, 'veto-response', now, state.timing.action, context);
      break;
    case 'veto':
      emit(
        state,
        context,
        now,
        'veto-response',
        `The Coordinator ${action.approve ? 'agrees to' : 'refuses'} the veto.`,
        { seat: seatNumber, data: { approved: action.approve } },
      );

      if (action.approve) {
        state.discards.push(...state.hand);
        state.hand = [];
        // A veto ends legislation; replenish before any resulting chaos draw.
        replenish(state, now, context);
        advanceTracker(state, now, context);
      } else {
        state.vetoRejected = true;
        enter(state, 'executor-policy', now, state.timing.action, context);
      }

      break;
    case 'investigate': {
      state.investigated.push(action.target);
      const team = teamOf(state.seats[action.target].role);
      emit(
        state,
        context,
        now,
        'investigation',
        `${seat.entrant.name} investigates ${state.seats[action.target].entrant.name}.`,
        { seat: seatNumber, data: { target: action.target } },
      );
      emit(
        state,
        context,
        now,
        'investigation-result',
        `${state.seats[action.target].entrant.name} belongs to the ${team} team.`,
        { seat: seatNumber, visibility: seatNumber, data: { target: action.target, team } },
      );
      nextRound(state, now, context);
      break;
    }

    case 'special-election':
      emit(
        state,
        context,
        now,
        'special-election',
        `${state.seats[action.target].entrant.name} is appointed to lead a special election.`,
        { seat: seatNumber, data: { target: action.target } },
      );
      nextRound(state, now, context, action.target);
      break;
    case 'execute': {
      const target = state.seats[action.target];
      target.alive = false;
      emit(state, context, now, 'execution', `${target.entrant.name} is executed.`, {
        seat: seatNumber,
        data: { target: action.target },
      });

      if (target.role === 'overlord') finish(state, 'cooperative', 'the Overlord was executed', now, context);
      else nextRound(state, now, context);
      break;
    }
  }

  return state;
}
