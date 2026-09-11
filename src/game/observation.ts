import { Match } from 'effect';
import { decisionId, legalActions } from './engine';
import { chatOpen, terminal } from './types';
import type { MatchState, Observation, PublicSeat } from './types';

/** This is the sole projection used by external agents, house runners, and spectators. */
export function observe(
  state: MatchState,
  seatNumber: number | null = null,
  after = 0,
  houseController = false,
): Observation {
  const ended = terminal(state);
  const seat = seatNumber === null ? null : (state.seats[seatNumber] ?? null);
  const permittedSeat = seat && (!seat.forfeited || houseController) ? seat : null;

  const takeoverEvent = seat?.forfeited
    ? (state.events.find((event) => event.type === 'takeover' && event.seat === seat.number)?.id ?? 0)
    : Infinity;

  const visible = state.events.filter(
    (event) =>
      event.visibility === 'public' ||
      ended ||
      (seat !== null && event.visibility === seat.number && (houseController || event.id < takeoverEvent)),
  );

  const reset = ended || after > visible.length;
  const options = permittedSeat ? legalActions(state, permittedSeat.number) : [];

  const replacementDeadline = permittedSeat
    ? state.phase.replacements[String(permittedSeat.number)]
    : undefined;

  const deadline = replacementDeadline ?? state.phase.deadline ?? 0;
  const graceUntil = replacementDeadline ?? deadline + state.timing.grace;

  const observation: Observation = {
    protocolVersion: '1',
    matchId: state.id,
    rulesVersion: state.rulesVersion,
    mode: state.mode,
    createdAt: state.createdAt,
    finishedAt: state.finishedAt,
    status: Match.value(state.phase.kind).pipe(
      Match.when('finished', () => 'finished' as const),
      Match.when('interrupted', () => 'interrupted' as const),
      Match.orElse(() => 'active' as const),
    ),
    phase: {
      id: state.phase.id,
      kind: state.phase.kind,
      deadline: state.phase.deadline,
      graceUntil:
        state.phase.graceAnnounced && state.phase.deadline !== null
          ? state.phase.deadline + state.timing.grace
          : null,
    },
    round: state.round,
    coordinator: state.coordinator,
    executor: state.executor,
    power: state.power,
    seats: state.seats.map((entry) => {
      const publicSeat: PublicSeat = {
        number: entry.number,
        agentId: entry.entrant.agentId,
        ownerId: entry.entrant.ownerId,
        name: entry.entrant.name,
        house: entry.houseProfile !== null,
        originalHouse: entry.entrant.house,
        alive: entry.alive,
        forfeited: entry.forfeited,
        rating: entry.entrant.rating,
      };

      const vote = state.lastVotes?.[String(entry.number)];

      if (ended) publicSeat.role = entry.role;

      if (vote !== undefined) publicSeat.vote = vote;

      return publicSeat;
    }),
    tracks: {
      safeguards: state.safeguards,
      overrides: state.overrides,
      electionTracker: state.electionTracker,
      drawCount: state.deck.length,
      discardCount: state.discards.length,
      vetoUnlocked: state.overrides >= 5,
    },
    lastGovernment: state.lastGovernment,
    winner: state.winner,
    winReason: state.winReason,
    chat: {
      open: chatOpen(state),
      maxCharacters: 1000,
      cooldownMs: state.timing.chatCooldown,
      nextSpeakAt:
        permittedSeat?.lastChatAt === null || !permittedSeat
          ? null
          : permittedSeat.lastChatAt + state.timing.chatCooldown,
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
    private: permittedSeat
      ? {
          role: permittedSeat.role,
          knownRogues:
            permittedSeat.role === 'rogue'
              ? state.seats.filter((entry) => entry.role === 'rogue').map((entry) => entry.number)
              : [],
          knownOverlord:
            permittedSeat.role === 'rogue'
              ? state.seats.find((entry) => entry.role === 'overlord')!.number
              : null,
          hand: options.some((option) => ['discard', 'enact', 'veto'].includes(option.action.type))
            ? structuredClone(state.hand)
            : [],
        }
      : null,
    decision:
      options.length && permittedSeat
        ? { id: decisionId(state, permittedSeat.number), deadline, graceUntil, actions: options }
        : null,
    cursor: visible.length,
    reset,
    // Re-number the authorized stream so private event counts never leak through gaps.
    events: visible
      .map(({ visibility: _visibility, ...event }, index) => ({ ...event, id: index + 1 }))
      .slice(reset ? 0 : Math.max(0, after)),
  };

  if (ended)
    observation.reveal = {
      deck: structuredClone(state.deck),
      discards: structuredClone(state.discards),
      hand: structuredClone(state.hand),
    };

  return observation;
}
