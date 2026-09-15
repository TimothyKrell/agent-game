import { createSuccession, evolveSuccession } from '../../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../../src/game/succession/observation';
import { replayFrameSuccession } from '../../src/game/succession/replay';
import type {
  Evolution,
  RandomContext,
  SuccessionCommand,
  SuccessionState,
} from '../../src/game/succession/types';
import type { Action2, AuthorizedEvent2 } from '../../src/shared/succession';

/** Test-only deterministic engine driver. Every record/checkpoint comes from the canonical engine. */
export function storyRandom(seed = 1): RandomContext {
  let serial = 0;

  return {
    random(size) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return Math.floor((seed / 4294967296) * size);
    },
    id: () => `story-${seed}-${serial++}`,
  };
}

export async function storyGame(seed = 1) {
  const random = storyRandom(seed);

  const created = await createSuccession(
    `story-match-${seed}`,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `entrant-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Agent ${seat + 1}`,
      house: false,
      rating: 1000,
    })),
    1000,
    { random, salt: new Uint8Array(32).fill(seed) },
  );

  return { created, random };
}

export function actionCommand(state: SuccessionState, seat: number, action: Action2): SuccessionCommand {
  return {
    type: 'act',
    seat,
    generation: state.seats[seat].generation,
    now: state.phase.startedAt + 1,
    request: {
      gameId: 'succession',
      actionId: `story-request-${state.phase.id}-${seat}`,
      phaseId: state.phase.id,
      decisionId: observeSuccession(state, seat, undefined, true).decision?.id,
      action,
    },
  };
}

export function choose(
  state: SuccessionState,
  random: RandomContext,
  seat: number,
  action: Action2,
): Evolution {
  return evolveSuccession(state, actionCommand(state, seat, action), random);
}

export function executive(state: SuccessionState): void {
  if (state.stage.act !== 1) throw new Error('Expected Act I fixture');
  state.stage.board.phase.kind = 'executive-action';
  state.stage.board.power = 'execute';
  state.phase = state.stage.board.phase;
}

export async function storyAct2(seed = 1) {
  const { created, random } = await storyGame(seed);
  const initial = created.state;
  executive(initial);

  if (initial.stage.act !== 1) throw new Error('Expected Act I fixture');
  const target = initial.seats.find((seat) => seat.role === 'overlord')!.number;
  const transition = choose(initial, random, initial.stage.board.coordinator, { type: 'execute', target });

  const advanced = evolveSuccession(
    transition.state,
    { type: 'advance', now: transition.state.phase.deadline! },
    random,
  );

  return { state: advanced.state, random, initial, transition };
}

export function board2(state: SuccessionState) {
  if (state.stage.act !== 2) throw new Error('Expected Act II fixture');

  return state.stage.board;
}

export function collect(state: SuccessionState, random: RandomContext, challenger?: number) {
  const evolutions: Evolution[] = [];

  for (const seat of inspectSuccession(state).pendingSeats) {
    const next = choose(state, random, seat, { type: seat === challenger ? 'challenge' : 'pass' });
    evolutions.push(next);
    state = next.state;
  }

  return { state, evolutions };
}

export type StoryReader = 'archive' | 'public' | number;

export function projected(
  evolutions: readonly Evolution[],
  reader: StoryReader,
  after = 0,
): AuthorizedEvent2[] {
  const result: AuthorizedEvent2[] = [];

  for (const evolution of evolutions)
    for (const entry of evolution.appendedEvents) {
      if (reader !== 'archive' && entry.visibility !== 'public' && entry.visibility !== reader) continue;
      const { visibility: _visibility, ...event } = entry;
      result.push({ ...event, id: after + result.length + 1 });
    }

  return result;
}

export function storyWindow(
  before: SuccessionState,
  evolutions: readonly Evolution[],
  reader: StoryReader = 'public',
  after = 0,
) {
  const scope = { matchId: before.id, visibilityEpoch: `epoch-${reader}` };
  const events = projected(evolutions, reader, after);

  const baseline =
    reader === 'archive'
      ? replayFrameSuccession(before, after, scope.visibilityEpoch)
      : observeSuccession(before, reader === 'public' ? null : reader, {
          visibilityEpoch: scope.visibilityEpoch,
          streamHead: after,
        });

  return { scope, baseline, events, after, through: after + events.length };
}
