import { useEffect, useMemo, useState } from 'react';
import type { Observation, Role } from '../game/types';
import type { Action3, Observation3 } from '../shared/coding-finale';
import type { AuthorizedEvent2, Observation2 } from '../shared/succession';
import type { HistoryCheckpoint3, RoundIndex3 } from '../shared/coding-finale-history';
import { buildSuccessionStory } from './succession-story';
import { SuccessionBoard, SuccessionPrivacy } from './succession-board';
import { SuccessionControls, SuccessionPhase } from './succession-controls';
import { SuccessionDossier } from './succession-dossier';
import { useAgentPictures } from './use-agent-pictures';

interface CodingHistoryView {
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
  const actOneRounds = history.rounds.filter((round) => round.act === 1);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (view.act !== 1 || view.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [view.act, view.status]);

  return (
    <section className="cf-act-one-dossier" aria-label="Act I Secret Overlord table and record">
      <header className="cf-history-toolbar">
        <div>
          <small>AUTHORIZED CANONICAL RECORD</small>
          <strong>
            Events {history.after + (history.events.length ? 1 : 0)}–{history.through} of {history.head}
          </strong>
        </div>
        <label>
          Election round
          <select
            value=""
            disabled={history.loading || !actOneRounds.length}
            onChange={(event) => {
              const through = Number(event.target.value);

              if (Number.isSafeInteger(through)) void history.loadRound(through);
            }}
          >
            <option value="">Jump to…</option>
            {actOneRounds.map((round) => (
              <option value={round.through} key={round.key}>
                Round {round.round}
              </option>
            ))}
          </select>
        </label>
        <div className="cf-history-actions">
          <button
            className="button small"
            disabled={history.loading || history.after === 0}
            onClick={() => void history.loadEarlier()}
          >
            Earlier
          </button>
          <button
            className="button small"
            disabled={history.loading || history.through >= history.head}
            onClick={() => void history.loadLater()}
          >
            Later
          </button>
          <button
            className="button small"
            disabled={history.loading || history.following}
            onClick={() => void history.loadLatest()}
          >
            Latest
          </button>
        </div>
      </header>
      {history.loading && (
        <p className="cf-history-state" role="status">
          Loading the authorized record…
        </p>
      )}
      {history.error && (
        <p className="cf-history-state error" role="alert">
          {history.error}
        </p>
      )}
      {!history.loading && !history.error && history.events.length === 0 && (
        <p className="cf-history-state">No authorized events exist in this window yet.</p>
      )}
      {current ? (
        <SuccessionDossier
          game="coding-finale"
          model={model}
          status={current.status}
          act={1}
          archiveAvailable={view.status !== 'active'}
          pictures={pictures.pictures}
          onImageError={pictures.revalidateUnavailable}
          currentState={
            view.act === 1 && view.status === 'active' ? (
              <div className="dossier-current">
                <SuccessionPhase view={current} connected={connected} now={now} />
                <SuccessionPrivacy view={current} />
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
                <details open>
                  <summary>Current table · public resources and seats</summary>
                  <SuccessionBoard
                    view={current}
                    pictures={pictures.pictures}
                    onPictureError={pictures.revalidateUnavailable}
                  />
                </details>
              </div>
            ) : undefined
          }
        />
      ) : (
        <p className="cf-history-state error">The authoritative Act I observation is unavailable.</p>
      )}
    </section>
  );
}
