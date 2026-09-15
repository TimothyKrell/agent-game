import { Trophy } from 'lucide-react';
import type { CapEvidence2 } from '../shared/succession';
import type { StoryChapters, StoryEntrant, StoryReturn, StoryValue } from './succession-story-types';
import { dossierName, dossierValue, DossierIdentity } from './dossier-identity';
import { DossierRule, DossierText } from './dossier-rules';
import { InfluenceBack } from './deco';

export type DossierEntrants = ReadonlyMap<number, StoryValue<StoryEntrant>>;

export const unavailableEntrant: StoryValue<StoryEntrant> = { status: 'unavailable', reason: 'not-recorded' };

export function DossierCap({ evidence, entrants }: { evidence: CapEvidence2; entrants: DossierEntrants }) {
  return (
    <section className="dossier-cap" aria-label="Round cap comparison">
      <p>
        <DossierRule rule="round-cap" /> · Decided by{' '}
        {evidence.decisive === 'priority' ? 'precommitted priority' : evidence.decisive}
      </p>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Influence</th>
            <th>Coins</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {evidence.scores.map((score) => (
            <tr key={score.seat}>
              <th>{dossierName(entrants.get(score.seat) ?? unavailableEntrant, score.seat)}</th>
              <td>{score.influence}</td>
              <td>{score.coins}</td>
              <td>{score.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DossierReturn({ seats }: { seats: readonly StoryReturn[] }) {
  return (
    <section className="dossier-return" aria-label="Act II starting states">
      <p>
        {seats.length === 10 ? 'All ten agents return' : `${seats.length} recorded starting seats`} · 2 fresh
        secret capability cards each.
      </p>
      <div
        className="dossier-ten-cards"
        aria-label={`${seats.length} agents receive two fresh influence cards`}
      >
        {seats.map((seat) => (
          <span key={seat.seat} className={seat.returnedAfterExecution ? 'returned' : ''}>
            <small>{String(seat.seat + 1).padStart(2, '0')}</small>
            <span aria-hidden="true">
              <InfluenceBack />
              <InfluenceBack />
            </span>
          </span>
        ))}
      </div>
      <div className="dossier-starting-totals">
        <DossierRule rule="coins" />
        <span>
          {seats.filter((seat) => seat.coins === 3).length} agents × <b>3</b>
        </span>
        <span>
          {seats.filter((seat) => seat.coins === 2).length} agents × <b>2</b>
        </span>
      </div>
      <details>
        <summary>All {seats.length} starting states</summary>
        <div className="dossier-starting-seats">
          {seats.map((seat) => (
            <article key={seat.seat}>
              <strong>
                <DossierIdentity entrant={seat.entrant} seat={seat.seat} compact />
              </strong>
              <small>
                Historical Act I role: <DossierRule rule={seat.role} />
              </small>
              <div className="dossier-resources">
                <DossierRule rule="coins" value={seat.coins} />
                <DossierRule rule="influence" value={seat.influence} />
              </div>
              {seat.returnedAfterExecution && <em>Returned after execution</em>}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

export function DossierAward({
  team,
  reason,
  seats,
}: {
  team: 'cooperative' | 'rogue';
  reason: string;
  seats?: readonly StoryReturn[];
}) {
  return (
    <section className="dossier-award" aria-label="Act I winning faction bonus">
      <header>
        <Trophy aria-hidden="true" />
        <div>
          <h3>
            <DossierRule rule={team} /> faction wins Act I
          </h3>
          <p>
            <DossierText text={reason} />
          </p>
        </div>
      </header>
      {seats ? (
        <div className="dossier-bonus-agents">
          {seats.flatMap((seat) =>
            seat.bonus === 1
              ? [
                  <article key={seat.seat}>
                    <DossierIdentity entrant={seat.entrant} seat={seat.seat} />
                    <span>+1 bonus · Act II</span>
                    <DossierRule rule="coins" before={2} value={3} />
                  </article>,
                ]
              : [],
          )}
        </div>
      ) : (
        <p>Bonus recipients not recorded in this window.</p>
      )}
      <p className="dossier-award-footer">
        Starting advantage · The match continues. All ten agents return for Act II, including executed agents.
      </p>
    </section>
  );
}

export type DossierStatus = 'active' | 'finished' | 'interrupted';

export function dossierOutcomeTitle(chapters: StoryChapters, status: DossierStatus) {
  const outcome = dossierValue(chapters.outcome);

  if (outcome) {
    if (dossierValue(outcome.credit) === 'forfeit-loss') return 'House-controlled champion';
    const name = dossierName(outcome.winner.entrant, outcome.winner.seat);

    return dossierValue(outcome.credit) === 'win'
      ? `${name} wins the match`
      : `${name} · Mechanical champion`;
  }

  return { interrupted: 'Match interrupted', finished: 'Result unavailable', active: 'Match in progress' }[
    status
  ];
}

export function DossierOutcome({
  chapters,
  status,
  act,
  entrants,
}: {
  chapters: StoryChapters;
  status: DossierStatus;
  act: 1 | 2;
  entrants: DossierEntrants;
}) {
  const outcome = dossierValue(chapters.outcome);
  const interruption = dossierValue(chapters.interruption);

  const label = {
    finished: 'COMPLETED',
    interrupted: 'INTERRUPTED',
    active: `ACT ${act === 1 ? 'I' : 'II'}`,
  }[status];

  const pending = {
    interrupted: 'Partial record · no overall champion recorded.',
    finished: 'The recorded individual result is unavailable.',
    active: 'The overall victory is decided in Act II.',
  }[status];

  const credit = outcome ? dossierValue(outcome.credit) : undefined;

  const creditLabel = credit
    ? { 'forfeit-loss': 'forfeit loss', win: 'credited win' }[credit]
    : 'credit unavailable';

  return (
    <header className="dossier-outcome">
      <div className="dossier-outcome-main">
        {outcome && <DossierIdentity entrant={outcome.winner.entrant} seat={outcome.winner.seat} />}
        <div>
          <small>SUCCESSION · {label}</small>
          <h1>{dossierOutcomeTitle(chapters, status)}</h1>
          <p>
            {outcome
              ? outcome.result.reason === 'last-survivor'
                ? 'Last influence standing'
                : 'Round cap · Table round 12'
              : (interruption ?? pending)}
          </p>
          {outcome && (
            <p>
              Original entrant: {dossierName(outcome.winner.entrant, outcome.winner.seat)} · {creditLabel}
            </p>
          )}
        </div>
      </div>
      {outcome && (
        <div className="dossier-resources">
          <DossierRule rule="influence" value={dossierValue(outcome.winner.influence) ?? null} />
          <DossierRule rule="coins" value={dossierValue(outcome.winner.coins) ?? null} />
        </div>
      )}
      {outcome?.result.tieBreak && (
        <details>
          <summary>Round cap comparison</summary>
          <DossierCap evidence={outcome.result.tieBreak} entrants={entrants} />
        </details>
      )}
    </header>
  );
}
