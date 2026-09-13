import type { ReplayFrame2 } from '../../shared/succession';
import { evolveSuccession } from './engine';
import { observeSuccession } from './observation';
import type { SuccessionState, ReplayFact, RandomContext } from './types';
import { verifyCommitment } from './commitment';

/** Validate the terminal archive anchor before the host serves any cursor-specific frames. */
export async function verifyReplayArchive(state: SuccessionState): Promise<void> {
  if (state.status === 'active')
    throw new Error('Replay archive is available only after overall termination.');

  if (!(await verifyCommitment(state.id, state.commitment)))
    throw new Error('Replay commitment verification failed.');
}

/** Independently verify up to 64 bounded mutations from a private checkpoint using realized randomness. */
export function replaySuccession(checkpoint: SuccessionState, facts: readonly ReplayFact[]): SuccessionState {
  if (facts.length > 64) throw new Error('Replay reconstruction requires a nearer checkpoint.');
  let state = structuredClone(checkpoint);

  for (const fact of facts) {
    if (fact.command.type === 'chat') {
      state.seats[fact.command.seat].lastChatAt = fact.command.now;
      state.lastChat = { seat: fact.command.seat, at: fact.command.now };
      continue;
    }

    let cursor = 0;

    const random: RandomContext = {
      random(size) {
        const value = fact.randomness[cursor++];

        if (value?.kind !== 'index' || value.size !== size) throw new Error('Replay random index diverged.');

        return value.value;
      },
      id() {
        const value = fact.randomness[cursor++];

        if (value?.kind !== 'id') throw new Error('Replay identity diverged.');

        return value.value;
      },
    };

    state = evolveSuccession(state, fact.command, random).state;

    if (cursor !== fact.randomness.length) throw new Error('Replay contains unused random outcomes.');
  }

  return state;
}

/** Host authorizes terminal archive access, then selects the exact event's private frame checkpoint. */
export function replayFrameSuccession(
  state: SuccessionState,
  through: number,
  visibilityEpoch: string,
): ReplayFrame2 {
  if (!Number.isSafeInteger(through) || through < 0) throw new Error('Invalid replay cursor.');

  const {
    decision: _decision,
    history: _history,
    ...current
  } = observeSuccession(state, null, { visibilityEpoch, streamHead: through });

  const archive: ReplayFrame2['archive'] =
    state.stage.act === 1
      ? {
          act: 1,
          deck: structuredClone(state.stage.board.deck),
          discards: structuredClone(state.stage.board.discards),
          hand: structuredClone(state.stage.board.hand),
        }
      : {
          act: 2,
          hands: state.stage.board.resources.map((resource, seat) => ({
            seat,
            hand: resource.hand.map(({ id, capability }) => ({ id, capability })),
          })),
          court: state.stage.board.court.map(({ id, capability }) => ({ id, capability })),
          exchangePool: state.stage.board.pending?.exchange
            ? {
                seat: state.stage.board.pending.actor,
                cards: state.stage.board.pending.exchange.map(({ id, capability }) => ({ id, capability })),
              }
            : null,
        };

  // Historical frames are nonactionable; terminal disclosure is supplied separately by the host.
  return {
    ...current,
    chat: { ...current.chat, open: false, nextSpeakAt: null },
    through,
    visibilityEpoch,
    archive,
  };
}
