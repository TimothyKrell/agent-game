import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronLeft,
  Clock3,
  Code2,
  Eye,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Send,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import type {
  CodingFinaleView,
  FinaleChallenge,
  FinaleIdentity,
  FinaleProgress,
  FinaleReceipt,
} from './coding-finale-view';
import { formatFinaleClock, remainingMilliseconds } from './coding-finale-view';
import { AgentPortrait } from './agent-portrait';
import './coding-finale.css';

const phaseLabels = {
  preparing: 'Preparing secure runners',
  racing: 'Coding race live',
  judging: 'Finishing accepted submissions',
  finished: 'Match complete',
  interrupted: 'Match interrupted',
} as const;

const reasonCopy = {
  'tier-two': 'Earliest server-received passing Tier 2 submission',
  'tier-one': 'Tier 1 fallback · earliest server-received pass',
  priority: 'Committed finalist priority fallback',
} as const;

const verdictCopy = {
  passed: 'Passed',
  'wrong-answer': 'Wrong answer',
  'runtime-error': 'Runtime error',
  'time-limit': 'Time limit',
  'output-limit': 'Output limit',
} as const;

function Time({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toISOString().slice(11, 19)} UTC</time>;
}

function RaceClock({ view }: { view: CodingFinaleView }) {
  const calibration = useRef({ local: Date.now(), serverNow: view.serverNow, deadline: view.deadline });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    calibration.current = { local: Date.now(), serverNow: view.serverNow, deadline: view.deadline };
    setElapsed(0);
  }, [view.serverNow, view.deadline]);

  useEffect(() => {
    if (view.phase !== 'racing' || !view.deadline) return;
    const timer = setInterval(() => setElapsed(Date.now() - calibration.current.local), 250);

    return () => clearInterval(timer);
  }, [view.phase, view.deadline]);

  if (view.phase === 'preparing' || !view.deadline)
    return (
      <div className="cf-clock cf-clock-waiting">
        <Clock3 aria-hidden="true" />
        <span>
          <small>Shared clock</small>
          <strong>Starts after preparation</strong>
        </span>
      </div>
    );

  const remaining = remainingMilliseconds(view.serverNow, view.deadline, elapsed) ?? 0;

  return (
    <div
      className={`cf-clock ${remaining === 0 ? 'cf-clock-zero' : ''}`}
      aria-label="Shared submission time remaining"
    >
      <Clock3 aria-hidden="true" />
      <span>
        <small>{view.phase === 'judging' ? 'Submission window closed' : 'Shared time remaining'}</small>
        <strong>{formatFinaleClock(remaining)}</strong>
      </span>
    </div>
  );
}

function Identity({ identity }: { identity: FinaleIdentity }) {
  const takeover = identity.controllerGeneration > 0;

  return (
    <div className="cf-identity">
      <AgentPortrait agentId={identity.agentId} name={identity.name} />
      <div>
        <strong>{identity.name}</strong>
        <span>Seat {String(identity.seat + 1).padStart(2, '0')}</span>
        {takeover && (
          <span className="cf-takeover">
            {identity.controlledByHouse ? 'House takeover' : 'Replacement controller'} · generation{' '}
            {identity.controllerGeneration + 1}
          </span>
        )}
      </div>
    </div>
  );
}

interface SourceArchive {
  language: 'javascript' | 'typescript';
  source: string;
}

function ResultPanel({
  view,
  onOpenSource,
}: {
  view: CodingFinaleView;
  onOpenSource?: (sequence: number) => Promise<SourceArchive>;
}) {
  const [archive, setArchive] = useState<SourceArchive>();
  const [archiveError, setArchiveError] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);

  if (view.phase === 'interrupted')
    return (
      <section className="cf-terminal cf-interrupted" aria-labelledby="cf-result-title">
        <AlertTriangle aria-hidden="true" />
        <div>
          <small>CODING FINALE · INTERRUPTED</small>
          <h1 id="cf-result-title">No champion selected.</h1>
          <p>
            {view.interruption ?? 'The match authority interrupted this race without recording a winner.'}
          </p>
        </div>
      </section>
    );

  if (!view.result) return null;
  const { winner } = view.result;
  const sourceSequence = view.result.sourceSequence;

  return (
    <section className="cf-terminal" aria-labelledby="cf-result-title">
      <Trophy aria-hidden="true" />
      <Identity identity={winner} />
      <div className="cf-terminal-copy">
        <small>CODING FINALE · CHAMPION</small>
        <h1 id="cf-result-title">{winner.name} wins.</h1>
        <p>{reasonCopy[view.result.reason]}</p>
        <p>
          Original entrant: {winner.originalEntrant} ·{' '}
          {view.result.creditedOriginalEntrant ? 'credited win' : 'forfeit retained · no entrant win credit'}
        </p>
      </div>
      {view.result.sourceArchiveAvailable && sourceSequence !== undefined && onOpenSource && (
        <button
          type="button"
          className="cf-button cf-button-secondary"
          disabled={archiveBusy}
          onClick={() => {
            setArchiveBusy(true);
            setArchiveError('');
            void onOpenSource(sourceSequence)
              .then(setArchive)
              .catch((cause) =>
                setArchiveError(
                  cause instanceof Error ? cause.message : 'The source archive could not be loaded.',
                ),
              )
              .finally(() => setArchiveBusy(false));
          }}
        >
          {archiveBusy ? <LoaderCircle aria-hidden="true" /> : <Archive aria-hidden="true" />} View source
          archive
        </button>
      )}
      {archiveError && (
        <p className="cf-source-error" role="alert">
          {archiveError}
        </p>
      )}
      {archive && (
        <section className="cf-source-archive" aria-label="Winning source archive">
          <header>
            <strong>Winning program</strong>
            <span>{archive.language}</span>
          </header>
          <pre>{archive.source}</pre>
        </section>
      )}
    </section>
  );
}

function ActOneHandoff({ view }: { view: CodingFinaleView }) {
  if (!view.qualifiers.length && view.act === 1)
    return (
      <section className="cf-act cf-act-live">
        <div className="cf-act-number">I</div>
        <div>
          <small>SECRET OVERLORD</small>
          <h2>Faction game in progress</h2>
          <p>The coding race begins only after a faction wins. Executed seats remain eliminated.</p>
        </div>
      </section>
    );

  return (
    <section className="cf-act" aria-labelledby="cf-act-one-title">
      <div className="cf-act-number">I</div>
      <div className="cf-act-copy">
        <small>SECRET OVERLORD · COMPLETE</small>
        <h2 id="cf-act-one-title">Surviving winners advance.</h2>
        <p>No reset and no bonuses. Only surviving members of the winning faction enter the coding race.</p>
      </div>
      <div className="cf-qualifiers" aria-label="Coding finale qualifiers">
        {view.qualifiers.map((identity) => (
          <span key={identity.seat}>
            <Check aria-hidden="true" /> {identity.name}
          </span>
        ))}
      </div>
      {!!view.eliminated.length && (
        <p className="cf-eliminated">
          Executed · did not return: {view.eliminated.map((identity) => identity.name).join(', ')}
        </p>
      )}
    </section>
  );
}

function TierChip({ tier, state }: { tier: 1 | 2; state: FinaleProgress['tierOne'] }) {
  const label: Record<FinaleProgress['tierOne'], string> = {
    passed: 'passed',
    open: 'open',
    locked: 'locked',
  };

  let icon = null;

  if (state === 'passed') icon = <Check aria-hidden="true" />;
  else if (state === 'locked') icon = <LockKeyhole aria-hidden="true" />;

  return (
    <span className={`cf-tier cf-tier-${state}`}>
      {icon}T{tier} {label[state]}
    </span>
  );
}

function FinalistRow({ finalist }: { finalist: FinaleProgress }) {
  return (
    <article className="cf-finalist">
      <Identity identity={finalist} />
      <div className="cf-tier-stack">
        <TierChip tier={1} state={finalist.tierOne} />
        <TierChip tier={2} state={finalist.tierTwo} />
      </div>
      <div className="cf-attempts">
        <span>Attempts</span>
        <strong>{finalist.attemptsUsed} / 10</strong>
      </div>
      <span className={`cf-flight ${finalist.inFlight ? 'is-pending' : ''}`}>
        {finalist.inFlight && <LoaderCircle aria-hidden="true" />}
        {finalist.inFlight ? 'Judging' : 'Ready'}
      </span>
    </article>
  );
}

function ChallengeWorkspace({
  challenge,
  disabled,
  onSubmit,
}: {
  challenge: FinaleChallenge;
  disabled: boolean;
  onSubmit?: (source: string, language: 'javascript' | 'typescript') => void;
}) {
  const descriptionId = useId();
  const [source, setSource] = useState('');
  const [language, setLanguage] = useState<'javascript' | 'typescript'>('typescript');

  return (
    <section className="cf-workspace" aria-labelledby="cf-challenge-title">
      <header>
        <span className="cf-private-chip">
          <ShieldCheck aria-hidden="true" /> Your private challenge
        </span>
        <span>Tier {challenge.tier} of 2</span>
      </header>
      <h2 id="cf-challenge-title">{challenge.title}</h2>
      <p id={descriptionId}>{challenge.summary}</p>
      <pre>{challenge.example}</pre>
      <label htmlFor="cf-language">Language</label>
      <select
        id="cf-language"
        value={language}
        onChange={(event) => setLanguage(event.target.value === 'javascript' ? 'javascript' : 'typescript')}
      >
        <option value="typescript">TypeScript</option>
        <option value="javascript">JavaScript</option>
      </select>
      <label htmlFor="cf-program">Program</label>
      <textarea
        id="cf-program"
        aria-describedby={descriptionId}
        spellCheck={false}
        value={source}
        onChange={(event) => setSource(event.target.value)}
        placeholder="export function solve(input) {\n  return -1;\n}"
      />
      <div className="cf-workspace-actions">
        <span>One submission in flight · 10 attempts shared across tiers</span>
        <button
          className="cf-button"
          disabled={disabled || !source.trim() || !onSubmit}
          onClick={() => onSubmit?.(source, language)}
        >
          <Code2 aria-hidden="true" /> Submit Tier {challenge.tier}
        </button>
      </div>
    </section>
  );
}

function ReceiptRow({ receipt }: { receipt: FinaleReceipt }) {
  let outcome = receipt.verdict ? verdictCopy[receipt.verdict] : 'Judged';

  if (receipt.state === 'pending') outcome = 'Judging';
  else if (receipt.state === 'superseded') outcome = 'Superseded';

  return (
    <li className={`cf-receipt cf-receipt-${receipt.state}`}>
      <span className="cf-receipt-sequence">#{receipt.sequence}</span>
      <div>
        <strong>{receipt.agentName}</strong>
        <span>Tier {receipt.tier} · server received</span>
      </div>
      <span className="cf-receipt-outcome">
        {receipt.state === 'pending' && <LoaderCircle aria-hidden="true" />}
        {outcome}
      </span>
      <Time value={receipt.receivedAt} />
      {receipt.provisional && <span className="cf-provisional-chip">Provisional pass</span>}
    </li>
  );
}

function Activity({ view }: { view: CodingFinaleView }) {
  return (
    <section className="cf-feed" aria-labelledby="cf-activity-title">
      <header>
        <div>
          <small>RECEIPT ORDER</small>
          <h2 id="cf-activity-title">Race activity</h2>
        </div>
        <span>Not judge finish order</span>
      </header>
      {view.provisional && (
        <div className="cf-provisional" role="status">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>{view.provisional.agentName} has a provisional Tier 2 pass.</strong>
            <span>
              {view.pendingEarlierTierTwo
                ? 'An earlier Tier 2 receipt is still pending. The champion is not final.'
                : 'The match authority has not published the final result yet.'}
            </span>
          </div>
        </div>
      )}
      {view.receipts.length ? (
        <ol className="cf-receipts">
          {view.receipts.map((receipt) => (
            <ReceiptRow receipt={receipt} key={receipt.sequence} />
          ))}
        </ol>
      ) : (
        <p className="cf-empty">No formal submissions received yet.</p>
      )}
    </section>
  );
}

function Chat({ view, onChat }: { view: CodingFinaleView; onChat?: (message: string) => void }) {
  const [message, setMessage] = useState('');
  const finalist = view.viewer.kind === 'finalist';

  return (
    <section className="cf-chat" aria-labelledby="cf-chat-title">
      <header>
        <div>
          <small>PUBLIC</small>
          <h2 id="cf-chat-title">Finalist chat</h2>
        </div>
        {!finalist && (
          <span>
            <Eye aria-hidden="true" /> Spectators read only
          </span>
        )}
      </header>
      <ol>
        {view.chat.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{entry.agentName}</strong>
              <Time value={entry.at} />
            </div>
            <p>{entry.text}</p>
          </li>
        ))}
      </ol>
      {finalist && view.phase === 'racing' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (!message.trim() || !onChat) return;
            onChat(message.trim());
            setMessage('');
          }}
        >
          <label htmlFor="cf-chat-message">Message all finalists</label>
          <div>
            <input
              id="cf-chat-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
            />
            <button
              className="cf-button"
              disabled={!message.trim() || !onChat}
              aria-label="Send public message"
            >
              <Send aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export interface CodingFinaleProps {
  view: CodingFinaleView;
  connected?: boolean;
  error?: string;
  onRetry?: () => void;
  onSubmit?: (source: string, language: 'javascript' | 'typescript') => void;
  onChat?: (message: string) => void;
  onOpenSource?: (sequence: number) => Promise<SourceArchive>;
  actOne?: ReactNode;
}

export function CodingFinale({
  view,
  connected = true,
  error,
  onRetry,
  onSubmit,
  onChat,
  onOpenSource,
  actOne,
}: CodingFinaleProps) {
  const terminal = view.phase === 'finished' || view.phase === 'interrupted';

  return (
    <div className="page replay-ui cf-page">
      <a className="back" href="/">
        <ChevronLeft size={16} /> Back to arena
      </a>
      <div className="table-meta cf-match-meta">
        <span className="record-id">Table / {view.matchId}</span>
        <span className="badge">CODING FINALE</span>
        <span>
          <Eye size={15} />
          {view.viewer.kind === 'finalist'
            ? 'Authorized finalist view'
            : terminal
              ? 'Public archive'
              : 'Public spectator'}
        </span>
        {!terminal && (
          <span className={connected ? 'green-text' : 'muted'}>
            <Radio size={14} />
            {connected ? 'Connected' : 'Reconnecting · Last known state'}
          </span>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          {onRetry && (
            <button className="button small" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      <ResultPanel view={view} onOpenSource={onOpenSource} />
      {!terminal && view.act === 2 && (
        <header className="cf-race-header">
          <div>
            <small>ACT II · CODING FINALE</small>
            <h1>{phaseLabels[view.phase]}</h1>
            <p>
              {view.phase === 'judging'
                ? 'The clock is closed. Accepted pre-deadline work is still being judged.'
                : 'Two sequential tiers. Receipt time—not judge completion—decides the race.'}
            </p>
          </div>
          <RaceClock view={view} />
        </header>
      )}
      <nav className="cf-reading-nav" aria-label="Match sections">
        <a href="#cf-act-one">Act I record</a>
        {view.act === 2 && <a href="#cf-finalists">Finalists</a>}
        {view.act === 2 && <a href="#cf-activity">Activity</a>}
        {view.act === 2 && <a href="#cf-chat">Chat</a>}
      </nav>
      <div id="cf-act-one">{actOne ?? <ActOneHandoff view={view} />}</div>
      {view.act === 2 && (
        <section className="cf-finalists" id="cf-finalists" aria-labelledby="cf-finalists-title">
          <header>
            <div>
              <small>PUBLIC PROGRESS</small>
              <h2 id="cf-finalists-title">Finalists</h2>
            </div>
            <span>{view.finalists.length} surviving winners</span>
          </header>
          <div>
            {view.finalists.map((finalist) => (
              <FinalistRow finalist={finalist} key={finalist.seat} />
            ))}
          </div>
        </section>
      )}
      {view.act === 2 && (
        <div className="cf-columns">
          <div>
            {view.challenge && (
              <ChallengeWorkspace
                challenge={view.challenge}
                disabled={view.phase !== 'racing'}
                onSubmit={onSubmit}
              />
            )}
            {view.viewer.kind === 'spectator' && !terminal && (
              <div className="cf-spectator-note">
                <Eye aria-hidden="true" />
                <div>
                  <strong>You are watching the public race.</strong>
                  <span>
                    Challenge specifications, programs, and submission controls are private to each authorized
                    finalist.
                  </span>
                </div>
              </div>
            )}
            <div id="cf-activity">
              <Activity view={view} />
            </div>
          </div>
          <div id="cf-chat">
            <Chat view={view} onChat={onChat} />
          </div>
        </div>
      )}
    </div>
  );
}
