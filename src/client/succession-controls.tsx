import { LockKeyhole } from 'lucide-react';
import type { Action2, Observation2 } from '../shared/succession';
import { successionPhaseLabel } from './succession-display';

export function SuccessionControls({
  view,
  pending,
  onAction,
}: {
  view: Observation2;
  pending: boolean;
  onAction: (action: Action2) => void;
}) {
  if (view.status !== 'active' || !view.you || !view.private) return null;
  const privateState = view.private;

  const cards =
    privateState.act === 2
      ? privateState.exchangePool.length
        ? privateState.exchangePool
        : privateState.hand
      : privateState.hand;

  return (
    <section className="succession-private" aria-label="Your private controller state">
      <div className="eyebrow">
        <LockKeyhole size={15} /> PRIVATE · SEAT {view.you.seat + 1}
      </div>
      <h2>{privateState.act === 2 ? 'Your capability cards' : 'Your Act 1 knowledge'}</h2>
      {privateState.act === 1 && (
        <p>
          Role: {privateState.role} · Known rogues:{' '}
          {privateState.knownRogues.map((seat) => seat + 1).join(', ') || 'None disclosed'}
          {privateState.knownOverlord !== null && ` · Known Overlord: Seat ${privateState.knownOverlord + 1}`}
        </p>
      )}
      <div className="capability-hand">
        {cards.map((card) => (
          <div className="capability-card" key={card.id}>
            {'capability' in card ? card.capability : card.policy}
          </div>
        ))}
      </div>
      {privateState.act === 2 && privateState.reaction && (
        <p role="status">
          Your sealed response is locked: {privateState.reaction}. Other responses remain private until
          resolution.
        </p>
      )}
      {view.decision && (
        <>
          <h3>Your legal choices</h3>
          <div className="legal-actions">
            {view.decision.actions.map((choice) => (
              <button
                className="button"
                key={JSON.stringify(choice.action)}
                disabled={pending}
                onClick={() => onAction(choice.action)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}
      {!view.decision && <p>No decision is currently required from this controller.</p>}
    </section>
  );
}

export function SuccessionPhase({
  view,
  connected,
  now,
  historical = false,
}: {
  view: Pick<Observation2, 'board' | 'phase' | 'seats' | 'chat'>;
  connected: boolean;
  now: number;
  historical?: boolean;
}) {
  const board = view.board;
  const deadline = view.phase.graceUntil ?? view.phase.deadline;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

  const seatName = (number: number) =>
    view.seats.find((seat) => seat.number === number)?.name ?? `Seat ${number + 1}`;

  return (
    <section
      className={`phase-banner succession-phase ${view.phase.graceUntil ? 'phase-grace' : ''}`}
      aria-label={historical ? 'Historical match state' : 'Current match state'}
      data-phase={view.phase.kind}
    >
      <div>
        <div className="eyebrow">
          ACT {board.act} ·{' '}
          {historical ? 'AT SELECTED EVENT' : connected ? 'CURRENT PHASE' : 'LAST RECEIVED STATE'}
        </div>
        <h2>{successionPhaseLabel(view)}</h2>
        {view.phase.graceUntil !== null && (
          <span className="grace-status">Grace period · Awaiting required decisions</span>
        )}
        <p>
          {board.act === 1
            ? `Coordinator: ${seatName(board.coordinator)}${board.executor === null ? '' : ` → ${seatName(board.executor)}`}`
            : `Active seat: ${seatName(board.activeSeat)} · Table round ${board.tableRound} / ${board.roundCap}`}
        </p>
        {board.act === 1 && board.power && <p>Executive power: {board.power.replaceAll('-', ' ')}</p>}
        {board.act === 2 && board.pending && (
          <div className="pending-action">
            <b>
              {seatName(board.pending.actor)} · {board.pending.action}
            </b>
            {board.pending.target !== null && <span>Target: {seatName(board.pending.target)}</span>}
            {board.pending.claim && <span>Claims {board.pending.claim}</span>}
            <span>Paid {board.pending.paid} coins</span>
            {board.pending.block && (
              <span>
                {seatName(board.pending.block.seat)} blocks as {board.pending.block.capability}
              </span>
            )}
          </div>
        )}
        {board.act === 2 && view.phase.kind === 'act-2:challenge' && (
          <p>Challenges sealed · Choices reveal together at resolution.</p>
        )}
        {!historical && (
          <p className="chat-context">
            {view.chat.open ? 'Discussion is open · Living agents have the floor.' : 'Discussion is closed.'}
          </p>
        )}
      </div>
      {!historical && remaining !== null && (
        <span
          className="countdown"
          aria-label={connected ? `${remaining} seconds remaining` : 'Timer stale while reconnecting'}
        >
          {connected ? remaining : '—'}
          <small>
            {!connected
              ? 'LAST KNOWN'
              : remaining === 0
                ? 'AWAITING TRANSITION'
                : view.phase.graceUntil
                  ? 'GRACE SEC'
                  : 'SECONDS'}
          </small>
        </span>
      )}
      {!historical && remaining === null && (
        <span className="phase-waiting">
          {connected ? 'Awaiting update' : 'Reconnecting · Last known state'}
        </span>
      )}
    </section>
  );
}
