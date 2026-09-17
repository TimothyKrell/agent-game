import { beforeAll, describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { createHash } from 'node:crypto';
import {
  createCodingFinale,
  evolveCodingFinale,
  inspectCodingFinale,
  observeCodingFinale,
  decodeCodingFinale,
  decodeCodingFinaleReplayState,
  authorizeCodingFinaleChallenge,
  publicCodingFinaleChallenge,
  pendingCodingFinaleJobs,
  settleCodingFinale,
} from '../src/game/coding-finale/game';
import type { CodingFinaleState } from '../src/game/coding-finale/game';
import { gameDescriptor } from '../src/game/descriptors';
import { decodeGameState, gameRegistry } from '../src/game/registry';
import { previewAction } from '../src/game/preview';
import { teamOf } from '../src/game/types';
import { codingChallenge } from '../src/game/coding-finale/challenges';
import type { ActionRequest3 } from '../src/shared/coding-finale';
import { ActionRequest3Schema, Observation3Schema } from '../src/shared/coding-finale';

const entrants = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `a-${seat}`,
  ownerId: `o-${seat}`,
  name: `Agent ${seat}`,
  house: false,
  rating: 1000,
}));

let prepared: CodingFinaleState;

const routingChallenge = (tier: 1 | 2) =>
  codingChallenge(prepared.challengeFamily ?? 'scheduled-network-1', tier);

let nextId = 0;

beforeAll(async () => {
  let seed = 17;

  const random = {
    random(size: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % size;
    },
    id: () => `id-${nextId++}`,
  };

  let { state } = await createCodingFinale('production-finale', entrants, 1000, {
    snapshot: {
      ...gameDescriptor('coding-finale'),
      mode: 'ranked',
      houseModel: { provider: 'test', model: 'test', policyVersion: 'coding-finale-1' },
    },
    random,
  });

  const digest = state.commitment.digest;

  for (let step = 0; step < 2000 && !state.finale; step++) {
    const inspection = inspectCodingFinale(state);
    const seat = inspection.pendingSeats[0];
    const view = observeCodingFinale(state, seat ?? null);
    const action = view.actOne && previewAction(view.actOne);

    const evolution =
      seat === undefined
        ? evolveCodingFinale(state, { type: 'advance', now: inspection.nextDeadline! }, random)
        : evolveCodingFinale(
            state,
            {
              type: 'act',
              seat,
              generation: state.seats[seat].generation,
              request: {
                gameId: 'coding-finale',
                actionId: `action-${nextId++}`,
                phaseId: view.phase.id,
                decisionId: view.decision?.id,
                action: action!,
              },
              now: state.phase.startedAt + 1,
            },
            random,
          );

    expect(
      evolution.appendedEvents.some(
        (event) =>
          event.type === 'victory' ||
          (event.type === 'phase' && event.data && 'phase' in event.data && event.data.phase === 'finished'),
      ),
    ).toBe(false);
    expect(new Set(evolution.appendedEvents.map((event) => event.eventKey)).size).toBe(
      evolution.appendedEvents.length,
    );
    expect(evolution.replayFrames.map((frame) => frame.eventKey)).toEqual(
      evolution.appendedEvents.map((event) => event.eventKey),
    );

    for (const frame of evolution.replayFrames)
      expect(decodeCodingFinaleReplayState(JSON.parse(JSON.stringify(frame.state)))).toEqual(frame.state);
    state = evolution.state;
    expect(state.commitment.digest).toBe(digest);
    expect(JSON.stringify(state).length).toBeLessThan(65_536);
  }

  expect(state.finale?.status).toBe('preparing');
  prepared = state;
});

function racing() {
  return evolveCodingFinale(prepared, { type: 'prepare-ready', now: prepared.phase.startedAt + 1000 }).state;
}

function submit(
  state: CodingFinaleState,
  seat: number,
  tier: 1 | 2,
  now: number,
  id = `submission-${nextId++}`,
) {
  const request: ActionRequest3 = {
    gameId: 'coding-finale',
    phaseId: state.phase.id,
    actionId: id,
    action: {
      type: 'submit-program',
      tier,
      challengeId: state.finale!.challengeId,
      program: { language: 'typescript', source: 'export const solve = (input: unknown): number => -1;' },
    },
  };

  const fingerprint = createHash('sha256').update(JSON.stringify(request.action)).digest('hex');

  return {
    request,
    fingerprint,
    evolution: evolveCodingFinale(state, {
      type: 'act',
      seat,
      generation: state.seats[seat].generation,
      house: state.seats[seat].houseProfile !== null,
      request,
      fingerprint,
      now,
    }),
  };
}

describe('production Coding Finale adapter', () => {
  it('registers its protocol and commits priority before a real full first act', async () => {
    const initial = await createCodingFinale('initial', entrants, 0);
    expect(gameRegistry['coding-finale'].inspect(initial.state).status).toBe('active');
    expect(initial.appendedEvents[0].type).toBe('finale-commitment');
    const view = observeCodingFinale(initial.state, 0, { serverNow: 25 });
    expect(Schema.decodeUnknownSync(Observation3Schema)(view)).toEqual(view);
    expect(view).toMatchObject({
      gameId: 'coding-finale',
      protocolVersion: '3',
      serverNow: 25,
      act: 1,
      finale: null,
    });
    expect(view.actOne?.private).not.toBeNull();
    expect(observeCodingFinale(initial.state).actOne?.private).toBeNull();
    expect(decodeGameState(JSON.parse(JSON.stringify(initial.state)))).toEqual(initial.state);
  });

  it('atomically qualifies surviving winners and defers the shared clock until preparation', () => {
    expect(prepared.status).toBe('active');
    expect(settleCodingFinale(prepared)).toBeNull();
    expect(prepared.finale!.finalists.map((seat) => seat.seat)).toEqual(
      prepared.seats
        .filter((seat) => seat.alive && teamOf(seat.role) === prepared.act1Result!.team)
        .map((seat) => seat.number),
    );
    const seat = prepared.finale!.finalists[0].seat;
    expect(publicCodingFinaleChallenge(prepared, 1)).toEqual(routingChallenge(1));
    expect(authorizeCodingFinaleChallenge(prepared, { seat, generation: 0, house: false }, 1)).toEqual(
      routingChallenge(1),
    );
    expect(() => publicCodingFinaleChallenge(prepared, 2)).toThrow('Tier 1');
    const state = racing();
    expect(state.finale!.deadline! - state.finale!.startedAt!).toBe(300_000);
    expect(observeCodingFinale(state).actOne).toBeNull();
    expect(() => authorizeCodingFinaleChallenge(state, { seat, generation: 0, house: false }, 2)).toThrow(
      'Tier 1',
    );
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('persists submission metadata only, fences tier access, and admits retries once', () => {
    let state = racing();
    const seat = state.finale!.finalists[0].seat;
    const firstView = observeCodingFinale(state, seat);
    expect(() => submit(state, seat, 2, state.phase.startedAt + 1)).toThrow('Tier 1');
    const admitted = submit(state, seat, 1, state.phase.startedAt + 1);
    state = admitted.evolution.state;
    expect(Schema.decodeUnknownSync(ActionRequest3Schema)(admitted.request)).toEqual(admitted.request);
    expect(JSON.stringify(state)).not.toContain('export const solve');
    expect(JSON.stringify(admitted.evolution.replayFrames)).not.toContain('export const solve');
    expect(observeCodingFinale(state, seat).decision).toBeNull();
    expect(pendingCodingFinaleJobs(state)).toHaveLength(1);
    expect(inspectCodingFinale(state).nextDeadline).toBe(state.finale!.submissions[0].receivedAt + 30_000);

    const retry = evolveCodingFinale(state, {
      type: 'act',
      seat,
      generation: 0,
      request: admitted.request,
      fingerprint: admitted.fingerprint,
      now: state.phase.startedAt + 2,
    });

    expect(retry.appendedEvents).toHaveLength(0);
    expect(retry.state.finale!.submissions).toHaveLength(1);
    expect(() =>
      evolveCodingFinale(state, {
        type: 'act',
        seat,
        generation: 0,
        request: admitted.request,
        fingerprint: 'b'.repeat(64),
        now: state.phase.startedAt + 2,
      }),
    ).toThrow('identical');
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'passed',
      now: state.phase.startedAt + 10,
    }).state;
    expect(observeCodingFinale(state, seat).decision?.id).not.toBe(firstView.decision?.id);
    expect(observeCodingFinale(state, seat).finale?.you?.unlockedTier).toBe(2);
    expect(observeCodingFinale(state).finale?.submissions[0].verdict).toBeNull();
    expect(authorizeCodingFinaleChallenge(state, { seat, generation: 0, house: false }, 2)).toBeDefined();
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('exposes provisional ordering while earlier Tier 2 receipts remain pending', () => {
    let state = racing();
    const [a, b] = state.finale!.finalists;
    expect(b).toBeDefined();
    const now = state.phase.startedAt;

    for (const finalist of [a, b]) {
      state = submit(state, finalist.seat, 1, now + 1).evolution.state;
      state = evolveCodingFinale(state, {
        type: 'judge-result',
        sequence: state.finale!.submissions.length,
        verdict: 'passed',
        now: now + 2,
      }).state;
    }

    state = submit(state, a.seat, 2, now + 3).evolution.state;
    state = submit(state, b.seat, 2, now + 4).evolution.state;
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 4,
      verdict: 'passed',
      now: now + 5,
    }).state;
    expect(observeCodingFinale(state).finale?.provisionalResult).toEqual({
      winnerSeat: b.seat,
      submission: 4,
    });
    expect(state.status).toBe('active');
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 3,
      verdict: 'passed',
      now: now + 6,
    }).state;
    expect(state.result).toMatchObject({
      kind: 'individual',
      winnerSeat: a.seat,
      reason: 'tier-two',
      credited: true,
    });
    expect(observeCodingFinale(state).finale?.provisionalResult).toBeNull();
    expect(Schema.decodeUnknownSync(Observation3Schema)(observeCodingFinale(state))).toEqual(
      observeCodingFinale(state),
    );
    const settled = settleCodingFinale(state)!;
    expect(settled.participants.filter((entry) => entry.won)).toHaveLength(1);
    expect(settled.participants.every((entry) => entry.placement)).toBe(true);
    expect(settled.participants.find((entry) => entry.won)?.ratingDelta).toBeCloseTo(28.8);
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('uses deadline fallback, drains pre-deadline receipts, and schedules judging recovery', () => {
    const initial = racing();
    const empty = evolveCodingFinale(initial, { type: 'advance', now: initial.finale!.deadline! }).state;
    expect(empty.result?.reason).toBe('priority');
    expect(empty.result?.winnerSeat).toBe(
      initial.commitment.priority.find((seat) =>
        initial.finale!.finalists.some((entry) => entry.seat === seat),
      ),
    );

    let state = submit(initial, initial.finale!.finalists[0].seat, 1, initial.finale!.deadline! - 1).evolution
      .state;

    state = evolveCodingFinale(state, { type: 'advance', now: initial.finale!.deadline! }).state;
    expect(state.finale?.status).toBe('judging');
    expect(inspectCodingFinale(state).nextDeadline).toBe(initial.finale!.deadline! + 29_999);
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'wrong-answer',
      now: initial.finale!.deadline! + 1,
    }).state;
    expect(state.result?.reason).toBe('priority');
    expect(inspectCodingFinale(state).nextDeadline).toBeNull();
  });

  it('interrupts lost judge work and late preparation rather than inventing contestant losses', () => {
    const late = evolveCodingFinale(prepared, { type: 'prepare-ready', now: prepared.phase.deadline! }).state;
    expect(late.status).toBe('interrupted');
    const initial = racing();

    const accepted = submit(initial, initial.finale!.finalists[0].seat, 1, initial.phase.startedAt + 1)
      .evolution.state;

    const interrupted = evolveCodingFinale(accepted, {
      type: 'recover',
      now: initial.phase.startedAt + 30_001,
    }).state;

    expect(interrupted.status).toBe('interrupted');
    expect(
      settleCodingFinale(interrupted)?.participants.every(
        (seat) => seat.won === null && seat.ratingDelta === 0 && !seat.placement,
      ),
    ).toBe(true);

    const lateVerdict = evolveCodingFinale(accepted, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'wrong-answer',
      now: initial.phase.startedAt + 30_001,
    });

    expect(lateVerdict.state.status).toBe('interrupted');
    expect(lateVerdict.appendedEvents.some((event) => event.type === 'submission-judged')).toBe(false);
  });

  it('retains progress and entrant credit during temporary coverage without house-authored programs', () => {
    let state = racing();
    const seat = state.finale!.finalists[0].seat;
    const now = state.phase.startedAt;
    state = submit(state, seat, 1, now + 1).evolution.state;
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'passed',
      now: now + 2,
    }).state;
    state = evolveCodingFinale(state, { type: 'replace', seat, houseProfile: 'relief', now: now + 3 }).state;
    expect(state.seats[seat].entrant).toEqual(prepared.seats[seat].entrant);
    expect(observeCodingFinale(state, seat).finale?.you).toBeNull();
    expect(observeCodingFinale(state, seat, { houseController: true }).finale?.you?.unlockedTier).toBe(2);
    expect(() => authorizeCodingFinaleChallenge(state, { seat, generation: 0, house: false }, 1)).toThrow(
      'controller',
    );
    expect(() => submit(state, seat, 2, now + 4)).toThrow('cannot author programs');
    state = evolveCodingFinale(state, { type: 'advance', now: state.finale!.deadline! }).state;
    expect(state.result).toMatchObject({ winnerSeat: seat, credited: true });
    expect(settleCodingFinale(state)?.participants.find((entry) => entry.seat === seat)).toMatchObject({
      won: true,
      forfeited: false,
      placement: true,
    });
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('withholds entrant credit only after the fourth coverage incident', () => {
    let state = racing();
    const seat = state.finale!.finalists[0].seat;
    const now = state.phase.startedAt;
    state = submit(state, seat, 1, now + 1).evolution.state;
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'passed',
      now: now + 2,
    }).state;

    for (let incident = 1; incident <= 4; incident++) {
      state = evolveCodingFinale(state, {
        type: 'replace',
        seat,
        houseProfile: `relief-${seat}`,
        now: now + incident * 2 + 1,
      }).state;

      if (incident < 4)
        state = evolveCodingFinale(state, {
          type: 'reclaim',
          seat,
          now: now + incident * 2 + 2,
        }).state;
    }

    expect(state.seats[seat]).toMatchObject({ recoveryCount: 4, forfeited: true });
    state = evolveCodingFinale(state, { type: 'advance', now: state.finale!.deadline! }).state;
    expect(state.result).toMatchObject({ winnerSeat: seat, credited: false });
    expect(settleCodingFinale(state)?.participants.find((entry) => entry.seat === seat)).toMatchObject({
      won: false,
      forfeited: true,
      placement: false,
    });
  });

  it('keeps covered external finalists idle until explicit reclaim without disturbing accepted judge work', () => {
    let state = racing();
    const finalist = state.finale!.finalists.find((entry) => !state.seats[entry.seat].entrant.house)!;
    const seat = state.seats[finalist.seat];
    const originalGeneration = seat.generation;
    const accepted = submit(state, seat.number, 1, state.phase.startedAt + 1).evolution.state;
    state = structuredClone(accepted);
    state.seats[seat.number].recoveryCount = 1;
    state.seats[seat.number].maxRecoveries = 3;
    state.seats[seat.number].generation++;
    state.seats[seat.number].houseProfile = `relief-${seat.number}`;
    state.finale!.finalists.find((entry) => entry.seat === seat.number)!.generation++;
    state.finale!.finalists.find((entry) => entry.seat === seat.number)!.houseProfile =
      `relief-${seat.number}`;

    expect(inspectCodingFinale(state).pendingSeats).not.toContain(seat.number);
    expect(observeCodingFinale(state, seat.number)).toMatchObject({
      decision: null,
      finale: { you: null },
      you: { control: 'temporary-house', canReclaim: true },
    });

    const coveredGeneration = state.seats[seat.number].generation;
    state = evolveCodingFinale(state, {
      type: 'reclaim',
      seat: seat.number,
      now: state.phase.startedAt + 2,
    }).state;
    expect(state.finale!.submissions[0]).toMatchObject({ status: 'pending', generation: originalGeneration });
    expect(state.seats[seat.number]).toMatchObject({
      houseProfile: null,
      generation: coveredGeneration + 1,
      recoveryCount: 1,
    });
    expect(inspectCodingFinale(state).pendingSeats).not.toContain(seat.number);
    expect(observeCodingFinale(state, seat.number).finale?.you).not.toBeNull();
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('keeps spectators read-only and persisted state free of source artifacts', () => {
    const state = racing();
    const seat = state.finale!.finalists[0].seat;

    const spectator = state.seats.find(
      (entry) => !state.finale!.finalists.some((finalist) => finalist.seat === entry.number),
    )!;

    expect(observeCodingFinale(state, spectator.number).decision).toBeNull();
    expect(() =>
      authorizeCodingFinaleChallenge(state, { seat: spectator.number, generation: 0, house: false }, 1),
    ).toThrow('winning-faction');

    expect(JSON.stringify(state).length).toBeLessThan(20_000);
    expect(publicCodingFinaleChallenge(state, 1)).toEqual(routingChallenge(1));
    expect(observeCodingFinale(state, seat).chat.open).toBe(false);
    expect(() =>
      decodeCodingFinale({ ...state, seed: 1, programs: [{ source: 'not permitted' }] }),
    ).toThrow();
    expect(() => decodeCodingFinale({ ...state, gameId: 'succession' })).toThrow();
  });

  it('decodes historical snapshots without recovery capability or wire fields', () => {
    const historical = structuredClone(prepared);
    delete historical.snapshot.controllerRecovery;

    for (const seat of historical.seats) {
      delete seat.recoveryCount;
      delete seat.maxRecoveries;
    }

    const decoded = decodeCodingFinale(JSON.parse(JSON.stringify(historical)));
    expect(decoded.snapshot.controllerRecovery).toBeUndefined();
    expect(observeCodingFinale(decoded).seats[0]).not.toHaveProperty('control');
    expect(decodeCodingFinaleReplayState(JSON.parse(JSON.stringify(historical)))).toEqual(historical);
  });

  it('preserves ordinary Act 1 chat', async () => {
    const { state } = await createCodingFinale('chat-act-one', entrants, 0);
    expect(observeCodingFinale(state, 0).chat.open).toBe(true);

    const evolution = evolveCodingFinale(state, {
      type: 'act',
      seat: 0,
      generation: 0,
      now: 1,
      request: {
        gameId: 'coding-finale',
        phaseId: state.phase.id,
        actionId: 'chat-one',
        action: { type: 'chat', text: 'Discuss this nomination.' },
      },
    });

    expect(
      evolution.appendedEvents.some(
        (event) => event.type === 'chat' && event.text === 'Discuss this nomination.',
      ),
    ).toBe(true);
    expect(evolution.state.lastChat).toEqual({ seat: 0, at: 1 });
    expect(inspectCodingFinale(evolution.state).discussion).not.toBeNull();
    expect(() => publicCodingFinaleChallenge(state, 1)).toThrow('not available');
  });

  it('rejects all Act 2 chat without changing progress or historical chat fields', () => {
    const initial = racing();
    const seat = initial.finale!.finalists[0].seat;
    const pending = submit(initial, seat, 1, initial.finale!.deadline! - 1).evolution.state;
    const judging = evolveCodingFinale(pending, { type: 'advance', now: initial.finale!.deadline! }).state;
    const finished = evolveCodingFinale(initial, { type: 'advance', now: initial.finale!.deadline! }).state;

    const interrupted = evolveCodingFinale(initial, {
      type: 'interrupt',
      now: initial.phase.startedAt + 1,
      reason: 'Test interruption.',
    }).state;

    for (const original of [prepared, initial, judging, finished, interrupted]) {
      const state = structuredClone(original);
      state.lastChat = { seat, at: state.createdAt };
      state.seats[seat].lastChatAt = state.createdAt;
      const before = structuredClone(state);
      expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
      expect(inspectCodingFinale(state).discussion).toBeNull();

      for (const speaker of state.seats) {
        expect(observeCodingFinale(state, speaker.number).chat).toMatchObject({
          open: false,
          nextSpeakAt: null,
        });
        expect(() =>
          evolveCodingFinale(state, {
            type: 'act',
            seat: speaker.number,
            generation: speaker.generation,
            now: state.phase.startedAt + 1,
            request: {
              gameId: 'coding-finale',
              phaseId: state.phase.id,
              actionId: 'closed-chat',
              action: { type: 'chat', text: 'No Act 2 chat.' },
            },
          }),
        ).toThrow(expect.objectContaining({ code: 'chat-closed' }));
      }

      expect(observeCodingFinale(state).chat).toMatchObject({ open: false, nextSpeakAt: null });
      expect(state).toEqual(before);
    }
  });

  it('opens public Tier 2 after any finalist passes without unlocking another finalist submission', () => {
    let state = racing();
    const [a, b] = state.finale!.finalists;
    const now = state.phase.startedAt;
    state = submit(state, a.seat, 1, now + 1).evolution.state;
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'passed',
      now: now + 2,
    }).state;
    expect(publicCodingFinaleChallenge(state, 2)).toEqual(routingChallenge(2));
    expect(
      authorizeCodingFinaleChallenge(state, { seat: b.seat, generation: b.generation, house: false }, 2),
    ).toEqual(routingChallenge(2));
    expect(observeCodingFinale(state, b.seat).finale?.you?.unlockedTier).toBe(1);
    expect(() => submit(state, b.seat, 2, now + 3)).toThrow('Tier 1');

    const alteredSecrets = {
      ...state,
      seed: state.seed ^ 12345,
      commitment: { ...state.commitment, saltBase64url: 'different-secret' },
    };

    expect(publicCodingFinaleChallenge(alteredSecrets, 2)).toEqual(routingChallenge(2));
    const finished = evolveCodingFinale(state, { type: 'advance', now: state.finale!.deadline! }).state;
    expect(publicCodingFinaleChallenge(finished, 2)).toEqual(routingChallenge(2));
  });

  it('keeps public Tier 2 locked at termination when nobody passed Tier 1', () => {
    const initial = racing();
    const finished = evolveCodingFinale(initial, { type: 'advance', now: initial.finale!.deadline! }).state;

    const interrupted = evolveCodingFinale(prepared, {
      type: 'interrupt',
      now: prepared.phase.startedAt + 1,
      reason: 'Preparation failed.',
    }).state;

    for (const state of [finished, interrupted]) {
      expect(publicCodingFinaleChallenge(state, 1)).toEqual(routingChallenge(1));
      expect(() => publicCodingFinaleChallenge(state, 2)).toThrow(
        expect.objectContaining({ code: 'tier-locked' }),
      );
    }
  });

  it('bounds the full submission budget and waits until the common deadline for fallback', () => {
    let state = racing();
    const now = state.phase.startedAt;

    for (const finalist of state.finale!.finalists) {
      for (let attempt = 0; attempt < 10; attempt++) {
        state = submit(state, finalist.seat, 1, now + 1).evolution.state;
        state = evolveCodingFinale(state, {
          type: 'judge-result',
          sequence: state.finale!.submissions.length,
          verdict: 'wrong-answer',
          now: now + 2,
        }).state;
      }

      expect(() => submit(state, finalist.seat, 1, now + 3)).toThrow('ten');
    }

    expect(inspectCodingFinale(state).pendingSeats).toEqual([]);
    expect(inspectCodingFinale(state).nextDeadline).toBe(state.finale!.deadline);
    expect(new TextEncoder().encode(JSON.stringify(state)).length).toBeLessThan(65_536);
    expect(new TextEncoder().encode(JSON.stringify(observeCodingFinale(state))).length).toBeLessThan(32_768);
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const corrupt = structuredClone(state);
    corrupt.finale!.submissions[0].verdict = null;
    expect(() => decodeCodingFinale(corrupt)).toThrow('receipt');
    const result = evolveCodingFinale(state, { type: 'advance', now: state.finale!.deadline! }).state;
    expect(result.result?.reason).toBe('priority');
    expect(decodeCodingFinale(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
});
