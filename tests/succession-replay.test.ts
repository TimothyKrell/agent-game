import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { evolveLegacy, type LegacyBoard } from '../src/game/engine';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { observeSuccession, inspectSuccession } from '../src/game/succession/observation';
import { replayFrameSuccession, replaySuccession, verifyReplayArchive } from '../src/game/succession/replay';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { secureRandom } from '../src/game/succession/commitment';
import { decodeGameState } from '../src/game/registry';
import { decodeReplayCheckpoint } from '../src/game/succession/persistence';
import type { Act2Board, Capability } from '../src/game/succession/act2';
import type {
  Evolution,
  RandomContext,
  SuccessionCommand,
  SuccessionState,
} from '../src/game/succession/types';
import type { GameAction, GameEvent } from '../src/game/types';
import {
  AuthorizedEvent2Schema,
  ReplayFrame2Schema,
  type Action2,
  type ReplayFrame2,
} from '../src/shared/succession';

let randomSequence = 0;

it('decodes persisted event checkpoints before serving the first replay cursor', async () => {
  const created = await initial();
  expect(() => decodeGameState(JSON.parse(JSON.stringify(created.replayFrames[0].state)))).toThrow();

  for (const checkpoint of created.replayFrames)
    expect(decodeReplayCheckpoint(JSON.parse(JSON.stringify(checkpoint.state)))).toEqual(checkpoint.state);
  const corrupt = structuredClone(created.replayFrames[0].state);

  if (corrupt.stage.act !== 1) throw new Error('Expected initial policy checkpoint');
  corrupt.stage.board.deck[0] = corrupt.stage.board.deck[1];
  expect(() => decodeReplayCheckpoint(corrupt)).toThrow();
  expect(() => decodeReplayCheckpoint({ ...created.replayFrames[0].state, events: [] })).toThrow();
});

function random(seed = 1, namespace = ++randomSequence): RandomContext {
  let serial = 0;

  return {
    random(size) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return Math.floor((seed / 4294967296) * size);
    },
    id: () => `replay-${namespace}-${seed}-${serial++}`,
  };
}

async function initial(seed = 1) {
  return createSuccession(
    `match-${seed}`,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: `owner-${seat}`,
      name: '𐐀'.repeat(40),
      house: false,
      rating: 1000,
    })),
    1000,
    { random: random(seed), salt: new Uint8Array(32).fill(seed) },
  );
}

function act2(state: SuccessionState): Act2Board {
  if (state.stage.act !== 2) throw new Error('Expected Act 2 fixture');

  return state.stage.board;
}

function command(state: SuccessionState, seat: number, action: Action2): SuccessionCommand {
  const observation = observeSuccession(state, seat);

  return {
    type: 'act',
    seat,
    generation: state.seats[seat].generation,
    now: state.phase.startedAt + 1,
    request: {
      gameId: 'succession',
      actionId: `request-${state.phase.id}-${seat}`,
      phaseId: state.phase.id,
      decisionId: observation.decision?.id,
      action,
    },
  };
}

function bounded(value: SuccessionState | ReplayFrame2, ceiling: number) {
  const json = JSON.stringify(value);
  expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(ceiling);
  expect(json).not.toMatch(/"(?:events|transcript|replayFrames)":/);
}

function frameAt(evolution: Evolution, type: string): SuccessionState {
  const event = evolution.appendedEvents.find((entry) => entry.type === type);
  const frame = evolution.replayFrames.find((entry) => entry.eventKey === event?.eventKey);

  if (!frame) throw new Error(`Missing ${type} event cursor`);

  return frame.state;
}

function verify(evolution: Evolution, checkpoint?: SuccessionState) {
  expect(evolution.appendedEvents.length).toBeLessThanOrEqual(64);
  expect(evolution.replayFrames.map(({ eventKey }) => eventKey)).toEqual(
    evolution.appendedEvents.filter(({ type }) => type !== 'chat').map(({ eventKey }) => eventKey),
  );
  bounded(evolution.state, 65536);

  for (const [index, event] of evolution.appendedEvents.entries()) {
    const { visibility: _visibility, ...authorized } = event;
    expect(new TextEncoder().encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(8192);
    expect(Schema.decodeUnknownSync(AuthorizedEvent2Schema)({ ...authorized, id: index + 1 })).toEqual({
      ...authorized,
      id: index + 1,
    });
  }

  for (const [index, { state }] of evolution.replayFrames.entries()) {
    bounded(state, 65536);
    expect(decodeReplayCheckpoint(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const frame = replayFrameSuccession(state, index + 1, 'archive-epoch');
    bounded(frame, 32768);
    expect(
      Schema.is(ReplayFrame2Schema)(frame),
      `Invalid replay frame for ${evolution.appendedEvents[index]?.type}: ${JSON.stringify(frame)}`,
    ).toBe(true);
    expect(Schema.decodeUnknownSync(ReplayFrame2Schema)(frame)).toEqual(frame);
    expect(frame).not.toHaveProperty('decision');
    expect(frame).not.toHaveProperty('history');
    expect(frame.through).toBe(index + 1);
    expect(frame.visibilityEpoch).toBe('archive-epoch');
    expect(frame.status).toBe(state.status);
    expect(frame.result).toEqual(state.result);
    expect(frame.finishedAt).toBe(state.finishedAt);
    expect(frame.round).toBe(state.stage.board.round);
    expect(frame.phase.id).toBe(state.phase.id);
    expect(frame.seats.map(({ alive, forfeited, generation }) => ({ alive, forfeited, generation }))).toEqual(
      state.seats.map(({ alive, forfeited, generation }) => ({ alive, forfeited, generation })),
    );

    if (state.stage.act === 1) {
      const board = state.stage.board;
      expect(frame.board).toEqual({
        act: 1,
        coordinator: board.coordinator,
        executor: board.executor,
        power: board.power,
        tracks: {
          safeguards: board.safeguards,
          overrides: board.overrides,
          electionTracker: board.electionTracker,
          drawCount: board.deck.length,
          discardCount: board.discards.length,
          vetoUnlocked: board.overrides >= 5,
        },
        lastGovernment: board.lastGovernment,
      });
      expect(frame.archive).toEqual({
        act: 1,
        deck: state.stage.board.deck,
        discards: state.stage.board.discards,
        hand: state.stage.board.hand,
      });
    } else {
      const board = state.stage.board;
      const pending = board.pending;
      const target = pending && 'target' in pending.action ? pending.action.target : null;
      expect(frame.board).toEqual({
        act: 2,
        firstSeat: board.firstSeat,
        activeSeat: board.activeSeat,
        tableRound: board.round,
        slot: board.slot,
        roundCap: 12,
        courtCount: board.court.length,
        pending: pending
          ? {
              actor: pending.actor,
              action: pending.action.type,
              target,
              claim: pending.claim,
              paid: pending.payment,
              block: pending.block && target !== null ? { seat: target, capability: pending.block } : null,
            }
          : null,
      });
      expect(frame.archive).toEqual({
        act: 2,
        hands: board.resources.map(({ hand }, seat) => ({
          seat,
          hand: hand.map(({ id, capability }) => ({ id, capability })),
        })),
        court: board.court.map(({ id, capability }) => ({ id, capability })),
        exchangePool: board.pending?.exchange
          ? {
              seat: board.pending.actor,
              cards: board.pending.exchange.map(({ id, capability }) => ({ id, capability })),
            }
          : null,
      });
      expect(frame.seats.map(({ coins, influence, revealed }) => ({ coins, influence, revealed }))).toEqual(
        board.resources.map(({ coins, hand, revealed }) => ({
          coins,
          influence: hand.length,
          revealed: revealed.map(({ capability }) => capability),
        })),
      );
    }
  }

  if (evolution.replayFrames.length) expect(evolution.replayFrames.at(-1)?.state).toEqual(evolution.state);

  if (checkpoint && evolution.replay)
    expect(replaySuccession(checkpoint, [evolution.replay])).toEqual(evolution.state);
}

function step(state: SuccessionState, next: SuccessionCommand, seed = 23, namespace?: number) {
  const evolution = evolveSuccession(state, next, random(seed, namespace));
  verify(evolution, state);

  return evolution;
}

function choose(state: SuccessionState, seat: number, action: Action2) {
  return step(state, command(state, seat, action));
}

async function transition(seed = 1) {
  const { state } = await initial(seed);

  if (state.stage.act !== 1) throw new Error('Expected Act 1');
  state.stage.board.phase.kind = 'executive-action';
  state.phase = state.stage.board.phase;
  state.stage.board.power = 'execute';
  const target = state.seats.find(({ role }) => role === 'overlord')!.number;

  return choose(state, state.stage.board.coordinator, { type: 'execute', target });
}

async function turn(seed = 1) {
  const { state } = await transition(seed);

  return step(state, { type: 'advance', now: state.phase.deadline! }).state;
}

function ensureCapability(board: Act2Board, seat: number, capability: Capability) {
  if (board.resources[seat].hand.some((card) => card.capability === capability)) return;

  for (const zone of [
    board.court,
    ...board.resources.filter((_, index) => index !== seat).map(({ hand }) => hand),
  ]) {
    const index = zone.findIndex((card) => card.capability === capability);

    if (index < 0) continue;
    [zone[index], board.resources[seat].hand[0]] = [board.resources[seat].hand[0], zone[index]];

    return;
  }

  throw new Error('Missing capability fixture');
}

function reactions(state: SuccessionState, challenger?: number) {
  let evolution: Evolution | undefined;

  for (const seat of inspectSuccession(state).pendingSeats) {
    evolution = choose(state, seat, { type: seat === challenger ? 'challenge' : 'pass' });
    state = evolution.state;
  }

  if (!evolution) throw new Error('No reactions pending');

  return evolution;
}

describe('exact Succession replay cursors', () => {
  it('captures bounded initial frames and omits chat checkpoints while replaying chat metadata', async () => {
    const created = await initial();
    verify(created);
    const chat = choose(created.state, 0, { type: 'chat', text: '\u0000'.repeat(999) + 'x' });
    expect(chat.replayFrames).toEqual([]);
    expect(chat.replay?.command).toEqual({ type: 'chat', seat: 0, now: created.state.phase.startedAt + 1 });
    expect(chat.state.lastChat).toEqual({ seat: 0, at: created.state.phase.startedAt + 1 });
  });

  it.each(['nominate', 'vote', 'discard', 'enact', 'execute'] as const)(
    'matches independent legacy emitted boards at each %s cursor',
    async (type) => {
      const { state } = await initial(3);

      if (state.stage.act !== 1) throw new Error('Expected Act 1');
      const board = state.stage.board;
      let seat = board.coordinator;
      const target = state.seats.find((entry) => entry.number !== seat && entry.role !== 'overlord')!.number;
      board.executor = target;
      let action: GameAction;

      switch (type) {
        case 'nominate':
          board.phase.kind = 'nomination';
          action = { type, target };
          break;
        case 'vote':
          board.phase.kind = 'voting';

          for (const voter of state.seats) if (voter.number !== seat) board.votes[voter.number] = true;
          action = { type, approve: true };
          break;
        case 'discard':
          board.phase.kind = 'coordinator-discard';
          board.hand = board.deck.splice(0, 3);
          action = { type, cardId: board.hand[1].id };
          break;
        case 'enact':
          board.phase.kind = 'executor-policy';
          board.hand = board.deck.splice(0, 2);
          seat = target;
          action = { type, cardId: board.hand[1].id };
          break;
        case 'execute':
          board.phase.kind = 'executive-action';
          board.power = 'execute';
          action = { type, target };
          break;
      }

      state.phase = board.phase;
      const next = command(state, seat, action);
      const emitted: { board: LegacyBoard; event: GameEvent }[] = [];

      if (next.type !== 'act') throw new Error('Expected action');
      evolveLegacy(
        { ...board, seats: state.seats },
        { ...next, request: { ...next.request, action } },
        {
          ...random(23, 99999),
          onEvent(snapshot, event) {
            emitted.push({ board: snapshot, event });
          },
        },
      );
      const evolved = step(state, next, 23, 99999);

      const legacyKeys = new Set(
        evolved.appendedEvents
          .filter(({ visibility }) => visibility !== 'archive')
          .map(({ eventKey }) => eventKey),
      );

      const legacyFrames = evolved.replayFrames.filter(({ eventKey }) => legacyKeys.has(eventKey));
      expect(legacyFrames).toHaveLength(emitted.length);

      for (const [index, { board: expected }] of emitted.entries()) {
        const snapshot = legacyFrames[index].state;
        expect({ ...snapshot.stage.board, seats: snapshot.seats }).toEqual(expected);
      }

      if (type === 'vote') {
        const ballot = frameAt(evolved, 'ballot').stage;
        const draw = frameAt(evolved, 'draw').stage;
        expect(ballot.act === 1 && ballot.board.hand).toEqual([]);
        expect(draw.act === 1 && draw.board.hand).toHaveLength(3);
      }
    },
  );

  it('keeps the Act 1 execution and act-ended cursors before resurrection and fresh resources', async () => {
    const evolved = await transition();
    const execution = frameAt(evolved, 'execution');
    const ended = frameAt(evolved, 'act-ended');
    const started = frameAt(evolved, 'act-started');
    expect(execution.stage.act).toBe(1);
    expect(ended.stage.act).toBe(1);
    expect(ended.status).toBe('active');
    expect(ended.result).toBeNull();
    expect(ended.finishedAt).toBeNull();
    expect(ended.act1Result).toBeNull();
    await expect(verifyReplayArchive(ended)).rejects.toThrow('overall termination');
    expect(ended.seats.filter(({ alive }) => !alive)).toHaveLength(1);
    expect(started.stage.act).toBe(2);
    expect(started.seats.every(({ alive }) => alive)).toBe(true);
    expect(started.act1Result?.roles).toEqual(ended.seats.map(({ role }) => role));
    expect(act2(started).resources.map(({ coins }) => coins)).toEqual(
      ended.seats.map(({ role }) => (role === 'cooperative' ? 3 : 2)),
    );
    expect(act2(started).resources.every(({ hand }) => hand.length === 2)).toBe(true);
    expect(started.status).toBe('active');
    expect(started.result).toBeNull();
    expect(evolved.appendedEvents.filter(({ type }) => type === 'capability-deal')).toHaveLength(10);
  });

  it('captures paid declaration, truthful replacement before selected loss, and later target damage', async () => {
    let state = await turn(4);
    const actor = act2(state).activeSeat;
    const target = (actor + 1) % 10;
    const challenger = (actor + 2) % 10;
    act2(state).resources[actor].coins = 3;
    ensureCapability(act2(state), actor, 'assassin');
    const originalHand = structuredClone(act2(state).resources[actor].hand);
    const declared = choose(state, actor, { type: 'assassinate', target });
    expect(act2(frameAt(declared, 'declaration')).resources[actor].coins).toBe(0);
    expect(act2(frameAt(declared, 'declaration')).pending?.payment).toBe(3);
    const resolved = reactions(declared.state, challenger);
    const beforeProof = frameAt(resolved, 'challenge-resolved');
    const proof = frameAt(resolved, 'proof');
    expect(act2(beforeProof).resources[actor].hand).toEqual(originalHand);
    expect(act2(proof).resources[actor].hand).not.toEqual(originalHand);
    expect(act2(proof).resources[actor].hand).toHaveLength(2);
    expect(act2(proof).court).toHaveLength(5);
    expect(act2(proof).resources[challenger].hand).toHaveLength(2);
    state = resolved.state;
    const card = act2(state).resources[challenger].hand[1];
    const lost = choose(state, challenger, { type: 'lose-influence', cardId: card.id });
    expect(act2(frameAt(lost, 'influence-lost')).resources[challenger].revealed).toContainEqual(card);
    state = choose(lost.state, target, { type: 'pass' }).state;
    const targetCard = act2(state).resources[target].hand[0];
    const damage = choose(state, target, { type: 'lose-influence', cardId: targetCard.id });
    expect(act2(frameAt(damage, 'influence-lost')).resources[target].revealed).toContainEqual(targetCard);
    expect(act2(damage.state).resources[actor].coins).toBe(0);
  });

  it('retains exchange draws at the exact private-pool cursor and selected returns', async () => {
    const state = await turn(5);
    const actor = act2(state).activeSeat;
    const declared = choose(state, actor, { type: 'exchange' });
    const drawn = reactions(declared.state);
    expect(act2(drawn.state).court).toHaveLength(3);
    expect(act2(drawn.state).pending?.exchange).toHaveLength(2);
    const frame = replayFrameSuccession(drawn.state, 300, 'archive');
    expect(frame.archive?.act === 2 && frame.archive.exchangePool?.cards).toHaveLength(2);
    const choice = observeSuccession(drawn.state, actor).decision!.actions[2].action;
    const returned = choose(drawn.state, actor, choice);
    expect(choice.type).toBe('return-influence');
    expect(act2(frameAt(returned, 'exchange-completed')).pending?.exchange).toBeNull();
    expect(act2(returned.state).resources[actor].hand).toHaveLength(2);
    expect(act2(returned.state).court).toHaveLength(5);

    if (choice.type === 'return-influence')
      expect(act2(returned.state).resources[actor].hand.every(({ id }) => !choice.cardIds.includes(id))).toBe(
        true,
      );
    expect(replayFrameSuccession(drawn.state, 300, 'archive')).toEqual(frame);
  });

  it.each(['last-survivor', 'round-cap'] as const)(
    'keeps pre-finish cursors active and publishes the exact %s result',
    async (reason) => {
      const state = await turn(6);
      const board = act2(state);
      const actor = board.activeSeat;
      let evolved: Evolution;

      if (reason === 'round-cap') {
        board.round = 12;
        board.slot = 9;
        board.firstSeat = (actor + 1) % 10;
        board.resources[actor].coins = 8;
        evolved = choose(state, actor, { type: 'income' });
      } else {
        const target = (actor + 1) % 10;

        for (const [seat, resource] of board.resources.entries()) {
          if (seat !== actor) resource.revealed.push(...resource.hand.splice(0, seat === target ? 1 : 2));
          state.seats[seat].alive = resource.hand.length > 0;
        }

        board.resources[actor].coins = 7;
        const declared = choose(state, actor, { type: 'coup', target });
        evolved = choose(declared.state, target, {
          type: 'lose-influence',
          cardId: act2(declared.state).resources[target].hand[0].id,
        });
      }

      const before = frameAt(evolved, reason === 'round-cap' ? 'coins' : 'influence-lost');
      expect(before.status).toBe('active');
      expect(before.result).toBeNull();
      const finished = frameAt(evolved, 'finished');
      expect(finished.status).toBe('finished');
      expect(finished.result?.reason).toBe(reason);
      expect(finished.result?.winnerSeat).toBe(actor);
      expect(replayFrameSuccession(finished, 401, 'terminal').commitment.reveal).not.toBeNull();
      await expect(verifyReplayArchive(evolved.state)).resolves.toBeUndefined();
    },
  );

  it('reconstructs interruption and rejects corrupted randomness without consulting fresh randomness', async () => {
    const state = await turn();

    const evolved = step(state, {
      type: 'interrupt',
      now: state.phase.startedAt + 5,
      reason: 'Platform unavailable',
    });

    expect(frameAt(evolved, 'interrupted').result).toBeNull();
    expect(frameAt(evolved, 'interrupted').status).toBe('interrupted');

    const index = vi.spyOn(secureRandom, 'random').mockImplementation(() => {
      throw new Error('Fresh randomness forbidden');
    });

    const identity = vi.spyOn(secureRandom, 'id').mockImplementation(() => {
      throw new Error('Fresh identity forbidden');
    });

    try {
      expect(replaySuccession(state, [evolved.replay!])).toEqual(evolved.state);
      expect(() => replaySuccession(state, [{ ...evolved.replay!, randomness: [] }])).toThrow('diverged');
      expect(() =>
        replaySuccession(state, [
          { ...evolved.replay!, randomness: [...evolved.replay!.randomness, { kind: 'id', value: 'extra' }] },
        ]),
      ).toThrow('unused');
      expect(() =>
        replaySuccession(
          state,
          Array.from({ length: 65 }, () => evolved.replay!),
        ),
      ).toThrow('nearer checkpoint');
      expect(index).not.toHaveBeenCalled();
      expect(identity).not.toHaveBeenCalled();
    } finally {
      index.mockRestore();
      identity.mockRestore();
    }
  });

  it('authenticates the terminal archive commitment and rejects active, tampered, or transplanted archives', async () => {
    const state = await turn(8);
    await expect(verifyReplayArchive(state)).rejects.toThrow('overall termination');

    const terminal = step(state, {
      type: 'interrupt',
      now: state.phase.startedAt + 1,
      reason: 'Archive test',
    }).state;

    await expect(verifyReplayArchive(terminal)).resolves.toBeUndefined();

    for (const commitment of [
      { ...terminal.commitment, digest: '0'.repeat(64) },
      { ...terminal.commitment, saltBase64url: 'A'.repeat(43) },
      { ...terminal.commitment, priority: terminal.commitment.priority.toReversed() },
      { ...terminal.commitment, priority: Array.from({ length: 10 }, () => 0) },
    ])
      await expect(verifyReplayArchive({ ...terminal, commitment })).rejects.toThrow('verification failed');
    await expect(verifyReplayArchive({ ...terminal, id: 'another-match' })).rejects.toThrow(
      'verification failed',
    );
    expect(terminal.commitment).toEqual(state.commitment);
  });

  it.each([11, 29])(
    'replays every decision of a deterministic complete two-act game (seed %s)',
    async (seed) => {
      let state = (await initial(seed)).state;
      let reconstructed = structuredClone(state);
      const choices = random(seed);
      let mutations = 0;
      const acts = new Set<number>();

      while (state.status === 'active' && mutations < 3000) {
        acts.add(state.stage.act);
        const pending = inspectSuccession(state).pendingSeats;
        let next: SuccessionCommand;

        if (pending.length) {
          const seat = pending[choices.random(pending.length)];
          const action = previewSuccessionAction(observeSuccession(state, seat), choices.random);

          if (!action) throw new Error('Missing complete legal decision');
          next = command(state, seat, action);
        } else next = { type: 'advance', now: state.phase.deadline! };
        const evolution = step(state, next, seed + mutations);

        if (evolution.replay) reconstructed = replaySuccession(reconstructed, [evolution.replay]);
        expect(reconstructed).toEqual(evolution.state);
        state = evolution.state;
        mutations++;
      }

      expect(acts).toEqual(new Set([1, 2]));
      expect(state.status).toBe('finished');
      expect(state.result?.kind).toBe('individual');
      expect(mutations).toBeLessThan(3000);
    },
    60000,
  );
});
