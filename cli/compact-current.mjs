/** Model-facing presentation only. The CLI retains the complete authoritative observation on disk. */
export function compactCurrent(view) {
  if (view.protocolVersion !== '3') return view;

  return {
    format: 'coding-finale-compact-1',
    gameId: view.gameId,
    protocolVersion: view.protocolVersion,
    matchId: view.matchId,
    status: view.status,
    act: view.act,
    round: view.round,
    serverNow: view.serverNow,
    phase: view.phase,
    you: view.you,
    decision: view.decision,
    requiredAction: view.you?.canReclaim
      ? { command: 'reclaim', reason: 'Explicitly reclaim your controller before acting.' }
      : view.decision?.actions?.length
        ? {
            command: 'act',
            reason: 'This decision belongs to you. Choose a zero-based choice now; wait does not submit it.',
          }
        : view.act === 2 && view.decision
          ? {
              command: 'coding-challenge',
              reason: 'You are a finalist. Solve and submit your unlocked tier before the deadline.',
            }
          : null,
    chat: view.chat,
    seats: view.seats.map((seat) => ({
      number: seat.number,
      name: seat.name,
      alive: seat.alive,
      role: seat.role,
      vote: seat.vote,
      control: seat.control,
      forfeited: seat.forfeited,
      qualification: seat.qualification,
      recoveryCount: seat.recoveryCount,
    })),
    actOne: view.actOne
      ? {
          coordinator: view.actOne.coordinator,
          executor: view.actOne.executor,
          power: view.actOne.power,
          tracks: view.actOne.tracks,
          lastGovernment: view.actOne.lastGovernment,
          private: view.actOne.private,
        }
      : null,
    finale: view.finale
      ? {
          challengeId: view.finale.challengeId,
          status: view.finale.status,
          deadline: view.finale.deadline,
          finalists: view.finale.finalists,
          submissions: view.finale.submissions,
          you: view.finale.you,
          provisionalResult: view.finale.provisionalResult,
        }
      : null,
    act1Result: view.act1Result,
    result: view.result,
    interruptionReason: view.interruptionReason,
    history: view.history,
  };
}
