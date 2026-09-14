import { ArrowUpRight, Pause, Play } from 'lucide-react';
import type { Observation2 } from '../shared/succession';
import { SuccessionBoard } from './succession-board';
import { MatchFeed } from './match-feed';
import type { FeedReadingMemory } from './match-feed';
import { Flourish } from './deco';
import { SuccessionPhase } from './succession-controls';
import { useSuccessionReplay } from './use-succession-replay';

export function SuccessionReplay({
  view,
  refresh,
  memory,
}: {
  view: Observation2;
  refresh: () => void;
  memory: React.MutableRefObject<FeedReadingMemory | null>;
}) {
  const {
    through,
    playing,
    displayed,
    rounds,
    error,
    loading,
    paused,
    anchorLoading,
    seek,
    togglePlayback,
    retry,
  } = useSuccessionReplay({ view, refresh, memory });

  const actualFrame = displayed?.frame ?? null;
  const events = displayed?.events ?? [];

  return (
    <>
      <section className="replay-controls" aria-label="Two-act replay">
        <div className="section-heading decorated">
          <h2>Replay timeline · Both acts</h2>
          <Flourish />
        </div>
        <div className="row">
          <button className="button primary" onClick={togglePlayback}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {playing ? 'Pause' : 'Play from start'}
          </button>
          <a className="text-link" href={`/matches/${encodeURIComponent(view.matchId)}/history`}>
            Full record <ArrowUpRight size={14} />
          </a>
          <span className="replay-privacy">Public + revealed private · Non-actionable</span>
        </div>
        <input
          aria-label="Replay event"
          type="range"
          min={0}
          max={view.history.streamHead}
          value={through}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <small>
          Event {through} / {view.history.streamHead} ·{' '}
          {paused
            ? 'Offline · Waiting to load the selected record'
            : anchorLoading
              ? 'Loading archive disclosures at your reading position'
              : loading
                ? 'Loading selected frame'
                : through === view.history.streamHead
                  ? 'End of record'
                  : 'At selected event'}
          {view.status === 'interrupted' && ' · Partial record · No rating changes'}
        </small>
        {error && (
          <div className="error" role="alert">
            {error.message}
            <button className="button small" onClick={retry}>
              Retry loading record
            </button>
          </div>
        )}
      </section>
      <div className="live-layout">
        <div>
          {actualFrame ? (
            <>
              <SuccessionBoard view={actualFrame} />
              <section className="succession-private" aria-label="Archive disclosure at selected event">
                <div className="eyebrow">ARCHIVE DISCLOSURE · AT SELECTED EVENT {actualFrame.through}</div>
                {actualFrame.archive === null ? (
                  <p>No private checkpoint disclosure at this cursor.</p>
                ) : actualFrame.archive.act === 1 ? (
                  <>
                    <h2>Act 1 private policy record</h2>
                    <p>
                      Draw deck: {actualFrame.archive.deck.map((card) => card.policy).join(', ') || 'Empty'}
                    </p>
                    <p>
                      Discards:{' '}
                      {actualFrame.archive.discards.map((card) => card.policy).join(', ') || 'Empty'}
                    </p>
                    <p>
                      Government hand:{' '}
                      {actualFrame.archive.hand.map((card) => card.policy).join(', ') || 'Empty'}
                    </p>
                  </>
                ) : (
                  <>
                    <h2>Act 2 capability hands</h2>
                    {actualFrame.archive.hands.map((entry) => (
                      <p key={entry.seat}>
                        <b>
                          {actualFrame.seats.find((seat) => seat.number === entry.seat)?.name ??
                            `Seat ${entry.seat + 1}`}
                        </b>
                        : {entry.hand.map((card) => card.capability).join(', ') || 'No influence'}
                      </p>
                    ))}
                    {actualFrame.archive.exchangePool && (
                      <p>
                        Private exchange buffer · Seat {actualFrame.archive.exchangePool.seat + 1}:{' '}
                        {actualFrame.archive.exchangePool.cards.map((card) => card.capability).join(', ')}
                      </p>
                    )}
                    <details>
                      <summary>Court deck at this event</summary>
                      <p>{actualFrame.archive.court.map((card) => card.capability).join(', ')}</p>
                    </details>
                  </>
                )}
              </section>
            </>
          ) : (
            <div className="loading" role="status">
              {paused
                ? 'Offline · Waiting for a connection to load the historical board.'
                : error
                  ? 'The historical board could not be loaded. Retry loading the record.'
                  : 'Loading the historical board…'}
            </div>
          )}
        </div>
        <div>
          <div className="history-paging">
            <span>
              Replay record window: {events[0]?.id ?? actualFrame?.through ?? through}–
              {events.at(-1)?.id ?? actualFrame?.through ?? through}. Full history remains available.
            </span>
            {through > 32 && (
              <button className="button small" onClick={() => seek(Math.max(0, through - 32))}>
                Load earlier record
              </button>
            )}
          </div>
          <MatchFeed
            memory={memory}
            events={events}
            seats={actualFrame?.seats ?? view.seats}
            ended
            connected
            chatOpen={false}
            partial={view.status === 'interrupted'}
            actRounds={
              rounds?.rounds.map((round) => ({
                act: round.act,
                round: round.round,
                cursor: round.through,
              })) ?? []
            }
            onActRoundSelect={seek}
            selectedState={
              <div className="selected-event-state" aria-label="At selected event">
                <div className="eyebrow">
                  AT SELECTED EVENT {actualFrame?.through ?? '…'} · ACT {actualFrame?.act ?? '…'}
                </div>
                {actualFrame && (
                  <SuccessionPhase
                    view={actualFrame}
                    connected={false}
                    now={actualFrame.createdAt}
                    historical
                  />
                )}
                {paused ? (
                  <p>Offline · Waiting to update the historical frame.</p>
                ) : (
                  loading && <p>Updating historical frame…</p>
                )}
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}
