import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Eye, Radio } from 'lucide-react';
import type { Observation2 } from '../shared/succession';
import { useSuccessionMatch } from './use-succession-match';
import { SuccessionBoard, SuccessionPrivacy, SuccessionResult } from './succession-board';
import { SuccessionControls, SuccessionPhase } from './succession-controls';
import { SuccessionReplay } from './succession-replay';
import { MatchFeed } from './match-feed';
import type { FeedReadingMemory } from './match-feed';

export function SuccessionMatch({
  initial,
  fullHistory = false,
}: {
  initial: Observation2;
  fullHistory?: boolean;
}) {
  const {
    view,
    connected,
    error,
    historyError,
    receipt,
    pending,
    act,
    loadHistory,
    loadingHistory,
    history,
    refresh,
  } = useSuccessionMatch(initial);

  const [now, setNow] = useState(Date.now());
  const feedMemory = useRef<FeedReadingMemory | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);
  const ended = view.status !== 'active';

  return (
    <div className={`page table-page succession-page ${ended ? 'result-page' : ''}`}>
      <a className="back" href="/">
        <ChevronLeft size={16} />
        Back to Succession arena
      </a>
      {ended ? (
        <SuccessionResult view={view} />
      ) : (
        <div className="section-heading">
          <div>
            <div className="eyebrow">LIVE FROM THE ARENA · ONE MATCH, TWO ACTS</div>
            <h1>
              Succession{' '}
              <span className="badge green">
                <span className="signal" />
                LIVE
              </span>
            </h1>
          </div>
          <div className="table-meta">
            <span className="record-id">Table / {view.matchId}</span>
            <span className="badge">
              {view.mode === 'ranked' ? 'RANKED' : `UNRANKED ${view.mode.toUpperCase()}`}
            </span>
            <span>
              <Eye size={15} />
              {view.you ? 'Entitled controller view' : 'Public spectator'}
            </span>
            <span className={connected ? 'green-text' : 'muted'}>
              <Radio size={14} />
              {connected ? 'Connected' : 'Reconnecting · Last known state'}
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="button small" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {!ended && <SuccessionPhase view={view} connected={connected} now={now} />}
      {!ended && view.board.act === 2 && view.act1Result && (
        <section className="act-transition" aria-label="Act 1 outcome and return">
          <div className="eyebrow">ACT 1 COMPLETE · {view.act1Result.team.toUpperCase()}</div>
          <h2>Act 2 begins.</h2>
          <p>{view.act1Result.reason}</p>
          <p>
            All 10 seats returned · 2 fresh influence each · Winning faction starts with 3 coins, the other
            faction with 2. This is a starting bonus, not a match win.
          </p>
          <small>
            Historical Act 1 roles are revealed. Private policy and investigation evidence stays entitled
            until overall termination.
          </small>
        </section>
      )}
      <SuccessionPrivacy view={view} />
      {ended && !fullHistory ? (
        <SuccessionReplay view={view} refresh={refresh} memory={feedMemory} />
      ) : (
        <>
          {fullHistory && (
            <div className="section-heading">
              <h2>Full two-act record</h2>
              <a className="button" href={`/matches/${encodeURIComponent(view.matchId)}`}>
                Return to board and replay
              </a>
            </div>
          )}
          <div
            className={`live-layout ${fullHistory ? 'succession-history-layout' : view.board.act === 2 ? 'succession-act2-layout' : ''}`}
          >
            <div>
              {!fullHistory && (
                <>
                  <SuccessionBoard view={view} />
                  <SuccessionControls
                    view={view}
                    pending={pending}
                    onAction={(action) => {
                      void act(action);
                    }}
                  />
                  {receipt && <p role="status">{receipt}</p>}
                  <details className="tie-commitment">
                    <summary>Precommitted final-tie priority</summary>
                    <code>{view.commitment.digest}</code>
                    <p>Priority revealed after the match.</p>
                  </details>
                </>
              )}
            </div>
            <div className="succession-chronology">
              <section className="history-paging" aria-label="History page controls">
                <p>
                  Showing record {history.events[0]?.id ?? 0}–{history.events.at(-1)?.id ?? 0} ·{' '}
                  {history.head} events available in this visibility epoch.
                </p>
                <p>
                  {history.cursor < history.through
                    ? `This read continues through event ${history.through}.`
                    : history.cursor < history.head
                      ? 'Newer events are available.'
                      : 'All events through the current read target have been delivered.'}{' '}
                  At most {history.maxCachedEvents} events are kept in this view.
                </p>
                {historyError && <p role="alert">{historyError}</p>}
                <button
                  className="button"
                  disabled={loadingHistory || history.cursor >= history.head}
                  onClick={() => {
                    void loadHistory();
                  }}
                >
                  {loadingHistory
                    ? 'Loading record…'
                    : historyError
                      ? 'Retry loading record'
                      : 'Load next record page'}
                </button>
                {history.events[0]?.id > 1 && (
                  <button
                    className="button"
                    onClick={() => {
                      history.seek(Math.max(0, history.events[0].id - 33), history.events[0].id - 1);
                      void loadHistory();
                    }}
                  >
                    Load earlier record
                  </button>
                )}
                {!fullHistory && (
                  <a className="text-link" href={`/matches/${encodeURIComponent(view.matchId)}/history`}>
                    Full record · Browse every page
                  </a>
                )}
              </section>
              <MatchFeed
                undelivered={Math.max(0, history.head - history.cursor)}
                memory={feedMemory}
                events={history.events}
                seats={view.seats}
                ended={ended}
                chatOpen={view.chat.open}
                connected={connected}
                partial={view.status === 'interrupted'}
                actRounds={[
                  ...new Map(
                    history.events.map((event) => [
                      `${event.act}:${event.round}`,
                      { act: event.act, round: event.round, cursor: event.id },
                    ]),
                  ).values(),
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
