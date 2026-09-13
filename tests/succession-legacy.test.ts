import { describe, expect, it, vi } from 'vitest';
import {
  act,
  advance,
  createMatch,
  decisionId,
  evolveLegacy,
  interruptMatch,
  recoverMatch,
} from '../src/game/engine';
import type { LegacyBoard, LegacyCommand, LegacyContext } from '../src/game/engine';
import type { GameAction, GameEvent, MatchState, PhaseKind } from '../src/game/types';

function context(seed = 1): LegacyContext {
  let sequence = 0;

  return {
    random(size) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % size;
    },
    id: () => `id-${sequence++}`,
  };
}

function match(injected: LegacyContext = context()): MatchState {
  return createMatch(
    'legacy',
    Array.from({ length: 10 }, (_, index) => ({
      agentId: `agent-${index}`,
      ownerId: `owner-${index}`,
      name: `Agent ${index}`,
      house: false,
      rating: 1000,
    })),
    0,
    injected,
  );
}

function boardOf(state: MatchState): LegacyBoard {
  const { events: _events, ...board } = state;

  return board;
}

function actionCommand(state: MatchState, action: GameAction, seat = state.coordinator): LegacyCommand {
  return {
    type: 'act',
    seat,
    generation: state.seats[seat].generation,
    now: 100,
    request: {
      actionId: 'action',
      phaseId: state.phase.id,
      decisionId: decisionId(state, seat),
      action,
    },
  };
}

function legacy(state: MatchState, command: LegacyCommand, injected: LegacyContext): MatchState {
  switch (command.type) {
    case 'act':
      return act(state, command.seat, command.generation, command.request, command.now, injected);
    case 'advance':
      return advance(state, command.now, injected);
    case 'recover':
      return recoverMatch(state, command.now, injected);
    case 'interrupt':
      return interruptMatch(state, command.now, command.reason, injected);
  }
}

function parity(state: MatchState, command: LegacyCommand) {
  const before = structuredClone(state);
  const expected = legacy(state, command, context(42));
  const captured: GameEvent[] = [];

  const result = evolveLegacy(boardOf(state), command, {
    ...context(42),
    onEvent(_board, event) {
      captured.push(event);
    },
  });

  expect(captured).toEqual(result.appendedEvents);
  expect(result.state).toEqual(boardOf(expected));
  expect(result.appendedEvents.map((event) => ({ ...event, id: event.id + state.events.length }))).toEqual(
    expected.events.slice(state.events.length),
  );
  expect(state).toEqual(before);
  expect(result.state).not.toHaveProperty('events');

  return result;
}

describe('bounded legacy evolution', () => {
  it('captures every initial event with isolated, history-free board snapshots', () => {
    const snapshots: { board: LegacyBoard; event: GameEvent }[] = [];

    const state = match({
      ...context(),
      onEvent(board, event) {
        snapshots.push({ board, event });
      },
    });

    expect(snapshots.map(({ event }) => event)).toEqual(state.events);
    expect(snapshots.at(-1)?.board).toEqual(boardOf(state));

    for (const { board } of snapshots) expect(board).not.toHaveProperty('events');
    expect(snapshots[0].board.phase.id).toBe('');
    expect(snapshots.at(-1)?.board.phase.id).toBe('id-17');
    state.seats[0].alive = false;
    expect(snapshots[0].board.seats[0].alive).toBe(true);
    snapshots[0].board.seats[0].entrant.name = 'Changed snapshot';
    expect(snapshots[1].board.seats[0].entrant.name).not.toBe('Changed snapshot');
    expect(state.seats[0].entrant.name).not.toBe('Changed snapshot');
  });

  it('captures execution, victory, and terminal phase at their exact bounded event states', () => {
    const state = match();
    state.phase.kind = 'executive-action';
    state.power = 'execute';
    const target = state.seats.find((seat) => seat.role === 'overlord')!.number;

    const snapshots: { board: LegacyBoard; event: GameEvent }[] = [];
    const clone = vi.spyOn(globalThis, 'structuredClone');

    try {
      const result = evolveLegacy(boardOf(state), actionCommand(state, { type: 'execute', target }), {
        ...context(),
        onEvent(board, event) {
          snapshots.push({ board, event });
        },
      });

      expect(snapshots.map(({ event }) => event)).toEqual(result.appendedEvents);
      expect(snapshots.map(({ event }) => event.type)).toEqual(['execution', 'victory', 'phase']);
      expect(snapshots[0].board.seats[target].alive).toBe(false);
      expect(snapshots[0].board.winner).toBeNull();
      expect(snapshots[1].board.winner).toBe('cooperative');
      expect(snapshots[1].board.phase.kind).toBe('executive-action');
      expect(snapshots[2].board.phase.kind).toBe('finished');
      expect(snapshots[2].board).toEqual(result.state);
      expect(clone).toHaveBeenCalledTimes(4);
      expect(clone.mock.calls[0][0]).toEqual(expect.objectContaining({ events: [] }));

      for (const [value] of clone.mock.calls.slice(1)) expect(value).not.toHaveProperty('events');
      result.state.seats[target].alive = true;
      expect(snapshots.every(({ board }) => !board.seats[target].alive)).toBe(true);
      expect(state.seats[target].alive).toBe(true);
    } finally {
      clone.mockRestore();
    }
  });

  it('adds no snapshot cloning when no callback is supplied', () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');

    try {
      const state = match();
      expect(clone).not.toHaveBeenCalled();
      evolveLegacy(boardOf(state), { type: 'interrupt', now: 100, reason: 'maintenance' }, context());
      expect(clone).toHaveBeenCalledTimes(1);
    } finally {
      clone.mockRestore();
    }
  });

  it('injects all initial card and phase IDs reproducibly', () => {
    expect(match()).toEqual(match());
    expect(match().deck.every((card) => card.id.startsWith('id-'))).toBe(true);
    expect(match().phase.id).toBe('id-17');
  });

  it('matches advance, recover, interrupt and terminal no-ops', () => {
    const state = match();
    parity(state, { type: 'advance', now: 0 });
    parity(state, { type: 'advance', now: state.phase.deadline! });
    state.phase.replacements['0'] = 123;
    parity(state, { type: 'recover', now: 100 });
    parity(state, { type: 'interrupt', now: 100, reason: 'maintenance' });
    const ended = interruptMatch(state, 100, 'maintenance', context());

    for (const type of ['advance', 'recover', 'interrupt'] as const) {
      expect(parity(ended, { type, now: 200, reason: 'maintenance' }).randomFacts).toEqual([]);
    }
  });

  it.each<PhaseKind>(['nomination-discussion', 'government-discussion', 'executive-discussion'])(
    'matches the %s deadline',
    (kind) => {
      const state = match();
      state.phase.kind = kind;
      parity(state, { type: 'advance', now: state.phase.deadline! });
    },
  );

  it('matches grace, takeover and replacement interruption', () => {
    const state = advance(match(), 20_000, context());
    parity(state, { type: 'advance', now: state.phase.deadline! });
    const late = state.phase.deadline! + state.timing.grace;
    parity(state, { type: 'advance', now: late });
    const takeover = advance(state, late, context());
    parity(takeover, { type: 'advance', now: late + state.timing.action });
    state.seats[state.coordinator].houseProfile = 'house';
    parity(state, { type: 'advance', now: late });
  });

  it.each<GameAction['type']>([
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
  ])('matches the %s action', (type) => {
    const state = match();
    const target = (state.coordinator + 1) % 10;
    state.executor = target;
    state.hand = state.deck.splice(0, 3);
    let action: GameAction;
    let seat = state.coordinator;

    switch (type) {
      case 'chat':
        action = { type, text: 'Hello' };
        break;
      case 'nominate':
        state.phase.kind = 'nomination';
        action = { type, target };
        break;
      case 'vote':
        state.phase.kind = 'voting';

        for (const voter of state.seats) if (voter.number !== seat) state.votes[voter.number] = true;
        action = { type, approve: true };
        break;
      case 'discard':
        state.phase.kind = 'coordinator-discard';
        action = { type, cardId: state.hand[0].id };
        break;
      case 'enact':
        state.phase.kind = 'executor-policy';
        seat = target;
        action = { type, cardId: state.hand[0].id };
        break;
      case 'request-veto':
        state.phase.kind = 'executor-policy';
        state.overrides = 5;
        seat = target;
        action = { type };
        break;
      case 'veto':
        state.phase.kind = 'veto-response';
        action = { type, approve: true };
        break;
      case 'investigate':
      case 'special-election':
      case 'execute':
        state.phase.kind = 'executive-action';
        state.power = type;
        action = { type, target };
        break;
    }

    parity(state, actionCommand(state, action, seat));
  });

  it('replays seeded reshuffles and records every realized random fact in order', () => {
    const state = match();
    state.phase.kind = 'voting';
    state.executor = (state.coordinator + 1) % 10;
    state.discards = state.deck.splice(1);

    for (const seat of state.seats) if (seat.number !== state.coordinator) state.votes[seat.number] = true;
    const command = actionCommand(state, { type: 'vote', approve: true });
    const result = parity(state, command);
    expect(result.appendedEvents.some((event) => event.type === 'reshuffle')).toBe(true);
    expect(result.randomFacts.filter((fact) => fact.kind === 'index').map((fact) => fact.size)).toEqual(
      Array.from({ length: 16 }, (_, index) => 17 - index),
    );
    const facts = [...result.randomFacts];

    const replay = evolveLegacy(boardOf(state), command, {
      random(size) {
        const fact = facts.shift();

        if (fact?.kind !== 'index' || fact.size !== size) throw new Error('Unexpected random draw');

        return fact.value;
      },
      id() {
        const fact = facts.shift();

        if (fact?.kind !== 'id') throw new Error('Unexpected ID');

        return fact.value;
      },
    });

    expect(replay).toEqual(result);
    expect(facts).toEqual([]);
  });

  it('never passes historical events to structuredClone', () => {
    const state = match();
    const clone = vi.spyOn(globalThis, 'structuredClone');

    try {
      evolveLegacy(boardOf(state), actionCommand(state, { type: 'chat', text: 'Bounded' }), context());
      expect(clone).toHaveBeenCalledWith(expect.objectContaining({ events: [] }));
    } finally {
      clone.mockRestore();
    }
  });

  it('preserves rejected-command errors without modifying the board', () => {
    const state = match();
    const command = actionCommand(state, { type: 'nominate', target: state.coordinator });
    const before = structuredClone(state);
    expect(() => legacy(state, command, context())).toThrow('Choose one of the legal actions');
    expect(() => evolveLegacy(boardOf(state), command, context())).toThrow('Choose one of the legal actions');
    expect(state).toEqual(before);
  });
});
