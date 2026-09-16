import { Check, X } from 'lucide-react';
import type { StoryRow } from './succession-story-types';
import type { DossierEntrants } from './dossier-summary';
import { dossierName } from './dossier-identity';
import { DossierRule, DossierText } from './dossier-rules';
import { unavailableEntrant } from './dossier-summary';
import './dossier-evidence.css';

function evidenceName(row: StoryRow, entrants: DossierEntrants, seat: number) {
  const entrant =
    row.affected.find((change) => change.seat === seat)?.after.entrant ??
    entrants.get(seat) ??
    unavailableEntrant;

  return dossierName(entrant, seat);
}

export function DossierElectionEvidence({ row, entrants }: { row: StoryRow; entrants: DossierEntrants }) {
  if (row.fact.kind !== 'election') return null;
  const ballots = Object.entries(row.fact.votes);
  const approvals = ballots.filter(([, approve]) => approve).length;

  return (
    <section className="dossier-ballot-record" aria-label="Election result and published ballots">
      <div className="dossier-vote-total">
        <span>
          <b>{approvals}</b> approve
        </span>
        <span>
          <b>{ballots.length - approvals}</b> reject
        </span>
      </div>
      <div className="dossier-vote-bar" aria-label="Votes in seat order">
        {ballots.map(([seat, approve]) => (
          <span key={seat} className={approve ? 'approved' : 'rejected'} />
        ))}
      </div>
      <details>
        <summary>Ballots</summary>
        <div className="dossier-ballot-list">
          {ballots.map(([seat, approve]) => (
            <span key={seat} className={approve ? 'approved' : 'rejected'}>
              {approve ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
              {evidenceName(row, entrants, Number(seat))}
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

export function DossierPolicyEvidence({ row }: { row: StoryRow }) {
  if (row.fact.kind !== 'policy') return null;

  const tracks = [
    { rule: 'safeguard' as const, count: row.fact.safeguards, maximum: 5 },
    { rule: 'override' as const, count: row.fact.overrides, maximum: 6 },
  ];

  return (
    <section className="dossier-policy-tracks" aria-label="Policy tracks after enactment">
      {tracks.map(({ rule, count, maximum }) => (
        <div key={rule}>
          <DossierRule rule={rule} />
          <strong>
            {count} / {maximum}
          </strong>
          <span className="dossier-track-slots" aria-hidden="true">
            {Array.from({ length: maximum }, (_, index) => (
              <i key={index} className={index < count ? 'filled' : ''} />
            ))}
          </span>
        </div>
      ))}
      {row.fact.chaos && <DossierRule rule="chaos" />}
    </section>
  );
}

export function DossierTrackerEvidence({ row }: { row: StoryRow }) {
  if (row.fact.kind !== 'tracker') return null;

  return (
    <div className="dossier-tracker-compact">
      <DossierRule rule="election-tracker" />
      <strong>{row.fact.tracker} / 3</strong>
    </div>
  );
}

export function DossierChallengeEvidence({ row, entrants }: { row: StoryRow; entrants: DossierEntrants }) {
  if (row.fact.kind !== 'challenge-resolved') return null;
  const responses = Object.entries(row.fact.responses);

  return (
    <details className="dossier-responses dossier-responses-compact">
      <summary>Published responses · {responses.length}</summary>
      <ul>
        {responses.map(([seat, response]) => (
          <li key={seat}>
            <strong>{evidenceName(row, entrants, Number(seat))}</strong>
            <DossierText text={response} />
          </li>
        ))}
      </ul>
    </details>
  );
}
