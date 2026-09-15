/** Owner-approved Dossier. Retain Action & UI examples as a dev-only style guide through integration. */
import { Fragment, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronLeft, Eye, Skull, Trophy, X } from 'lucide-react';
import { InfluenceBack } from './deco';
import { useLocation, navigate } from './navigation';
import { PrototypeSwitcher } from './prototype-switcher';
import { RuleHelpProvider, RuleTerm, RuleText, ruleTerms } from './succession-dossier-rules.prototype';
import { AgentName, AgentPictureProvider, AgentPortrait } from './succession-dossier-profiles.prototype';
import {
  additionalExamples,
  dossierRows,
  record,
  recordedExamples,
} from './succession-dossier-data.prototype';
import type {
  DossierCards,
  DossierDelta,
  DossierExample,
  DossierRow,
} from './succession-dossier-data.prototype';
import './succession-dossier.prototype.css';
import DossierGuide from './dossier-guide.prototype';

function CardRecord({ cards }: { cards: DossierCards }) {
  return (
    <div className={`dp-card-record ${cards.private ? 'dp-private-cards' : ''}`}>
      <small>{cards.label}</small>
      <div>
        {cards.cards.length ? (
          cards.cards.map((card, index) => (
            <div className="dp-card" key={index}>
              <RuleText text={card} />
            </div>
          ))
        ) : (
          <span>No remaining cards</span>
        )}
      </div>
    </div>
  );
}

function ResourceDelta({ delta }: { delta: DossierDelta }) {
  return (
    <section
      className={`dp-delta ${delta.influence[1] === 0 ? 'dp-eliminated' : ''}`}
      aria-label={`${delta.name} public resources`}
    >
      <strong>
        <AgentName name={delta.name} />
      </strong>
      <div className="dp-resources">
        {(['Coins', 'Influence'] as const).map((term) => {
          const [before, after] = term === 'Coins' ? delta.coins : delta.influence;

          return <RuleTerm key={term} term={term} before={before} value={after} />;
        })}
      </div>
      {delta.lost && (
        <div className="dp-lost-card">
          <RuleText text={delta.lost} />
          <span>Lost</span>
        </div>
      )}
      {delta.status && <small className="dp-status">{delta.status}</small>}
    </section>
  );
}

function Evidence({ row }: { row: DossierRow }) {
  return (
    <>
      {row.stateChanges?.map((state) => (
        <div key={state.name} className="dp-state-change">
          <strong>
            <AgentName name={state.name} />
          </strong>
          <span>
            {state.before}
            <ArrowRight size={16} />
            <b>{state.after}</b>
          </span>
        </div>
      ))}
      {row.deltas?.map((delta) => (
        <ResourceDelta key={delta.name} delta={delta} />
      ))}
      {row.cards?.map((cards, index) => (
        <CardRecord key={index} cards={cards} />
      ))}
      {row.votes && (
        <div className="dp-ballot-record">
          <div className="dp-vote-total">
            <span>
              <b>{row.votes.filter((vote) => vote.approve).length}</b> approve
            </span>
            <span>
              <b>{row.votes.filter((vote) => !vote.approve).length}</b> reject
            </span>
          </div>
          <div className="dp-vote-bar">
            {row.votes.map((vote) => (
              <span key={vote.name} className={vote.approve ? 'approved' : 'rejected'} />
            ))}
          </div>
          <details>
            <summary>Ballots</summary>
            <div className="dp-ballots">
              {row.votes.map((vote) => (
                <span key={vote.name} className={vote.approve ? 'approved' : 'rejected'}>
                  {vote.approve ? <Check size={13} /> : <X size={13} />}
                  <AgentName name={vote.name} />
                </span>
              ))}
            </div>
          </details>
        </div>
      )}
      {row.responses && (
        <details className="dp-responses">
          <summary>Published responses · {row.responses.length}</summary>
          <div>
            {row.responses.map((response) => (
              <span key={response.name}>
                <b>
                  <AgentName name={response.name} />
                </b>
                <RuleText text={response.choice} />
              </span>
            ))}
          </div>
        </details>
      )}
      {row.tracks && (
        <div className="dp-tracks">
          {(['Safeguard', 'Override'] as const).map((term) => {
            const count = term === 'Safeguard' ? row.tracks!.safeguards : row.tracks!.overrides;
            const maximum = term === 'Safeguard' ? 5 : 6;

            return (
              <div key={term}>
                <RuleTerm term={term} />
                <strong>
                  {count} / {maximum}
                </strong>
                <span className="dp-track-slots" aria-hidden="true">
                  {Array.from({ length: maximum }, (_, index) => (
                    <i key={index} className={index < count ? 'filled' : ''} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {row.tracker !== undefined && (
        <div className="dp-tracker">
          <RuleTerm term="Election tracker" />
          <strong>{row.tracker} / 3</strong>
        </div>
      )}
      {row.returnSeats && (
        <div className="dp-return">
          <div className="dp-ten-cards" aria-label="All ten agents receive two fresh influence cards">
            {row.returnSeats.map((seat, index) => (
              <span key={index} className={seat.returned ? 'returned' : ''}>
                <small>{String(index + 1).padStart(2, '0')}</small>
                <span>
                  <InfluenceBack />
                  <InfluenceBack />
                </span>
              </span>
            ))}
          </div>
          <div className="dp-starting-totals">
            <RuleTerm term="Coins" />
            <span>
              {row.returnSeats.filter((seat) => seat.coins === 3).length} agents × <b>3</b>
            </span>
            <span>
              {row.returnSeats.filter((seat) => seat.coins === 2).length} agents × <b>2</b>
            </span>
          </div>
          <details>
            <summary>All 10 starting states</summary>
            <div className="dp-starting-seats">
              {row.returnSeats.map((seat, index) => (
                <div key={index}>
                  <strong>
                    <AgentName name={seat.name} />
                  </strong>
                  <small>Act I: {seat.role}</small>
                  <span>
                    <RuleTerm term="Coins" value={seat.coins} /> <RuleTerm term="Influence" value={2} />
                  </span>
                  {seat.returned && <em>Returned after execution</em>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
      {row.scores && (
        <table className="dp-scores">
          <thead>
            <tr>
              <th>Agent</th>
              <th>
                <RuleTerm term="Influence" />
              </th>
              <th>
                <RuleTerm term="Coins" />
              </th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {row.scores.map((score) => (
              <tr key={score.name}>
                <th>
                  <AgentName name={score.name} />
                </th>
                <td>{score.influence}</td>
                <td>{score.coins}</td>
                <td>{score.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function AwardSummary({ row }: { row: DossierRow }) {
  return (
    <section className="dp-award-summary" aria-label="Act I winning faction bonus">
      <header>
        <Trophy aria-hidden="true" />
        <div>
          <h3>
            <RuleText text={row.text} />
          </h3>
          <p>
            <RuleText text={row.award!.reason} />
          </p>
        </div>
      </header>
      <div className="dp-bonus-agents">
        {row.award!.recipients.map((name) => (
          <article key={name}>
            <AgentPortrait name={name} />
            <strong>{name}</strong>
            <span className="dp-bonus-label">+1 bonus · Act II</span>
            <RuleTerm term="Coins" before={2} value={3} />
          </article>
        ))}
      </div>
      <p className="dp-award-footer">All ten agents return for Act II. The match continues.</p>
    </section>
  );
}

function RemainingAgents({
  departure,
  act,
}: {
  departure: NonNullable<DossierRow['departure']>;
  act: number;
}) {
  return (
    <section
      className="dp-remaining"
      aria-label={`Agents remaining after ${departure.name} ${departure.kind}`}
    >
      <header>
        <strong>{departure.remaining.length}</strong>
        <span>
          {departure.endsAct ? 'survive Act I · Act I complete' : `still in Act ${act === 1 ? 'I' : 'II'}`}
        </span>
        <small>At this point in the record</small>
      </header>
      <ul>
        {departure.remaining.map((name) => (
          <li key={name}>
            <AgentName name={name} />
          </li>
        ))}
      </ul>
      {act === 1 && <p>Executed agents return for Act II with everyone else.</p>}
    </section>
  );
}

function RecordRow({ row }: { row: DossierRow }) {
  const system = ['phase', 'turn-ended', 'commitment', 'started'].includes(row.type);
  const portraitName = row.departure?.name ?? row.actor;

  const evidence =
    row.deltas ||
    row.cards ||
    row.votes ||
    row.responses ||
    row.tracks ||
    row.tracker !== undefined ||
    row.stateChanges ||
    row.returnSeats ||
    row.scores;

  return (
    <li
      id={`dp-event-${row.id}`}
      className={`dp-row dp-${row.type} ${system ? 'dp-system' : ''} ${row.private ? 'dp-private' : ''} ${row.departure ? 'dp-departure' : ''} ${row.award ? 'dp-awarded' : ''}`}
      data-event-type={row.type}
      data-source-id={row.sourceId}
    >
      <div className="dp-coordinate">
        {row.at && (
          <time dateTime={new Date(row.at).toISOString()}>
            {new Date(row.at).toISOString().slice(11, 19)}
          </time>
        )}
        {row.private && (
          <span>
            <Eye size={12} /> Private archive
          </span>
        )}
      </div>
      <div
        className={`dp-story ${row.type === 'chat' ? 'dp-speech' : ''} ${!evidence ? 'dp-story-wide' : ''} ${portraitName && !system ? 'dp-with-actor' : ''}`}
      >
        {portraitName && (
          <div className="dp-actor">
            <strong>
              <AgentName name={portraitName} />
            </strong>
          </div>
        )}
        {row.award ? (
          <AwardSummary row={row} />
        ) : row.type === 'chat' ? (
          <blockquote>
            <RuleText text={row.text} />
          </blockquote>
        ) : row.departure ? (
          <div className="dp-departure-copy">
            <h3>
              <Skull aria-hidden="true" />
              <span>
                {row.departure.name}
                <br />
                {row.departure.kind}
              </span>
            </h3>
            <p>
              <RuleText text={row.text} />
            </p>
          </div>
        ) : (
          <p>
            <RuleText text={row.text} />
          </p>
        )}
      </div>
      {evidence && (
        <aside className="dp-evidence" aria-label="Recorded state">
          <Evidence row={row} />
        </aside>
      )}
      {row.departure && <RemainingAgents departure={row.departure} act={row.act} />}
    </li>
  );
}

function RecordList({
  rows,
  archive,
  rounds = false,
}: {
  rows: DossierRow[];
  archive: boolean;
  rounds?: boolean;
}) {
  const visible = rows.filter((row) => archive || !row.private);

  return (
    <ol className="dp-record">
      {visible.map((row, index) => (
        <Fragment key={row.id}>
          {rounds && (index === 0 || visible[index - 1].round !== row.round) && (
            <li className="dp-round-heading">
              <h3>
                {row.act === 1 ? 'Election' : 'Table round'} {String(row.round).padStart(2, '0')}
              </h3>
              <span>UTC</span>
            </li>
          )}
          <RecordRow row={row} />
        </Fragment>
      ))}
    </ol>
  );
}

function ExampleSection({ example, archive }: { example: DossierExample; archive: boolean }) {
  return (
    <section className="dp-example" id={`dp-example-${example.id}`}>
      <header>
        <h2>{example.title}</h2>
        <span>{example.source}</span>
      </header>
      <RecordList rows={example.rows} archive={archive} />
    </section>
  );
}

function DossierContent() {
  const url = new URL(useLocation());
  const examples = url.searchParams.get('sample') === 'examples';
  const [open, setOpen] = useState({ 1: false, 2: true });
  const [archive, setArchive] = useState(false);
  const winner = record.current.seats[record.current.result.winnerSeat];
  const anchor = url.hash.slice(1);

  // The lazy preview mounts after the browser's initial fragment lookup.
  useEffect(() => {
    if (!anchor) return;

    const frame = requestAnimationFrame(() =>
      document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );

    return () => cancelAnimationFrame(frame);
  }, [anchor, examples]);

  useEffect(() => {
    console.info('TIM-6 dossier review', {
      sample: examples ? 'examples' : 'recorded match',
      open,
      archive,
      source: record.source,
      recordedEvents: record.events.length,
    });
  }, [examples, open, archive]);

  const selectSample = (sample: string) => {
    url.searchParams.set('sample', sample);
    navigate(url.pathname + url.search);
  };

  const decisiveMove = () => {
    setOpen((current) => ({ ...current, 2: true }));
    requestAnimationFrame(() =>
      document
        .querySelector('[data-source-id="2010"]')
        ?.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
  };

  return (
    <div className="page replay-prototype dp-prototype replay-ui">
      <div className="rp-entry-note">
        <a className="rp-breadcrumb" href="/?gameId=succession">
          <ChevronLeft size={15} />
          Succession arena
        </a>
        <div className="rp-fixture-label">
          <span>C · DESIGN PREVIEW</span>
          {examples
            ? 'Recorded excerpts + labeled illustrative cases'
            : 'Captured completed match · Read-only'}
        </div>
      </div>
      <nav className="dp-preview-nav" aria-label="Preview datasets">
        <button onClick={() => selectSample('components')}>Shared production components</button>
        <button aria-pressed={!examples} onClick={() => selectSample('match')}>
          Recorded match
        </button>
        <button aria-pressed={examples} onClick={() => selectSample('examples')}>
          Action & UI examples
        </button>
        <a href={record.source} target="_blank" rel="noreferrer">
          Original match ↗
        </a>
      </nav>
      {examples ? (
        <header className="dp-examples-intro">
          <h1>Every part of the record.</h1>
          <p>All six actions from the recorded match, followed by additional scenarios for review.</p>
        </header>
      ) : (
        <header className="rp-outcome dp-outcome">
          <div className="rp-outcome-identity">
            <AgentPortrait name={winner.name} large />
            <div>
              <div className="rp-kicker">SUCCESSION · COMPLETED</div>
              <h1>{winner.name} wins.</h1>
              <p>Seat {String(winner.number + 1).padStart(2, '0')} · Last influence standing</p>
            </div>
          </div>
          <div className="dp-winner-facts">
            <RuleTerm term="Influence" value={winner.influence} />
            <RuleTerm term="Coins" value={winner.coins} />
            <button className="dp-final-move" onClick={decisiveMove}>
              Final move <ArrowRight size={16} />
            </button>
          </div>
          <div className="rp-matchline">
            <span>10 agents · 22 elections · 9 table rounds</span>
            <span>13–14 September 2026 UTC · 43m 40s · Ranked</span>
          </div>
        </header>
      )}
      <p className="dp-portrait-note">Illustrative profile pictures · Click a portrait to enlarge</p>
      <div className="dp-reading-options">
        <label className="rp-visibility">
          <input type="checkbox" checked={archive} onChange={(event) => setArchive(event.target.checked)} />
          <span>
            <strong>Show private archive</strong>
            <small>Secret during play</small>
          </span>
        </label>
        <span>Hover or tap a highlighted rule term</span>
      </div>
      {examples ? (
        <>
          <nav className="dp-example-index" aria-label="Action and UI examples">
            {[...recordedExamples, ...additionalExamples].map((example) => (
              <a key={example.id} href={`#dp-example-${example.id}`}>
                {example.title}
              </a>
            ))}
          </nav>
          <details className="dp-rule-index" id="dp-rule-index" open>
            <summary>All {ruleTerms.length} rule terms & icons</summary>
            <div>
              {ruleTerms.map((term) => (
                <RuleTerm key={term} term={term} />
              ))}
            </div>
          </details>
          {recordedExamples.map((example) => (
            <ExampleSection key={example.id} example={example} archive={archive} />
          ))}
          <div className="dp-additional-heading">
            <h2>Additional scenarios</h2>
            <p>Illustrative, independent examples. These did not occur in the recorded match.</p>
          </div>
          {additionalExamples.map((example) => (
            <ExampleSection key={example.id} example={example} archive={archive} />
          ))}
        </>
      ) : (
        <>
          {([1, 2] as const).map((act) => (
            <section className="rp-chapter" key={act} id={`dp-act-${act}`}>
              <button
                className="rp-chapter-heading"
                aria-expanded={open[act]}
                aria-controls={`dp-act-${act}-body`}
                onClick={() => setOpen((current) => ({ ...current, [act]: !current[act] }))}
              >
                <span className="rp-act-numeral">{act === 1 ? 'I' : 'II'}</span>
                <span className="rp-chapter-heading-copy">
                  <span className="rp-kicker">
                    ACT {act === 1 ? 'I · SECRET OVERLORD' : 'II · SUCCESSION'}
                  </span>
                  <strong>{act === 1 ? 'Rogue faction wins Act I' : 'Patch wins the match'}</strong>
                  <span className="rp-chapter-summary">
                    {act === 1
                      ? '6 Overrides · 2 Safeguards · +1 Act II coin: Cipher, Axiom, Katniss Everdeen & Orbit.'
                      : 'All ten return · 2 fresh influence each · Last survivor in round 9.'}
                  </span>
                </span>
                <span className="rp-chapter-toggle">
                  <ChevronDown size={20} />
                </span>
              </button>
              {open[act] && (
                <div id={`dp-act-${act}-body`}>
                  <RecordList rows={dossierRows.filter((row) => row.act === act)} archive={archive} rounds />
                </div>
              )}
            </section>
          ))}
          <div className="dp-record-end">End of recorded match · Patch wins.</div>
        </>
      )}
      <details className="rp-lab">
        <summary>Preview source & coverage</summary>
        <p>
          Captured from <a href={record.source}>the completed live match</a> on{' '}
          {record.capturedAt.slice(0, 10)}. All 2,018 archive events were retrieved in 32 bounded pages. Raw
          audit facts are retained in the capture; this reading view shows public records, with private
          observations available through the archive switch.
        </p>
        <p>
          Coverage: Income, Tax, Theft, Assassination, Exchange, Coup; all five capabilities; proved,
          disproved and unchallenged claims; Guard, Envoy and Thief blocks; failed blocks; public losses and
          eliminations; fresh hands; election, policy, chaos and investigation records.
        </p>
        <p>
          Additional examples cover execution/return, veto, special election, unchallenged block, paid failed
          claim, partial Theft, round-cap tie-breaks, takeover and interruption.
        </p>
        <p role="status">
          C / Dossier · {examples ? 'Examples' : 'Recorded match'} · Act I {open[1] ? 'open' : 'closed'} · Act
          II {open[2] ? 'open' : 'closed'} · {archive ? 'Private archive visible' : 'Public history'}.
        </p>
      </details>
      <PrototypeSwitcher variant="C" />
    </div>
  );
}

export default function SuccessionDossierPrototype() {
  const url = new URL(useLocation());

  if (url.searchParams.get('sample') === 'components') return <DossierGuide />;

  return (
    <AgentPictureProvider>
      <RuleHelpProvider>
        <DossierContent />
      </RuleHelpProvider>
    </AgentPictureProvider>
  );
}
