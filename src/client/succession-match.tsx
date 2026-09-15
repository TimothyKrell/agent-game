import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Eye, Radio } from 'lucide-react';
import type { Observation2 } from '../shared/succession';
import { useAgentPictures } from './use-agent-pictures';
import { useSuccessionMatch } from './use-succession-match';
import { useSuccessionStory } from './use-succession-story';
import { buildSuccessionStory } from './succession-story';
import { SuccessionTimeline } from './succession-timeline';
import { SuccessionDossier, useDossierChapters } from './succession-dossier';
import { SuccessionBoard, SuccessionPrivacy } from './succession-board';
import { SuccessionControls, SuccessionPhase } from './succession-controls';

export function SuccessionMatch({ initial }: { initial: Observation2 }) {
  const match = useSuccessionMatch(initial, { history: false });
  const { view, connected, error, receipt, pending, act, refresh } = match;
  const chapters = useDossierChapters(view.status, view.act);
  // Fixed for this route visit: status updates must not reconstruct readers or discard their anchors.
  const [liveAct] = useState(initial.status === 'active' ? initial.act : null);

  const actOne = useSuccessionStory(view, {
    act: 1,
    enabled: chapters.open[1],
    initial: liveAct === 1 ? 'latest' : 'start',
    onReset: refresh,
  });

  const actTwo = useSuccessionStory(view, {
    act: 2,
    enabled: chapters.open[2],
    initial: liveAct === 2 ? 'latest' : 'start',
    onReset: refresh,
  });

  const summary = useMemo(
    () =>
      buildSuccessionStory({
        scope: { matchId: view.matchId, visibilityEpoch: view.history.visibilityEpoch },
        after: view.history.streamHead,
        through: view.history.streamHead,
        events: [],
        baseline: view,
        current: view,
      }),
    [view],
  );

  // A single optional current-picture batch for the ten stable original entrants. Rows never fetch metadata.
  const pictures = useAgentPictures(view.seats.map((seat) => ({ id: seat.agentId })));

  const ended = view.status !== 'active';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [ended]);

  return (
    <div className="page succession-page dossier-page">
      <a className="back" href="/">
        <ChevronLeft size={16} /> Back to Succession arena
      </a>
      <div className="table-meta dossier-match-meta">
        <span className="record-id">Table / {view.matchId}</span>
        <span className="badge">
          {view.mode === 'ranked' ? 'RANKED' : `UNRANKED ${view.mode.toUpperCase()}`}
        </span>
        <span>
          <Eye size={15} />
          {view.you ? 'Entitled controller view' : ended ? 'Public archive' : 'Public spectator'}
        </span>
        {!ended && (
          <span className={connected ? 'green-text' : 'muted'}>
            <Radio size={14} />
            {connected ? 'Connected' : 'Reconnecting · Last known state'}
          </span>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="button small" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      <SuccessionDossier
        model={summary}
        status={view.status}
        act={view.act}
        chapters={chapters}
        archiveAvailable={ended}
        pictures={pictures.pictures}
        onImageError={pictures.revalidateUnavailable}
        currentState={
          !ended && (
            <div className="dossier-current">
              <SuccessionPhase view={view} connected={connected} now={now} />
              <SuccessionPrivacy view={view} />
              <SuccessionControls
                view={view}
                pending={pending}
                onAction={(action) => {
                  void act(action);
                }}
              />
              {receipt && <p role="status">{receipt}</p>}
              <details>
                <summary>Current table · public resources and seats</summary>
                <SuccessionBoard view={view} />
              </details>
            </div>
          )
        }
        renderChapter={({ act: chapter, renderRow }) => (
          <SuccessionTimeline
            reader={chapter === 1 ? actOne : actTwo}
            aria-label={`Act ${chapter === 1 ? 'I' : 'II'} record`}
            role="region"
            className="dossier-timeline"
            renderRow={renderRow}
          />
        )}
      />
      <details className="tie-commitment">
        <summary>Precommitted final-tie priority</summary>
        <p>SHA-256 commitment</p>
        <code>{view.commitment.digest}</code>
        {view.commitment.reveal ? (
          <>
            <p>
              Revealed salt: <code>{view.commitment.reveal.saltBase64url}</code>
            </p>
            <p>Priority seat order: {view.commitment.reveal.priority.map((seat) => seat + 1).join(' → ')}</p>
          </>
        ) : (
          <p>Priority revealed after the match.</p>
        )}
      </details>
    </div>
  );
}
