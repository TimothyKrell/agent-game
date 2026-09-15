/** Test-only backend: seeded Act I power, then canonical engine transitions and exact checkpoints. */
import { evolveSuccession } from '../../../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../../../src/game/succession/observation';
import { replayFrameSuccession } from '../../../src/game/succession/replay';
import type { Evolution, SuccessionState } from '../../../src/game/succession/types';
import type { AuthorizedEvent2 } from '../../../src/shared/succession';
import { board2, choose, executive, projected, storyGame } from '../../fixtures/succession-story';

type Mode = 'finished' | 'active' | 'controller' | 'act1' | 'interrupted';

export async function routeFixture() {
  const { created, random } = await storyGame(14);
  executive(created.state);
  const initial = structuredClone(created.state);

  if (initial.stage.act !== 1) throw new Error('Expected Act I');
  const target = initial.seats.find((seat) => seat.role === 'overlord')!.number;
  const transition = choose(initial, random, initial.stage.board.coordinator, { type: 'execute', target });
  const evolutions: Evolution[] = [transition];

  const advance = (state: SuccessionState) =>
    evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, random);

  const advanced = advance(transition.state);
  evolutions.push(advanced);
  const live = structuredClone(advanced.state);
  let state = live;
  let now = state.phase.startedAt + 1;

  for (let index = 0; index < 512; index++) {
    now += state.snapshot.timing.chatCooldown + 1;
    const seat = index % 10;

    const evolution = evolveSuccession(
      state,
      {
        type: 'act',
        seat,
        generation: state.seats[seat].generation,
        now,
        request: {
          gameId: 'succession',
          actionId: `dossier-dialogue-${index}`,
          phaseId: state.phase.id,
          action: {
            type: 'chat',
            text: `Historical message ${index + 1}. “Exact dialogue”\n${'A canonical reading example. '.repeat(index % 5)}`,
          },
        },
      },
      random,
    );

    evolutions.push(evolution);
    state = evolution.state;
  }

  const liveEnd = structuredClone(state);
  const liveCount = evolutions.length;

  // Normal legal decisions through the round cap; no fabricated final result/resources.
  for (let step = 0; state.status === 'active' && step < 1000; step++) {
    const pending = inspectSuccession(state).pendingSeats;
    const seat = pending[0];
    const decision = seat === undefined ? null : observeSuccession(state, seat).decision;

    const choice =
      decision?.actions.find((choice) => choice.action.type === 'income') ??
      decision?.actions.find((choice) => choice.action.type === 'pass') ??
      decision?.actions[0];

    const evolution = choice ? choose(state, random, seat, choice.action) : advance(state);
    evolutions.push(evolution);
    state = evolution.state;
  }

  if (state.status !== 'finished') throw new Error('Fixture did not finish');
  const terminal = state;
  const frames = evolutions.flatMap((evolution) => evolution.replayFrames);
  const archive = projected(evolutions, 'archive');
  const publicEvents = projected(evolutions.slice(0, liveCount), 'public');
  const actor = board2(live).activeSeat;
  const privateEvents = projected(evolutions.slice(0, liveCount), actor);

  const interrupted = evolveSuccession(
    liveEnd,
    { type: 'interrupt', now: now + 1, reason: 'Fixture interruption' },
    random,
  );

  const interruptedEvents = projected([...evolutions.slice(0, liveCount), interrupted], 'archive');

  const interruptedFrames = [
    ...evolutions.slice(0, liveCount).flatMap((evolution) => evolution.replayFrames),
    ...interrupted.replayFrames,
  ];

  const states: Record<Mode, SuccessionState> = {
    finished: terminal,
    interrupted: interrupted.state,
    act1: initial,
    controller: liveEnd,
    active: liveEnd,
  };

  const records: Record<Mode, AuthorizedEvent2[]> = {
    finished: archive,
    interrupted: interruptedEvents,
    controller: privateEvents,
    act1: [],
    active: publicEvents,
  };

  function observation(mode: Mode, reader: number | null = mode === 'controller' ? actor : null) {
    const source = states[mode];
    const events = eventsFor(mode);

    const view = observeSuccession(source, reader, {
      visibilityEpoch: `route-${mode}`,
      streamHead: events.length,
    });

    return view;
  }

  function eventsFor(mode: Mode) {
    return records[mode];
  }

  return {
    matchId: initial.id,
    actor,
    observation,
    eventsFor,
    checkpoint(mode: Mode, through: number) {
      const events = eventsFor(mode);
      const keys = new Set(events.slice(0, through).map((event) => event.eventKey));

      const frame = (mode === 'interrupted' ? interruptedFrames : frames).findLast((frame) =>
        keys.has(frame.eventKey),
      );

      const state = frame?.state ?? initial;
      const epoch = `route-${mode}`;

      const baseline =
        mode === 'finished' || mode === 'interrupted'
          ? replayFrameSuccession(state, through, epoch)
          : observeSuccession(state, mode === 'controller' ? actor : null, {
              visibilityEpoch: epoch,
              streamHead: through,
            });

      if ('decision' in baseline) baseline.decision = null;
      baseline.chat = { ...baseline.chat, open: false, nextSpeakAt: null };

      return {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: initial.id,
        visibilityEpoch: epoch,
        through,
        baseline,
      };
    },
  };
}
