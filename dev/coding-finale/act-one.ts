import { act, advance, createMatch, pendingSeats } from '../../src/game/engine';
import { observe } from '../../src/game/observation';
import { previewAction } from '../../src/game/preview';

/** Unranked lab entry: play a real first act with observation-only scripted decisions. */
export function playLabActOne(id: string) {
  let state = createMatch(
    id,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `lab-agent-${seat}`,
      ownerId: `lab-owner-${seat}`,
      name: `Lab agent ${seat}`,
      house: false,
      rating: 1000,
    })),
    0,
    { mode: 'evaluation' },
  );

  for (let step = 0; step < 2000; step++) {
    if (state.phase.kind === 'finished') return state;

    if (state.phase.kind === 'interrupted') throw new Error('The lab first act was interrupted.');
    const seat = pendingSeats(state)[0];

    if (seat === undefined) {
      if (state.phase.deadline === null) throw new Error('First act has no next decision.');
      state = advance(state, state.phase.deadline);
      continue;
    }

    const view = observe(state, seat);
    const action = previewAction(view);

    if (!action) throw new Error('No scripted action for the first-act decision.');
    state = act(
      state,
      seat,
      state.seats[seat].generation,
      {
        actionId: crypto.randomUUID(),
        phaseId: view.phase.id,
        decisionId: view.decision?.id,
        action,
      },
      state.phase.startedAt + 1,
    );
  }

  throw new Error('The scripted first act exceeded the lab step budget.');
}
