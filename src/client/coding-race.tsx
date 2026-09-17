import { useState } from 'react';
import { Check, ChevronRight, Code2, Lock, X } from 'lucide-react';
import { useStickToBottom } from 'use-stick-to-bottom';
import type { Observation3 } from '../shared/coding-finale';
import { PublicCodingChallengeSchema, CodingSubmissionReportSchema } from '../shared/coding-finale-artifacts';
import type { CodingSubmissionReport } from '../shared/coding-finale-artifacts';
import { useLoad } from './use-load';
import { AgentPortrait } from './agent-portrait';
import { useAgentPictures } from './use-agent-pictures';

function Puzzle({ matchId, tier, unlocked }: { matchId: string; tier: 1 | 2; unlocked: boolean }) {
  const challenge = useLoad(
    `/api/matches/${encodeURIComponent(matchId)}/coding/challenge?tier=${tier}`,
    PublicCodingChallengeSchema,
    0,
    unlocked,
  );

  return (
    <section className={`cf-puzzle ${unlocked ? '' : 'is-locked'}`} aria-label={`Tier ${tier} puzzle`}>
      <header>
        <span>Tier {tier}</span>
        {unlocked ? <Code2 size={18} /> : <Lock size={18} />}
      </header>
      {!unlocked ? (
        <>
          <h2>The next challenge</h2>
          <p>Revealed when the first finalist passes Tier 1.</p>
        </>
      ) : !challenge.data ? (
        <p role="status">
          {challenge.error || 'Loading the puzzle…'}
          {challenge.error && <button onClick={() => void challenge.refresh()}>Retry</button>}
        </p>
      ) : (
        <>
          <h2>{challenge.data.title}</h2>
          <p className="cf-puzzle-statement">{challenge.data.statement.split('\n').slice(0, 3).join('\n')}</p>
          {tier === 2 && (
            <p className="cf-puzzle-twist">
              The twist: routes now consume energy. Refilling at a recharger costs time.
            </p>
          )}
          <details>
            <summary>Full rules and limits</summary>
            <p className="cf-puzzle-statement">{challenge.data.statement}</p>
          </details>
          <details>
            <summary>Example input and output</summary>
            <pre>{JSON.stringify(challenge.data.example.input, null, 2)}</pre>
            <p>
              Expected output <code>{challenge.data.example.expected}</code>
            </p>
          </details>
          <details>
            <summary>JavaScript starter</summary>
            <pre>{challenge.data.starter}</pre>
          </details>
        </>
      )}
    </section>
  );
}

export function CodingRacePuzzles({ view }: { view: Observation3 }) {
  const tierTwo = view.finale?.finalists.some((finalist) => finalist.completedTier >= 1) ?? false;

  return (
    <section className="cf-puzzles" id="cf-puzzles" aria-label="The coding challenges">
      <Puzzle matchId={view.matchId} tier={1} unlocked={view.act === 2} />
      <Puzzle matchId={view.matchId} tier={2} unlocked={tierTwo} />
    </section>
  );
}

function TestEvidence({ report }: { report: CodingSubmissionReport }) {
  const evidence = report.evidence;

  if (evidence.status === 'unavailable')
    return (
      <p className="cf-evidence-unavailable">
        {evidence.reason === 'not-judged'
          ? 'This submission was not judged.'
          : 'This older submission has no stored per-test results.'}{' '}
        The recorded verdict is shown above.
      </p>
    );

  return (
    <section className="cf-test-evidence" aria-label="Recorded test results">
      <header>
        <strong>
          {evidence.passedCases === null
            ? 'No valid test output'
            : `${evidence.passedCases} / ${evidence.totalCases} tests passed`}
        </strong>
        <span>
          {evidence.execution.timedOut
            ? 'Time limit reached'
            : evidence.execution.truncated
              ? 'Output limit reached'
              : evidence.execution.exitCode === 0
                ? 'Execution completed'
                : `Exit ${evidence.execution.exitCode ?? 'unavailable'}`}
        </span>
      </header>
      {evidence.passedCases !== null && (
        <meter min={0} max={evidence.totalCases} value={evidence.passedCases}>
          {evidence.passedCases} passed
        </meter>
      )}
      <p>
        Recorded examples from the actual judging run. {evidence.cases.length} of {evidence.totalCases} test
        inputs shown.
      </p>
      {evidence.cases.map((example) => (
        <details className={`cf-test-case is-${example.status}`} key={example.index}>
          <summary>
            {example.status === 'passed' ? <Check size={16} /> : <X size={16} />}
            <b>Test {example.index + 1}</b>
            <span>{example.status}</span>
            <code>
              expected {example.expected} · got {example.actual ?? 'no output'}
            </code>
          </summary>
          <pre>{JSON.stringify(example.input, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}

function SubmissionReport({ matchId, sequence }: { matchId: string; sequence: number }) {
  const report = useLoad(
    `/api/matches/${encodeURIComponent(matchId)}/coding/submission?sequence=${sequence}`,
    CodingSubmissionReportSchema,
  );

  if (!report.data)
    return (
      <p role="status">
        {report.error || 'Loading the submitted solution…'}
        {report.error && <button onClick={() => void report.refresh()}>Retry</button>}
      </p>
    );

  return (
    <article className="cf-submission-report">
      <header>
        <strong>
          Submission #{sequence} · Tier {report.data.tier}
        </strong>
        <span>
          {report.data.verdict?.replaceAll('-', ' ') ?? report.data.status} · {report.data.program.language}
        </span>
      </header>
      <div className="cf-solution-columns">
        <section aria-label="Submitted program">
          <h3>Submitted code</h3>
          <pre tabIndex={0}>
            <code>{report.data.program.source}</code>
          </pre>
        </section>
        <TestEvidence report={report.data} />
      </div>
    </article>
  );
}

export function CodingRaceRecord({ view }: { view: Observation3 }) {
  const terminal = view.status !== 'active';
  const receipts = view.finale?.submissions ?? [];
  const finalists = view.finale?.finalists ?? [];
  const [selectedSeat, setSelectedSeat] = useState<number>();
  const [selectedReceipt, setSelectedReceipt] = useState<number>();
  const [tier, setTier] = useState<1 | 2>(1);
  const pictures = useAgentPictures(view.seats.map((entry) => ({ id: entry.agentId })));

  const seat =
    selectedSeat ?? (view.result?.kind === 'individual' ? view.result.winnerSeat : finalists[0]?.seat);

  const entries = receipts.filter((receipt) => receipt.seat === seat && receipt.tier === tier);

  const selected =
    entries.find((receipt) => receipt.sequence === selectedReceipt) ??
    entries.find((receipt) => receipt.tier === 2 && receipt.verdict === 'passed') ??
    entries.find((receipt) => receipt.verdict === 'passed') ??
    entries.at(-1);

  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({
    initial: 'instant',
    resize: 'instant',
  });

  return (
    <section className="cf-race-record" id="cf-activity">
      <header>
        <div>
          <small>{terminal ? 'EVERY FINALIST · EVERY SUBMISSION' : 'LIVE JUDGING'}</small>
          <h2>{terminal ? 'Solutions & test results' : 'Race activity'}</h2>
        </div>
        <span>{receipts.length} submissions</span>
      </header>
      {terminal ? (
        <>
          <div className="cf-solution-tabs" role="group" aria-label="Choose a finalist">
            {finalists.map((finalist) => {
              const entrant = view.seats.find((candidate) => candidate.number === finalist.seat);

              return (
                <div
                  className="cf-solution-agent replay-ui"
                  key={finalist.seat}
                  data-selected={finalist.seat === seat}
                >
                  <AgentPortrait
                    agentId={entrant?.agentId}
                    name={entrant?.name ?? 'Unknown finalist'}
                    picture={entrant ? pictures.pictures.get(entrant.agentId) : undefined}
                    size={48}
                    onImageError={pictures.revalidateUnavailable}
                  />
                  <button
                    key={finalist.seat}
                    aria-pressed={finalist.seat === seat}
                    onClick={() => {
                      setSelectedSeat(finalist.seat);
                      setSelectedReceipt(undefined);
                    }}
                  >
                    <span>
                      {view.seats.find((candidate) => candidate.number === finalist.seat)?.name ??
                        'Unknown finalist'}
                    </span>
                    <small>{finalist.attempts} submissions</small>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="cf-tier-tabs" role="group" aria-label="Solution tier">
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                aria-pressed={tier === value}
                onClick={() => {
                  setTier(value);
                  setSelectedReceipt(undefined);
                }}
              >
                Tier {value}
              </button>
            ))}
          </div>
          {selected ? (
            <>
              <div className="cf-attempt-tabs" role="group" aria-label="Submission attempts">
                {entries.map((entry) => (
                  <button
                    aria-pressed={selected.sequence === entry.sequence}
                    onClick={() => setSelectedReceipt(entry.sequence)}
                    key={entry.sequence}
                  >
                    #{entry.sequence} · Tier {entry.tier} ·{' '}
                    {entry.verdict?.replaceAll('-', ' ') ?? entry.status}
                  </button>
                ))}
              </div>
              <SubmissionReport
                key={`${view.matchId}:${selected.sequence}`}
                matchId={view.matchId}
                sequence={selected.sequence}
              />
            </>
          ) : (
            <p>
              {receipts.some((entry) => entry.seat === seat)
                ? `No Tier ${tier} submissions from this finalist.`
                : 'This finalist did not submit a program.'}
            </p>
          )}
        </>
      ) : (
        <>
          <div
            className="cf-race-scroll"
            ref={scrollRef}
            tabIndex={0}
            role="region"
            aria-label="Live submission activity"
          >
            <ol ref={contentRef}>
              {receipts.map((entry) => (
                <li key={entry.sequence}>
                  <span className="cf-receipt-number">#{entry.sequence}</span>
                  <strong>{view.seats.find((candidate) => candidate.number === entry.seat)?.name}</strong>
                  <span>Tier {entry.tier}</span>
                  <span>
                    {entry.status === 'pending'
                      ? 'Judging…'
                      : (entry.verdict?.replaceAll('-', ' ') ??
                        (entry.status === 'judged' ? 'Judged' : 'Superseded'))}
                  </span>
                  <time>
                    {new Date(entry.receivedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </time>
                </li>
              ))}
              {!receipts.length && (
                <li className="cf-race-empty">
                  The finalists are working on Tier 1. Their submissions will appear here.
                </li>
              )}
            </ol>
          </div>
          <div className="cf-feed-status">
            <span>Receipt order decides the winner.</span>
            {!isAtBottom && (
              <button onClick={() => void scrollToBottom('instant')}>
                Latest submission <ChevronRight size={14} />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
