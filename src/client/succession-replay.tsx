import { useEffect, useRef, useState } from 'react';
import { Schema } from 'effect';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import { HistoryPage2Schema, ReplayFrame2Schema } from '../shared/succession';
import type { AuthorizedEvent2, Observation2, ReplayFrame2 } from '../shared/succession';
import { RoundIndex2Schema } from '../shared/history';
import { api } from './api';
import { historyPath, SuccessionHistory } from './succession-stream';
import { SuccessionBoard } from './succession-board';
import { MatchFeed } from './match-feed';
import { Flourish } from './deco';

const FrameResponse = Schema.Union([ReplayFrame2Schema, HistoryPage2Schema]);

const RoundsResponse = Schema.Union([RoundIndex2Schema, HistoryPage2Schema]);

export function SuccessionReplay({ view, refresh }: { view: Observation2; refresh: () => void }) {
  const [through, setThrough] = useState(view.history.streamHead);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState<ReplayFrame2 | null>(null);
  const [events, setEvents] = useState<AuthorizedEvent2[]>([]);
  const [rounds, setRounds] = useState<typeof RoundIndex2Schema.Type | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const requests = useRef(0);
  const reader = useRef(new SuccessionHistory());
  const epoch = view.history.visibilityEpoch;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ epoch });
    void api(`/api/matches/${encodeURIComponent(view.matchId)}/rounds?${query}`, RoundsResponse)
      .then((result) => {
        if (!active) return;

        if ('reset' in result) {
          refresh();

          return;
        }

        if (result.matchId === view.matchId && result.visibilityEpoch === epoch) setRounds(result);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });

    return () => {
      active = false;
    };
  }, [view.matchId, epoch, retry]);

  useEffect(() => {
    const request = ++requests.current;
    setLoading(true);
    setError('');

    const timer = setTimeout(() => {
      const query = new URLSearchParams({ epoch, through: String(through) });
      const history = reader.current;
      history.observe(view.history);
      history.seek(Math.max(0, through - 32), through);
      const walk = through > 0 ? { epoch, after: Math.max(0, through - 32), through } : null;
      void Promise.all([
        api(`/api/matches/${encodeURIComponent(view.matchId)}/replay?${query}`, FrameResponse),
        walk ? api(historyPath(view.matchId, walk), HistoryPage2Schema) : Promise.resolve(null),
      ])
        .then(([result, page]) => {
          if (request !== requests.current) return;

          if ('reset' in result || page?.reset) {
            refresh();

            return;
          }

          if (
            result.matchId !== view.matchId ||
            result.visibilityEpoch !== epoch ||
            result.through !== through
          )
            throw new Error('The replay frame changed while loading.');
          setFrame(result);

          if (page && walk) {
            if (!history.accept(page, walk))
              throw new Error('The replay history page changed while loading.');
            setEvents([...history.events]);
          } else setEvents([]);
        })
        .catch((cause: Error) => {
          if (request === requests.current) {
            setError(cause.message);
            setPlaying(false);
          }
        })
        .finally(() => {
          if (request === requests.current) setLoading(false);
        });
    }, 80);

    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [view.matchId, epoch, through, retry]);

  useEffect(() => {
    if (!playing || loading || !frame || frame.through !== through) return;

    if (through >= view.history.streamHead) {
      setPlaying(false);

      return;
    }

    const timer = setTimeout(() => setThrough((value) => Math.min(view.history.streamHead, value + 1)), 700);

    return () => clearTimeout(timer);
  }, [playing, loading, frame, through, view.history.streamHead]);

  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };

    document.addEventListener('visibilitychange', pause);

    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const seek = (value: number) => {
    setPlaying(false);
    setThrough(value);
  };

  const actualFrame = frame?.visibilityEpoch === epoch ? frame : null;

  return (
    <>
      <section className="replay-controls" aria-label="Two-act replay">
        <div className="section-heading decorated">
          <h2>Replay timeline · Both acts</h2>
          <Flourish />
        </div>
        <div className="row">
          <button
            className="button primary"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setThrough(0);
                setPlaying(true);
              }
            }}
          >
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
          {loading
            ? 'Loading selected frame'
            : through === view.history.streamHead
              ? 'End of record'
              : 'At selected event'}
          {view.status === 'interrupted' && ' · Partial record · No rating changes'}
        </small>
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="button small" onClick={() => setRetry((value) => value + 1)}>
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
              Loading the historical board…
            </div>
          )}
        </div>
        <div>
          <div className="history-paging">
            <span>
              Replay record window: {events[0]?.id ?? through}–{events.at(-1)?.id ?? through}. Full history
              remains available.
            </span>
            {through > 32 && (
              <button className="button small" onClick={() => seek(Math.max(0, through - 32))}>
                Load earlier record
              </button>
            )}
          </div>
          <MatchFeed
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
                <p>
                  {actualFrame?.phase.kind.replaceAll('-', ' ') ?? 'Loading'}
                  {loading && ' · Updating frame'}
                </p>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}
