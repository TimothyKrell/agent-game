import { observe } from '../observation';
import { pendingSeats, nextDeadline } from '../engine';
import type { RuntimeInspection } from '../contracts';
import type { Observation2, HistoryMetadata2, InfluenceCard, PendingAction2 } from '../../shared/succession';
import { legalAct2, pendingAct2 } from './act2';
import type { CapabilityCard } from './act2';
import type { SuccessionState } from './types';

const cardView = ({ id, capability }: CapabilityCard): InfluenceCard => ({ id, capability });

/** Host supplies only recipient-entitled history metadata; this projection never reads history. */
export function observeSuccession(
  state: SuccessionState,
  seatNumber: number | null = null,
  history: HistoryMetadata2 = { visibilityEpoch: '', streamHead: 0 },
  houseController = false,
): Observation2 {
  const seat = seatNumber === null ? null : (state.seats[seatNumber] ?? null);
  const permitted = seat && (!seat.forfeited || houseController) ? seat : null;
  const ended = state.status !== 'active';

  const base: Observation2 = {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: state.id,
    rulesVersion: 'succession-1',
    mode: state.snapshot.mode,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    status: state.status,
    act: state.stage.act,
    round: state.stage.board.round,
    phase: {
      id: state.phase.id,
      kind: state.phase.kind,
      deadline: state.phase.deadline,
      graceUntil:
        state.phase.graceAnnounced && state.phase.deadline !== null
          ? state.phase.deadline + state.snapshot.timing.grace
          : null,
    },
    seats: state.seats.map((entry) => {
      const visible: Observation2['seats'][number] = {
        number: entry.number,
        agentId: entry.entrant.agentId,
        ownerId: entry.entrant.ownerId,
        name: entry.entrant.name,
        house: entry.houseProfile !== null,
        originalHouse: entry.entrant.house,
        alive: entry.alive,
        forfeited: entry.forfeited,
        rating: entry.entrant.rating,
        generation: entry.generation,
      };

      if (state.stage.act === 2 || ended) visible.role = entry.role;

      return visible;
    }),
    board: {
      act: 1,
      coordinator: 0,
      executor: null,
      power: null,
      tracks: {
        safeguards: 0,
        overrides: 0,
        electionTracker: 0,
        drawCount: 0,
        discardCount: 0,
        vetoUnlocked: false,
      },
      lastGovernment: null,
    },
    act1Result: state.act1Result,
    chat: {
      open: false,
      maxCharacters: 1000,
      cooldownMs: state.snapshot.timing.chatCooldown,
      nextSpeakAt:
        permitted?.lastChatAt == null ? null : permitted.lastChatAt + state.snapshot.timing.chatCooldown,
    },
    you: seat
      ? {
          seat: seat.number,
          agentId: seat.entrant.agentId,
          alive: seat.alive,
          forfeited: seat.forfeited,
          generation: seat.generation,
        }
      : null,
    private: null,
    decision: null,
    result: state.result,
    interruptionReason: state.interruptionReason,
    commitment: {
      digest: state.commitment.digest,
      reveal: ended
        ? { saltBase64url: state.commitment.saltBase64url, priority: state.commitment.priority }
        : null,
    },
    history: { ...history },
  };

  if (state.stage.act === 1) {
    // Only the active child can be projected here. Its terminal victory is intercepted atomically.
    const child = observe(
      { ...state.stage.board, seats: state.seats, events: [] },
      seatNumber,
      0,
      houseController,
    );

    base.board = {
      act: 1,
      coordinator: child.coordinator,
      executor: child.executor,
      power: child.power,
      tracks: child.tracks,
      lastGovernment: child.lastGovernment,
    };

    for (const [index, entry] of base.seats.entries()) {
      const vote = child.seats[index].vote;

      if (vote !== undefined) entry.vote = vote;
    }

    base.chat = { ...child.chat, open: child.chat.open && (!seat || seat.alive) };
    base.private = child.private ? { act: 1, ...child.private } : null;
    base.decision = ended ? null : child.decision;

    if (base.decision)
      base.decision.actions = base.decision.actions.map(({ action, label }) => ({
        action,
        label: 'target' in action ? `${action.type} seat ${action.target + 1}` : label,
      }));

    return base;
  }

  const board = state.stage.board;
  const pending = board.pending;
  const target = pending && 'target' in pending.action ? pending.action.target : null;

  const publicPending: PendingAction2 | null = pending
    ? {
        actor: pending.actor,
        action: pending.action.type,
        target,
        claim: pending.claim,
        paid: pending.payment,
        block: pending.block && target !== null ? { seat: target, capability: pending.block } : null,
      }
    : null;

  base.board = {
    act: 2,
    firstSeat: board.firstSeat,
    activeSeat: board.activeSeat,
    tableRound: board.round,
    slot: board.slot,
    roundCap: 12,
    courtCount: board.court.length,
    pending: publicPending,
  };
  base.seats = base.seats.map((entry) => ({
    ...entry,
    coins: board.resources[entry.number].coins,
    influence: board.resources[entry.number].hand.length,
    revealed: board.resources[entry.number].revealed.map((card) => card.capability),
  }));
  base.chat.open = !ended && board.phase !== 'exchange' && (!seat || seat.alive);

  if (permitted) {
    const hand = board.resources[permitted.number].hand;
    base.private = {
      act: 2,
      hand: hand.map(cardView),
      exchangePool:
        pending?.actor === permitted.number && pending.exchange
          ? [...hand, ...pending.exchange].map(cardView)
          : [],
      reaction: pending?.challenge?.responses[permitted.number] ?? null,
    };
    const actions = ended ? [] : legalAct2(board, permitted.number);

    if (actions.length) {
      const replacement = state.phase.replacements[String(permitted.number)];
      const deadline = replacement ?? state.phase.deadline ?? 0;
      base.decision = {
        id: `${state.phase.id}:${permitted.number}:${permitted.generation}`,
        deadline,
        graceUntil: replacement ?? deadline + state.snapshot.timing.grace,
        actions: actions.map((action) => ({
          action,
          label:
            'target' in action
              ? `${action.type} seat ${action.target + 1}`
              : action.type === 'block'
                ? `Block with ${action.capability}`
                : action.type === 'lose-influence'
                  ? `Reveal ${hand.find((card) => card.id === action.cardId)?.capability ?? 'influence'}`
                  : action.type === 'return-influence'
                    ? `Return selected pair`
                    : action.type,
        })),
      };
    }
  }

  return base;
}

export function inspectSuccession(state: SuccessionState): RuntimeInspection {
  const active = state.status === 'active';

  const pending = active
    ? state.stage.act === 1
      ? pendingSeats({ ...state.stage.board, seats: state.seats, events: [] })
      : pendingAct2(state.stage.board)
    : [];

  let deadline: number | null = null;

  if (active && state.stage.act === 1)
    deadline = nextDeadline({ ...state.stage.board, seats: state.seats, events: [] });
  else if (active && state.phase.deadline !== null)
    deadline =
      state.phase.graceAnnounced && pending.length
        ? Math.min(
            ...pending.map(
              (seat) =>
                state.phase.replacements[String(seat)] ?? state.phase.deadline! + state.snapshot.timing.grace,
            ),
          )
        : state.phase.deadline;

  const discussion =
    active &&
    (state.stage.act === 1
      ? ['nomination-discussion', 'government-discussion', 'executive-discussion'].includes(state.phase.kind)
      : state.stage.board.phase === 'discussion');

  return {
    status: state.status,
    phaseId: state.phase.id,
    phase: state.phase,
    timing: state.snapshot.timing,
    lastChat: state.lastChat,
    nextDeadline: deadline,
    pendingSeats: pending,
    participants: state.seats,
    discussion: discussion
      ? {
          seats: state.seats.filter((seat) => seat.alive).map((seat) => seat.number),
          anchor: state.stage.act === 1 ? state.stage.board.coordinator : state.stage.board.activeSeat,
          key: state.phase.id,
        }
      : null,
  };
}
