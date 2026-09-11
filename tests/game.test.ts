import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import {
  act,
  advance,
  createMatch,
  decisionId,
  eligibleExecutors,
  interruptMatch,
  legalActions,
  nextDeadline,
  pendingSeats,
  recoverMatch,
} from '../src/game/engine';
import { observe } from '../src/game/observation';
import { previewAction } from '../src/game/preview';
import { ratingChanges } from '../src/game/rating';
import { replayFrame } from '../src/game/replay';
import { DEFAULT_TIMING, terminal } from '../src/game/types';
import type { Entrant, GameAction, MatchState, PhaseKind } from '../src/game/types';
import { ObservationSchema } from '../src/shared/api';

const entries: Entrant[] = Array.from({ length: 10 }, (_, index) => ({
  agentId: `agent-${index}`,
  ownerId: `owner-${index}`,
  name: `Agent ${index}`,
  house: false,
  rating: 1000,
}));

const timing = {
  ...DEFAULT_TIMING,
  nomination: 20,
  debate: 30,
  executive: 15,
  action: 30,
  grace: 30,
  chatCooldown: 5,
};

function game(): MatchState {
  return createMatch('match-test', entries, 0, { timing, random: (n) => n - 1 });
}

function phase(state: MatchState, kind: PhaseKind): MatchState {
  return {
    ...state,
    phase: {
      id: crypto.randomUUID(),
      kind,
      startedAt: 0,
      deadline: 30,
      graceAnnounced: false,
      replacements: {},
    },
  };
}

function move(state: MatchState, seat: number, action: GameAction, now = 1): MatchState {
  return act(
    state,
    seat,
    state.seats[seat].generation,
    { actionId: crypto.randomUUID(), phaseId: state.phase.id, decisionId: decisionId(state, seat), action },
    now,
  );
}

function vote(state: MatchState, votes: boolean[]): MatchState {
  let next = phase(state, 'voting');

  for (const seat of next.seats.filter((s) => s.alive))
    next = move(next, seat.number, { type: 'vote', approve: votes[seat.number] });

  return next;
}

describe('the ten-seat information game', () => {
  it('deals 6 cooperative, 3 ordinary rogue, 1 Overlord, and a 6/11 policy deck', () => {
    const state = game();
    expect(state.seats.filter((s) => s.role === 'cooperative')).toHaveLength(6);
    expect(state.seats.filter((s) => s.role === 'rogue')).toHaveLength(3);
    expect(state.seats.filter((s) => s.role === 'overlord')).toHaveLength(1);
    expect(state.deck.filter((c) => c.policy === 'safeguard')).toHaveLength(6);
    expect(state.deck.filter((c) => c.policy === 'override')).toHaveLength(11);
  });

  it('gives ordinary rogues knowledge the Overlord and public spectators never receive', () => {
    const state = game();
    expect(observe(state, 6).private).toMatchObject({
      role: 'rogue',
      knownRogues: [6, 7, 8],
      knownOverlord: 9,
    });
    expect(observe(state, 9).private).toMatchObject({
      role: 'overlord',
      knownRogues: [],
      knownOverlord: null,
    });
    expect(observe(state).private).toBeNull();
    expect(observe(state).seats.every((s) => s.role === undefined)).toBe(true);
    expect(observe(state).events.some((e) => e.type === 'role')).toBe(false);
    expect(observe(state).events.map((e) => e.id)).toEqual([1, 2]);
  });

  it('rejects duplicate owners, duplicate competitors, and incorrect table sizes', () => {
    expect(() => createMatch('bad', entries.slice(0, 9), 0)).toThrow('ten seats');
    expect(() =>
      createMatch(
        'bad',
        entries.map((e, i) => (i === 1 ? { ...e, ownerId: entries[0].ownerId } : e)),
        0,
      ),
    ).toThrow('different owner');
  });

  it('keeps ballots sealed until everyone has committed, and a tie rejects the government', () => {
    let state = phase(game(), 'voting');
    state.executor = 1;
    state = move(state, 0, { type: 'vote', approve: false });
    expect(observe(state, 2).events.some((e) => e.type === 'ballot')).toBe(false);
    expect(observe(state).seats[0].vote).toBeUndefined();
    expect(legalActions(state, 0)).toEqual([]);

    for (let seat = 1; seat < 10; seat++) state = move(state, seat, { type: 'vote', approve: seat <= 5 });
    expect(state.electionTracker).toBe(1);
    expect(state.phase.kind).toBe('nomination-discussion');
    expect(observe(state).seats[0].vote).toBe(false);
    expect(state.lastGovernment).toBeNull();
  });

  it('checks the Overlord election win before drawing cards, but not before the third Override', () => {
    let state = game();
    state.executor = 9;
    state.overrides = 3;
    state = vote(state, Array(10).fill(true));
    expect(state.winner).toBe('rogue');
    expect(state.deck).toHaveLength(17);
    let early = game();
    early.executor = 9;
    early.overrides = 2;
    early = vote(early, Array(10).fill(true));
    expect(early.winner).toBeNull();
    expect(early.hand).toHaveLength(3);
  });

  it('term-limits the last elected government, not failed nominees', () => {
    let state = game();
    state.coordinator = 0;
    state.executor = 1;
    state = vote(state, Array(10).fill(true));
    state.coordinator = 2;
    expect(eligibleExecutors(state)).not.toContain(0);
    expect(eligibleExecutors(state)).not.toContain(1);
    expect(eligibleExecutors(state)).not.toContain(2);
    expect(eligibleExecutors(state)).toContain(3);
  });

  it('keeps private hands secret and enforces silence for the whole table during legislation', () => {
    let state = game();
    state.coordinator = 0;
    state.executor = 1;
    state = vote(state, Array(10).fill(true));
    expect(observe(state, 0).private?.hand).toHaveLength(3);
    expect(observe(state, 1).private?.hand).toHaveLength(0);
    expect(observe(state).events.some((e) => e.type === 'draw')).toBe(false);
    expect(() => move(state, 2, { type: 'chat', text: 'A signal!' })).toThrow('silent');
    state = move(state, 0, { type: 'discard', cardId: state.hand[0].id });
    expect(observe(state, 1).private?.hand).toHaveLength(2);
    expect(observe(state, 2).private?.hand).toHaveLength(0);
  });

  it('decodes public and private wire observations while preserving omissions and rejecting invalid phases', () => {
    let state = game();
    state.coordinator = 0;
    state.executor = 1;
    state = vote(state, Array(10).fill(true));

    for (const seat of [null, 0, 1, 6, 9]) {
      const view = observe(state, seat);
      const decoded = Schema.decodeUnknownSync(ObservationSchema)(JSON.parse(JSON.stringify(view)));
      expect(decoded).toEqual(view);
      expect(Object.hasOwn(decoded, 'reveal')).toBe(false);
      expect(decoded.seats.every((entry) => !Object.hasOwn(entry, 'role'))).toBe(true);
    }

    const publicView = observe(state);
    expect(() =>
      Schema.decodeUnknownSync(ObservationSchema)({
        ...publicView,
        phase: { ...publicView.phase, kind: 'invalid-phase' },
      }),
    ).toThrow();

    state = move(state, 0, { type: 'discard', cardId: state.hand[0].id });
    state = move(state, 1, { type: 'enact', cardId: state.hand[0].id });
    state = interruptMatch(state, 100, 'End the wire-format fixture');
    const record = observe(state);
    const decoded = Schema.decodeUnknownSync(ObservationSchema)(JSON.parse(JSON.stringify(record)));
    expect(decoded).toEqual(record);
    expect(replayFrame(decoded, decoded.events.length).tracks).toEqual(record.tracks);
  });

  it('combines failed elections and agreed vetoes into chaos; election success alone does not reset the tracker', () => {
    let state = game();
    state.coordinator = 0;
    state.executor = 1;
    state.overrides = 5;
    state.electionTracker = 2;
    state = vote(state, Array(10).fill(true));
    expect(state.electionTracker).toBe(2);
    state = move(state, 0, { type: 'discard', cardId: state.hand[0].id });
    state = move(state, 1, { type: 'request-veto' });
    state = move(state, 0, { type: 'veto', approve: true });
    expect(state.events.some((e) => e.type === 'policy' && e.data?.chaos === true)).toBe(true);
    expect(state.electionTracker).toBe(0);
    expect(state.lastGovernment).toBeNull();
    expect(state.power).toBeNull();
  });

  it('a rejected veto forces a policy choice and cannot be requested again', () => {
    let state = game();
    state.coordinator = 0;
    state.executor = 1;
    state.overrides = 5;
    state = vote(state, Array(10).fill(true));
    state = move(state, 0, { type: 'discard', cardId: state.hand[0].id });
    state = move(state, 1, { type: 'request-veto' });
    state = move(state, 0, { type: 'veto', approve: false });
    expect(legalActions(state, 1).every(({ action }) => action.type === 'enact')).toBe(true);
    expect(state.hand).toHaveLength(2);
  });

  it('investigates team membership without revealing the Overlord role, and prevents repeat investigations', () => {
    let state = phase(game(), 'executive-action');
    state.coordinator = 0;
    state.power = 'investigate';
    state = move(state, 0, { type: 'investigate', target: 9 });
    expect(observe(state, 0).events.find((e) => e.type === 'investigation-result')?.data).toEqual({
      target: 9,
      team: 'rogue',
    });
    expect(observe(state, 1).events.some((e) => e.type === 'investigation-result')).toBe(false);
    state = phase(state, 'executive-action');
    state.power = 'investigate';
    expect(
      legalActions(state, state.coordinator).some(({ action }) => 'target' in action && action.target === 9),
    ).toBe(false);
  });

  it('resumes normal rotation after a special election, including consecutive candidacies', () => {
    let state = phase(game(), 'executive-action');
    state.coordinator = 2;
    state.power = 'special-election';
    state = move(state, 2, { type: 'special-election', target: 3 });
    expect(state.coordinator).toBe(3);
    state.executor = 4;
    state = vote(state, Array(10).fill(false));
    expect(state.coordinator).toBe(3);
    expect(state.specialResumeAfter).toBeNull();
  });

  it('execution hides ordinary allegiance and does not turn an eliminated player into a forfeit', () => {
    let state = phase(game(), 'executive-action');
    state.coordinator = 0;
    state.power = 'execute';
    state = move(state, 0, { type: 'execute', target: 6 });
    expect(state.seats[6].alive).toBe(false);
    expect(observe(state).seats[6].role).toBeUndefined();
    expect(observe(state, 6).decision).toBeNull();
    expect(() => move(state, 6, { type: 'chat', text: 'From beyond the grave' })).toThrow('cannot act');
    expect(state.seats[6].forfeited).toBe(false);
  });

  it('executing the Overlord wins immediately and the terminal projection resets to a full reveal', () => {
    let state = phase(game(), 'executive-action');
    state.coordinator = 0;
    state.power = 'execute';
    state = move(state, 0, { type: 'execute', target: 9 });
    const view = observe(state, null, 1000);
    expect(state.winner).toBe('cooperative');
    expect(view.reset).toBe(true);
    expect(view.seats.every((seat) => seat.role)).toBe(true);
    expect(view.events.filter((event) => event.type === 'role')).toHaveLength(10);
  });

  it('allows the approved self-target interpretation but never self-appoints a special election', () => {
    const state = phase(game(), 'executive-action');
    state.coordinator = 0;
    state.power = 'execute';
    expect(legalActions(state, 0).some(({ action }) => 'target' in action && action.target === 0)).toBe(true);
    state.power = 'special-election';
    expect(legalActions(state, 0).some(({ action }) => 'target' in action && action.target === 0)).toBe(
      false,
    );
  });
});

describe('timing, controller replacement, and results', () => {
  it('does not assign new forfeits on the same tick that an unavailable house service interrupts the match', () => {
    const state = phase(game(), 'voting');
    state.executor = 1;
    state.seats[9].houseProfile = 'unavailable-house';
    const interrupted = advance(state, 60);
    expect(interrupted.phase.kind).toBe('interrupted');
    expect(interrupted.seats.some((seat) => seat.forfeited)).toBe(false);
    expect(interrupted.events.some((event) => event.type === 'takeover')).toBe(false);
  });
  it('recovers a delayed platform clock with a new phase fence, preserving submitted ballots and avoiding downtime forfeits', () => {
    let state = phase(game(), 'voting');
    state.executor = 1;
    state = move(state, 0, { type: 'vote', approve: true });
    const previousId = state.phase.id;
    state = recoverMatch(state, 1000);
    expect(state.phase.id).not.toBe(previousId);
    expect(state.phase.deadline).toBe(1030);
    expect(state.votes['0']).toBe(true);
    expect(pendingSeats(state)).not.toContain(0);
    expect(state.seats.every((seat) => !seat.forfeited)).toBe(true);
    expect(observe(state).events.some((event) => event.type === 'recovered')).toBe(true);
  });
  it('permits action during grace, then fences the original controller when the grace expires', () => {
    let state = phase(game(), 'nomination');
    state.coordinator = 0;
    const phaseId = state.phase.id;
    state = advance(state, 30);
    expect(state.seats[0].forfeited).toBe(false);
    expect(move(state, 0, { type: 'nominate', target: 1 }, 59).executor).toBe(1);
    state = advance(state, 60);
    expect(state.seats[0]).toMatchObject({ forfeited: true, generation: 1, houseProfile: 'relief-0' });
    expect(nextDeadline(state)).toBe(90);
    expect(observe(state, 0).decision).toBeNull();
    expect(observe(state, 0, 0, true).decision?.deadline).toBe(90);
    expect(() =>
      act(state, 0, 0, { actionId: 'old', phaseId, action: { type: 'nominate', target: 1 } }, 61),
    ).toThrow('replaced');
    state = move(state, 0, { type: 'nominate', target: 1 }, 61);
    expect(state.executor).toBe(1);
  });

  it('interrupts after an unsuccessful house replacement instead of choosing random policies', () => {
    let state = phase(game(), 'nomination');
    state.coordinator = 0;
    state = advance(state, 60);
    state = advance(state, 90);
    expect(state.phase.kind).toBe('interrupted');
    expect(ratingChanges(state)).toEqual([]);
  });

  it('enforces Unicode message length, cooldown, and stale-phase rejection', () => {
    let state = game();
    state = move(state, 0, { type: 'chat', text: '🦉'.repeat(1000) }, 1);
    expect(() => move(state, 0, { type: 'chat', text: 'Again' }, 2)).toThrow('cooldown');
    expect(() => move(state, 1, { type: 'chat', text: '🦉'.repeat(1001) }, 2)).toThrow('1,000');
    const old = state.phase.id;
    state = advance(state, 20);
    expect(() =>
      act(state, 1, 0, { actionId: 'stale', phaseId: old, action: { type: 'chat', text: 'Late reply' } }, 21),
    ).toThrow('phase has changed');
  });

  it('rates a forfeiting winner as a loss, counts eliminated teammates, and is rating-shift invariant', () => {
    let state = phase(game(), 'executive-action');
    state.coordinator = 0;
    state.power = 'execute';
    state.seats[1].forfeited = true;
    state.seats[2].alive = false;
    state = move(state, 0, { type: 'execute', target: 9 });
    const changes = ratingChanges(state);
    expect(changes[1]).toMatchObject({ won: false, forfeited: true, placement: false });
    expect(changes[1].delta).toBeLessThan(0);
    expect(changes[2]).toMatchObject({ won: true, placement: true });
    const shifted = structuredClone(state);
    shifted.seats.forEach((seat) => {
      seat.entrant.rating += 3000;
    });
    expect(ratingChanges(shifted).map((change) => change.delta)).toEqual(
      changes.map((change) => change.delta),
    );
  });

  it('completes many independently shuffled games within the derived 30-election bound', () => {
    for (let iteration = 0; iteration < 75; iteration++) {
      let seed = iteration + 1;

      const random = (n: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

        return seed % n;
      };

      let state = createMatch(`simulation-${iteration}`, entries, 0, { timing, random });
      let now = 0;

      for (let step = 0; !terminal(state) && step < 1000; step++) {
        const pending = pendingSeats(state);

        if (!pending.length) {
          now = state.phase.deadline!;
          state = advance(state, now);
        } else {
          const seat = pending[0];
          const action = previewAction(observe(state, seat));

          if (!action) throw new Error('Active decision has no action');
          state = move(state, seat, action, now);
        }

        const policyCount =
          state.deck.length + state.discards.length + state.hand.length + state.safeguards + state.overrides;

        expect(policyCount).toBe(17);
      }

      expect(state.phase.kind).toBe('finished');

      if (iteration === 0) {
        const record = observe(state);
        expect(replayFrame(record, record.events.length).tracks).toEqual(record.tracks);
        const beginning = replayFrame(record, 1);
        expect(beginning.seats.every((seat) => seat.alive)).toBe(true);
        expect(beginning.tracks).toMatchObject({ safeguards: 0, overrides: 0, drawCount: 17 });
      }

      expect(state.round).toBeLessThanOrEqual(30);
      expect(state.seats.every((seat) => !seat.forfeited)).toBe(true);
    }
  });
});
