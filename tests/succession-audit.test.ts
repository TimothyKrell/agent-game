import { Schema } from 'effect';
import { expect, it } from 'vitest';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { AuditFact2Schema, AuthorizedEvent2Schema } from '../src/shared/succession';
import type { Evolution } from '../src/game/succession/types';
import type { Entrant } from '../src/game/types';

const entrants: Entrant[] = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `audit-${seat}`,
  ownerId: `owner-${seat}`,
  name: `Audit seat ${seat}`,
  house: false,
  rating: 1000,
}));

it('retains typed realized initial, shuffle, and physical-zone outcomes in bounded canonical archive facts', async () => {
  let seed = 97;

  const random = {
    random(size: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % size;
    },
    id: () => crypto.randomUUID(),
  };

  let evolution = await createSuccession('audit-outcomes', entrants, 0, {
    random,
    salt: new Uint8Array(32).fill(7),
  });

  const kinds = new Set<string>();
  let maxEvent = 0;

  const audit = (change: Evolution) => {
    expect(change.appendedEvents.length).toBeLessThanOrEqual(64);

    for (const [index, event] of change.appendedEvents.entries()) {
      const { visibility, ...authorized } = event;
      expect(Schema.is(AuthorizedEvent2Schema)({ ...authorized, id: index + 1 })).toBe(true);
      const length = new TextEncoder().encode(JSON.stringify(event)).length;
      maxEvent = Math.max(maxEvent, length);

      if (event.type === 'audit') {
        expect(visibility).toBe('archive');
        const fact = Schema.decodeUnknownSync(AuditFact2Schema)(event.data);
        kinds.add(fact.kind);
      }
    }
  };

  audit(evolution);
  let steps = 0;

  while (evolution.state.status === 'active' && steps++ < 2000) {
    const state = evolution.state;
    const runtime = inspectSuccession(state);
    const number = runtime.pendingSeats[0];

    if (number === undefined) {
      evolution = evolveSuccession(state, { type: 'advance', now: runtime.nextDeadline! }, random);
    } else {
      const view = observeSuccession(state, number);
      const action = previewSuccessionAction(view, random.random);

      if (!action || !view.decision) throw new Error('Missing required legal action');
      evolution = evolveSuccession(
        state,
        {
          type: 'act',
          seat: number,
          generation: state.seats[number].generation,
          now: state.phase.startedAt,
          request: {
            gameId: 'succession',
            actionId: crypto.randomUUID(),
            phaseId: view.phase.id,
            decisionId: view.decision.id,
            action,
          },
        },
        random,
      );
    }

    audit(evolution);
  }

  expect(evolution.state.status).toBe('finished');

  for (const kind of ['initial', 'random-outcomes', 'policy-zones', 'court-order', 'capability-zones'])
    expect(kinds.has(kind)).toBe(true);
  expect(maxEvent).toBeLessThanOrEqual(8192);
});
