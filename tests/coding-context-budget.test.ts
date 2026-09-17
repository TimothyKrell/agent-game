import { expect, it } from 'vitest';
import { compactCurrent } from '../cli/compact-current.mjs';
import {
  createCodingFinale,
  evolveCodingFinale,
  inspectCodingFinale,
  observeCodingFinale,
} from '../src/game/coding-finale/game';
import { previewAction } from '../src/game/preview';
import { gameDescriptor } from '../src/game/descriptors';

it.each([17, 29, 43])(
  'preserves playable information with bounded compact output across seeded game %i',
  async (seed) => {
    let nextId = 0;

    const random = {
      random(size: number) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

        return seed % size;
      },
      id: () => `context-${nextId++}`,
    };

    let { state } = await createCodingFinale(
      `match_context_${seed}`,
      Array.from({ length: 10 }, (_, seat) => ({
        agentId: `agent-${seat}`,
        ownerId: `owner-${seat}`,
        name: `Competitor ${seat}`,
        house: false,
        rating: 1000,
      })),
      1000,
      {
        random,
        snapshot: {
          ...gameDescriptor('coding-finale'),
          mode: 'preview',
          houseModel: { provider: 'preview', model: 'preview', policyVersion: 'coding-finale-1' },
        },
      },
    );

    let fullBytes = 0;
    let compactBytes = 0;
    let samples = 0;
    let maxCompactBytes = 0;

    const sample = () => {
      for (const seat of [null, ...state.seats.map((entry) => entry.number)]) {
        const view = observeCodingFinale(state, seat);
        const compact = compactCurrent(view);
        const bytes = Buffer.byteLength(JSON.stringify(compact));
        fullBytes += Buffer.byteLength(JSON.stringify(view));
        compactBytes += bytes;
        maxCompactBytes = Math.max(maxCompactBytes, bytes);
        samples++;
        expect(compact.decision).toEqual(view.decision);
        expect(compact.phase).toEqual(view.phase);
        expect(compact.you).toEqual(view.you);
        expect(compact.history).toEqual(view.history);
        expect(compact.chat).toEqual(view.chat);
        expect(compact.result).toEqual(view.result);
        expect(compact.actOne?.private).toEqual(view.actOne?.private);
        expect(compact.actOne?.tracks).toEqual(view.actOne?.tracks);
        expect(compact.actOne?.lastGovernment).toEqual(view.actOne?.lastGovernment);
        expect(compact.finale?.you).toEqual(view.finale?.you);
        expect(compact.finale?.submissions).toEqual(view.finale?.submissions);
        expect(compact.finale?.provisionalResult).toEqual(view.finale?.provisionalResult);
        expect(
          compact.seats.map((entry) => [entry.number, entry.role, entry.vote, entry.alive, entry.control]),
        ).toEqual(
          view.seats.map((entry) => [entry.number, entry.role, entry.vote, entry.alive, entry.control]),
        );
      }
    };

    for (let step = 0; step < 2000 && !state.finale; step++) {
      sample();
      const inspection = inspectCodingFinale(state);
      const seat = inspection.pendingSeats[0];
      const view = observeCodingFinale(state, seat ?? null);
      const action = view.actOne && previewAction(view.actOne);
      state = (
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
                  actionId: random.id(),
                  phaseId: view.phase.id,
                  decisionId: view.decision?.id,
                  action: action!,
                },
                now: state.phase.startedAt + 1,
              },
              random,
            )
      ).state;
    }

    expect(state.finale?.status).toBe('preparing');
    sample();
    state = evolveCodingFinale(state, { type: 'prepare-ready', now: state.phase.startedAt + 1 }).state;
    const finalist = state.finale!.finalists[0];

    for (const tier of [1, 2] as const) {
      sample();
      state = evolveCodingFinale(state, {
        type: 'act',
        seat: finalist.seat,
        generation: finalist.generation,
        fingerprint: 'a'.repeat(64),
        request: {
          gameId: 'coding-finale',
          actionId: random.id(),
          phaseId: state.phase.id,
          action: {
            type: 'submit-program',
            tier,
            challengeId: state.finale!.challengeId,
            program: { language: 'javascript', source: 'export const solve = () => 0;' },
          },
        },
        now: state.phase.startedAt + tier * 10,
      }).state;
      sample();
      // Deterministic judge-result fixture; this measures presentation, not coding ability.
      state = evolveCodingFinale(state, {
        type: 'judge-result',
        sequence: state.finale!.submissions.length,
        verdict: 'passed',
        now: state.phase.startedAt + tier * 10 + 1,
      }).state;
    }

    sample();
    expect(state.status).toBe('finished');
    expect(compactBytes / fullBytes).toBeLessThan(0.65);
    expect(maxCompactBytes).toBeLessThan(6000);
    console.log(
      JSON.stringify({
        matchId: state.id,
        samples,
        fullBytes,
        compactBytes,
        reduction: 1 - compactBytes / fullBytes,
        maxCompactBytes,
      }),
    );
  },
);
