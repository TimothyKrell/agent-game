import { describe, expect, it } from 'vitest';
import { createMatch } from '../src/game/engine';
import { gameDescriptor } from '../src/game/descriptors';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { legalAct2, pendingAct2 } from '../src/game/succession/act2';
import {
  decodeLegacyState,
  decodeReplayFact,
  decodeSuccessionState,
} from '../src/game/succession/persistence';
import type { Action2 } from '../src/shared/succession';
import type { RandomContext, ReplayFact, SuccessionState } from '../src/game/succession/types';

const entrants = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `agent-${seat}`,
  ownerId: `owner-${seat}`,
  name: `Seat ${seat}`,
  house: false,
  rating: 1000,
}));

function random(): RandomContext {
  let sequence = 0;

  return { random: (size) => size - 1, id: () => `handle-${sequence++}` };
}

async function initial() {
  const context = random();

  const { state } = await createSuccession('persisted', entrants, 0, {
    random: context,
    salt: new Uint8Array(32),
  });

  return { state, context };
}

function action(state: SuccessionState, seat: number, choice: Action2, context: RandomContext) {
  return evolveSuccession(
    state,
    {
      type: 'act',
      seat,
      generation: state.seats[seat].generation,
      now: state.phase.startedAt + 1,
      request: {
        gameId: 'succession',
        actionId: 'action',
        phaseId: state.phase.id,
        decisionId: `${state.phase.id}:${seat}:${state.seats[seat].generation}`,
        action: choice,
      },
    },
    context,
  );
}

async function secondAct() {
  const { state, context } = await initial();

  if (state.stage.act !== 1) throw new Error('Expected Act 1');
  const board = state.stage.board;
  board.safeguards = 4;

  for (let i = 0; i < 4; i++)
    board.deck.splice(
      board.deck.findIndex((card) => card.policy === 'safeguard'),
      1,
    );

  const [policy] = board.deck.splice(
    board.deck.findIndex((card) => card.policy === 'safeguard'),
    1,
  );

  const other = board.deck.pop();

  if (!other) throw new Error('Missing policy');
  board.hand = [policy, other];
  board.executor = (board.coordinator + 1) % 10;
  board.phase.kind = 'executor-policy';
  const next = action(state, board.executor, { type: 'enact', cardId: policy.id }, context);

  return { state: next.state, context };
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/no-known-value-widening -- Corruption fixtures deliberately construct untrusted values that must fail decoding. */
function corrupt(value: unknown, path: string, replacement: unknown): unknown {
  const [head, ...tail] = path.split('.');

  if (Array.isArray(value))
    return value.map((item: unknown, index: number) =>
      index === Number(head)
        ? tail.length
          ? corrupt(item, tail.join('.'), replacement)
          : replacement
        : item,
    );

  if (typeof value !== 'object' || value === null) throw new Error('Invalid test path');
  const entries = Object.fromEntries(Object.entries(value));

  return {
    ...entries,
    [head]: tail.length ? corrupt(entries[head], tail.join('.'), replacement) : replacement,
  };
}

/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/no-known-value-widening */

describe('Succession persistence', () => {
  it('round trips both stages without events and validates frozen input', async () => {
    for (const { state } of [await initial(), await secondAct()]) {
      const stored: unknown = JSON.parse(JSON.stringify(state));
      expect(decodeSuccessionState(stored)).toEqual(state);
      expect(decodeSuccessionState(Object.freeze(state))).toEqual(state);
    }
  });

  it.each([
    ['storageVersion', 2],
    ['gameId', 'secret-overlord'],
    ['rulesVersion', 'succession-2'],
    ['snapshot.gameId', 'secret-overlord'],
    ['snapshot.rulesVersion', 'secret-overlord-1'],
    ['snapshot.ratingPoolId', 'secret-overlord-1'],
    ['snapshot.ratingVersion', 'team-elo-1'],
    ['snapshot.protocolVersion', '1'],
    ['snapshot.playerCount', 9],
    ['snapshot.mode', 'other'],
    ['snapshot.houseModel.model', null],
    ['snapshot.timing.action', -1],
    ['seats', []],
    ['seats.0.number', 1],
    ['seats.0.role', 'guard'],
    ['seats.0.generation', 0.5],
    ['seats.0.entrant.rating', Infinity],
    ['stage.act', 3],
    ['stage.board.votes.10', true],
    ['stage.board.deck.0.policy', 'treasurer'],
    ['stage.board.deck.0.id', ''],
    ['stage.board.safeguards', 1],
    ['stage.board.phase.kind', 'act-2:action'],
    ['phase.id', 'different'],
    ['phase.replacements.10', 10],
    ['status', 'finished'],
    ['commitment.priority', [0, 0, 1, 2, 3, 4, 5, 6, 7, 8]],
    ['commitment.digest', 'bad'],
    ['commitment.saltBase64url', 'bad'],
    ['lastChat', { seat: 10, at: 1 }],
  ])('rejects invalid %s', async (path, replacement) => {
    const { state } = await initial();
    expect(() => decodeSuccessionState(corrupt(state, String(path), replacement))).toThrow();
  });

  it('rejects histories at every storage boundary rather than dropping them', async () => {
    const first = await initial();
    const second = await secondAct();

    for (const state of [first.state, second.state]) {
      for (const path of [
        'events',
        'stage.events',
        'stage.board.events',
        'snapshot.events',
        'seats.0.events',
      ]) {
        expect(() => decodeSuccessionState(corrupt(state, path, []))).toThrow();
      }
    }

    for (const path of ['stage.archive.events', 'stage.archive.seats', 'stage.board.resources.0.events']) {
      expect(() => decodeSuccessionState(corrupt(second.state, path, []))).toThrow();
    }

    expect(() =>
      decodeSuccessionState({ ...first.state, stage: { ...first.state.stage, archive: {} } }),
    ).toThrow();
  });

  it.each([
    ['stage.board.resources', []],
    ['stage.board.resources.0.coins', -1],
    ['stage.board.resources.0.hand', []],
    ['stage.board.court', []],
    ['stage.board.resources.0.hand.0.capability', 'rogue'],
    ['stage.board.slot', 10],
    ['stage.board.round', 13],
    ['stage.board.activeSeat', 10],
    ['stage.board.phaseId', 'wrong'],
    ['stage.board.phase', 'challenge'],
    ['stage.archive.winner', null],
    ['act1Result', null],
    ['act1Result.roles.0', 'overlord'],
    ['act1Result.finalTracks', undefined],
    ['act1Result.finalTracks.safeguards', 4],
    ['act1Result.finalTracks.drawCount', 17],
    ['act1Result.bonuses.0', 0],
    ['result', {}],
    ['seats.0.alive', false],
  ])('rejects corrupt Act 2 %s', async (path, replacement) => {
    const { state } = await secondAct();
    expect(() => decodeSuccessionState(corrupt(state, String(path), replacement))).toThrow();
  });

  it('rejects duplicated physical cards and handles independently', async () => {
    const { state } = await secondAct();

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    const held = state.stage.board.resources[0].hand[0];

    for (const field of ['physicalId', 'id'] as const) {
      expect(() =>
        decodeSuccessionState(corrupt(state, `stage.board.court.0.${field}`, held[field])),
      ).toThrow();
    }
  });

  it('round trips sealed challenges and private exchanges; rejects malformed pending windows', async () => {
    let { state, context } = await secondAct();
    state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, context).state;

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    state = action(state, state.stage.board.activeSeat, { type: 'exchange' }, context).state;
    expect(decodeSuccessionState(state)).toEqual(state);

    for (const [path, replacement] of [
      ['stage.board.pending', null],
      ['stage.board.pending.payment', 3],
      ['stage.board.pending.claim', 'assassin'],
      ['stage.board.pending.challenge.responses.10', 'pass'],
      ['stage.board.pending.challenge.responses.0', 'yes'],
      ['stage.board.pending.challenge.eligible', [0, 0]],
      ['stage.board.pending.challenge.block', true],
      ['stage.board.pending.exchange', []],
    ])
      expect(() => decodeSuccessionState(corrupt(state, String(path), replacement))).toThrow();

    while (state.stage.act === 2 && state.stage.board.phase === 'challenge') {
      state = action(state, pendingAct2(state.stage.board)[0], { type: 'pass' }, context).state;
      expect(decodeSuccessionState(state)).toEqual(state);
    }

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    expect(state.stage.board.phase).toBe('exchange');
    expect(() => decodeSuccessionState(corrupt(state, 'stage.board.pending.exchange', []))).toThrow();
    const choice = legalAct2(state.stage.board, state.stage.board.activeSeat)[0];
    state = action(state, state.stage.board.activeSeat, choice, context).state;
    expect(decodeSuccessionState(state)).toEqual(state);
  });

  it('validates every persisted phase through an entire Act 2 match', async () => {
    let { state, context } = await secondAct();

    for (let step = 0; state.status === 'active' && step < 1000; step++) {
      if (state.stage.act !== 2) throw new Error('Expected Act 2');

      if (state.stage.board.phase === 'discussion') {
        state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, context).state;
      } else {
        const seat = pendingAct2(state.stage.board)[0];
        const choices = legalAct2(state.stage.board, seat);
        const choice = choices.find((option) => option.type === 'coup') ?? choices[0];
        const evolution = action(state, seat, choice, context);

        if (evolution.replay) expect(decodeReplayFact(evolution.replay)).toEqual(evolution.replay);
        state = evolution.state;
      }

      expect(decodeSuccessionState(state)).toEqual(state);
    }

    expect(state.status).toBe('finished');
    expect(() => decodeSuccessionState(corrupt(state, 'result.winnerSeat', 10))).toThrow();
  });

  it('round trips interruption and recovery in both acts', async () => {
    for (const { state, context } of [await initial(), await secondAct()]) {
      for (const type of ['recover', 'interrupt'] as const) {
        const next = evolveSuccession(state, { type, now: 200, reason: 'maintenance' }, context);
        expect(decodeSuccessionState(next.state)).toEqual(next.state);
      }
    }
  });

  it.each(['tax', 'exchange'] as const)(
    'round trips a challenged %s declaration and influence loss',
    async (type) => {
      let { state, context } = await secondAct();
      state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, context).state;

      if (state.stage.act !== 2) throw new Error('Expected Act 2');
      state = action(state, state.stage.board.activeSeat, { type }, context).state;
      let challenged = false;

      while (state.stage.act === 2 && state.stage.board.phase === 'challenge') {
        state = action(
          state,
          pendingAct2(state.stage.board)[0],
          { type: challenged ? 'pass' : 'challenge' },
          context,
        ).state;
        challenged = true;
        expect(decodeSuccessionState(state)).toEqual(state);
      }

      if (state.stage.act !== 2) throw new Error('Expected Act 2');
      expect(state.stage.board.phase).toBe('loss');
      const seat = pendingAct2(state.stage.board)[0];
      state = action(state, seat, legalAct2(state.stage.board, seat)[0], context).state;
      expect(decodeSuccessionState(state)).toEqual(state);
    },
  );

  it('validates a last-survivor result against the remaining hands', async () => {
    let { state, context } = await secondAct();

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    const actor = state.stage.board.activeSeat;
    const target = (actor + 1) % 10;
    state.stage.board.resources[actor].coins = 7;

    for (const [seat, resource] of state.stage.board.resources.entries()) {
      if (seat === actor) continue;
      resource.revealed.push(...resource.hand.splice(seat === target ? 1 : 0));
      state.seats[seat].alive = resource.hand.length > 0;
    }

    state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, context).state;
    state = action(state, actor, { type: 'coup', target }, context).state;
    expect(decodeSuccessionState(state)).toEqual(state);

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    state = action(state, target, legalAct2(state.stage.board, target)[0], context).state;
    expect(state.result?.reason).toBe('last-survivor');
    expect(decodeSuccessionState(state)).toEqual(state);
    expect(() => decodeSuccessionState(corrupt(state, 'result.winnerSeat', target))).toThrow();
  });
});

describe('Replay fact persistence', () => {
  const fact: ReplayFact = {
    command: { type: 'advance', now: 1 },
    randomness: [
      { kind: 'index', size: 5, value: 4 },
      { kind: 'id', value: 'phase' },
    ],
  };

  it('accepts realized randomness and chat metadata only', () => {
    expect(decodeReplayFact(fact)).toEqual(fact);
    const chat = { command: { type: 'chat', seat: 1, now: 2 }, randomness: [] };
    expect(decodeReplayFact(chat)).toEqual(chat);
    expect(() =>
      decodeReplayFact({ ...chat, command: { ...chat.command, text: 'private history' } }),
    ).toThrow();
    expect(() => decodeReplayFact({ ...chat, randomness: fact.randomness })).toThrow();
    expect(() =>
      decodeReplayFact({
        command: {
          type: 'act',
          seat: 1,
          generation: 0,
          now: 1,
          request: {
            gameId: 'succession',
            actionId: 'a',
            phaseId: 'p',
            action: { type: 'chat', text: 'not a replay command' },
          },
        },
        randomness: [],
      }),
    ).toThrow();
  });

  it.each([
    ['randomness.0.size', 0],
    ['randomness.0.value', 5],
    ['randomness.0.value', -1],
    ['randomness.0.value', 0.5],
    ['randomness.0.size', Infinity],
    ['randomness.1.kind', 'uuid'],
    ['randomness.1.value', ''],
    ['command.type', 'unknown'],
    ['command.now', NaN],
    ['events', []],
  ])('rejects malformed %s', (path, replacement) => {
    expect(() => decodeReplayFact(corrupt(fact, String(path), replacement))).toThrow();
  });

  it('validates every action payload without importing the API runtime', () => {
    const actions: Action2[] = [
      { type: 'nominate', target: 2 },
      { type: 'vote', approve: true },
      { type: 'discard', cardId: 'card' },
      { type: 'enact', cardId: 'card' },
      { type: 'request-veto' },
      { type: 'veto', approve: false },
      { type: 'investigate', target: 2 },
      { type: 'special-election', target: 2 },
      { type: 'execute', target: 2 },
      { type: 'income' },
      { type: 'tax' },
      { type: 'exchange' },
      { type: 'challenge' },
      { type: 'pass' },
      { type: 'steal', target: 2 },
      { type: 'assassinate', target: 2 },
      { type: 'coup', target: 2 },
      { type: 'block', capability: 'guard' },
      { type: 'lose-influence', cardId: 'card' },
      { type: 'return-influence', cardIds: ['a', 'b'] },
    ];

    for (const choice of actions) {
      const value = {
        command: {
          type: 'act',
          seat: 0,
          generation: 0,
          now: 1,
          request: {
            gameId: 'succession',
            actionId: 'a',
            phaseId: 'p',
            decisionId: 'p:0:0',
            action: choice,
          },
        },
        randomness: [],
      };

      expect(decodeReplayFact(value)).toEqual(value);
      expect(() => decodeReplayFact(corrupt(value, 'command.request.action.extra', 'unknown'))).toThrow();
    }
  });
});

describe('legacy persistence', () => {
  it('preserves known historical states and their events', () => {
    const state = createMatch('legacy', entrants, 0, random());
    expect(decodeLegacyState(state)).toEqual(state);
    expect(decodeLegacyState(state).events).toHaveLength(state.events.length);

    const snapshot = {
      ...gameDescriptor('secret-overlord'),
      mode: state.mode,
      houseModel: { provider: 'preview', model: 'scripted', policyVersion: 'secret-overlord-1' },
    };

    const stored = { ...state, gameId: 'secret-overlord', snapshot };
    expect(decodeLegacyState(stored)).toEqual(stored);

    for (const [path, replacement] of [
      ['gameId', 'succession'],
      ['rulesVersion', 'succession-1'],
      ['snapshot.gameId', 'succession'],
      ['snapshot.rulesVersion', 'succession-1'],
      ['snapshot.ratingPoolId', 'succession-1'],
      ['snapshot.ratingVersion', 'winner-softmax-1'],
      ['snapshot.protocolVersion', '2'],
      ['events.0.id', 2],
      ['events.0.visibility', 10],
      ['events.0.data', { nested: { deeper: {} } }],
      ['seats.0.role', 'guard'],
      ['deck.0.policy', 'guard'],
    ])
      expect(() => decodeLegacyState(corrupt(stored, String(path), replacement))).toThrow();
  });
});
