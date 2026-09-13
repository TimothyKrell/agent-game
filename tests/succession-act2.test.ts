import { describe, expect, it } from 'vitest';
import {
  advanceAct2Discussion,
  applyAct2,
  createAct2,
  legalAct2,
  pendingAct2,
  type Act2Board,
  type Act2Context,
  type Act2Fact,
  type Capability,
} from '../src/game/succession/act2';

function setup(seed = 1) {
  let value = seed;
  let serial = 0;
  const facts: Act2Fact[] = [];
  const finishes: number[] = [];

  const context: Act2Context = {
    random(size) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

      return Math.floor((value / 4294967296) * size);
    },
    id: () => `opaque-${serial++}`,
    priority: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    emit: (fact) => {
      facts.push(fact);
    },
    onFinish: (winner) => {
      finishes.push(winner);
    },
  };

  const board = createAct2(
    context.random,
    context.id,
    Array.from({ length: 10 }, (_, seat) => seat < 6),
  );

  return { board, context, facts, finishes };
}

function invariant(board: Act2Board) {
  const hands = board.resources.flatMap((seat) => seat.hand);
  const revealed = board.resources.flatMap((seat) => seat.revealed);
  const buffer = board.pending?.exchange ?? [];
  const cards = [...hands, ...revealed, ...board.court, ...buffer];
  expect(cards).toHaveLength(25);
  expect(new Set(cards.map((card) => card.physicalId)).size).toBe(25);
  expect(new Set(cards.map((card) => card.id)).size).toBe(25);

  for (const capability of ['treasurer', 'thief', 'assassin', 'envoy', 'guard'])
    expect(cards.filter((card) => card.capability === capability)).toHaveLength(5);
  expect(hands.length + revealed.length).toBe(20);
  expect(board.court).toHaveLength(board.phase === 'exchange' ? 3 : 5);

  for (const seat of board.resources) {
    expect(Number.isInteger(seat.coins) && seat.coins >= 0).toBe(true);
    expect(seat.hand.length + seat.revealed.length).toBe(2);
  }

  expect(board.round).toBeLessThanOrEqual(12);
}

function replies(board: Act2Board, context: Act2Context, challengers: number[] = []) {
  for (const seat of pendingAct2(board).toReversed())
    applyAct2(board, seat, { type: challengers.includes(seat) ? 'challenge' : 'pass' }, context);
}

function lose(board: Act2Board, context: Act2Context, index = 0) {
  const [seat] = pendingAct2(board);
  applyAct2(board, seat, { type: 'lose-influence', cardId: board.resources[seat].hand[index].id }, context);
}

function ensureCapability(board: Act2Board, seat: number, capability: Capability) {
  if (board.resources[seat].hand.some((card) => card.capability === capability)) return;

  const zones = [
    board.court,
    ...board.resources.filter((_, index) => index !== seat).map((resource) => resource.hand),
  ];

  for (const zone of zones) {
    const index = zone.findIndex((card) => card.capability === capability);

    if (index >= 0) {
      [zone[index], board.resources[seat].hand[0]] = [board.resources[seat].hand[0], zone[index]];

      return;
    }
  }

  throw new Error('Missing test capability');
}

function removeCapability(board: Act2Board, seat: number, capability: Capability) {
  for (let i = 0; i < board.resources[seat].hand.length; i++) {
    if (board.resources[seat].hand[i].capability !== capability) continue;
    const index = board.court.findIndex((card) => card.capability !== capability);
    [board.court[index], board.resources[seat].hand[i]] = [board.resources[seat].hand[i], board.court[index]];
  }
}

function eliminate(board: Act2Board, seat: number, count = 2) {
  board.resources[seat].revealed.push(...board.resources[seat].hand.splice(0, count));
}

describe('Succession Act 2', () => {
  it('rejects corrupt physical-card persistence before mutation', () => {
    const { board, context } = setup();
    board.court[0].physicalId = board.court[1].physicalId;
    const before = structuredClone(board);
    expect(() => advanceAct2Discussion(board, context)).toThrow('integrity');
    expect(board).toEqual(before);
  });

  it('steals zero or at most two coins and supports both unchallenged theft blocks', () => {
    for (const coins of [0, 1, 5]) {
      for (const block of [null, 'thief', 'envoy']) {
        const { board, context } = setup();
        const actor = board.activeSeat;
        const target = (actor + 1) % 10;
        const before = board.resources[actor].coins;
        board.resources[target].coins = coins;
        advanceAct2Discussion(board, context);
        applyAct2(board, actor, { type: 'steal', target }, context);
        replies(board, context);

        if (block === 'thief' || block === 'envoy') {
          applyAct2(board, target, { type: 'block', capability: block }, context);
          replies(board, context);
        } else applyAct2(board, target, { type: 'pass' }, context);
        const transferred = block ? 0 : Math.min(2, coins);
        expect(board.resources[actor].coins).toBe(before + transferred);
        expect(board.resources[target].coins).toBe(coins - transferred);
        invariant(board);
      }
    }
  });

  it('cancels an attack when its target dies challenging the action claim', () => {
    const { board, context } = setup();
    const actor = board.activeSeat;
    const target = (actor + 1) % 10;
    ensureCapability(board, actor, 'assassin');
    eliminate(board, target, 1);
    board.resources[actor].coins = 3;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'assassinate', target }, context);
    replies(board, context, [target]);
    lose(board, context);
    expect(board.phase).toBe('discussion');
    expect(board.resources[target].hand).toHaveLength(0);
    expect(board.resources[actor].coins).toBe(0);
    invariant(board);
  });

  it('anchors block challenge priority to the actor, with the actor last', () => {
    const { board, context } = setup();
    const actor = board.activeSeat;
    const target = (actor + 2) % 10;
    const thirdParty = (actor + 1) % 10;
    ensureCapability(board, target, 'thief');
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'steal', target }, context);
    replies(board, context);
    applyAct2(board, target, { type: 'block', capability: 'thief' }, context);
    applyAct2(board, actor, { type: 'challenge' }, context);
    replies(board, context, [thirdParty]);
    expect(pendingAct2(board)).toEqual([thirdParty]);
    lose(board, context);
    expect(board.resources[actor].hand).toHaveLength(2);
    invariant(board);
  });

  it('uses influence then coins ahead of precommitted priority at the cap', () => {
    for (const decisive of ['influence', 'coins']) {
      const { board, context } = setup();
      const actor = board.activeSeat;
      const other = (actor + 1) % 10;

      for (let seat = 0; seat < 10; seat++) if (seat !== actor && seat !== other) eliminate(board, seat);
      board.round = 12;
      board.resources[actor].coins = decisive === 'coins' ? 4 : 2;
      board.resources[other].coins = decisive === 'coins' ? 2 : 8;

      if (decisive === 'influence') eliminate(board, other, 1);
      advanceAct2Discussion(board, context);
      applyAct2(board, actor, { type: 'income' }, context);
      advanceAct2Discussion(board, context);
      applyAct2(board, other, { type: 'income' }, context);
      expect(board.winner).toBe(actor);
      expect(board.capEvidence?.decisive).toBe(decisive);
      invariant(board);
    }
  });

  it('deals independent resources, enforces affordability and mandatory coups, rejects illegal choices atomically', () => {
    const { board, context } = setup();
    invariant(board);
    expect(board.resources.map((seat) => seat.coins)).toEqual([3, 3, 3, 3, 3, 3, 2, 2, 2, 2]);
    expect(pendingAct2(board)).toEqual([]);
    advanceAct2Discussion(board, context);
    const actor = board.activeSeat;
    board.resources[actor].coins = 2;
    expect(
      legalAct2(board, actor).some((action) => action.type === 'assassinate' || action.type === 'coup'),
    ).toBe(false);
    const before = structuredClone(board);
    expect(() => applyAct2(board, actor, { type: 'steal', target: actor }, context)).toThrow();
    expect(board).toEqual(before);
    board.resources[actor].coins = 10;
    expect(legalAct2(board, actor)).toHaveLength(9);
    expect(legalAct2(board, actor).every((action) => action.type === 'coup')).toBe(true);
  });

  it('seals reactions, resolves clockwise rather than arrival order, proves automatically and allows chosen loss', () => {
    const { board, context, facts } = setup();
    advanceAct2Discussion(board, context);
    const actor = board.activeSeat;
    ensureCapability(board, actor, 'treasurer');
    const oldHandles = board.resources[actor].hand.map((card) => card.id);
    const coins = board.resources[actor].coins;
    applyAct2(board, actor, { type: 'tax' }, context);
    const phaseId = board.phaseId;
    const factCount = facts.length;
    const late = (actor + 9) % 10;
    applyAct2(board, late, { type: 'challenge' }, context);
    expect(board.phaseId).toBe(phaseId);
    expect(facts).toHaveLength(factCount);
    expect(legalAct2(board, late)).toEqual([]);
    expect(() => applyAct2(board, late, { type: 'pass' }, context)).toThrow();
    const first = (actor + 1) % 10;
    replies(board, context, [first]);
    expect(pendingAct2(board)).toEqual([first]);
    expect(board.resources[actor].hand.every((card) => !oldHandles.includes(card.id))).toBe(true);
    const chosen = board.resources[first].hand[1];
    lose(board, context, 1);
    expect(board.resources[first].revealed[0]).toEqual(chosen);
    expect(board.resources[late].hand).toHaveLength(2);
    expect(board.resources[actor].coins).toBe(coins + 3);
    expect(facts.find((fact) => fact.type === 'proof')).toEqual({
      type: 'proof',
      seat: actor,
      capability: 'treasurer',
    });
    invariant(board);
  });

  it('sustains unchallenged bluffs without proof or handle changes', () => {
    const { board, context, facts } = setup();
    const actor = board.activeSeat;
    removeCapability(board, actor, 'treasurer');
    const hand = structuredClone(board.resources[actor].hand);
    const coins = board.resources[actor].coins;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'tax' }, context);
    replies(board, context);
    expect(board.resources[actor].hand).toEqual(hand);
    expect(board.resources[actor].coins).toBe(coins + 3);
    expect(facts.some((fact) => fact.type === 'proof')).toBe(false);
  });

  it('does not refund a challenged false assassination and cancels after actor death', () => {
    const { board, context } = setup();
    const actor = board.activeSeat;
    const target = (actor + 1) % 10;
    removeCapability(board, actor, 'assassin');
    eliminate(board, actor, 1);
    board.resources[actor].coins = 3;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'assassinate', target }, context);
    replies(board, context, [target]);
    expect(pendingAct2(board)).toEqual([actor]);
    lose(board, context);
    expect(board.resources[actor].coins).toBe(0);
    expect(board.resources[target].hand).toHaveLength(2);
    expect(board.phase).toBe('discussion');
    invariant(board);
  });

  it('cancels a one-influence assassin after losing a challenge to a truthful Guard block', () => {
    const { board, context } = setup();
    const actor = board.activeSeat;
    const target = (actor + 1) % 10;
    eliminate(board, actor, 1);
    ensureCapability(board, target, 'guard');
    board.resources[actor].coins = 3;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'assassinate', target }, context);
    replies(board, context);
    applyAct2(board, target, { type: 'block', capability: 'guard' }, context);
    replies(board, context, [actor]);
    lose(board, context);
    expect(board.resources[actor].hand).toHaveLength(0);
    expect(board.resources[target].hand).toHaveLength(2);
    expect(board.resources[actor].coins).toBe(0);
    invariant(board);
  });

  it('allows two sequential losses after a disproved block, but never requests a dead target loss', () => {
    for (const influences of [1, 2]) {
      const { board, context } = setup();
      const actor = board.activeSeat;
      const target = (actor + 1) % 10;
      removeCapability(board, target, 'guard');

      if (influences === 1) eliminate(board, target, 1);
      board.resources[actor].coins = 3;
      advanceAct2Discussion(board, context);
      applyAct2(board, actor, { type: 'assassinate', target }, context);
      replies(board, context);
      applyAct2(board, target, { type: 'block', capability: 'guard' }, context);
      replies(board, context, [actor]);
      lose(board, context);

      if (influences === 2) {
        expect(board.phase).toBe('loss');
        lose(board, context);
      }

      expect(board.phase).toBe('discussion');
      expect(board.resources[target].hand).toHaveLength(0);
      invariant(board);
    }
  });

  it('enumerates all private exchange pairs for one or two influence and invalidates old handles', () => {
    for (const influences of [1, 2]) {
      const { board, context } = setup();
      const actor = board.activeSeat;

      if (influences === 1) eliminate(board, actor, 1);
      const old = board.resources[actor].hand.map((card) => card.id);
      advanceAct2Discussion(board, context);
      applyAct2(board, actor, { type: 'exchange' }, context);
      replies(board, context);
      invariant(board);
      const choices = legalAct2(board, actor);
      expect(choices).toHaveLength(influences === 1 ? 3 : 6);
      expect(JSON.stringify(choices)).not.toContain(`"${old[0]}"`);
      const drawn = board.pending?.exchange?.map((card) => card.id).sort();

      const returnDrawn = choices.find(
        (action) =>
          action.type === 'return-influence' && JSON.stringify(action.cardIds) === JSON.stringify(drawn),
      );

      if (!returnDrawn) throw new Error('Cannot return both draws');
      applyAct2(board, actor, returnDrawn, context);
      expect(board.resources[actor].hand).toHaveLength(influences);
      expect(() => applyAct2(board, actor, returnDrawn, context)).toThrow();
      invariant(board);
    }
  });

  it('ends immediately on a sole survivor before continuing an attack', () => {
    const { board, context, finishes } = setup();
    const actor = board.activeSeat;
    const target = (actor + 1) % 10;

    for (let seat = 0; seat < 10; seat++) if (seat !== actor && seat !== target) eliminate(board, seat);
    eliminate(board, target, 1);
    board.resources[actor].coins = 7;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'coup', target }, context);
    lose(board, context);
    expect(board.phase).toBe('finished');
    expect(board.winner).toBe(actor);
    expect(board.capEvidence).toBeNull();
    expect(finishes).toEqual([actor]);
    invariant(board);
  });

  it('consumes dead fixed-ring slots and finishes round twelve with complete priority evidence', () => {
    const { board, context, finishes } = setup();
    const actor = board.firstSeat;
    const other = (actor + 3) % 10;

    for (let seat = 0; seat < 10; seat++) if (seat !== actor && seat !== other) eliminate(board, seat);
    board.round = 12;
    board.resources[actor].coins = 2;
    board.resources[other].coins = 2;
    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'income' }, context);
    expect(board.slot).toBe(3);
    expect(board.round).toBe(12);
    advanceAct2Discussion(board, context);
    applyAct2(board, other, { type: 'income' }, context);
    expect(board.phase).toBe('finished');
    expect(board.capEvidence?.decisive).toBe('priority');
    expect(board.capEvidence?.scores).toHaveLength(2);
    expect(board.winner).toBe(Math.max(actor, other));
    expect(finishes).toHaveLength(1);
    invariant(board);
  });

  it('completes 250 seeded full games preserving every card and frozen eliminated resources at every decision', () => {
    const phases = new Set<string>();
    const actions = new Set<string>();

    for (let seed = 1; seed <= 250; seed++) {
      const { board, context, finishes } = setup(seed);
      const frozen = new Map<number, number>();
      let steps = 0;

      while (board.phase !== 'finished') {
        if (++steps > 5000) throw new Error(`Unbounded game seed ${seed}`);
        phases.add(board.phase);
        invariant(board);

        for (const [seat, coins] of frozen) {
          expect(board.resources[seat].coins).toBe(coins);
          expect(legalAct2(board, seat)).toEqual([]);
        }

        if (board.phase === 'discussion') advanceAct2Discussion(board, context);
        else {
          const seats = pendingAct2(board);
          const seat = seats[context.random(seats.length)];
          const choices = legalAct2(board, seat);
          const action = choices[context.random(choices.length)];
          actions.add(action.type);
          applyAct2(board, seat, action, context);
        }

        board.resources.forEach((resource, seat) => {
          if (!resource.hand.length && !frozen.has(seat)) frozen.set(seat, resource.coins);
        });
      }

      invariant(board);
      expect(finishes).toEqual([board.winner]);
      expect(board.winner).not.toBeNull();
      expect(board.resources[board.winner ?? 0].hand.length).toBeGreaterThan(0);
      expect(pendingAct2(board)).toEqual([]);
    }

    expect([...phases].sort()).toEqual(['action', 'block', 'challenge', 'discussion', 'exchange', 'loss']);
    expect([...actions].sort()).toEqual([
      'assassinate',
      'block',
      'challenge',
      'coup',
      'exchange',
      'income',
      'lose-influence',
      'pass',
      'return-influence',
      'steal',
      'tax',
    ]);
  });
});
