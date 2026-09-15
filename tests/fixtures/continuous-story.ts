import { evolveSuccession } from '../../src/game/succession/engine';
import { observeSuccession } from '../../src/game/succession/observation';
import type { Evolution } from '../../src/game/succession/types';
import { board2, choose, collect, projected, storyAct2 } from './succession-story';

/** Real engine dialogue with a Tax resolution between two long chat-only checkpoint gaps. */
export async function continuousStoryFixture(count = 2048) {
  const { state: initial, random } = await storyAct2(5);
  const evolutions: Evolution[] = [];
  let state = initial;
  let now = state.phase.startedAt + 1;

  for (let index = 0; index < count; index++) {
    if (index === Math.floor(count / 2)) {
      const declared = choose(state, random, board2(state).activeSeat, { type: 'tax' });
      const responses = collect(declared.state, random);
      evolutions.push(declared, ...responses.evolutions);
      state = responses.state;
    }

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
          actionId: `reading-chat-${index}`,
          phaseId: state.phase.id,
          action: {
            type: 'chat',
            text: `Record ${index + 1}. “Exact dialogue”\n${'A longer canonical message. '.repeat(index % 13)}`,
          },
        },
      },
      random,
    );

    evolutions.push(evolution);
    state = evolution.state;
  }

  const events = projected(evolutions, 'public');
  const frames = evolutions.flatMap((evolution) => evolution.replayFrames);

  const checkpoint = (through: number, matchId = initial.id, epoch = 'continuous-public') => {
    const keys = new Set(events.slice(0, through).map((event) => event.eventKey));
    const frame = frames.findLast((candidate) => keys.has(candidate.eventKey));

    const baseline = observeSuccession(frame?.state ?? initial, null, {
      visibilityEpoch: epoch,
      streamHead: through,
    });

    baseline.matchId = matchId;
    baseline.decision = null;
    baseline.chat = { ...baseline.chat, open: false, nextSpeakAt: null };

    return {
      protocolVersion: '2' as const,
      gameId: 'succession' as const,
      matchId,
      visibilityEpoch: epoch,
      through,
      baseline,
    };
  };

  const current = (through = events.length, matchId = initial.id, epoch = 'continuous-public') => {
    const view = observeSuccession(state, null, { visibilityEpoch: epoch, streamHead: through });
    view.matchId = matchId;

    return view;
  };

  return { initial, events, checkpoint, current };
}
