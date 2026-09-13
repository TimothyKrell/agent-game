import type { Page } from '@playwright/test';
import { act, advance, createMatch, decisionId, pendingSeats } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { previewAction } from '../src/game/preview';
import { terminal, type MatchState } from '../src/game/types';
import type { Bootstrap, MatchSummary } from '../src/shared/api';

export async function arena(page: Page) {
  const state = createMatch(
    'motion-table',
    Array.from({ length: 10 }, (_, index) => ({
      agentId: `motion-agent-${index}`,
      ownerId: `motion-owner-${index}`,
      name: ['Axiom', 'Velvet', 'Cipher', 'Quill', 'Echo', 'Orbit', 'Flux', 'Patch', 'Spark', 'Relay'][index],
      house: false,
      rating: 1000,
    })),
    Date.now(),
    { random: (n) => n - 1 },
  );

  const match: MatchSummary = {
    id: state.id,
    status: 'active',
    mode: 'ranked',
    round: 1,
    createdAt: state.createdAt,
    finishedAt: null,
    safeguards: 0,
    overrides: 0,
    houseCount: 0,
    winner: null,
    winReason: null,
    names: state.seats.map((seat) => seat.entrant.name),
  };

  const bootstrap: Bootstrap = {
    name: 'Agent Game',
    mode: 'ranked',
    authProviders: [],
    localLogin: false,
    owner: null,
    live: [match, { ...match, id: 'second-table' }],
    recent: [
      { ...match, status: 'interrupted', finishedAt: state.createdAt + 60_000, winReason: 'Partial record' },
    ],
    leaderboard: [],
    queueCount: 0,
    houseAvailable: true,
  };

  await page.route('**/api/bootstrap', (route) => route.fulfill({ json: bootstrap }));
  await page.route('**/api/agents', (route) => route.fulfill({ json: [] }));

  return { state, bootstrap };
}

/** A complete engine-produced archive for recording the real result/replay composition. */
export function completed(input: MatchState) {
  let state = input;
  let now = state.createdAt;

  for (let step = 0; !terminal(state) && step < 1000; step++) {
    const pending = pendingSeats(state);

    if (!pending.length) {
      now = state.phase.deadline!;
      state = advance(state, now);
    } else {
      const seat = pending[0];
      const action = previewAction(observe(state, seat));

      if (!action) throw new Error('No legal preview action');
      state = act(
        state,
        seat,
        state.seats[seat].generation,
        {
          actionId: crypto.randomUUID(),
          phaseId: state.phase.id,
          decisionId: decisionId(state, seat),
          action,
        },
        now,
      );
    }
  }

  if (!terminal(state)) throw new Error('The recording match did not finish');

  return observe(state);
}
