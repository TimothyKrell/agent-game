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
  type Act2Action,
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

function startAt(board: Act2Board, seat: number) {
  board.firstSeat = seat;
  board.activeSeat = seat;
  board.slot = 0;
}

function putCapability(board: Act2Board, seat: number, slot: number, capability: Capability) {
  if (board.resources[seat].hand[slot].capability === capability) return;

  const zones = [
    board.court,
    ...board.resources.filter((_, index) => index !== seat).map((resource) => resource.hand),
  ];

  for (const zone of zones) {
    const index = zone.findIndex((card) => card.capability === capability);

    if (index < 0) continue;
    [zone[index], board.resources[seat].hand[slot]] = [board.resources[seat].hand[slot], zone[index]];

    return;
  }

  throw new Error('Missing fixture card');
}

function permutations(values: number[]): number[][] {
  if (!values.length) return [[]];

  return values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]),
  );
}

describe('Act 2 explicit contract matrices', () => {
  const claims: { type: 'tax' | 'steal' | 'assassinate' | 'exchange'; capability: Capability }[] = [
    { type: 'tax', capability: 'treasurer' },
    { type: 'steal', capability: 'thief' },
    { type: 'assassinate', capability: 'assassin' },
    { type: 'exchange', capability: 'envoy' },
  ];

  for (const { type, capability } of claims) {
    for (const truthful of [false, true]) {
      for (const challenged of [false, true]) {
        it(`${type}: ${truthful ? 'truthful' : 'bluff'} claim, ${challenged ? 'challenged' : 'unchallenged'}, complete effect and cost`, () => {
          const { board, context, facts } = setup();
          const actor = board.activeSeat;
          const target = (actor + 1) % 10;
          const challenger = (actor + 2) % 10;

          if (truthful) ensureCapability(board, actor, capability);
          else removeCapability(board, actor, capability);
          board.resources[actor].coins = 3;
          board.resources[target].coins = 2;
          const oldHand = structuredClone(board.resources[actor].hand);
          const failed = challenged && !truthful;
          const action: Act2Action = type === 'steal' || type === 'assassinate' ? { type, target } : { type };
          advanceAct2Discussion(board, context);
          applyAct2(board, actor, action, context);
          expect(board.resources[actor].coins).toBe(type === 'assassinate' ? 0 : 3);
          replies(board, context, challenged ? [challenger] : []);
          expect(facts.filter((fact) => fact.type === 'proof')).toHaveLength(challenged && truthful ? 1 : 0);

          if (!challenged && type !== 'exchange') expect(board.resources[actor].hand).toEqual(oldHand);

          if (!challenged && type === 'exchange')
            expect(board.resources[actor].hand.map((card) => card.physicalId)).toEqual(
              oldHand.map((card) => card.physicalId),
            );

          if (challenged) {
            expect(pendingAct2(board)).toEqual([truthful ? challenger : actor]);
            lose(board, context, 1);
          }

          if (!failed && (type === 'steal' || type === 'assassinate')) {
            expect(board.phase).toBe('block');
            applyAct2(board, target, { type: 'pass' }, context);

            if (type === 'assassinate') lose(board, context, 1);
          }

          if (!failed && type === 'exchange') {
            expect(board.phase).toBe('exchange');
            const choice = legalAct2(board, actor)[0];
            applyAct2(board, actor, choice, context);
          }

          let expectedCoins = type === 'assassinate' ? 0 : 3;

          if (!failed && type === 'tax') expectedCoins += 3;

          if (!failed && type === 'steal') expectedCoins += 2;
          expect(board.resources[actor].coins).toBe(expectedCoins);
          expect(board.resources[actor].hand).toHaveLength(failed ? 1 : 2);
          expect(board.resources[challenger].hand).toHaveLength(challenged && truthful ? 1 : 2);
          expect(board.resources[target].hand).toHaveLength(!failed && type === 'assassinate' ? 1 : 2);
          expect(board.resources[target].coins).toBe(!failed && type === 'steal' ? 0 : 2);
          expect(facts.filter((fact) => fact.type === 'exchange-completed')).toHaveLength(
            !failed && type === 'exchange' ? 1 : 0,
          );
          expect(board.phase).toBe('discussion');
          invariant(board);
        });
      }
    }
  }

  for (const type of ['income', 'coup']) {
    it(`${type} bypasses every challenge and block choice`, () => {
      const { board, context, facts } = setup();
      const actor = board.activeSeat;
      const target = (actor + 1) % 10;
      board.resources[actor].coins = 7;
      advanceAct2Discussion(board, context);

      if (type === 'coup') {
        applyAct2(board, actor, { type: 'coup', target }, context);
        expect(board.phase).toBe('loss');
        expect(pendingAct2(board)).toEqual([target]);
        lose(board, context);
      } else applyAct2(board, actor, { type: 'income' }, context);
      expect(board.resources[actor].coins).toBe(type === 'coup' ? 0 : 8);
      expect(
        facts.some(
          (fact) => fact.type === 'challenge-resolved' || fact.type === 'block' || fact.type === 'proof',
        ),
      ).toBe(false);
      invariant(board);
    });
  }

  const blocks: { type: 'steal' | 'assassinate'; capability: Capability }[] = [
    { type: 'steal', capability: 'thief' },
    { type: 'steal', capability: 'envoy' },
    { type: 'assassinate', capability: 'guard' },
  ];

  for (const { type, capability } of blocks) {
    for (const truthful of [false, true]) {
      for (const challenged of [false, true]) {
        it(`${type} blocked by ${capability}, truthful=${truthful}, challenged=${challenged}`, () => {
          const { board, context, facts } = setup();
          const actor = board.activeSeat;
          const target = (actor + 1) % 10;
          const challenger = (actor + 2) % 10;

          if (truthful) ensureCapability(board, target, capability);
          else removeCapability(board, target, capability);
          board.resources[actor].coins = 3;
          board.resources[target].coins = 2;
          advanceAct2Discussion(board, context);
          applyAct2(board, actor, { type, target }, context);
          replies(board, context);
          applyAct2(board, target, { type: 'block', capability }, context);
          replies(board, context, challenged ? [challenger] : []);
          const failed = challenged && !truthful;

          if (challenged) {
            expect(pendingAct2(board)).toEqual([truthful ? challenger : target]);
            lose(board, context);
          }

          if (failed && type === 'assassinate') {
            expect(pendingAct2(board)).toEqual([target]);
            lose(board, context);
          }

          expect(board.resources[target].hand).toHaveLength(failed ? (type === 'assassinate' ? 0 : 1) : 2);
          expect(board.resources[challenger].hand).toHaveLength(challenged && truthful ? 1 : 2);
          expect(board.resources[actor].coins).toBe(type === 'assassinate' ? 0 : failed ? 5 : 3);
          expect(board.resources[target].coins).toBe(type === 'steal' && failed ? 0 : 2);
          expect(facts.filter((fact) => fact.type === 'proof')).toHaveLength(challenged && truthful ? 1 : 0);
          expect(board.phase).toBe('discussion');
          invariant(board);
        });
      }
    }

    it(`${type}/${capability}: disproved one-card blocker dies and cancels attack with no extra effect`, () => {
      const { board, context, facts } = setup();
      const actor = board.activeSeat;
      const target = (actor + 1) % 10;
      removeCapability(board, target, capability);
      eliminate(board, target, 1);
      board.resources[actor].coins = 3;
      board.resources[target].coins = 5;
      advanceAct2Discussion(board, context);
      applyAct2(board, actor, { type, target }, context);
      replies(board, context);
      applyAct2(board, target, { type: 'block', capability }, context);
      replies(board, context, [actor]);
      lose(board, context);
      expect(board.resources[target].hand).toHaveLength(0);
      expect(board.resources[target].coins).toBe(5);
      expect(board.resources[actor].coins).toBe(type === 'assassinate' ? 0 : 3);
      expect(facts.filter((fact) => fact.type === 'influence-lost')).toHaveLength(1);
      expect(board.phase).toBe('discussion');
      invariant(board);
    });
  }

  for (const type of ['steal', 'assassinate']) {
    if (type !== 'steal' && type !== 'assassinate') continue;
    it(`${type} survives third-party challenger elimination while actor and target live`, () => {
      const { board, context } = setup();
      const actor = board.activeSeat;
      const target = (actor + 1) % 10;
      const challenger = (actor + 2) % 10;
      ensureCapability(board, actor, type === 'steal' ? 'thief' : 'assassin');
      eliminate(board, challenger, 1);
      board.resources[actor].coins = 3;
      board.resources[target].coins = 2;
      advanceAct2Discussion(board, context);
      applyAct2(board, actor, { type, target }, context);
      replies(board, context, [challenger]);
      lose(board, context);
      expect(board.resources[challenger].hand).toHaveLength(0);
      expect(board.phase).toBe('block');
      expect(pendingAct2(board)).toEqual([target]);
      applyAct2(board, target, { type: 'pass' }, context);

      if (type === 'assassinate') lose(board, context);
      expect(board.resources[actor].coins).toBe(type === 'steal' ? 5 : 0);
      expect(board.resources[target].hand).toHaveLength(type === 'steal' ? 2 : 1);
      invariant(board);
    });
  }

  for (let actor = 0; actor < 10; actor++) {
    for (const count of [2, 3, 4]) {
      it(`selects clockwise action challenger for actor ${actor}, ${count} challengers, every arrival permutation and offset`, () => {
        for (let offset = 0; offset < 9; offset++) {
          const challengers = Array.from(
            { length: count },
            (_, index) => (actor + 1 + ((offset + index) % 9)) % 10,
          );

          const expected = Array.from({ length: 9 }, (_, index) => (actor + index + 1) % 10).find((seat) =>
            challengers.includes(seat),
          );

          for (const order of permutations(challengers)) {
            const { board, context, facts } = setup();
            startAt(board, actor);
            ensureCapability(board, actor, 'treasurer');
            advanceAct2Discussion(board, context);
            applyAct2(board, actor, { type: 'tax' }, context);

            for (const seat of pendingAct2(board).filter((seat) => !challengers.includes(seat)))
              applyAct2(board, seat, { type: 'pass' }, context);
            const phaseId = board.phaseId;
            const factCount = facts.length;

            for (const [index, seat] of order.entries()) {
              applyAct2(board, seat, { type: 'challenge' }, context);

              if (index < order.length - 1) {
                expect(board.phaseId).toBe(phaseId);
                expect(facts).toHaveLength(factCount);
              }
            }

            expect(pendingAct2(board)).toEqual([expected]);
            expect(facts.find((fact) => fact.type === 'challenge-resolved')).toMatchObject({
              challenger: expected,
              outcome: 'proved',
            });
            lose(board, context, 1);

            for (const seat of challengers)
              expect(board.resources[seat].hand).toHaveLength(seat === expected ? 1 : 2);
            invariant(board);
          }
        }
      });

      it(`anchors block challengers to actor ${actor} last, ${count} challengers, every arrival permutation and offset`, () => {
        for (let offset = 0; offset < 8; offset++) {
          const target = (actor + 9) % 10;

          const challengers = [
            actor,
            ...Array.from({ length: count - 1 }, (_, index) => (actor + 1 + ((offset + index) % 8)) % 10),
          ];

          const expected = Array.from({ length: 10 }, (_, index) => (actor + index + 1) % 10).find((seat) =>
            challengers.includes(seat),
          );

          for (const order of permutations(challengers)) {
            const { board, context, facts } = setup();
            startAt(board, actor);
            ensureCapability(board, target, 'thief');
            advanceAct2Discussion(board, context);
            applyAct2(board, actor, { type: 'steal', target }, context);
            replies(board, context);
            applyAct2(board, target, { type: 'block', capability: 'thief' }, context);

            for (const seat of pendingAct2(board).filter((seat) => !challengers.includes(seat)))
              applyAct2(board, seat, { type: 'pass' }, context);

            for (const seat of order) applyAct2(board, seat, { type: 'challenge' }, context);
            expect(pendingAct2(board)).toEqual([expected]);
            expect(expected).not.toBe(actor);
            expect(facts.filter((fact) => fact.type === 'challenge-resolved')[1]).toMatchObject({
              block: true,
              challenger: expected,
              outcome: 'proved',
            });
            lose(board, context);
            expect(board.resources[actor].hand).toHaveLength(2);
            invariant(board);
          }
        }
      });
    }
  }

  for (const influences of [1, 2]) {
    const poolSize = influences + 2;

    for (let first = 0; first < poolSize; first++) {
      for (let second = first + 1; second < poolSize; second++) {
        it(`returns exact exchange pair ${first},${second} with ${influences} influence`, () => {
          const { board, context } = setup();
          const actor = board.activeSeat;

          if (influences === 1) eliminate(board, actor, 1);
          const lost = structuredClone(board.resources[actor].revealed);
          advanceAct2Discussion(board, context);
          applyAct2(board, actor, { type: 'exchange' }, context);
          replies(board, context);
          const pool = [...board.resources[actor].hand, ...(board.pending?.exchange ?? [])];
          const selected = [pool[first], pool[second]];
          const cardIds: [string, string] = [selected[0].id, selected[1].id];
          cardIds.sort();
          const action: Act2Action = { type: 'return-influence', cardIds };
          expect(legalAct2(board, actor)).toContainEqual(action);

          const expectedKept = pool
            .flatMap((card, index) => (index !== first && index !== second ? [card.physicalId] : []))
            .sort();

          const oldHandles = pool.map((card) => card.id);
          const courtBefore = board.court.map((card) => card.physicalId);
          applyAct2(board, actor, action, context);
          expect(board.resources[actor].hand.map((card) => card.physicalId).sort()).toEqual(expectedKept);
          expect(board.court.map((card) => card.physicalId).sort()).toEqual(
            [...courtBefore, ...selected.map((card) => card.physicalId)].sort(),
          );
          expect(board.resources[actor].hand.every((card) => !oldHandles.includes(card.id))).toBe(true);
          expect(board.resources[actor].revealed).toEqual(lost);
          invariant(board);
        });
      }
    }
  }

  it('proves the first of duplicate capabilities and can draw the identical physical card back', () => {
    const { board, context, facts } = setup();
    const actor = board.activeSeat;
    putCapability(board, actor, 0, 'treasurer');
    putCapability(board, actor, 1, 'treasurer');
    const original = structuredClone(board.resources[actor].hand);
    const court = board.court.map((card) => card.physicalId).sort();
    // The proved card is appended at index 5. Swap it to zero, then leave it there.
    const provedPhysicalIds: string[] = [];
    context.random = (size) => {
      if (size === 6) {
        provedPhysicalIds.push(board.court[5].physicalId);

        return 0;
      }

      return size - 1;
    };

    advanceAct2Discussion(board, context);
    applyAct2(board, actor, { type: 'tax' }, context);
    replies(board, context, [(actor + 1) % 10]);
    expect(provedPhysicalIds).toEqual([original[0].physicalId]);
    expect(board.resources[actor].hand.map((card) => card.physicalId)).toEqual(
      original.map((card) => card.physicalId),
    );
    expect(board.resources[actor].hand.every((card) => !original.some((old) => old.id === card.id))).toBe(
      true,
    );
    expect(board.court.map((card) => card.physicalId).sort()).toEqual(court);
    expect(facts.filter((fact) => fact.type === 'proof')).toEqual([
      { type: 'proof', seat: actor, capability: 'treasurer' },
    ]);
    lose(board, context);
    invariant(board);
  });

  it.each([0, 2, 3, 6, 7, 9, 10])('enumerates the complete affordable menu at %i coins', (coins) => {
    const { board, context } = setup();
    const actor = board.activeSeat;
    board.resources[actor].coins = coins;
    advanceAct2Discussion(board, context);
    const targets = Array.from({ length: 10 }, (_, seat) => seat).filter((seat) => seat !== actor);
    const expected: Act2Action[] = [];

    if (coins < 10) {
      expected.push({ type: 'income' }, { type: 'tax' }, { type: 'exchange' });

      for (const target of targets) expected.push({ type: 'steal', target });

      if (coins >= 3) for (const target of targets) expected.push({ type: 'assassinate', target });
    }

    if (coins >= 7) for (const target of targets) expected.push({ type: 'coup', target });
    expect(legalAct2(board, actor)).toEqual(expected);
    const before = structuredClone(board);

    if (coins < 3)
      expect(() => applyAct2(board, actor, { type: 'assassinate', target: targets[0] }, context)).toThrow();

    if (coins < 7)
      expect(() => applyAct2(board, actor, { type: 'coup', target: targets[0] }, context)).toThrow();

    if (coins >= 10) expect(() => applyAct2(board, actor, { type: 'income' }, context)).toThrow();
    expect(board).toEqual(before);
  });

  for (const duplicate of [false, true]) {
    for (const chosenIndex of [0, 1]) {
      it(`selects loss handle ${chosenIndex} from ${duplicate ? 'duplicate' : 'distinct'} cards; rejects stale, foreign, lost and unknown handles`, () => {
        const { board, context } = setup();
        const target = board.activeSeat;
        putCapability(board, target, 0, 'guard');
        putCapability(board, target, 1, duplicate ? 'guard' : 'envoy');
        const stale = board.resources[target].hand.map((card) => card.id);
        advanceAct2Discussion(board, context);
        applyAct2(board, target, { type: 'exchange' }, context);
        replies(board, context);
        const drawn = board.pending?.exchange;

        if (!drawn) throw new Error('Missing exchange buffer');
        const cardIds: [string, string] = [drawn[0].id, drawn[1].id];
        cardIds.sort();
        applyAct2(board, target, { type: 'return-influence', cardIds }, context);
        const actor = board.activeSeat;
        const outsider = (actor + 1) % 10;
        eliminate(board, outsider, 1);
        board.resources[actor].coins = 7;
        advanceAct2Discussion(board, context);
        applyAct2(board, actor, { type: 'coup', target }, context);
        const before = structuredClone(board);

        for (const invalid of [
          ...stale,
          board.resources[actor].hand[0].id,
          board.resources[outsider].revealed[0].id,
          'unknown-opaque',
        ]) {
          expect(() =>
            applyAct2(board, target, { type: 'lose-influence', cardId: invalid }, context),
          ).toThrow();
          expect(board).toEqual(before);
        }

        const chosen = structuredClone(board.resources[target].hand[chosenIndex]);
        const kept = structuredClone(board.resources[target].hand[1 - chosenIndex]);
        applyAct2(board, target, { type: 'lose-influence', cardId: chosen.id }, context);
        expect(board.resources[target].revealed).toEqual([chosen]);
        expect(board.resources[target].hand).toEqual([kept]);
        const nextActor = board.activeSeat;
        board.resources[nextActor].coins = 7;
        advanceAct2Discussion(board, context);
        applyAct2(board, nextActor, { type: 'coup', target }, context);
        expect(legalAct2(board, target)).toEqual([{ type: 'lose-influence', cardId: kept.id }]);
        const nextLoss = structuredClone(board);
        expect(() =>
          applyAct2(board, target, { type: 'lose-influence', cardId: chosen.id }, context),
        ).toThrow();
        expect(board).toEqual(nextLoss);
        applyAct2(board, target, { type: 'lose-influence', cardId: kept.id }, context);
        invariant(board);
      });
    }
  }
});

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
