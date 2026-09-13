import { describe, expect, it } from 'vitest';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { assertAct2Integrity } from '../src/game/succession/act2';
import { commitmentDigest, createCommitment, verifyCommitment } from '../src/game/succession/commitment';
import { settleSuccession, winnerProbabilities } from '../src/game/succession/rating';
import { teamOf } from '../src/game/types';
import type { Entrant, PhaseKind, Policy } from '../src/game/types';
import type { Action2, Observation2 } from '../src/shared/succession';
import type { Act1Board, RandomContext, SuccessionState, Evolution } from '../src/game/succession/types';

const entrants: Entrant[] = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `agent-${seat}`,
  ownerId: `owner-${seat}`,
  name: `Seat ${seat}`,
  house: false,
  rating: 1000,
}));

function rng(seed: number): RandomContext {
  let value = seed;
  let serial = 0;

  return {
    random(size) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

      return Math.floor((value / 4294967296) * size);
    },
    id: () => `seed-${seed}-opaque-${serial++}`,
  };
}

async function setup(seed = 1) {
  const random = rng(seed);

  const initial = await createSuccession(`succession-${seed}`, entrants, 0, {
    random,
    salt: new Uint8Array(32).fill(seed % 256),
  });

  return { ...initial, random };
}

function move(
  state: SuccessionState,
  seat: number,
  action: Action2,
  random: RandomContext,
  now = state.phase.startedAt + 1,
): Evolution {
  const observation = observeSuccession(state, seat, undefined, state.seats[seat].houseProfile !== null);

  return evolveSuccession(
    state,
    {
      type: 'act',
      seat,
      generation: state.seats[seat].generation,
      now,
      request: {
        gameId: 'succession',
        actionId: random.id(),
        phaseId: observation.phase.id,
        decisionId: observation.decision?.id,
        action,
      },
    },
    random,
  );
}

function policies(board: Act1Board): void {
  const cards = [...board.deck, ...board.discards, ...board.hand];
  expect(cards.length + board.safeguards + board.overrides).toBe(17);
  expect(cards.filter((card) => card.policy === 'safeguard').length + board.safeguards).toBe(6);
  expect(cards.filter((card) => card.policy === 'override').length + board.overrides).toBe(11);
  expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
}

function integrity(state: SuccessionState): void {
  if (state.stage.act === 1) policies(state.stage.board);
  else {
    assertAct2Integrity(state.stage.board);
    policies(state.stage.archive);
    expect(state.seats.map((seat) => seat.alive)).toEqual(
      state.stage.board.resources.map((resource) => resource.hand.length > 0),
    );
  }
}

function setPhase(state: SuccessionState, kind: PhaseKind, random: RandomContext): void {
  if (state.stage.act !== 1) throw new Error('Expected child');
  state.stage.board.phase = {
    id: random.id(),
    kind,
    startedAt: 0,
    deadline: 30000,
    graceAnnounced: false,
    replacements: {},
  };
  state.phase = state.stage.board.phase;
}

function enacted(board: Act1Board, policy: Policy, count: number): void {
  for (let i = 0; i < count; i++)
    board.deck.splice(
      board.deck.findIndex((card) => card.policy === policy),
      1,
    );

  if (policy === 'safeguard') board.safeguards = count;
  else board.overrides = count;
}

type VictoryPath =
  | 'safeguards'
  | 'overrides'
  | 'chaos-safeguards'
  | 'chaos-overrides'
  | 'election'
  | 'execution'
  | 'self-execution';

async function nearVictory(path: VictoryPath, takeover = false) {
  const fixture = await setup();
  let state = fixture.state;
  const { random } = fixture;

  if (state.stage.act !== 1) throw new Error('Expected child');
  const board = state.stage.board;
  const overlord = state.seats.find((seat) => seat.role === 'overlord')!.number;
  let actor = (overlord + 1) % 10;
  let action: Action2;
  const dead = (overlord + 2) % 10;
  state.seats[dead].alive = false;
  state.seats.forEach((seat) => {
    seat.lastChatAt = 999;
  });

  if (path === 'execution' || path === 'self-execution') {
    actor = path === 'self-execution' ? overlord : actor;
    board.coordinator = actor;
    board.power = 'execute';
    setPhase(state, 'executive-action', random);
    action = { type: 'execute', target: overlord };
  } else if (path === 'election' || path.startsWith('chaos-')) {
    board.coordinator = actor;
    board.executor = overlord;
    setPhase(state, 'voting', random);

    if (path === 'election') enacted(board, 'override', 3);
    else {
      const policy = path === 'chaos-safeguards' ? 'safeguard' : 'override';
      enacted(board, policy, policy === 'safeguard' ? 4 : 5);
      const index = board.deck.findIndex((card) => card.policy === policy);
      [board.deck[0], board.deck[index]] = [board.deck[index], board.deck[0]];
      board.electionTracker = 2;
    }

    for (const seat of state.seats)
      if (seat.alive && seat.number !== actor) board.votes[String(seat.number)] = path === 'election';
    action = { type: 'vote', approve: path === 'election' };
  } else {
    const policy = path === 'safeguards' ? 'safeguard' : 'override';
    enacted(board, policy, policy === 'safeguard' ? 4 : 5);
    const index = board.deck.findIndex((card) => card.policy === policy);
    board.hand = board.deck.splice(index, 1);
    board.hand.push(...board.deck.splice(0, 1));
    board.executor = actor;
    board.coordinator = overlord;
    setPhase(state, 'executor-policy', random);
    action = { type: 'enact', cardId: board.hand[0].id };
  }

  integrity(state);

  if (takeover)
    state = evolveSuccession(
      state,
      { type: 'advance', now: 30000 + state.snapshot.timing.grace },
      random,
    ).state;

  return { state, random, actor, action, dead, overlord };
}

async function act2() {
  const fixture = await nearVictory('self-execution');
  const result = move(fixture.state, fixture.actor, fixture.action, fixture.random);

  return { ...result, random: fixture.random };
}

function discuss(state: SuccessionState, random: RandomContext): SuccessionState {
  return evolveSuccession(state, { type: 'advance', now: state.phase.deadline ?? 0 }, random).state;
}

describe('Succession complete match boundary', () => {
  for (const path of [
    'safeguards',
    'overrides',
    'chaos-safeguards',
    'chaos-overrides',
    'election',
    'execution',
    'self-execution',
  ]) {
    if (
      path !== 'safeguards' &&
      path !== 'overrides' &&
      path !== 'chaos-safeguards' &&
      path !== 'chaos-overrides' &&
      path !== 'election' &&
      path !== 'execution' &&
      path !== 'self-execution'
    )
      continue;

    for (const takeover of [false, true]) {
      it(`atomically intercepts ${path}, takeover=${takeover}`, async () => {
        const fixture = await nearVictory(path, takeover);
        const { state: before, random, actor, action, dead } = fixture;
        const snapshot = structuredClone(before);

        const { state, appendedEvents } = move(
          before,
          actor,
          action,
          random,
          before.phase.startedAt + (takeover ? 60001 : 1),
        );

        expect(before).toEqual(snapshot);
        expect(state.status).toBe('active');
        expect(state.finishedAt).toBeNull();
        expect(state.result).toBeNull();
        expect(settleSuccession(state)).toBeNull();
        expect(state.stage.act).toBe(2);
        expect(state.phase.kind).toBe('act-2:discussion');
        expect(state.phase.id).not.toBe(before.phase.id);
        expect(state.commitment).toEqual(before.commitment);
        expect(state.seats.every((seat) => seat.alive && seat.lastChatAt === null)).toBe(true);
        expect(state.act1Result?.returnedSeats).toContain(dead);
        expect(state.act1Result?.roles).toEqual(before.seats.map((seat) => seat.role));
        expect(
          state.seats.map(({ generation, forfeited, houseProfile, entrant }) => ({
            generation,
            forfeited,
            houseProfile,
            entrant,
          })),
        ).toEqual(
          before.seats.map(({ generation, forfeited, houseProfile, entrant }) => ({
            generation,
            forfeited,
            houseProfile,
            entrant,
          })),
        );

        if (state.stage.act !== 2) throw new Error('Missing Act 2');
        expect(state.stage.board.resources.map((resource) => resource.coins)).toEqual(
          state.seats.map((seat) => (teamOf(seat.role) === state.act1Result?.team ? 3 : 2)),
        );
        expect(state.stage.board.resources.every((resource) => resource.hand.length === 2)).toBe(true);
        expect(appendedEvents.filter((event) => event.type === 'act-ended')).toHaveLength(1);
        expect(appendedEvents.filter((event) => event.type === 'act-started')).toHaveLength(1);
        expect(appendedEvents.filter((event) => event.type === 'capability-deal')).toHaveLength(10);
        expect(
          appendedEvents.some(
            (event) =>
              event.type === 'victory' ||
              (event.data && 'phase' in event.data && event.data.phase === 'finished'),
          ),
        ).toBe(false);
        expect(
          appendedEvents.some((event) => event.text.includes('All roles and private events are revealed')),
        ).toBe(false);
        const publicView = observeSuccession(state);
        expect(publicView.private).toBeNull();
        expect(publicView.commitment.reveal).toBeNull();
        expect(publicView.seats.map((seat) => seat.role)).toEqual(before.seats.map((seat) => seat.role));
        const publicBytes = JSON.stringify(publicView);

        for (const resource of state.stage.board.resources)
          for (const card of resource.hand) {
            expect(publicBytes).not.toContain(card.id);
            expect(publicBytes).not.toContain(card.physicalId);
          }

        if (takeover) {
          expect(observeSuccession(state, actor).private).toBeNull();
          expect(observeSuccession(state, actor, undefined, true).private?.act).toBe(2);
        }

        expect(() =>
          evolveSuccession(
            state,
            {
              type: 'act',
              seat: actor,
              generation: state.seats[actor].generation,
              now: 60002,
              request: { gameId: 'succession', actionId: 'stale', phaseId: before.phase.id, action },
            },
            random,
          ),
        ).toThrow();
        integrity(state);
      });
    }
  }

  it('interrupts Act 1 without a transition, bonus, or completed result', async () => {
    const { state, random } = await setup();

    const result = evolveSuccession(
      state,
      { type: 'interrupt', now: 10, reason: 'Platform unavailable' },
      random,
    );

    expect(result.state.status).toBe('interrupted');
    expect(result.state.stage.act).toBe(1);
    expect(result.state.act1Result).toBeNull();
    expect(result.state.result).toBeNull();
    expect(result.appendedEvents.some((event) => event.type === 'act-started')).toBe(false);
    expect(
      settleSuccession(result.state)?.participants.every(
        (participant) => participant.won === null && participant.ratingDelta === 0,
      ),
    ).toBe(true);
  });
});

describe('Succession sealed observations and authority', () => {
  it('keeps executed Act 1 seats waiting and restores their legal participation after transition', async () => {
    const fixture = await nearVictory('execution');
    const waiting = observeSuccession(fixture.state, fixture.dead);
    expect(waiting.status).toBe('active');
    expect(waiting.you?.alive).toBe(false);
    expect(waiting.decision).toBeNull();
    expect(waiting.chat.open).toBe(false);
    const { state } = move(fixture.state, fixture.actor, fixture.action, fixture.random);
    const returned = observeSuccession(state, fixture.dead);
    expect(returned.status).toBe('active');
    expect(returned.you?.alive).toBe(true);
    expect(returned.private).toMatchObject({ act: 2 });
    expect(returned.chat.open).toBe(true);
    expect(returned.you?.generation).toBe(waiting.you?.generation);
  });

  it('pauses chat during private exchange and reveals its pool only to the actor', async () => {
    const fixture = await act2();
    let state = discuss(fixture.state, fixture.random);

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    const actor = state.stage.board.activeSeat;
    state = move(state, actor, { type: 'exchange' }, fixture.random).state;

    for (const seat of inspectSuccession(state).pendingSeats)
      state = move(state, seat, { type: 'pass' }, fixture.random).state;
    const owner = observeSuccession(state, actor);
    expect(owner.private).toMatchObject({ act: 2 });

    if (owner.private?.act !== 2) throw new Error('Missing private exchange');
    expect(owner.private.exchangePool).toHaveLength(4);
    expect(owner.decision?.actions).toHaveLength(6);
    expect(JSON.stringify(owner)).not.toContain('physicalId');

    for (const seat of [null, ...state.seats.map((entry) => entry.number)]) {
      const observation = observeSuccession(state, seat);
      expect(observation.chat.open).toBe(false);

      if (seat !== actor && observation.private?.act === 2)
        expect(observation.private.exchangePool).toEqual([]);
    }

    const before = structuredClone(state);
    expect(() => move(state, actor, { type: 'chat', text: 'During exchange' }, fixture.random)).toThrow();
    expect(state).toEqual(before);
    const action = owner.decision?.actions[0].action;

    if (!action) throw new Error('Missing exchange return');
    state = move(state, actor, action, fixture.random).state;
    expect(observeSuccession(state).chat.open).toBe(true);
    integrity(state);
  });

  it('interrupts a failed replacement before assigning another external forfeit', async () => {
    const fixture = await act2();
    let state = discuss(fixture.state, fixture.random);

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    state = move(state, state.stage.board.activeSeat, { type: 'tax' }, fixture.random).state;
    const required = inspectSuccession(state).pendingSeats;
    const failedHouse = required[required.length - 1];
    state.seats[failedHouse].houseProfile = 'existing-house-controller';

    const result = evolveSuccession(
      state,
      { type: 'advance', now: (state.phase.deadline ?? 0) + state.snapshot.timing.grace },
      fixture.random,
    );

    expect(result.state.status).toBe('interrupted');
    expect(result.state.seats.some((seat) => seat.forfeited)).toBe(false);
    expect(result.appendedEvents.some((event) => event.type === 'takeover')).toBe(false);
    expect(result.state.result).toBeNull();
    expect(
      settleSuccession(result.state)?.participants.every((participant) => participant.won === null),
    ).toBe(true);
  });

  it('keeps uninvolved projections byte-identical for each partial response, including history metadata', async () => {
    const fixture = await act2();
    let state = discuss(fixture.state, fixture.random);

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    const actor = state.stage.board.activeSeat;
    state = move(state, actor, { type: 'tax' }, fixture.random).state;
    const responders = inspectSuccession(state).pendingSeats;
    const history = { visibilityEpoch: 'unchanged-entitlement', streamHead: 17 };

    for (const responder of responders.slice(0, -1)) {
      const others = [null, ...state.seats.map((seat) => seat.number).filter((seat) => seat !== responder)];
      const before = others.map((seat) => JSON.stringify(observeSuccession(state, seat, history)));
      const previousId = state.phase.id;
      const result = move(state, responder, { type: 'pass' }, fixture.random);
      expect(
        result.appendedEvents.every(
          (event) => event.visibility === responder || event.visibility === 'archive',
        ),
      ).toBe(true);
      state = result.state;
      expect(state.phase.id).toBe(previousId);
      expect(others.map((seat) => JSON.stringify(observeSuccession(state, seat, history)))).toEqual(before);
      expect(observeSuccession(state, responder).decision).toBeNull();
      expect(observeSuccession(state, responder).private).toMatchObject({ reaction: 'pass' });
      integrity(state);
    }

    const before = state.phase.id;
    state = move(state, responders[responders.length - 1], { type: 'pass' }, fixture.random).state;
    expect(state.phase.id).not.toBe(before);
  });

  it('preserves sealed receipts through takeover and recovery while revoking current private access', async () => {
    const fixture = await act2();
    let state = discuss(fixture.state, fixture.random);

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    const actor = state.stage.board.activeSeat;
    state = move(state, actor, { type: 'tax' }, fixture.random).state;
    const responders = inspectSuccession(state).pendingSeats;
    const missing = responders[responders.length - 1];

    for (const responder of responders.slice(0, -1))
      state = move(state, responder, { type: 'pass' }, fixture.random).state;
    const generation = state.seats[missing].generation;
    const timeout = (state.phase.deadline ?? 0) + state.snapshot.timing.grace;
    state = evolveSuccession(state, { type: 'advance', now: timeout }, fixture.random).state;
    expect(state.seats[missing]).toMatchObject({
      forfeited: true,
      generation: generation + 1,
      houseProfile: `relief-${missing}`,
    });
    expect(observeSuccession(state, missing).private).toBeNull();
    expect(observeSuccession(state, missing).decision).toBeNull();
    expect(observeSuccession(state, missing, undefined, true).private?.act).toBe(2);
    const oldId = state.phase.id;
    const before = structuredClone(state.stage);
    state = evolveSuccession(state, { type: 'recover', now: timeout + 1 }, fixture.random).state;
    expect(state.phase.id).not.toBe(oldId);

    if (state.stage.act !== 2 || before.act !== 2) throw new Error('Expected Act 2');
    expect(state.stage.board.resources).toEqual(before.board.resources);
    expect(state.stage.board.pending).toEqual(before.board.pending);
    expect(inspectSuccession(state).pendingSeats).toEqual([missing]);
    expect(() =>
      evolveSuccession(
        state,
        {
          type: 'act',
          seat: missing,
          generation,
          now: timeout + 2,
          request: {
            gameId: 'succession',
            actionId: 'revoked',
            phaseId: state.phase.id,
            action: { type: 'pass' },
          },
        },
        fixture.random,
      ),
    ).toThrow();
    state = move(state, missing, { type: 'pass' }, fixture.random, timeout + 2).state;
    expect(state.phase.kind).toBe('act-2:discussion');
    integrity(state);
  });
});

describe('Succession final commitment and rating', () => {
  it('binds salted canonical SHA-256 commitments to match, priority, and salt', async () => {
    const value = await createCommitment('match', rng(1), new Uint8Array(32).fill(7));
    expect(await verifyCommitment('match', value)).toBe(true);
    expect(await verifyCommitment('other-match', value)).toBe(false);
    expect(await verifyCommitment('match', { ...value, priority: value.priority.toReversed() })).toBe(false);
    expect(await verifyCommitment('match', { ...value, saltBase64url: 'A'.repeat(43) })).toBe(false);
    expect(await commitmentDigest('match', value.saltBase64url, value.priority)).toBe(value.digest);

    const bytes = new TextEncoder().encode(
      JSON.stringify(['succession-tie-v1', 'match', 'succession-1', value.saltBase64url, value.priority]),
    );

    const expected = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    expect(value.digest).toBe(expected);
    expect(value.saltBase64url).toHaveLength(43);
    await expect(createCommitment('match', rng(1), new Uint8Array(31))).rejects.toThrow();
  });

  it('finishes at the cap, reveals the commitment, and credits exactly one unforfeited winner', async () => {
    const fixture = await act2();
    let state = fixture.state;

    if (state.stage.act !== 2) throw new Error('Expected Act 2');
    state.stage.board.round = 12;
    state.stage.board.slot = 9;
    state.stage.board.activeSeat = (state.stage.board.firstSeat + 9) % 10;
    state.stage.board.resources.forEach((resource) => {
      resource.coins = 2;
    });
    const actor = state.stage.board.activeSeat;
    state = discuss(state, fixture.random);
    state = move(state, actor, { type: 'exchange' }, fixture.random).state;

    for (const seat of inspectSuccession(state).pendingSeats)
      state = move(state, seat, { type: 'pass' }, fixture.random).state;
    const observation = observeSuccession(state, actor);
    const action = observation.decision?.actions[0].action;

    if (!action) throw new Error('Missing exchange');
    state = move(state, actor, action, fixture.random).state;
    expect(state.status).toBe('finished');
    expect(state.result?.reason).toBe('round-cap');
    expect(state.result?.winnerSeat).toBe(state.commitment.priority[0]);
    expect(state.result?.tieBreak?.scores).toHaveLength(10);
    expect(state.result?.tieBreak?.decisive).toBe('priority');
    expect(observeSuccession(state).commitment.reveal).toEqual({
      saltBase64url: state.commitment.saltBase64url,
      priority: state.commitment.priority,
    });
    const settlement = settleSuccession(state);
    expect(settlement?.participants.filter((participant) => participant.won)).toHaveLength(1);
    expect(settlement?.participants.find((participant) => participant.won)?.ratingDelta).toBeCloseTo(28.8);
    expect(
      settlement?.participants
        .filter((participant) => !participant.won)
        .every((participant) => Math.abs(participant.ratingDelta + 3.2) < 1e-10),
    ).toBe(true);
    expect(
      settlement?.participants.reduce((sum, participant) => sum + participant.ratingDelta, 0),
    ).toBeCloseTo(0);
    state.seats[state.result!.winnerSeat].forfeited = true;
    const forfeited = settleSuccession(state);
    expect(forfeited?.participants.filter((participant) => participant.won)).toHaveLength(0);
    expect(
      forfeited?.participants.reduce((sum, participant) => sum + participant.ratingDelta, 0),
    ).toBeCloseTo(-32);
    expect(forfeited?.participants.find((participant) => participant.forfeited)?.placement).toBe(false);

    for (const mode of ['preview', 'evaluation']) {
      if (mode !== 'preview' && mode !== 'evaluation') continue;
      state.snapshot.mode = mode;
      expect(
        settleSuccession(state)?.participants.every(
          (participant) => participant.ratingDelta === 0 && !participant.placement,
        ),
      ).toBe(true);
    }

    integrity(state);
  });

  it('keeps softmax probabilities stable under rating translation and extreme finite values', () => {
    const ratings = Array.from({ length: 10 }, (_, i) => 800 + i * 100);
    const original = winnerProbabilities(ratings);
    const translated = winnerProbabilities(ratings.map((rating) => rating + 1e6));
    original.forEach((value, i) => expect(value).toBeCloseTo(translated[i], 12));
    expect(winnerProbabilities(Array.from({ length: 10 }, (_, i) => (i === 0 ? 1e100 : -1e100)))).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(() => winnerProbabilities([1000])).toThrow();
  });
});

function strategy(observation: Observation2, random: RandomContext, variety: number): Action2 | null {
  if (variety === 0) return previewSuccessionAction(observation, random.random);
  const options = observation.decision?.actions ?? [];

  if (!options.length) return null;

  if (variety === 1) return options[random.random(options.length)].action;

  if (observation.act === 1) {
    const reject = options.find(({ action }) => action.type === 'vote' && !action.approve);

    if (reject && random.random(3) !== 0) return reject.action;

    return previewSuccessionAction(observation, random.random);
  }

  const aggressive = options.filter(
    ({ action }) =>
      action.type === 'assassinate' ||
      action.type === 'steal' ||
      action.type === 'challenge' ||
      action.type === 'block',
  );

  return (
    aggressive.length ? aggressive[random.random(aggressive.length)] : options[random.random(options.length)]
  ).action;
}

describe('Succession observation-only complete simulations', () => {
  it('plays 250 seeded two-act matches with varied legal strategies and bounded normal virtual pacing', async () => {
    const metrics: {
      seed: number;
      strategy: number;
      submissions: number;
      act1: number;
      act2: number;
      windows: number;
      virtualMs: number;
      act1Ms: number;
      act2Ms: number;
      reason: string;
    }[] = [];

    const used = new Set<string>();

    for (let seed = 1; seed <= 250; seed++) {
      const initial = await setup(seed);
      let state = initial.state;
      const chooser = rng(seed + 9000);

      const metric = {
        seed,
        strategy: seed % 3,
        submissions: 0,
        act1: 0,
        act2: 0,
        windows: 0,
        virtualMs: 0,
        act1Ms: 0,
        act2Ms: 0,
        reason: '',
      };

      let phaseId = '';
      let responseAt = 0;
      let steps = 0;

      while (state.status === 'active') {
        if (++steps > 6000) throw new Error(`Unbounded seed ${seed}`);
        integrity(state);

        if (phaseId !== state.phase.id) {
          phaseId = state.phase.id;
          metric.windows++;
          // Concurrent reactions all arrive at the same virtual timestamp; 1s normal response latency.
          responseAt = state.phase.startedAt + 1000;
        }

        const observations = state.seats.map((seat) => observeSuccession(state, seat.number));
        const required = observations.filter((observation) => observation.decision !== null);
        const act = state.stage.act;
        let now: number;

        if (required.length) {
          const observation = required[chooser.random(required.length)];
          const action = strategy(observation, chooser, metric.strategy);

          if (!action || !observation.you) throw new Error('Missing observed legal action');
          used.add(action.type);
          now = responseAt;
          state = move(state, observation.you.seat, action, initial.random, now).state;
          metric.submissions++;

          if (act === 1) metric.act1++;
          else metric.act2++;
        } else {
          const deadline = observeSuccession(state).phase.deadline;

          if (deadline === null) throw new Error('Active match without a decision or deadline');
          now = deadline;
          state = evolveSuccession(state, { type: 'advance', now }, initial.random).state;
        }

        const elapsed = now - metric.virtualMs;
        expect(elapsed).toBeGreaterThanOrEqual(0);

        if (act === 1) metric.act1Ms += elapsed;
        else metric.act2Ms += elapsed;
        metric.virtualMs = now;
        integrity(state);
      }

      expect(state.status).toBe('finished');
      expect(state.stage.act).toBe(2);
      expect(state.result?.kind).toBe('individual');
      expect(state.seats.filter((seat) => seat.forfeited)).toHaveLength(0);
      expect(settleSuccession(state)?.participants.filter((participant) => participant.won)).toHaveLength(1);
      expect(await verifyCommitment(state.id, state.commitment)).toBe(true);
      expect(state.stage.act === 2 && state.stage.board.round <= 12).toBe(true);
      metric.reason = state.result?.reason ?? 'missing';
      metrics.push(metric);
    }

    for (const action of [
      'nominate',
      'vote',
      'discard',
      'enact',
      'execute',
      'income',
      'tax',
      'steal',
      'assassinate',
      'exchange',
      'coup',
      'challenge',
      'pass',
      'block',
      'lose-influence',
      'return-influence',
    ])
      expect(used.has(action)).toBe(true);

    const summary = [0, 1, 2].map((variety) => {
      const samples = metrics.filter((metric) => metric.strategy === variety);

      const range = (
        key: 'submissions' | 'act1' | 'act2' | 'windows' | 'virtualMs' | 'act1Ms' | 'act2Ms',
      ) => {
        const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);

        return {
          min: values[0],
          median: values[Math.floor(values.length / 2)],
          p95: values[Math.ceil(values.length * 0.95) - 1],
          max: values[values.length - 1],
        };
      };

      return {
        strategy: variety,
        matches: samples.length,
        caps: samples.filter((sample) => sample.reason === 'round-cap').length,
        submissions: range('submissions'),
        act1: range('act1'),
        act2: range('act2'),
        windows: range('windows'),
        virtualMs: range('virtualMs'),
        act1Ms: range('act1Ms'),
        act2Ms: range('act2Ms'),
      };
    });

    console.log('SUCCESSION_PACING', JSON.stringify(summary));
  }, 120000);
});
