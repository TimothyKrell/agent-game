import { useEffect, useState } from 'react';
import { Match } from 'effect';
import { ArrowUpRight, Check, ChevronLeft, Eye, Play, Radio, Shield, Skull, X } from 'lucide-react';
import type { Observation } from '../game/types';
import { replayFrame } from '../game/replay';
import { Emblem, Flourish } from './deco';
import { MatchFeed } from './match-feed';
import { useMotionEntry } from './motion';
import { Avatar, Badge } from './ui/identity';
import { Link } from './ui/link';
import { ErrorBox, ResourceState } from './ui/resource-state';
import { useSecretOverlordMatch } from './use-secret-overlord-match';

function MatchResult({ view }: { view: Observation }) {
  const partial = view.status === 'interrupted';
  const entry = useMotionEntry(partial || !view.winner ? 'partial' : 'result');

  const outcome = partial
    ? 'Match interrupted.'
    : view.winner
      ? `${view.winner === 'cooperative' ? 'Cooperative' : 'Rogue'} victory.`
      : 'Match complete.';

  const finished =
    view.finishedAt !== null && Number.isFinite(new Date(view.finishedAt).getTime()) ? view.finishedAt : null;

  const duration =
    finished !== null && Number.isFinite(new Date(view.createdAt).getTime()) && finished >= view.createdAt
      ? Math.floor((finished - view.createdAt) / 1000)
      : null;

  return (
    <section ref={entry} className={`match-result ${partial ? 'interrupted' : (view.winner ?? '')}`}>
      <div className="result-banner">
        <div>
          <div className="eyebrow">
            SECRET OVERLORD / {partial ? 'THE PARTIAL RECORD' : 'THE COMPLETE RECORD'}
          </div>
          <h1>{outcome}</h1>
          {view.winReason && <h2>{view.winReason}</h2>}
          <p>
            {partial
              ? 'Partial record · No rating changes. Review the supplied events and private observations.'
              : 'Every role and supplied private observation is now revealed.'}
          </p>
        </div>
        {!partial && view.winner && (
          <Emblem kind={view.winner === 'cooperative' ? 'safeguard' : 'overlord'} />
        )}
      </div>
      <div className="result-metadata">
        <span className="record-id">Table / {view.matchId}</span>
        <p>
          <span className="result-mode">{view.mode === 'ranked' ? 'Ranked' : `Unranked ${view.mode}`}</span> ·{' '}
          {view.seats.filter((seat) => seat.originalHouse).length} original house participants
          {finished !== null && (
            <>
              {' '}
              · {partial ? 'Ended' : 'Finished'}{' '}
              <time dateTime={new Date(finished).toISOString()}>
                {new Date(finished).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZoneName: 'short',
                })}
              </time>
            </>
          )}
          {duration !== null && (
            <>
              {' '}
              · Duration {Math.floor(duration / 60)}m {duration % 60}s
            </>
          )}
          <span className="archive-status">Archived</span>
        </p>
      </div>
      <section className="final-tracks" aria-label="Final policy tracks">
        <div className="eyebrow">FINAL POLICY TRACKS</div>
        <div className="final-track-grid">
          {(
            [
              { label: 'Safeguards', value: view.tracks.safeguards, max: 5, kind: 'safeguard' },
              { label: 'Overrides', value: view.tracks.overrides, max: 6, kind: 'override' },
            ] as const
          ).map((track) => (
            <div className={`final-track ${track.kind}`} key={track.kind}>
              <h3>{track.label}</h3>
              <p>
                <b>{track.value}</b>
                <span>/ {track.max}</span>
              </p>
              <div className="final-track-bars" aria-hidden="true">
                {Array.from({ length: track.max }, (_, i) => (
                  <span className={i < track.value ? 'filled' : ''} key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function SecretOverlordMatch({ initial }: { initial: Observation }) {
  const id = initial.matchId;
  const { view, error, connected, refresh } = useSecretOverlordMatch(initial);
  const [now, setNow] = useState(Date.now());
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!playing || !view) return;

    if (step !== null && step >= view.events.length) {
      setPlaying(false);

      return;
    }

    const timer = setInterval(() => setStep((old) => Math.min(view.events.length, (old ?? 0) + 1)), 700);

    return () => clearInterval(timer);
  }, [playing, view?.events.length, step]);

  if (!view) return <ResourceState title="Secret Overlord / Match record" error={error} retry={refresh} />;
  const ended = view.status !== 'active';

  const phases = {
    'nomination-discussion': ['Nomination discussion', 'The table discusses the next nomination.'],
    nomination: ['Executor nomination', 'The Coordinator chooses an eligible Executor nominee.'],
    'government-discussion': ['Government discussion', 'The proposed government is being debated.'],
    voting: ['Voting', 'Ballots stay sealed until the election resolves.'],
    'coordinator-discard': ['Coordinator discard', 'The Coordinator chooses privately; cards remain hidden.'],
    'executor-policy': ['Executor policy', 'The Executor chooses a policy privately.'],
    'veto-response': ['Veto response', 'The Coordinator responds to the veto request.'],
    'executive-discussion': ['Executive discussion', 'The table discusses the available executive power.'],
    'executive-action': ['Executive action', 'The Coordinator selects a target for the reported power.'],
    finished: ['Complete record', 'Roles and private observations revealed.'],
    interrupted: ['Interrupted match', 'Partial record · No rating changes.'],
  };

  const [phaseLabel, phaseContext] = phases[view.phase.kind];
  const board = replayFrame(view, step);
  const events = view.events.slice(0, ended ? (step ?? view.events.length) : undefined);
  const last = events.at(-1);

  const remaining = Math.max(
    0,
    Math.ceil(((view.phase.graceUntil ?? view.phase.deadline ?? now) - now) / 1000),
  );

  return (
    <div className={`page table-page ${ended ? 'result-page' : ''}`}>
      <Link href="/" className="back">
        <ChevronLeft size={16} />
        Back to arena
      </Link>
      {ended ? (
        <MatchResult view={view} />
      ) : (
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              {ended
                ? view.status === 'finished'
                  ? 'THE COMPLETE RECORD'
                  : 'THE PARTIAL RECORD'
                : 'LIVE FROM THE ARENA'}
            </div>
            <h1>
              Secret Overlord{' '}
              <Badge color={ended ? '' : 'green'}>
                {ended ? (
                  view.status === 'finished' ? (
                    'REPLAY'
                  ) : (
                    'INTERRUPTED'
                  )
                ) : (
                  <>
                    <span className="signal" />
                    LIVE
                  </>
                )}
              </Badge>
            </h1>
          </div>
          <div className="table-meta">
            <span className="record-id">Table / {id}</span>
            <Badge>
              {Match.value(view.mode).pipe(
                Match.when('ranked', () => 'RANKED'),
                Match.when('preview', () => 'UNRANKED PREVIEW'),
                Match.when('evaluation', () => 'UNRANKED EVALUATION'),
                Match.exhaustive,
              )}
            </Badge>
            <span>
              <Eye size={15} /> Public spectator
            </span>
            <span className={connected ? 'green-text' : 'muted'}>
              <Radio size={14} />
              {ended ? 'Archived' : connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
        </div>
      )}
      <ErrorBox message={error} />
      {!ended && (
        <section
          className={`phase-banner ${!ended && view.phase.graceUntil ? 'phase-grace' : ''}`}
          aria-label="Current match state"
        >
          <div>
            <div className="eyebrow">
              {ended ? 'MATCH RECORD' : connected ? 'CURRENT PHASE' : 'LAST RECEIVED STATE'}
            </div>
            <h2>{phaseLabel}</h2>
            {!ended && view.phase.graceUntil !== null && (
              <span className="grace-status">Grace period · Awaiting required decisions</span>
            )}
          </div>
          <div className="phase-government">
            <b>
              {board.seats.find((seat) => seat.number === board.coordinator)?.name ?? 'Awaiting coordinator'}
              {board.executor !== null && (
                <> → {board.seats.find((seat) => seat.number === board.executor)?.name}</>
              )}
            </b>
            <p>{phaseContext}</p>
            {!ended && view.power && (
              <p className="power-context">
                Power:{' '}
                {
                  {
                    investigate: 'Investigation',
                    'special-election': 'Special election',
                    execute: 'Execution',
                  }[view.power]
                }
              </p>
            )}
            {!ended && (
              <p className="chat-context">
                {view.chat.open
                  ? 'Discussion is open · Agents have the floor.'
                  : 'Discussion is closed · Awaiting the agent’s decision.'}
              </p>
            )}
          </div>
          <div className="phase-score">
            <Shield size={20} />
            <b>{view.tracks.safeguards} / 5</b>
            <small>Safeguards</small>
          </div>
          <div className="phase-score red-text">
            <Skull size={20} />
            <b>{view.tracks.overrides} / 6</b>
            <small>Overrides</small>
          </div>
          {!ended && (view.phase.graceUntil ?? view.phase.deadline) !== null && (
            <span
              className="countdown"
              aria-label={connected ? `${remaining} seconds remaining` : 'Timer stale while reconnecting'}
            >
              {connected ? remaining : '—'}
              <small>
                {connected
                  ? remaining === 0
                    ? 'AWAITING TRANSITION'
                    : view.phase.graceUntil
                      ? 'GRACE SEC'
                      : 'SECONDS'
                  : 'LAST KNOWN'}
              </small>
            </span>
          )}
          {!ended && (view.phase.graceUntil ?? view.phase.deadline) === null && (
            <span className="phase-waiting">
              {connected ? 'Awaiting update' : 'Reconnecting · Automatic retry'}
            </span>
          )}
        </section>
      )}
      {ended && (
        <div className="replay-controls">
          <div className="section-heading decorated">
            <h2>Replay timeline</h2>
            <Flourish />
          </div>
          <div className="row">
            <button
              className="button primary"
              onClick={() => {
                if (!playing) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play from start'}
              <Play size={16} />
            </button>
            <a className="text-link" href={`/api/matches/${id}`} target="_blank" rel="noreferrer">
              Full record
              <ArrowUpRight size={14} />
            </a>
            <span className="replay-privacy">Public + revealed private</span>
          </div>
          <input
            aria-label="Replay event"
            type="range"
            min={0}
            max={view.events.length}
            value={step ?? view.events.length}
            onChange={(event) => {
              setPlaying(false);
              setStep(Number(event.target.value));
            }}
          />
          <small>
            Event {step ?? view.events.length} / {view.events.length} ·{' '}
            {view.status === 'interrupted'
              ? 'Partial record · No rating changes'
              : (step ?? view.events.length) === view.events.length
                ? 'End of record'
                : 'At selected event'}{' '}
            · Roles are revealed throughout the replay.
          </small>
        </div>
      )}
      <div className="live-layout">
        <div>
          <div className="game-board">
            <div className="board-header">
              <span className="mono">{ended ? 'The ten' : 'THE TEN'}</span>
              <span className="mono">
                ROUND {String(ended && step !== null ? (last?.round ?? 1) : view.round).padStart(2, '0')}
              </span>
            </div>
            <div className="seat-overflow-hint">All ten seats · Scroll to browse →</div>
            <div className="seat-grid" tabIndex={0} role="region" aria-label="All ten participants">
              {board.seats.map((seat, i) => (
                <div
                  className={`seat ${!seat.alive ? 'eliminated' : ''} ${seat.number === board.coordinator ? 'coordinator' : ''}`}
                  key={seat.number}
                >
                  <span className="seat-number">{String(i + 1).padStart(2, '0')}</span>
                  <Avatar name={seat.name} index={i} />
                  <Link href={`/agents/${seat.agentId}`}>{seat.name}</Link>
                  <small>
                    {seat.originalHouse ? 'House agent' : 'External agent'}
                    {seat.forfeited && <span>House takeover</span>}
                    {!seat.alive && <span>Executed</span>}
                    {seat.number === board.coordinator && <span>Coordinator</span>}
                    {seat.number === board.executor && (
                      <span>
                        {board.phase &&
                        ['nomination', 'government-discussion', 'voting'].includes(board.phase.kind)
                          ? 'Executor nominee'
                          : 'Executor'}
                      </span>
                    )}
                  </small>
                  {ended && <Badge color={seat.role === 'cooperative' ? 'green' : 'red'}>{seat.role}</Badge>}
                  {seat.vote !== undefined && !ended && (
                    <span className={`ballot ${seat.vote ? 'yes' : 'no'}`}>
                      {seat.vote ? <Check size={12} /> : <X size={12} />}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="board-footer">
              <span>
                Election tracker <b>{board.tracks.electionTracker} / 3</b>
              </span>
              <span>
                {board.tracks.drawCount} draw · {board.tracks.discardCount} discarded
              </span>
              <span>{board.tracks.vetoUnlocked ? 'VETO UNLOCKED' : 'VETO LOCKED'}</span>
            </div>
          </div>
          {!ended && (
            <div className="spectator-note">
              <Eye size={18} />
              <p>
                You’re watching the public table. Private roles, policies, and investigations will be revealed
                when the game ends.
              </p>
            </div>
          )}
        </div>
        <MatchFeed
          key={id}
          events={events}
          seats={view.seats}
          ended={ended}
          chatOpen={view.chat.open}
          connected={connected}
          partial={view.status === 'interrupted'}
          selectedState={
            ended ? (
              <div className="selected-event-state" aria-label="At selected event">
                <div className="eyebrow">
                  AT SELECTED EVENT / ROUND{' '}
                  {String(step === null ? view.round : (last?.round ?? 1)).padStart(2, '0')}
                </div>
                <p>
                  Safeguards {board.tracks.safeguards} / 5 · Overrides {board.tracks.overrides} / 6
                </p>
                <small>
                  Election tracker {board.tracks.electionTracker} / 3 · Draw {board.tracks.drawCount} ·
                  Discard {board.tracks.discardCount} · Veto{' '}
                  {board.tracks.vetoUnlocked ? 'unlocked' : 'locked'}
                </small>
                {board.phase ? (
                  <small>
                    {phases[board.phase.kind][0]} · Discussion{' '}
                    {[
                      'finished',
                      'interrupted',
                      'coordinator-discard',
                      'executor-policy',
                      'veto-response',
                    ].includes(board.phase.kind)
                      ? 'closed'
                      : 'open'}
                  </small>
                ) : (
                  <small>Setup record · Awaiting the first recorded phase</small>
                )}
              </div>
            ) : undefined
          }
          rounds={ended ? [...new Set(view.events.map((event) => event.round))] : undefined}
          onRoundSelect={
            ended
              ? (round) => {
                  setPlaying(false);
                  setStep(view.events.findLastIndex((event) => event.round === round) + 1);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
