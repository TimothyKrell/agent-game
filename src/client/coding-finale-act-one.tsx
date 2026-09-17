import { useEffect, useMemo, useState } from 'react';
import { Clock3, ShieldCheck, Skull, Users, Vote } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import type { Observation, Role } from '../game/types';
import type { Action3, Observation3 } from '../shared/coding-finale';
import type { AuthorizedEvent2, Observation2 } from '../shared/succession';
import type { HistoryCheckpoint3, RoundIndex3 } from '../shared/coding-finale-history';
import { buildSuccessionStory } from './succession-story';
import { SuccessionBoard } from './succession-board';
import { SuccessionControls } from './succession-controls';
import { successionPhaseLabel } from './succession-display';
import { SuccessionDossier } from './succession-dossier';
import { useAgentPictures } from './use-agent-pictures';
import { AgentPortrait } from './agent-portrait';
import { CodingLiveRecord } from './coding-live-record';
import type { CodingRecordWindow } from './coding-live-record';

interface CodingHistoryView extends CodingRecordWindow {
  after: number;
  through: number;
  head: number;
  events: AuthorizedEvent2[];
  checkpoint: HistoryCheckpoint3 | null;
  actOneSnapshot: Observation3 | null;
  rounds: RoundIndex3['rounds'];
  loading: boolean;
  error: string;
  following: boolean;
  loadEarlier: () => Promise<void>;
  loadLater: () => Promise<void>;
  loadLatest: () => Promise<void>;
  loadRound: (through: number) => Promise<void>;
}

function roles(view: Observation): Role[] | null {
  const values = view.seats.map((seat) => seat.role);

  return values.every((role): role is Role => role !== undefined) ? values : null;
}

function actOneChoices(decision: NonNullable<Observation3['decision']>) {
  return decision.actions.flatMap((choice) =>
    choice.action.type === 'submit-program' ? [] : [{ action: choice.action, label: choice.label }],
  );
}

/** Protocol-3 owns authority; this adapter only lets the approved Act I presentation read its nested view. */
function actOneView(view: Observation3, snapshot: Observation | null = null): Observation2 | null {
  const actOne = view.actOne ?? snapshot;

  if (!actOne) return null;
  const revealedRoles = roles(actOne);
  const generations = new Map(view.seats.map((seat) => [seat.number, seat.generation]));

  const act1Result =
    view.act1Result && revealedRoles
      ? {
          ...view.act1Result,
          roles: revealedRoles,
          returnedSeats: [],
          bonuses: actOne.seats.map(() => 0 as const),
          finalTracks: actOne.tracks,
        }
      : null;

  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: view.matchId,
    rulesVersion: 'succession-1',
    mode: view.mode,
    createdAt: view.createdAt,
    finishedAt: view.act === 1 ? view.finishedAt : actOne.finishedAt,
    status: view.act === 1 ? view.status : 'finished',
    act: 1,
    round: actOne.round,
    phase: actOne.phase,
    seats: actOne.seats.map((seat) => ({ ...seat, generation: generations.get(seat.number) ?? 0 })),
    board: {
      act: 1,
      coordinator: actOne.coordinator,
      executor: actOne.executor,
      power: actOne.power,
      tracks: actOne.tracks,
      lastGovernment: actOne.lastGovernment,
    },
    act1Result,
    chat: actOne.chat,
    you: view.you,
    private: actOne.private ? { act: 1, ...actOne.private } : null,
    decision:
      view.act === 1 && view.decision
        ? {
            ...view.decision,
            actions: actOneChoices(view.decision),
          }
        : null,
    result: null,
    interruptionReason: view.interruptionReason,
    commitment: view.commitment,
    history: view.history,
  };
}

export function CodingFinaleActOne({
  view,
  history,
  connected,
  pending,
  onAction,
}: {
  view: Observation3;
  history: CodingHistoryView;
  connected: boolean;
  pending: boolean;
  onAction: (action: Action3) => void;
}) {
  const current = actOneView(view, history.actOneSnapshot?.actOne ?? null);
  const baseline = history.checkpoint?.baseline ? actOneView(history.checkpoint.baseline) : null;

  const model = useMemo(
    () =>
      buildSuccessionStory({
        scope: { matchId: view.matchId, visibilityEpoch: view.history.visibilityEpoch },
        after: history.after,
        through: history.through,
        events: history.events,
        baseline: baseline ?? undefined,
        current: history.through === history.head ? (current ?? undefined) : undefined,
      }),
    [
      baseline,
      current,
      history.after,
      history.events,
      history.head,
      history.through,
      view.history.visibilityEpoch,
      view.matchId,
    ],
  );

  const pictures = useAgentPictures(view.seats.map((seat) => ({ id: seat.agentId })));
  const [now, setNow] = useState(Date.now());
  const board = current?.board;
  const deadline = current?.phase.graceUntil ?? current?.phase.deadline;
  const remaining = deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

  const seatName = (number: number) =>
    view.seats.find((seat) => seat.number === number)?.name ?? `Seat ${number + 1}`;

  useEffect(() => {
    if (view.act !== 1 || view.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [view.act, view.status]);

  return (
    <section className="cf-act-one-dossier" aria-label="Act I Secret Overlord table and record">
      {current ? (
        <SuccessionDossier
          game="coding-finale"
          model={model}
          status={current.status}
          act={1}
          archiveAvailable={view.status !== 'active'}
          pictures={pictures.pictures}
          onImageError={pictures.revalidateUnavailable}
          renderChapter={({ renderRow }) => (
            <CodingLiveRecord
              key={view.history.visibilityEpoch}
              rows={model.rows.filter((row) => row.position.act === 1)}
              renderRow={(row) => (
                <>
                  {renderRow(row)}
                  {row.fact.kind === 'act-ended' &&
                    view.seats.some((seat) => seat.qualification === 'finalist') && (
                      <section className="cf-qualified-callout" aria-label="Qualified for Act II">
                        <h3>Through to Act II · Coding finale</h3>
                        <ul>
                          {view.seats
                            .filter((seat) => seat.qualification === 'finalist')
                            .map((seat) => (
                              <li key={seat.number}>
                                <AgentPortrait
                                  agentId={seat.agentId}
                                  name={seat.name}
                                  picture={pictures.pictures.get(seat.agentId)}
                                  size={48}
                                  onImageError={pictures.revalidateUnavailable}
                                />
                                <a href={`/agents/${encodeURIComponent(seat.agentId)}?gameId=coding-finale`}>
                                  {seat.name}
                                </a>
                              </li>
                            ))}
                        </ul>
                      </section>
                    )}
                </>
              )}
              history={history}
              live={view.act === 1 && view.status === 'active'}
            />
          )}
          currentState={
            view.act === 1 && view.status === 'active' ? (
              <div className="cf-current-state">
                {board?.act === 1 && (
                  <section
                    className="cf-status-bar"
                    aria-label="Current match state"
                    data-phase={current.phase.kind}
                  >
                    <div className="cf-status-phase">
                      <span className="cf-status-round">Round {current.round}</span>
                      <strong>{successionPhaseLabel(current)}</strong>
                      {board.power && (
                        <span className="cf-status-power">Power: {board.power.replaceAll('-', ' ')}</span>
                      )}
                      <span className="cf-status-government">
                        <span>Coordinator: {seatName(board.coordinator)}</span>
                        {board.executor !== null && <span> → Executor: {seatName(board.executor)}</span>}
                      </span>
                    </div>
                    <div className="cf-status-totals">
                      <span className="cf-status-safeguards">
                        <ShieldCheck size={16} aria-hidden="true" />
                        {board.tracks.safeguards}/5 Safeguards
                        <span className="cf-track-pips" aria-hidden="true">
                          {Array.from({ length: 5 }, (_, index) => (
                            <i key={index} data-filled={index < board.tracks.safeguards} />
                          ))}
                        </span>
                      </span>
                      <span className="cf-status-overrides">
                        <Skull size={16} aria-hidden="true" />
                        {board.tracks.overrides}/6 Overrides
                        <span className="cf-track-pips" aria-hidden="true">
                          {Array.from({ length: 6 }, (_, index) => (
                            <i key={index} data-filled={index < board.tracks.overrides} />
                          ))}
                        </span>
                      </span>
                      <span>
                        <Vote size={16} aria-hidden="true" />
                        {board.tracks.electionTracker}/3 Rejections
                      </span>
                      <span>
                        <Users size={16} aria-hidden="true" />
                        {view.seats.filter((seat) => seat.alive).length}/10 Alive
                      </span>
                      {view.seats.some((seat) => seat.recoverable) && (
                        <span>{view.seats.filter((seat) => seat.recoverable).length} house covering</span>
                      )}
                    </div>
                    <div className="cf-status-actions">
                      <span className="cf-status-clock">
                        <Clock3 size={16} aria-hidden="true" />
                        {!connected
                          ? 'Reconnecting'
                          : remaining === null || remaining === 0
                            ? 'Awaiting update'
                            : `${remaining}s${current.phase.graceUntil ? ' grace' : ''}`}
                      </span>
                      <Dialog>
                        <DialogTrigger className="cf-table-trigger">
                          <Users size={16} aria-hidden="true" />
                          Table & seats
                        </DialogTrigger>
                        <DialogContent className="cf-table-dialog" closeLabel="Close table and seats">
                          <DialogTitle>Act I · The table</DialogTitle>
                          <DialogDescription>
                            Round {current.round} · {view.seats.filter((seat) => seat.alive).length} agents
                            alive. Current offices, public votes, and controller status.
                          </DialogDescription>
                          <SuccessionBoard
                            game="coding-finale"
                            view={current}
                            pictures={pictures.pictures}
                            onPictureError={pictures.revalidateUnavailable}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </section>
                )}
                <SuccessionControls
                  view={current}
                  pending={pending}
                  onAction={(action) => {
                    switch (action.type) {
                      case 'income':
                      case 'tax':
                      case 'exchange':
                      case 'challenge':
                      case 'pass':
                      case 'steal':
                      case 'assassinate':
                      case 'coup':
                      case 'block':
                      case 'lose-influence':
                      case 'return-influence':
                        return;
                      default:
                        onAction(action);
                    }
                  }}
                />
              </div>
            ) : undefined
          }
        />
      ) : (
        <p className={`cf-history-state ${history.error ? 'error' : ''}`} role="status">
          {history.error ||
            (history.loading ? 'Loading the Act I timeline…' : 'The Act I timeline is unavailable.')}
        </p>
      )}
    </section>
  );
}
