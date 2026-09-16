import { describe, expect, it } from 'vitest';
import { createMatch } from '../src/game/engine';
import {
  createFinale,
  startFinale,
  admitSubmission,
  recordVerdict,
  advanceFinale,
  observeFinale,
  replaceFinalist,
} from '../src/game/coding-finale/engine';
import { createFinaleCommitment, finaleCommitmentDigest } from '../src/game/coding-finale/commitment';
import { FINALE_RULES } from '../src/game/coding-finale/types';
import type { FinaleState, SubmissionRequest, Tier } from '../src/game/coding-finale/types';
import { routingCases, routingChallenge, solveRouting } from '../src/game/coding-finale/routing';
import type { RoutingInput } from '../src/game/coding-finale/routing';
import { playLabActOne } from '../dev/coding-finale/act-one';

function setup() {
  const board = createMatch(
    'finale-test',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Agent ${seat}`,
      house: false,
      rating: 1000,
    })),
    0,
  );

  board.seats.forEach((seat, index) => {
    seat.role = index < 6 ? 'cooperative' : index === 9 ? 'overlord' : 'rogue';
  });
  board.seats[2].alive = false;
  board.seats[3].forfeited = true;
  board.seats[3].generation = 1;
  board.seats[3].houseProfile = 'relief';
  board.phase.kind = 'finished';
  board.winner = 'cooperative';

  const state = createFinale(board, 'challenge-a', {
    priority: [9, 2, 3, 0, 1, 4, 5, 6, 7, 8],
    saltBase64url: 'private-salt',
    digest: 'public-commitment',
  });

  return startFinale(state, 1000);
}

function controller(seat: number) {
  return { seat, generation: seat === 3 ? 1 : 0, house: seat === 3 };
}

function request(tier: Tier, id: string): SubmissionRequest {
  return {
    actionId: id,
    challengeId: 'challenge-a',
    tier,
    program: { language: 'javascript', source: 'export function solve() { return -1; }' },
  };
}

function submit(
  state: FinaleState,
  seat: number,
  tier: Tier,
  now: number,
  id = `attempt-${state.submissions.length + 1}`,
) {
  return admitSubmission(state, controller(seat), request(tier, id), `hash-${id}`, now).state;
}

function unlock(state: FinaleState, seat: number, at: number) {
  const next = submit(state, seat, 1, at);

  return recordVerdict(next, next.submissions.length, 'passed', at + 10);
}

describe('coding finale qualification and tier access', () => {
  it('qualifies only living winning-faction seats, retaining takeover provenance', () => {
    const state = setup();
    expect(state.finalists.map((seat) => seat.seat)).toEqual([0, 1, 3, 4, 5]);
    expect(state.finalists.find((seat) => seat.seat === 3)).toMatchObject({
      generation: 1,
      forfeited: true,
      houseProfile: 'relief',
    });
    expect(() => submit(state, 2, 1, 1100)).toThrow(/surviving/);
    expect(() => submit(state, 9, 1, 1100)).toThrow(/surviving/);
  });

  it('runs a real scripted first act through the existing engine before qualification', async () => {
    const board = playLabActOne('real-first-act');
    const state = createFinale(board, 'real-challenge', await createFinaleCommitment(board.id));
    expect(board.events.some((event) => event.type === 'victory')).toBe(true);
    expect(state.status).toBe('preparing');
    expect(state.finalists.length).toBeGreaterThan(0);
    expect(state.result).toBeNull();

    for (const finalist of state.finalists) expect(board.seats[finalist.seat].alive).toBe(true);
  });

  it('requires the same finalist to pass Tier 1, without resetting the shared clock', () => {
    const initial = setup();
    expect(() => submit(initial, 0, 2, 1100)).toThrow(/Tier 1/);
    let state = submit(initial, 0, 1, 1100);
    expect(() => submit(state, 0, 2, 1101)).toThrow(/Tier 1/);
    state = recordVerdict(state, 1, 'wrong-answer', 1110);
    expect(() => submit(state, 0, 2, 1120)).toThrow(/Tier 1/);
    state = unlock(state, 0, 1200);
    expect(submit(state, 0, 2, 1300).submissions.at(-1)?.tier).toBe(2);
    expect(() => submit(state, 1, 2, 1300)).toThrow(/Tier 1/);
    expect(state.deadline).toBe(initial.deadline);
    expect(observeFinale(state, controller(0)).you?.unlockedTier).toBe(2);
    expect(observeFinale(state, controller(1)).you?.unlockedTier).toBe(1);
  });

  it('does not expose source hashes, private priority, or controller information to spectators', () => {
    const state = submit(setup(), 0, 1, 1100);
    const view = observeFinale(state);
    expect(view.you).toBeNull();
    expect(view.priorityReveal).toBeNull();
    expect(JSON.stringify(view)).not.toContain('private-salt');
    expect(JSON.stringify(view)).not.toContain('hash-attempt');
  });
});

describe('authoritative coding race results', () => {
  it.each(['passed', 'wrong-answer'] as const)(
    'waits for an earlier complete submission before crowning a later one (%s)',
    (earlierVerdict) => {
      let state = unlock(unlock(setup(), 0, 1100), 1, 1200);
      state = submit(state, 0, 2, 1300);
      state = submit(state, 1, 2, 1300);
      state = recordVerdict(state, 4, 'passed', 1310);
      expect(state.result).toBeNull();
      state = recordVerdict(state, 3, earlierVerdict, 1320);
      expect(state.result).toMatchObject({
        winnerSeat: earlierVerdict === 'passed' ? 0 : 1,
        reason: 'tier-two',
      });
    },
  );

  it('ranks fallback completions by receipt order, not judge completion order', () => {
    let state = submit(submit(setup(), 0, 1, 1100), 1, 1, 1200);
    state = recordVerdict(state, 2, 'passed', 1250);
    state = recordVerdict(state, 1, 'passed', 1300);
    state = advanceFinale(state, state.deadline!);
    expect(state.result).toEqual({ winnerSeat: 0, credited: true, reason: 'tier-one', submission: 1 });
  });

  it('judges pre-deadline submissions after closing, and rejects new entries at the boundary', () => {
    let state = setup();
    state = submit(state, 0, 1, state.deadline! - 1);
    state = advanceFinale(state, state.deadline!);
    expect(state.status).toBe('judging');
    expect(() => submit(state, 1, 1, state.deadline!)).toThrow(/closed/);
    state = recordVerdict(state, 1, 'passed', state.deadline! + 100);
    expect(state.result?.reason).toBe('tier-one');
  });

  it('uses the precommitted finalist priority if nobody passes, without reviving executed seats or win credit', () => {
    const state = advanceFinale(setup(), 1000 + FINALE_RULES.durationMs);
    expect(state.result).toEqual({ winnerSeat: 3, credited: false, reason: 'priority', submission: null });
    expect(observeFinale(state).priorityReveal?.priority).toEqual(state.priority);
  });

  it('interrupts on unresolved judging rather than assigning a fabricated failure or timeout champion', () => {
    let state = setup();
    state = submit(state, 0, 1, state.deadline! - 1);
    const late = state.deadline! + FINALE_RULES.judgingGraceMs;
    expect(advanceFinale(state, late).status).toBe('interrupted');
    expect(recordVerdict(state, 1, 'passed', late).result).toBeNull();
  });

  it('produces a independently verifiable priority commitment', async () => {
    const commitment = await createFinaleCommitment('commitment-test');
    expect(new Set(commitment.priority).size).toBe(10);
    expect(commitment.digest).toBe(
      await finaleCommitmentDigest('commitment-test', commitment.saltBase64url, commitment.priority),
    );
    expect(commitment.digest).not.toBe(
      await finaleCommitmentDigest('another-match', commitment.saltBase64url, commitment.priority),
    );
  });
});

describe('submission limits, receipts, and controller authority', () => {
  it('allows one in-flight submission per finalist and ten total across both tiers', () => {
    let state = submit(setup(), 0, 1, 1100);
    expect(() => submit(state, 0, 1, 1101)).toThrow(/current submission/);
    state = recordVerdict(state, 1, 'passed', 1110);

    for (let attempt = 2; attempt <= 10; attempt++) {
      state = submit(state, 0, 2, 1100 + attempt * 100);
      state = recordVerdict(state, attempt, 'wrong-answer', 1110 + attempt * 100);
    }

    expect(() => submit(state, 0, 2, 3000)).toThrow(/ten/);
  });

  it('retries the same receipt after terminal status without consuming an attempt', () => {
    let state = submit(setup(), 0, 1, 1100, 'stable');
    state = recordVerdict(state, 1, 'passed', 1200);
    state = advanceFinale(state, state.deadline!);
    const retry = admitSubmission(state, controller(0), request(1, 'stable'), 'hash-stable', 999_999);
    expect(retry.duplicate).toBe(true);
    expect(retry.state.submissions).toHaveLength(1);
    expect(() =>
      admitSubmission(state, controller(0), request(1, 'stable'), 'different-source', 999_999),
    ).toThrow(/identical/);
  });

  it('retains passed tiers and limits on takeover, invalidates pending work, and rejects the old controller', () => {
    let state = unlock(setup(), 0, 1100);
    state = submit(state, 0, 2, 1200);
    state = replaceFinalist(state, 0, 'relief-0', 1210);
    expect(state.finalists[0]).toMatchObject({ tierOne: 1, generation: 1, forfeited: true });
    expect(state.submissions[1].status).toBe('superseded');
    expect(recordVerdict(state, 2, 'passed', 1220).result).toBeNull();
    expect(() => submit(state, 0, 2, 1230)).toThrow(/no longer controls/);
  });

  it('enforces UTF-8 source bytes as well as transport character limits', () => {
    const entry = {
      ...request(1, 'unicode'),
      program: { language: 'javascript' as const, source: '😀'.repeat(9000) },
    };

    expect(() => admitSubmission(setup(), controller(0), entry, 'unicode-hash', 1100)).toThrow(/byte limit/);
  });
});

/** Independent time-expanded reachability oracle, deliberately not another shortest-path implementation. */
function enumerateTime(input: RoutingInput, maxTime = 1200): number {
  const width = input.capacity + 1;
  const possible = Array.from({ length: maxTime + 1 }, () => new Set<number>());
  possible[0].add(input.start * width + input.capacity);

  for (let time = 0; time <= maxTime; time++) {
    for (const state of possible[time]) {
      const node = Math.floor(state / width);
      const charge = state % width;

      if (node === input.target) return time;

      if (time < maxTime) possible[time + 1].add(state);

      for (const edge of input.edges) {
        if (
          edge.from === node &&
          edge.energy <= charge &&
          time % edge.period === edge.phase &&
          time + edge.duration <= maxTime
        )
          possible[time + edge.duration].add(edge.to * width + charge - edge.energy);
      }

      if (input.rechargers.includes(node) && time + input.rechargeTime <= maxTime)
        possible[time + input.rechargeTime].add(node * width + input.capacity);
    }
  }

  return -1;
}

describe('original scheduled-network challenge', () => {
  it('handles sample waiting and the power-constrained extension', () => {
    expect(routingChallenge(1).example.expected).toBe(7);
    expect(routingChallenge(2).example.expected).toBe(11);
  });

  it('reproduces generated suites and checks answers with an independent time-expanded oracle', () => {
    for (const tier of [1, 2] as const) {
      const cases = routingCases(873, tier);
      expect(cases).toEqual(routingCases(873, tier));
      expect(cases).not.toEqual(routingCases(874, tier));

      for (const index of [0, 2, 3, 7])
        expect(solveRouting(cases[index].input)).toBe(enumerateTime(cases[index].input));
      expect(cases.some((entry) => entry.expected === -1)).toBe(true);
      expect(cases.some((entry) => entry.expected > 0)).toBe(true);
    }
  });
});
