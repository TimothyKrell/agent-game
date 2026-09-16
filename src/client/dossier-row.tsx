import { Skull } from 'lucide-react';
import type { StoryRow, StoryReturn, StorySeat } from './succession-story-types';
import { dossierName, dossierValue, DossierIdentity } from './dossier-identity';
import { DossierCard, DossierResources, dossierVisible } from './dossier-cards';
import { DossierRule, DossierText } from './dossier-rules';
import { dossierFactText } from './dossier-facts';
import type { DossierEntrants } from './dossier-summary';
import { DossierAward, DossierCap, DossierReturn, unavailableEntrant } from './dossier-summary';
import { DossierEventPanel, hasDossierEventPanel } from './dossier-event-panels';
import {
  DossierChallengeEvidence,
  DossierElectionEvidence,
  DossierPolicyEvidence,
  DossierTrackerEvidence,
} from './dossier-evidence';
import { storyActionRules } from './succession-story-rules';

export function dossierRowId(row: StoryRow) {
  return `dossier-event-${encodeURIComponent(row.source.matchId)}-${encodeURIComponent(row.source.eventKey)}`;
}

function rowEntrant(row: StoryRow, entrants: DossierEntrants, seat: number) {
  return (
    row.affected.find((change) => change.seat === seat)?.after.entrant ??
    entrants.get(seat) ??
    unavailableEntrant
  );
}

function DossierRemaining({ row }: { row: StoryRow }) {
  const remaining = dossierValue(row.remaining);

  return (
    <section className="dossier-remaining" aria-label="Agents remaining after this event">
      <header>
        <strong>{remaining?.length ?? '?'}</strong>
        <span>still in Act {row.position.act === 1 ? 'I' : 'II'}</span>
      </header>
      {remaining ? (
        <ul>
          {remaining.map((seat) => (
            <li key={seat.seat}>
              <DossierIdentity entrant={seat.entrant} seat={seat.seat} compact />
            </li>
          ))}
        </ul>
      ) : (
        <p>Historical remaining-agent roster unavailable.</p>
      )}
      {row.position.act === 1 && <p>Executed agents return for Act II with everyone else.</p>}
    </section>
  );
}

function DossierActionContext({ row, entrants }: { row: StoryRow; entrants: DossierEntrants }) {
  const action = dossierValue(row.action);

  if (!action || row.fact.kind === 'speech' || row.fact.kind === 'declaration') return null;
  const declaration = dossierValue(action.declaration);
  const name = dossierName(rowEntrant(row, entrants, action.actor), action.actor);

  return (
    <div
      className="dossier-action-context"
      data-action-source={declaration?.kind === 'event' ? declaration.eventKey : undefined}
    >
      <span>
        Action by {name} · <DossierRule rule={storyActionRules[action.action]} />
        {action.target !== null
          ? ` → ${dossierName(rowEntrant(row, entrants, action.target), action.target)}`
          : ''}
      </span>
      {action.paid > 0 && <span>{action.paid} coins paid · no refund</span>}
      {declaration?.kind === 'event' && (
        <span className="dossier-source-reference">Action at source {declaration.cursor}</span>
      )}
    </div>
  );
}

function FactEvidence({ row, entrants }: { row: StoryRow; entrants: DossierEntrants }) {
  const fact = row.fact;
  const actor = dossierValue(row.actor);
  const lossReason = dossierValue(row.lossReason);
  const name = (seat: number) => dossierName(rowEntrant(row, entrants, seat), seat);

  switch (fact.kind) {
    case 'declaration':
      return (
        <div className="dossier-action-facts">
          <DossierRule rule={storyActionRules[fact.action.type]} />
          {fact.claim && (
            <span>
              Claims <DossierRule rule={fact.claim} />
            </span>
          )}
          {fact.action.target !== undefined && <span>Target: {name(fact.action.target)}</span>}
          {fact.payment > 0 && (
            <span>
              <DossierRule rule="coins" value={fact.payment} /> paid · no refund
            </span>
          )}
        </div>
      );
    case 'challenge-resolved':
      return <DossierChallengeEvidence row={row} entrants={entrants} />;
    case 'proof':
      return (
        <section aria-label={`${actor == null ? 'Agent' : name(actor)} public proof`}>
          <small>{actor == null ? 'Owner unavailable' : name(actor)} · Public proof</small>
          <DossierCard capability={fact.capability} state="revealed" />
        </section>
      );
    case 'block':
      return (
        <p>
          Claims <DossierRule rule={fact.capability} /> to <DossierRule rule="block" />
        </p>
      );
    case 'influence-lost':
      return (
        <section aria-label={`${actor == null ? 'Agent' : name(actor)} lost card`}>
          <small>{actor == null ? 'Owner unavailable' : name(actor)} · Public loss</small>
          <DossierCard capability={fact.capability} state="lost" />
          {lossReason && (
            <p>
              {
                {
                  'failed-claim': 'Claim disproved',
                  'failed-challenge': 'Challenge failed',
                  'action-effect': 'Action effect',
                }[lossReason]
              }
            </p>
          )}
        </section>
      );
    case 'election':
      return <DossierElectionEvidence row={row} entrants={entrants} />;
    case 'policy':
      return <DossierPolicyEvidence row={row} />;
    case 'tracker':
      return <DossierTrackerEvidence row={row} />;
    case 'nomination':
      return null;
    case 'investigation-result':
      return (
        <p>
          {name(fact.target)} · <DossierRule rule={fact.team} /> ·{' '}
          {row.visibility === 'archive' ? 'Private archive' : 'Your private view'}
        </p>
      );
    case 'veto-request':
      return <DossierRule rule="veto" />;
    case 'veto-response':
      return (
        <p>
          <DossierRule rule="veto" /> {fact.approved ? 'accepted' : 'rejected'}
        </p>
      );
    case 'private-cards':
      return (
        <section className="dossier-hand">
          <small>
            {actor == null ? 'Owner unavailable' : name(actor)} ·{' '}
            {row.visibility === 'archive' ? 'Private archive · secret during play' : 'Your private view'} ·{' '}
            {fact.operation === 'exchange-draw' ? 'Exchange draw' : 'Hand'}
          </small>
          <div className="dossier-cards">
            {fact.cards.map((card) => (
              <DossierCard key={card.id} capability={card.capability} state="known" />
            ))}
          </div>
        </section>
      );
    case 'private-policies':
      return (
        <section className="dossier-hand">
          <small>
            {actor == null ? 'Owner unavailable' : name(actor)} ·{' '}
            {row.visibility === 'archive' ? 'Private archive' : 'Your private view'}
          </small>
          <div className="dossier-cards">
            {fact.cards.map((card, index) => (
              <div className="dossier-policy-card" key={index}>
                <DossierText text={card.policy} />
              </div>
            ))}
          </div>
          {fact.discarded.length > 0 && (
            <p>Discarded: {fact.discarded.map((card) => card.policy).join(', ')}</p>
          )}
        </section>
      );
    case 'role':
      return (
        <p>
          {actor == null ? 'Owner unavailable' : name(actor)} · Act I role: <DossierRule rule={fact.role} />
        </p>
      );
    case 'rogue-knowledge':
      return (
        <p>
          Rogues: {fact.rogues.map(name).join(', ')} · Overlord: {name(fact.overlord)}
        </p>
      );
    case 'reaction':
      return <p>Sealed private choice: {fact.choice}</p>;
    case 'finished':
      return (
        <>
          <p>Mechanical champion: {name(fact.winner)}</p>
          {fact.capEvidence && <DossierCap evidence={fact.capEvidence} entrants={entrants} />}
        </>
      );
    case 'unavailable':
      return (
        <p className="dossier-unavailable">
          {fact.reason === 'unsupported-event' ? 'Event details unavailable' : 'Incomplete event details'} ·
          Source text retained.
        </p>
      );
    default:
      return null;
  }
}

export interface DossierRowProps {
  game?: 'succession' | 'coding-finale';
  row: StoryRow;
  entrants: DossierEntrants;
  archive: boolean;
  returns?: readonly StoryReturn[];
}

/** A single canonical record. Caller owns list/window anchors; this component owns no history. */
export function DossierRow({ row, entrants, archive, returns, game }: DossierRowProps) {
  if (!dossierVisible(row.visibility, archive)) return null;
  const fact = row.fact;

  if (fact.kind === 'audit') return null;
  const actor = dossierValue(row.actor);
  const departure = fact.kind === 'execution' || (fact.kind === 'influence-lost' && fact.eliminated);
  const departureBanner = fact.kind === 'execution';

  const portraitSeat = ['election', 'policy', 'tracker'].includes(fact.kind)
    ? null
    : fact.kind === 'execution'
      ? fact.target
      : actor;

  const system = fact.kind === 'phase' || fact.kind === 'system' || fact.kind === 'turn-ended';

  const speech = fact.kind === 'speech';
  const entrant = portraitSeat == null ? unavailableEntrant : rowEntrant(row, entrants, portraitSeat);
  const name = portraitSeat == null ? 'Actor unavailable' : dossierName(entrant, portraitSeat);
  const evidence = !speech && !system && fact.kind !== 'act-ended' && fact.kind !== 'nomination';

  const remaining = dossierValue(row.remaining);
  const action = dossierValue(row.action);
  const actionSource = action ? dossierValue(action.declaration) : undefined;

  const victim: StorySeat | undefined =
    portraitSeat == null ? undefined : row.affected.find((change) => change.seat === portraitSeat)?.after;

  const eventPanel = hasDossierEventPanel(row);

  return (
    <article
      id={dossierRowId(row)}
      tabIndex={-1}
      className={`dossier-row ${speech ? 'dossier-speech' : ''} ${system ? 'dossier-system' : ''} ${departureBanner ? 'dossier-departure' : ''} ${fact.kind === 'influence-lost' && fact.eliminated ? 'dossier-elimination' : ''} ${row.visibility !== 'public' ? 'dossier-private' : ''}`}
      data-event-type={fact.kind}
      data-source-id={row.source.cursor}
      data-source-act={row.position.act}
      data-event-key={row.source.eventKey}
      data-action-key={actionSource?.kind === 'event' ? actionSource.eventKey : undefined}
    >
      <div className="dossier-coordinate">
        <span>
          Act {row.position.act === 1 ? 'I' : 'II'} · {row.position.act === 1 ? 'Election' : 'Round'}{' '}
          {row.position.round}
        </span>
        <time dateTime={new Date(row.position.at).toISOString()}>
          {new Date(row.position.at).toISOString().slice(11, 19)} UTC
        </time>
        {row.visibility !== 'public' && (
          <span>{row.visibility === 'archive' ? 'Private archive' : 'Your private view'}</span>
        )}
      </div>
      <div className={`dossier-story ${evidence ? '' : 'dossier-story-wide'}`}>
        {portraitSeat != null && !system && (
          <div className="dossier-actor">
            <DossierIdentity entrant={entrant} seat={portraitSeat} />
          </div>
        )}
        <div className="dossier-copy">
          {speech ? (
            <>
              {actor == null && <small>Speaker unavailable</small>}
              <blockquote>
                <DossierText text={row.text} />
              </blockquote>
            </>
          ) : (
            <>
              {departureBanner && (
                <h3>
                  <Skull aria-hidden="true" />
                  <span>
                    {name}
                    <br />
                    {fact.kind === 'execution' ? 'executed' : 'eliminated'}
                  </span>
                </h3>
              )}
              <p className="dossier-source-text">
                <DossierText text={dossierFactText(row, entrants)} />
              </p>
              {departure && fact.kind !== 'execution' && !action && <p>Action actor unavailable</p>}
              {!['challenge-resolved', 'proof', 'influence-lost'].includes(fact.kind) && (
                <DossierActionContext row={row} entrants={entrants} />
              )}
              {fact.kind === 'turn-ended' && dossierValue(row.resolution) && (
                <p>
                  {action && <DossierRule rule={storyActionRules[action.action]} />} ·{' '}
                  {dossierValue(row.resolution)}
                </p>
              )}
              {fact.kind === 'act-ended' && (
                <DossierAward team={fact.team} reason={fact.reason} seats={returns} game={game} />
              )}
            </>
          )}
        </div>
      </div>
      {evidence && (
        <aside className="dossier-evidence" aria-label="Recorded state">
          {eventPanel ? (
            <DossierEventPanel row={row} entrants={entrants} />
          ) : fact.kind === 'act-started' ? (
            returns ? (
              <DossierReturn seats={returns} />
            ) : (
              <p>Recorded starting states unavailable.</p>
            )
          ) : (
            <>
              <FactEvidence row={row} entrants={entrants} />
              {fact.kind !== 'challenge-resolved' &&
                row.affected.map((change) => (
                  <DossierResources
                    key={change.seat}
                    change={change}
                    act={row.position.act}
                    archive={archive}
                  />
                ))}
            </>
          )}
          {departure && !victim && <p>Historical resources unavailable.</p>}
        </aside>
      )}
      {departure && remaining && <DossierRemaining row={row} />}
    </article>
  );
}
