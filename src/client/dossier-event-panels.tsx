import type { StoryChange, StoryRow, StoryValue, StoryEntrant } from './succession-story-types';
import type { DossierEntrants } from './dossier-summary';
import { DossierCard } from './dossier-cards';
import { dossierName, dossierValue, DossierIdentity } from './dossier-identity';
import { DossierRule } from './dossier-rules';
import { unavailableEntrant } from './dossier-summary';

function eventEntrant(row: StoryRow, entrants: DossierEntrants, seat: number): StoryValue<StoryEntrant> {
  return (
    row.affected.find((change) => change.seat === seat)?.after.entrant ??
    entrants.get(seat) ??
    unavailableEntrant
  );
}

function DossierEventChange({ change, act }: { change: StoryChange; act: 1 | 2 }) {
  const alive = dossierValue(change.after.alive);

  return (
    <section
      className="dossier-event-change"
      aria-label={`${dossierName(change.after.entrant, change.seat)} public resources`}
    >
      <strong>
        <DossierIdentity entrant={change.after.entrant} seat={change.seat} compact />
      </strong>
      {act === 2 && (
        <div className="dossier-resources">
          <DossierRule
            rule="coins"
            before={dossierValue(change.before.coins) ?? null}
            value={dossierValue(change.after.coins) ?? null}
          />
          <DossierRule
            rule="influence"
            before={dossierValue(change.before.influence) ?? null}
            value={dossierValue(change.after.influence) ?? null}
          />
        </div>
      )}
      {alive === false && (
        <small className="dossier-status">
          {act === 1 ? 'Executed · returns for Act II' : 'Eliminated · coins frozen'}
        </small>
      )}
    </section>
  );
}

const lossReasons = {
  'failed-claim': 'Claim disproved',
  'failed-challenge': 'Challenge failed',
  'action-effect': 'Action effect',
} as const;

/** True when this component replaces both the ordinary fact and affected-resource blocks. */
export function hasDossierEventPanel(row: StoryRow) {
  return row.fact.kind === 'proof' || row.fact.kind === 'influence-lost';
}

/**
 * A public proof or loss and its source-time resource changes in one box.
 * It deliberately renders no hand data, so adding it to a public row cannot disclose private cards.
 */
export function DossierEventPanel({ row, entrants }: { row: StoryRow; entrants: DossierEntrants }) {
  if (!hasDossierEventPanel(row)) return null;

  const fact = row.fact;

  if (fact.kind !== 'proof' && fact.kind !== 'influence-lost') return null;

  const actor = dossierValue(row.actor);
  const owner = actor == null ? 'Agent' : dossierName(eventEntrant(row, entrants, actor), actor);
  const lossReason = dossierValue(row.lossReason);
  const loss = fact.kind === 'influence-lost';

  return (
    <section
      className={`dossier-event-panel ${loss && fact.eliminated ? 'dossier-event-panel-eliminated' : ''}`}
      aria-label={`${owner} ${loss ? 'public influence loss' : 'public proof'}`}
    >
      <div className="dossier-event-changes">
        {row.affected.map((change) => (
          <DossierEventChange key={change.seat} change={change} act={row.position.act} />
        ))}
      </div>
      <div className="dossier-event-card-detail">
        <small>
          {owner} · {loss ? 'Public loss' : 'Public proof'}
        </small>
        <DossierCard capability={fact.capability} state={loss ? 'lost' : 'revealed'} />
        {loss && lossReason && <p>{lossReasons[lossReason]}</p>}
      </div>
    </section>
  );
}
