import { createSuccession, evolveSuccession } from '../../src/game/succession/engine';
import { observeSuccession } from '../../src/game/succession/observation';
import { replayFrameSuccession } from '../../src/game/succession/replay';
import type { HistoryPage2 } from '../../src/shared/succession';

/** Real engine boards with a synthetic long authorized chat stream for transport/lifecycle tests. */
export async function successionClientFixture() {
  let serial = 0;
  const random = { id: () => `client-${serial++}`, random: (size: number) => size - 1 };

  const created = await createSuccession(
    'query-fixture',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Client agent ${seat}`,
      house: false,
      rating: 1000,
    })),
    1000,
    { random, salt: new Uint8Array(32).fill(1) },
  );

  let state = created.state;
  let controller = observeSuccession(state, 0, { visibilityEpoch: 'seat', streamHead: 0 });

  for (let turn = 0; !controller.decision && turn < 10; turn++) {
    state = evolveSuccession(
      state,
      { type: 'advance', now: state.phase.deadline ?? state.phase.startedAt + 30_000 },
      random,
    ).state;
    controller =
      state.seats
        .map((seat) => observeSuccession(state, seat.number, { visibilityEpoch: 'seat', streamHead: 0 }))
        .find((view) => view.decision) ?? controller;
  }

  if (!controller.decision || !controller.you) throw new Error('Missing fixture decision');

  const ended = evolveSuccession(
    state,
    { type: 'interrupt', now: state.phase.startedAt + 1, reason: 'Transport fixture archive' },
    random,
  ).state;

  const terminal = observeSuccession(ended, null, { visibilityEpoch: 'archive', streamHead: 512 });

  return {
    controller,
    terminal,
    frame: (through: number, epoch = 'archive') => replayFrameSuccession(created.state, through, epoch),
    page: (after: number, through: number, epoch = 'archive', limit = 32): HistoryPage2 => {
      const cursor = Math.min(through, after + limit);

      return {
        protocolVersion: '2',
        gameId: 'succession',
        matchId: terminal.matchId,
        visibilityEpoch: epoch,
        streamHead: 512,
        after,
        through,
        cursor,
        hasMore: cursor < through,
        reset: false,
        events: Array.from({ length: cursor - after }, (_, index) => ({
          id: after + index + 1,
          eventKey: `event-${after + index + 1}`,
          at: 1000,
          act: 1,
          round: 1,
          type: 'chat',
          text: `Record ${after + index + 1}`,
        })),
      };
    },
    reset: (epoch = 'replacement'): HistoryPage2 => ({
      protocolVersion: '2',
      gameId: 'succession',
      matchId: terminal.matchId,
      visibilityEpoch: epoch,
      streamHead: 512,
      after: 0,
      through: 512,
      cursor: 0,
      events: [],
      hasMore: true,
      reset: true,
    }),
  };
}
