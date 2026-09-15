import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Eye, Radio } from 'lucide-react';
import type { Observation2 } from '../shared/succession';
import { useAgentPictures } from './use-agent-pictures';
import { useSuccessionMatch } from './use-succession-match';
import { useSuccessionStory } from './use-succession-story';
import { buildSuccessionStory } from './succession-story';
import { SuccessionTimeline } from './succession-timeline';
import type { SuccessionTimelineHandle } from './succession-timeline';
import { SuccessionDossier, useDossierChapters } from './succession-dossier';
import { SuccessionBoard, SuccessionPrivacy } from './succession-board';
import { SuccessionControls, SuccessionPhase } from './succession-controls';
import { dossierEnding } from './dossier-ending';
import { dossierRowId } from './dossier-row';
import { dossierNavigationEvents, dossierNavigationIntent } from './dossier-navigation-intent';

export function SuccessionMatch({ initial }: { initial: Observation2 }) {
  const match = useSuccessionMatch(initial, { history: false });
  const { view, connected, error, receipt, pending, act, refresh } = match;
  const chapters = useDossierChapters(view.status, view.act);
  // Fixed for this route visit: status updates must not reconstruct readers or discard their anchors.
  const [entryAct] = useState(initial.status === 'finished' ? 2 : initial.act);

  const actOne = useSuccessionStory(view, {
    act: 1,
    enabled: chapters.open[1],
    initial: entryAct === 1 ? 'latest' : 'start',
    onReset: refresh,
  });

  const actTwo = useSuccessionStory(view, {
    act: 2,
    enabled: chapters.open[2],
    initial: entryAct === 2 ? 'latest' : 'start',
    onReset: refresh,
  });

  const terminal = useMemo(() => dossierEnding(actTwo.rows), [actTwo.rows]);
  const [savedEnding, setSavedEnding] = useState(terminal);
  const [requestedEnding, setRequestedEnding] = useState<ReturnType<typeof dossierEnding>>(null);
  const endingIntent = useRef<ReturnType<typeof dossierNavigationIntent> | null>(null);
  const readingOwner = useRef<1 | 2 | 'other' | null>(null);
  const oneTimeline = useRef<SuccessionTimelineHandle>(null);
  const twoTimeline = useRef<SuccessionTimelineHandle>(null);

  useEffect(() => {
    const claim = (event: Event) => {
      const target = event.target;
      const section = target instanceof Element ? target.closest('[data-dossier-act]') : null;

      if (document.querySelector('[role="dialog"]')) {
        readingOwner.current = 'other';

        return;
      }

      const control =
        target instanceof Element &&
        target.closest(
          'a[href],button,input,textarea,select,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"]',
        );

      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches('textarea,select,input:not([type=checkbox]):not([type=radio])'));

      const documentKey =
        event instanceof KeyboardEvent &&
        !editing &&
        (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
          (event.key === ' ' && !control));

      // Native document gestures can target any noninteractive wrapper or gutter.
      // Consult the actual visible reading surface; layout-induced scroll is not input.
      if (
        (documentKey && !(target instanceof Element && target.closest('[data-story-window]'))) ||
        (!section && !control && ['wheel', 'touchmove'].includes(event.type))
      ) {
        readingOwner.current = oneTimeline.current?.ownsViewport()
          ? 1
          : twoTimeline.current?.ownsViewport()
            ? 2
            : null;
      } else
        readingOwner.current = section?.getAttribute('data-dossier-act') === '1' ? 1 : section ? 2 : 'other';
    };

    const events = new AbortController();

    for (const type of dossierNavigationEvents)
      document.addEventListener(type, claim, { capture: true, passive: true, signal: events.signal });

    return () => events.abort();
  }, []);
  const ending = terminal ?? savedEnding;

  const currentEnding =
    ending?.source.matchId === view.matchId && ending.source.visibilityEpoch === view.history.visibilityEpoch
      ? ending
      : null;

  useEffect(() => {
    if (terminal) setSavedEnding(terminal);
  }, [terminal]);

  useEffect(
    () => () => {
      endingIntent.current?.cancel();
      endingIntent.current = null;
    },
    [view.matchId, view.history.visibilityEpoch, view.status],
  );

  useEffect(() => {
    if (view.status !== 'active' || view.act !== 1) actOne.detach();

    if (view.status !== 'active' || view.act !== 2) actTwo.detach();
  }, [view.status, view.act, actOne.detach, actTwo.detach]);

  useEffect(() => {
    if (
      !requestedEnding ||
      requestedEnding.source.matchId !== view.matchId ||
      requestedEnding.source.visibilityEpoch !== view.history.visibilityEpoch
    )
      return;
    const reader = requestedEnding.act === 1 ? actOne : actTwo;

    if (!chapters.open[requestedEnding.act] || reader.status !== 'ready') return;
    const row = reader.rows.find((row) => row.source.eventKey === requestedEnding.source.eventKey);
    const element = row && document.getElementById(dossierRowId(row));

    if (!element) return;
    const allowed = endingIntent.current?.complete();
    endingIntent.current = null;
    setRequestedEnding(null);

    if (!allowed) return;
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
    element.focus({ preventScroll: true });
  }, [requestedEnding, actOne, actTwo, chapters.open, view.matchId, view.history.visibilityEpoch]);

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
        ending={
          view.status === 'finished'
            ? {
                label: currentEnding?.label ?? 'Terminal record',
                onRead: currentEnding
                  ? () => {
                      endingIntent.current?.cancel();
                      const reader = currentEnding.act === 1 ? actOne : actTwo;

                      const intent = dossierNavigationIntent(document, () => {
                        setRequestedEnding(null);
                      });

                      endingIntent.current = intent;
                      readingOwner.current = currentEnding.act;
                      chapters.setOpen(currentEnding.act, true);
                      setRequestedEnding(currentEnding);
                      void reader.seek(currentEnding.source.eventKey, intent.signal);
                    }
                  : undefined,
              }
            : undefined
        }
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
                <SuccessionBoard
                  view={view}
                  pictures={pictures.pictures}
                  onPictureError={pictures.revalidateUnavailable}
                />
              </details>
            </div>
          )
        }
        renderChapter={({ act: chapter, renderRow }) => {
          const reader = chapter === 1 ? actOne : actTwo;
          const live = view.status === 'active' && view.act === chapter;

          // Modal references own the viewport. A canceled seek may settle while one
          // is open; boundary observers must not start a new read behind it.
          const read = (load: () => Promise<void>) => () =>
            document.querySelector('[role="dialog"]') ||
            (readingOwner.current !== null && readingOwner.current !== chapter)
              ? Promise.resolve()
              : load();

          return (
            <SuccessionTimeline
              ref={chapter === 1 ? oneTimeline : twoTimeline}
              reader={{
                ...reader,
                following: live && reader.following,
                follow: read(live ? reader.follow : reader.loadLater),
                loadEarlier: read(reader.loadEarlier),
                loadLater: read(reader.loadLater),
              }}
              aria-label={`Act ${chapter === 1 ? 'I' : 'II'} record`}
              role="region"
              className="dossier-timeline"
              renderRow={renderRow}
            />
          );
        }}
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
