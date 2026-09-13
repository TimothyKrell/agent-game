import { createMatch, evolveLegacy } from '../engine';
import type { LegacyCommand, LegacyBoard } from '../engine';
import { gameDescriptor } from '../descriptors';
import { GameError, teamOf } from '../types';
import type { Entrant, GameAction, GameEvent } from '../types';
import { createCommitment, secureRandom } from './commitment';
import { createAct2, applyAct2, advanceAct2Discussion, pendingAct2, assertAct2Integrity } from './act2';
import type { Act2Action, Act2Context, Act2CapEvidence } from './act2';
import type {
  Act1Board,
  CreateSuccessionOptions,
  Evolution,
  RandomContext,
  RealizedRandom,
  SuccessionCommand,
  SuccessionEvent,
  SuccessionState,
} from './types';

const legacyActions = new Set([
  'chat',
  'nominate',
  'vote',
  'discard',
  'enact',
  'request-veto',
  'veto',
  'investigate',
  'special-election',
  'execute',
]);
type EventContext = RandomContext & { capture?(eventKey: string, state: SuccessionState): void };
function isLegacyAction(
  action: SuccessionCommand & { type: 'act' },
): action is SuccessionCommand & { type: 'act'; request: { action: GameAction } } {
  return legacyActions.has(action.request.action.type);
}

function legacyEvents(events: GameEvent[], random: RandomContext): SuccessionEvent[] {
  return events
    .filter((event) => !(event.type === 'phase' && event.data?.phase === 'finished'))
    .map(({ id: _id, ...event }) => ({
      ...event,
      eventKey: random.id(),
      act: 1,
      ...(event.type === 'victory' ? { type: 'act-ended', text: `Act 1 ended: ${event.text}` } : {}),
    }));
}

export async function createSuccession(
  id: string,
  entrants: Entrant[],
  now: number,
  options: CreateSuccessionOptions = {},
): Promise<Evolution> {
  const random = options.random ?? secureRandom;
  const descriptor = gameDescriptor('succession');
  const snapshot = options.snapshot ?? {
    ...descriptor,
    mode: 'ranked',
    houseModel: { provider: 'preview', model: 'scripted', policyVersion: descriptor.housePolicyVersion },
  };
  if (
    snapshot.gameId !== 'succession' ||
    snapshot.rulesVersion !== 'succession-1' ||
    snapshot.ratingPoolId !== 'succession-1' ||
    snapshot.ratingVersion !== 'winner-softmax-1' ||
    snapshot.protocolVersion !== '2'
  )
    throw new GameError('game-mismatch', 'Unsupported Succession snapshot.', 400);
  const commitment = await createCommitment(id, random, options.salt);
  const childFrames: LegacyBoard[] = [];
  const child = createMatch(id, entrants, now, {
    timing: snapshot.timing,
    mode: snapshot.mode,
    random: random.random,
    id: random.id,
    onEvent(board) {
      childFrames.push(board);
    },
  });
  const { seats, events, ...board } = child;
  const state: SuccessionState = {
    storageVersion: 1,
    gameId: 'succession',
    rulesVersion: 'succession-1',
    id,
    createdAt: now,
    finishedAt: null,
    snapshot: structuredClone(snapshot),
    status: 'active',
    seats,
    stage: { act: 1, board },
    phase: board.phase,
    act1Result: null,
    result: null,
    interruptionReason: null,
    commitment,
    lastChat: null,
  };
  const appendedEvents: SuccessionEvent[] = [
    {
      eventKey: random.id(),
      at: now,
      act: 1,
      round: 1,
      type: 'commitment',
      text: 'Final-tie priority committed before play.',
      visibility: 'public',
      data: { digest: commitment.digest },
    },
    ...legacyEvents(events, random),
  ];
  const replayFrames = appendedEvents.map((entry, index) => ({
    eventKey: entry.eventKey,
    state: legacyFrame(state, childFrames[Math.max(0, index - 1)]),
  }));
  replayFrames[replayFrames.length - 1].state = structuredClone(state);
  return { state, appendedEvents, replay: null, replayFrames };
}

function legacyFrame(template: SuccessionState, child: LegacyBoard): SuccessionState {
  const frame = structuredClone(template);
  const { seats, ...board } = child;
  frame.seats = structuredClone(seats);
  frame.stage = { act: 1, board: structuredClone(board) };
  frame.phase = structuredClone(board.phase);
  // Child faction victories are historical Act 1 facts, never terminal match results.
  frame.status = board.phase.kind === 'interrupted' ? 'interrupted' : 'active';
  frame.finishedAt = frame.status === 'interrupted' ? board.finishedAt : null;
  frame.interruptionReason = frame.status === 'interrupted' ? board.winReason : null;
  return frame;
}

function recordRandom(context: RandomContext, facts: RealizedRandom[]): RandomContext {
  return {
    random(size) {
      const value = context.random(size);
      if (!Number.isInteger(value) || value < 0 || value >= size)
        throw new Error('Invalid injected random index');
      facts.push({ kind: 'index', size, value });
      return value;
    },
    id() {
      const value = context.id();
      facts.push({ kind: 'id', value });
      return value;
    },
  };
}

export function evolveSuccession(
  input: SuccessionState,
  command: SuccessionCommand,
  context: RandomContext = secureRandom,
): Evolution {
  const randomness: RealizedRandom[] = [];
  const replayFrames: Evolution['replayFrames'] = [];
  const random: EventContext = {
    ...recordRandom(context, randomness),
    capture(eventKey, state) {
      replayFrames.push({ eventKey, state: structuredClone(state) });
    },
  };
  if (input.status !== 'active') {
    if (command.type === 'act') throw new GameError('not-playing', 'This match has ended.');
    return { state: input, appendedEvents: [], replay: null, replayFrames: [] };
  }
  if (command.type === 'act' && command.request.gameId !== 'succession')
    throw new GameError('game-mismatch', 'This match uses Succession.');
  const state = structuredClone(input);
  const appendedEvents: SuccessionEvent[] = [];
  if (state.stage.act === 1) {
    let childCommand: LegacyCommand;
    if (command.type === 'act') {
      if (!isLegacyAction(command))
        throw new GameError('illegal-action', 'Act 2 actions are unavailable in Act 1.', 400);
      childCommand = { ...command, request: { ...command.request, action: command.request.action } };
    } else childCommand = command;
    const childFrames: LegacyBoard[] = [];
    const child = evolveLegacy({ ...state.stage.board, seats: state.seats }, childCommand, {
      ...random,
      onEvent(board) {
        childFrames.push(board);
      },
    });
    const { seats, ...board } = child.state;
    state.seats = seats;
    state.stage.board = board;
    state.phase = board.phase;
    const translated = legacyEvents(child.appendedEvents, random);
    const retained = child.appendedEvents.filter(
      (entry) => !(entry.type === 'phase' && entry.data?.phase === 'finished'),
    );
    for (const [index, entry] of translated.entries())
      if (entry.type !== 'chat')
        replayFrames.push({
          eventKey: entry.eventKey,
          state: legacyFrame(input, childFrames[retained[index].id - 1]),
        });
    appendedEvents.push(...translated);
    if (board.phase.kind === 'interrupted') {
      state.status = 'interrupted';
      state.finishedAt = command.now;
      state.interruptionReason = board.winReason;
    } else if (board.phase.kind === 'finished') transition(state, board, command.now, random, appendedEvents);
  } else evolveAct2(state, command, random, appendedEvents);
  if (command.type === 'act' && command.request.action.type === 'chat') {
    state.lastChat = { seat: command.seat, at: command.now };
    return {
      state,
      appendedEvents,
      replay: { command: { type: 'chat', seat: command.seat, now: command.now }, randomness: [] },
      replayFrames: [],
    };
  }
  if (replayFrames.length) replayFrames[replayFrames.length - 1].state = structuredClone(state);
  return {
    state,
    appendedEvents,
    replay:
      appendedEvents.length || randomness.length ? { command: structuredClone(command), randomness } : null,
    replayFrames,
  };
}

function transition(
  state: SuccessionState,
  archive: Act1Board,
  now: number,
  random: EventContext,
  events: SuccessionEvent[],
): void {
  if (!archive.winner || !archive.winReason) throw new Error('Missing Act 1 result');
  const returnedSeats = state.seats.filter((seat) => !seat.alive).map((seat) => seat.number);
  const bonuses = state.seats.map((seat) => (teamOf(seat.role) === archive.winner ? 1 : 0));
  state.act1Result = {
    team: archive.winner,
    reason: archive.winReason,
    roles: state.seats.map((seat) => seat.role),
    returnedSeats,
    bonuses,
    finalTracks: {
      safeguards: archive.safeguards,
      overrides: archive.overrides,
      electionTracker: archive.electionTracker,
      drawCount: archive.deck.length,
      discardCount: archive.discards.length,
      vetoUnlocked: archive.overrides >= 5,
    },
  };
  for (const seat of state.seats) {
    seat.alive = true;
    seat.lastChatAt = null;
  }
  startAct2(state, archive, bonuses, now, random, events);
}

function event(
  state: SuccessionState,
  now: number,
  random: EventContext,
  events: SuccessionEvent[],
  type: string,
  text: string,
  extra: Partial<Pick<SuccessionEvent, 'visibility' | 'seat' | 'data'>> = {},
): void {
  const entry: SuccessionEvent = {
    eventKey: random.id(),
    at: now,
    act: state.stage.act,
    round: state.stage.board.round,
    type,
    text,
    visibility: 'public',
    ...extra,
  };
  events.push(entry);
  if (type !== 'chat') random.capture?.(entry.eventKey, state);
}
function syncAct2Phase(state: SuccessionState, now: number): void {
  if (state.stage.act !== 2) return;
  const board = state.stage.board;
  if (state.phase.id === board.phaseId) return;
  state.phase = {
    id: board.phaseId,
    kind: `act-2:${board.phase}`,
    startedAt: now,
    deadline:
      board.phase === 'finished'
        ? null
        : now +
          (board.phase === 'discussion'
            ? Math.round(state.snapshot.timing.action / 3)
            : state.snapshot.timing.action),
    graceAnnounced: false,
    replacements: {},
  };
}
function startAct2(
  state: SuccessionState,
  archive: Act1Board,
  bonuses: number[],
  now: number,
  random: EventContext,
  events: SuccessionEvent[],
): void {
  state.stage = { act: 2, board: createAct2(random.random, random.id, bonuses.map(Boolean)), archive };
  state.lastChat = null;
  syncAct2Phase(state, now);
  event(state, now, random, events, 'act-started', 'All ten seats return. Succession begins.', {
    data: {
      team: state.act1Result!.team,
      reason: state.act1Result!.reason,
      roles: state.act1Result!.roles,
      returnedSeats: state.act1Result!.returnedSeats,
      bonuses,
      firstSeat: state.stage.board.firstSeat,
    },
  });
  for (const seat of state.seats)
    event(state, now, random, events, 'capability-deal', 'Your fresh capability hand.', {
      seat: seat.number,
      visibility: seat.number,
      data: {
        cards: state.stage.board.resources[seat.number].hand.map(({ id, capability }) => ({
          id,
          capability,
        })),
      },
    });
  event(state, now, random, events, 'phase', 'Discuss the next turn.', {
    data: { phase: state.phase.kind, deadline: state.phase.deadline },
  });
}
function act2Context(
  state: SuccessionState,
  now: number,
  random: EventContext,
  events: SuccessionEvent[],
): Act2Context {
  return {
    ...random,
    priority: state.commitment.priority,
    emit(fact) {
      if (state.stage.act === 2) {
        for (const seat of state.seats) seat.alive = state.stage.board.resources[seat.number].hand.length > 0;
        syncAct2Phase(state, now);
        if (state.stage.board.winner !== null)
          finishAct2(state, state.stage.board.winner, state.stage.board.capEvidence, now);
      }
      event(state, now, random, events, fact.type, fact.type.replaceAll('-', ' '), {
        data: { ...fact },
        ...('seat' in fact ? { seat: fact.seat } : {}),
      });
    },
    onFinish(winner, tieBreak) {
      finishAct2(state, winner, tieBreak, now);
    },
  };
}
function finishAct2(
  state: SuccessionState,
  winner: number,
  tieBreak: Act2CapEvidence | null,
  now: number,
): void {
  if (!state.act1Result) throw new Error('Missing Act 1 archive');
  state.status = 'finished';
  state.finishedAt = now;
  state.result = {
    kind: 'individual',
    winnerSeat: winner,
    reason: tieBreak ? 'round-cap' : 'last-survivor',
    act1: { team: state.act1Result.team, reason: state.act1Result.reason },
    tieBreak,
  };
}
function interrupt(
  state: SuccessionState,
  now: number,
  reason: string,
  random: EventContext,
  events: SuccessionEvent[],
): void {
  state.status = 'interrupted';
  state.finishedAt = now;
  state.interruptionReason = reason;
  state.phase = {
    id: random.id(),
    kind: 'interrupted',
    startedAt: now,
    deadline: null,
    graceAnnounced: false,
    replacements: {},
  };
  event(state, now, random, events, 'interrupted', reason);
}
function evolveAct2(
  state: SuccessionState,
  command: SuccessionCommand,
  random: EventContext,
  events: SuccessionEvent[],
): void {
  if (state.stage.act !== 2) throw new Error('Expected Act 2');
  const board = state.stage.board;
  assertAct2Integrity(board);
  const now = command.now;
  const context = act2Context(state, now, random, events);
  if (command.type === 'interrupt') {
    interrupt(state, now, command.reason, random, events);
    return;
  }
  if (command.type === 'recover') {
    const replacements = Object.keys(state.phase.replacements);
    board.phaseId = random.id();
    syncAct2Phase(state, now);
    for (const seat of replacements) state.phase.replacements[seat] = now + state.snapshot.timing.action;
    event(
      state,
      now,
      random,
      events,
      'recovered',
      'The current choice has a fresh platform-recovery window.',
    );
    return;
  }
  if (command.type === 'advance') {
    const deadline = state.phase.deadline;
    if (deadline === null || now < deadline) return;
    if (board.phase === 'discussion') {
      advanceAct2Discussion(board, context);
      syncAct2Phase(state, now);
      return;
    }
    const pending = pendingAct2(board);
    if (!state.phase.graceAnnounced && pending.length) {
      state.phase.graceAnnounced = true;
      event(
        state,
        now,
        random,
        events,
        'grace',
        'A required decision is overdue. The reconnection allowance is running.',
        { data: { graceUntil: deadline + state.snapshot.timing.grace } },
      );
    }
    for (const number of pending) {
      const replacementEnd = state.phase.replacements[String(number)];
      if (
        (replacementEnd !== undefined && now >= replacementEnd) ||
        (replacementEnd === undefined &&
          state.seats[number].houseProfile &&
          now >= deadline + state.snapshot.timing.grace)
      ) {
        interrupt(
          state,
          now,
          'The house-agent service could not complete a required decision.',
          random,
          events,
        );
        return;
      }
    }
    for (const number of pending) {
      if (
        state.phase.replacements[String(number)] !== undefined ||
        now < deadline + state.snapshot.timing.grace
      )
        continue;
      const seat = state.seats[number];
      seat.forfeited = true;
      seat.generation++;
      seat.houseProfile = `relief-${number}`;
      state.phase.replacements[String(number)] = now + state.snapshot.timing.action;
      event(
        state,
        now,
        random,
        events,
        'takeover',
        `Seat ${number + 1} forfeits. A house agent takes over.`,
        { seat: number, data: { agentId: seat.entrant.agentId, generation: seat.generation } },
      );
    }
    return;
  }
  const seat = state.seats[command.seat];
  if (!seat || !seat.alive) throw new GameError('not-playing', 'This seat cannot act.');
  if (seat.generation !== command.generation)
    throw new GameError('controller-replaced', 'This controller has been replaced.');
  if (command.request.phaseId !== state.phase.id)
    throw new GameError('stale-phase', 'The phase has changed; observe again.');
  const action = command.request.action;
  if (action.type === 'chat') {
    if (board.phase === 'exchange')
      throw new GameError('chat-closed', 'The table is silent during private exchange.');
    const text = action.text.trim();
    if (!text || [...text].length > 1000)
      throw new GameError('invalid-message', 'Messages must contain 1–1,000 Unicode characters.', 400);
    if (seat.lastChatAt !== null && now < seat.lastChatAt + state.snapshot.timing.chatCooldown)
      throw new GameError('chat-cooldown', 'Wait for your speaking cooldown.', 429);
    seat.lastChatAt = now;
    event(state, now, random, events, 'chat', text, { seat: command.seat });
    return;
  }
  if (command.request.decisionId !== `${state.phase.id}:${seat.number}:${seat.generation}`)
    throw new GameError('stale-decision', 'The decision has changed; observe again.');
  if (!isAct2Action(action))
    throw new GameError('illegal-action', 'Act 1 actions are unavailable in Act 2.', 400);
  const priorHands = board.resources.map((resource) => JSON.stringify(resource.hand));
  const priorExchange = JSON.stringify(board.pending?.exchange ?? null);
  try {
    applyAct2(board, command.seat, action, context);
  } catch (error) {
    if (error instanceof Error && error.message.includes('legal'))
      throw new GameError('illegal-action', 'Choose a current legal action.', 400);
    throw error;
  }
  for (const participant of state.seats) {
    const hand = board.resources[participant.number].hand;
    if (priorHands[participant.number] !== JSON.stringify(hand))
      event(state, now, random, events, 'hand-updated', 'Your current capability hand.', {
        seat: participant.number,
        visibility: participant.number,
        data: { cards: hand.map(({ id, capability }) => ({ id, capability })) },
      });
  }
  if (board.pending?.exchange && JSON.stringify(board.pending.exchange) !== priorExchange)
    event(
      state,
      now,
      random,
      events,
      'exchange-draw',
      'Choose two cards to return from your private exchange pool.',
      {
        seat: board.pending.actor,
        visibility: board.pending.actor,
        data: { cards: board.pending.exchange.map(({ id, capability }) => ({ id, capability })) },
      },
    );
  if (action.type === 'pass' || action.type === 'challenge')
    event(state, now, random, events, 'reaction', 'Your sealed response is committed.', {
      seat: seat.number,
      visibility: seat.number,
      data: { choice: action.type },
    });
  for (const participant of state.seats)
    participant.alive = board.resources[participant.number].hand.length > 0;
  syncAct2Phase(state, now);
  assertAct2Integrity(board);
}
function isAct2Action(action: import('../../shared/succession').Action2): action is Act2Action {
  return [
    'income',
    'tax',
    'exchange',
    'steal',
    'assassinate',
    'coup',
    'challenge',
    'pass',
    'block',
    'lose-influence',
    'return-influence',
  ].includes(action.type);
}
