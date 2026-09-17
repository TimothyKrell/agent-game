import type { Capability } from '../shared/succession';
import type { StoryChange, StoryHand, StorySeat, StoryValue } from './succession-story-types';
import { InfluenceBack } from './deco';
import { dossierName, dossierValue, DossierIdentity } from './dossier-identity';
import { DossierRule } from './dossier-rules';
import { storyRules } from './succession-story-rules';

/** Archive preference applies at every nested value, independently from public row visibility. */
export function dossierVisible(
  visibility: 'public' | 'private' | 'archive' | 'unavailable',
  archive: boolean,
) {
  return visibility === 'public' || visibility === 'private' || (visibility === 'archive' && archive);
}

export function DossierCard({
  capability,
  state,
}: {
  capability?: Capability;
  state: 'hidden' | 'known' | 'revealed' | 'lost';
}) {
  const label = {
    known: 'Secret during play',
    revealed: 'Proved · replaced, not lost',
    lost: 'Lost · publicly revealed',
    hidden: 'Hidden',
  }[state];

  return (
    <div className={`dossier-card dossier-card-${state}`}>
      {capability && state !== 'hidden' ? (
        <>
          <DossierRule rule={capability} />
          {state === 'known' && <small>{storyRules[capability][1]}</small>}
        </>
      ) : (
        <>
          <InfluenceBack />
          <strong>Secret capability</strong>
        </>
      )}
      <span>{label}</span>
    </div>
  );
}

function Hand({
  hand,
  owner,
  archive,
  influence,
  label = 'Hand',
}: {
  hand: StoryValue<StoryHand>;
  owner: string;
  archive: boolean;
  influence?: number;
  label?: string;
}) {
  const known = dossierValue(hand);
  const visible = known && dossierVisible(known.visibility, archive);

  return (
    <section className="dossier-hand" aria-label={`${owner} ${label.toLowerCase()}`}>
      <small>
        {owner} · {label} ·{' '}
        {visible
          ? known.visibility === 'archive'
            ? 'Private archive · secret during play'
            : 'Your private view'
          : 'Identities hidden'}
      </small>
      <div className="dossier-cards">
        {visible ? (
          known.cards.map((card) => <DossierCard key={card.id} capability={card.capability} state="known" />)
        ) : influence !== undefined ? (
          Array.from({ length: influence }, (_, index) => <DossierCard key={index} state="hidden" />)
        ) : (
          <span>Historical cards unavailable</span>
        )}
        {((visible && known.cards.length === 0) || (!visible && influence === 0)) && (
          <span>No remaining cards</span>
        )}
      </div>
    </section>
  );
}

export function DossierSeatCards({ seat, archive }: { seat: StorySeat; archive: boolean }) {
  const owner = dossierName(seat.entrant, seat.seat);
  const role = dossierValue(seat.role);
  const draw = dossierValue(seat.exchangeDraw);
  const revealed = dossierValue(seat.revealed);

  return (
    <>
      {role && dossierVisible(role.visibility, archive) && (
        <p className={role.visibility === 'public' ? '' : 'dossier-private-label'}>
          {owner} · Act I role ·{' '}
          {{ archive: 'Private archive', private: 'Your private view', public: 'Public' }[role.visibility]}:{' '}
          <DossierRule rule={role.role} />
        </p>
      )}
      <Hand hand={seat.hand} owner={owner} archive={archive} influence={dossierValue(seat.influence)} />
      {revealed && revealed.length > 0 && (
        <section className="dossier-public-losses" aria-label={`${owner} publicly lost cards`}>
          <small>{owner} · Publicly lost cards</small>
          <div className="dossier-cards">
            {revealed.map((capability, index) => (
              <DossierCard key={index} capability={capability} state="lost" />
            ))}
          </div>
        </section>
      )}
      {draw && dossierVisible(draw.visibility, archive) && draw.cards.length > 0 && (
        <Hand hand={seat.exchangeDraw} owner={owner} archive={archive} label="Exchange draw" />
      )}
    </>
  );
}

export function DossierResources({
  change,
  act,
  archive,
}: {
  change: StoryChange;
  act: 1 | 2;
  archive: boolean;
}) {
  const { before, after } = change;
  const controller = dossierValue(after.controller);
  const alive = dossierValue(after.alive);
  const name = dossierName(after.entrant, after.seat);
  const role = dossierValue(after.role);

  return (
    <section className="dossier-delta" aria-label={`${name} public resources`}>
      <strong>
        <DossierIdentity entrant={after.entrant} seat={after.seat} compact />
      </strong>
      {act === 2 && (
        <div className="dossier-resources">
          <DossierRule
            rule="coins"
            before={dossierValue(before.coins) ?? null}
            value={dossierValue(after.coins) ?? null}
          />
          <DossierRule
            rule="influence"
            before={dossierValue(before.influence) ?? null}
            value={dossierValue(after.influence) ?? null}
          />
        </div>
      )}
      {alive === false && (
        <p className="dossier-status">
          {act === 1 ? 'Executed · returns for Act II' : 'Eliminated · coins frozen'}
        </p>
      )}
      {controller?.forfeited && (
        <p className="dossier-status">
          Original entrant: forfeit loss ·{' '}
          {controller.house ? 'House-controlled seat' : 'Controller unavailable'}
          {dossierValue(controller.generation) !== undefined
            ? ` · Generation ${dossierValue(controller.generation)}`
            : ''}
        </p>
      )}
      {controller &&
        !controller.forfeited &&
        (controller.recoverable || (controller.recoveryCount ?? 0) > 0) && (
          <p className="dossier-status">
            {controller.recoverable
              ? 'House covering · original entrant can reconnect'
              : 'Original entrant reconnected'}
            {controller.recoveryCount !== undefined && controller.recoveryLimit !== undefined
              ? ` · ${controller.recoveryCount} of ${controller.recoveryLimit} recoveries used`
              : ''}
          </p>
        )}
      {act === 1 && role && dossierVisible(role.visibility, archive) && (
        <p className="dossier-private-label">
          {
            {
              public: 'Public Act I role',
              private: 'Your private Act I role',
              archive: 'Private archive · Act I role',
            }[role.visibility]
          }
          : <DossierRule rule={role.role} />
        </p>
      )}
    </section>
  );
}
