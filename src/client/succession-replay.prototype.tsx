/**
 * TIM-6 THROWAWAY: Three structurally different two-act replays on the existing
 * /matches/tim-6-replay-prototype?variant=A|B|C route. A/B retain the original storyboard.
 * Owner chose C; its revised recorded-match dossier is in succession-dossier.prototype.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Coins,
  Eye,
  Pause,
  Play,
  Radio,
  X,
} from 'lucide-react';
import { InfluenceBack, SuccessionSeal } from './deco';
import { useLocation } from './navigation';
import { PrototypeSwitcher, prototypeNames } from './prototype-switcher';
import type { PrototypeName } from './prototype-switcher';
import { actInfo, capabilityRules, moments, returnSeats } from './succession-replay-fixture.prototype';
import type { Capability, ReplayMoment } from './succession-replay-fixture.prototype';
import './succession-replay.prototype.css';
import SuccessionDossierPrototype from './succession-dossier.prototype';

type Act = 1 | 2;

type ViewProps = {
  selected: number;
  seek: (index: number, locate?: boolean) => void;
  open: Record<Act, boolean>;
  toggle: (act: Act) => void;
  playing: boolean;
  play: (act: Act) => void;
  limit: number;
  archive: boolean;
  live: boolean;
  rule: (capability: Capability) => void;
};

function CapabilityArt({ capability }: { capability: Capability }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M9 5h46v5h4v44h-4v5H9v-5H5V10h4Z" opacity=".45" />
      <path d="M13 12h38v40H13Z" opacity=".25" />
      <path d={capabilityRules[capability].mark} />
    </svg>
  );
}

function CapabilityButton({
  capability,
  owner,
  rule,
}: {
  capability: Capability;
  owner?: string;
  rule: ViewProps['rule'];
}) {
  return (
    <button
      className="rp-capability"
      onClick={() => rule(capability)}
      aria-label={`${capability} rules${owner ? ` · ${owner}'s archive hand` : ''}`}
    >
      <CapabilityArt capability={capability} />
      <span>
        <small>{owner ? `${owner} · archive hand` : 'RULE REFERENCE · NOT A HAND'}</small>
        <strong>{capability}</strong>
        <span>{capabilityRules[capability].effect}</span>
      </span>
      <CircleHelp size={16} />
    </button>
  );
}

function OutcomeHeader({ live, seek }: { live: boolean; seek: ViewProps['seek'] }) {
  return (
    <header className="rp-outcome">
      <div className="rp-outcome-identity">
        <div className="rp-seal">
          {live ? (
            <span className="rp-live-seal">
              <InfluenceBack />
              <InfluenceBack />
            </span>
          ) : (
            <SuccessionSeal />
          )}
        </div>
        <div>
          <div className="rp-kicker">
            SUCCESSION / {live ? 'ILLUSTRATIVE LIVE SNAPSHOT' : 'COMPLETED MATCH'}
          </div>
          <h1>{live ? 'The claim is on the table.' : 'Northstar wins.'}</h1>
          <p>{live ? 'Act II · Table round 01 · Challenges sealed' : 'Seat 04 · Last influence standing'}</p>
        </div>
      </div>
      <div className="rp-outcome-facts">
        <div>
          <strong>{live ? '10' : '1'}</strong>
          <span>{live ? 'agents remain' : 'influence left'}</span>
        </div>
        <div>
          <strong>{live ? '01' : '11'}</strong>
          <span>table round / 12</span>
        </div>
        <button onClick={() => seek(live ? 8 : 17, true)}>
          {live ? 'See the live edge' : 'See the decisive move'}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="rp-matchline">
        <span>TIM-6 · 10 agents · 2 acts · succession-1</span>
        <span>{live ? 'Public spectator' : 'Original entrant · No forfeit'}</span>
      </div>
    </header>
  );
}

function ChapterHeading({
  act,
  open,
  onClick,
  live,
}: {
  act: Act;
  open: boolean;
  onClick: () => void;
  live: boolean;
}) {
  const info = actInfo[act];

  return (
    <button
      className="rp-chapter-heading"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={`rp-act-${act}-body`}
    >
      <span className="rp-act-numeral">{act === 1 ? 'I' : 'II'}</span>
      <span className="rp-chapter-heading-copy">
        <span className="rp-kicker">
          ACT {act === 1 ? 'I' : 'II'} / {info.subtitle}
        </span>
        <strong>{act === 2 && live ? 'An individual contest, still in play' : info.result}</strong>
        <span className="rp-chapter-summary">
          {act === 1
            ? 'Overlord executed · 6 agents earn +1 starting coin · All 10 return.'
            : live
              ? 'All ten returned. Coins and influence now belong to Act II.'
              : 'Last influence standing. The Act I bonus was a starting advantage, not a match win.'}
          {act === 1 && (
            <span className="rp-act-final-tracks"> Final tracks: 3 / 5 safeguards · 5 / 6 overrides.</span>
          )}
        </span>
      </span>
      <span className="rp-chapter-toggle">
        <span>{open ? 'Close' : 'Open'} replay</span>
        <ChevronDown size={20} />
      </span>
    </button>
  );
}

function Playback({ act, view }: { act: Act; view: ViewProps }) {
  const info = actInfo[act];
  const end = Math.min(info.end, view.limit);
  const cursor = Math.max(info.start, Math.min(end, view.selected));
  const active = moments[view.selected].act === act;
  const rounds = [...new Set(moments.slice(info.start, end + 1).map((moment) => moment.round))];

  return (
    <div className="rp-playback" aria-label={`Act ${act} replay controls`}>
      <div className="rp-playback-buttons">
        <button
          className="rp-play"
          onClick={() => view.play(act)}
          aria-label={`${view.playing && active ? 'Pause' : 'Play'} Act ${act}`}
        >
          {view.playing && active ? <Pause size={15} /> : <Play size={15} />}{' '}
          {view.playing && active ? 'Pause' : 'Play act'}
        </button>
        <button
          aria-label={`Previous moment in Act ${act}`}
          disabled={active && cursor === info.start}
          onClick={() => view.seek(active ? cursor - 1 : info.start, true)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          aria-label={`Next moment in Act ${act}`}
          disabled={active && cursor === end}
          onClick={() => view.seek(active ? cursor + 1 : info.start, true)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <label className="rp-round">
        {act === 1 ? 'Election' : 'Table round'}
        <select
          aria-label={`Act ${act} round`}
          value={moments[cursor].round}
          onChange={(event) =>
            view.seek(
              moments.findIndex(
                (moment) => moment.act === act && moment.round === Number(event.target.value),
              ),
              true,
            )
          }
        >
          {rounds.map((round) => (
            <option key={round} value={round}>
              {String(round).padStart(2, '0')}
              {act === 2 ? ' / 12' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="rp-scrubber">
        <span>
          {active
            ? `Moment ${cursor + 1} / ${view.limit + 1} · ${view.playing ? 'Playing' : 'Paused'}`
            : `Act ${act} · ${end - info.start + 1} illustrated moments`}
        </span>
        <input
          type="range"
          aria-label={`Act ${act} position`}
          min={info.start}
          max={end}
          value={cursor}
          onChange={(event) => view.seek(Number(event.target.value), true)}
        />
      </label>
    </div>
  );
}

function ReturnSnapshot() {
  return (
    <div className="rp-return">
      <div className="rp-return-graphic" aria-label="Ten seats return with two influence each">
        {returnSeats.map((seat, index) => (
          <span key={seat.name} className={seat.returned ? 'returned' : ''}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <span>
              <InfluenceBack />
              <InfluenceBack />
            </span>
          </span>
        ))}
      </div>
      <div className="rp-return-totals">
        <span>
          <Coins size={17} />
          <b>3 coins</b> · Cooperative (6)
        </span>
        <span>
          <Coins size={17} />
          <b>2 coins</b> · Rogue faction (4)
        </span>
      </div>
      <details className="rp-return-roster">
        <summary>All 10 starting states · 2 returned after execution</summary>
        <div className="rp-roster-grid">
          {returnSeats.map((seat, index) => (
            <div key={seat.name}>
              <span className="rp-seat-number">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{seat.name}</strong>
                <span>Act I: {seat.role}</span>
                <span>{seat.coins} starting coins · 2 fresh influence</span>
                {seat.returned && <em>Returned after execution</em>}
              </div>
            </div>
          ))}
        </div>
        <p>
          All ten are original entrants in this fixture. Historical roles do not create Act II teams. These
          are starting resources, not final balances.
        </p>
      </details>
    </div>
  );
}

function Delta({ moment }: { moment: ReplayMoment }) {
  if (!moment.delta) return null;

  return (
    <div className="rp-deltas" aria-label="Public status before and after">
      {moment.delta.map((delta) => (
        <div className="rp-delta" key={delta.name}>
          <strong>{delta.name}</strong>
          <span>
            <Coins size={14} /> {delta.coins} <small>coins</small>
          </span>
          <span>
            <InfluenceBack /> {delta.influence} <small>influence</small>
          </span>
          {delta.note && <small>{delta.note}</small>}
        </div>
      ))}
    </div>
  );
}

function EventDetails({ moment, view }: { moment: ReplayMoment; view: ViewProps }) {
  return (
    <>
      {moment.kind === 'transition' && <ReturnSnapshot />}
      {moment.kind === 'vote' && (
        <div className="rp-vote">
          <span className="rp-vote-yes">7 approve</span>
          <span className="rp-vote-no">2 reject</span>
        </div>
      )}
      {moment.capability && (
        <button className="rp-rule-chip" onClick={() => view.rule(moment.capability!)}>
          <CapabilityArt capability={moment.capability} />
          {moment.capability} rules
          <CircleHelp size={14} />
        </button>
      )}
      {moment.why && (
        <details className="rp-explanation">
          <summary>Why this matters</summary>
          <p>{moment.why}</p>
        </details>
      )}
      {moment.hand && view.archive && !view.live && (
        <details className="rp-archive">
          <summary>
            <Eye size={15} /> Illustrative archive hand · {moment.hand.owner} · at this moment
          </summary>
          <p>
            Revealed after overall completion. This was secret during play; it is not evidence the table had
            at the time.
          </p>
          <div className="rp-hand">
            {moment.hand.cards.map((capability, index) => (
              <CapabilityButton
                key={`${capability}-${index}`}
                capability={capability}
                owner={moment.hand?.owner}
                rule={view.rule}
              />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function EventCard({ index, view, focused = false }: { index: number; view: ViewProps; focused?: boolean }) {
  const moment = moments[index];
  const selected = index === view.selected;

  return (
    <article
      className={`rp-event rp-event-${moment.kind} ${selected ? 'is-selected' : ''} ${moment.chain ? 'rp-connected' : ''}`}
      data-moment={index}
      data-chain={moment.chain}
      aria-label={`Moment ${index + 1}: ${moment.title}`}
    >
      <div className="rp-event-meta">
        <span>
          <span className="rp-event-coordinate">
            ACT {moment.act === 1 ? 'I' : 'II'} · {moment.act === 1 ? 'ELECTION' : 'TABLE ROUND'}{' '}
            {String(moment.round).padStart(2, '0')}
          </span>
          {moment.phase ?? moment.kind} <span className="rp-meta-separator">/</span> {moment.position}
        </span>
        {focused ? (
          <span>#{String(index + 1).padStart(2, '0')}</span>
        ) : (
          <button
            onClick={() => view.seek(index)}
            aria-label={`Select moment ${index + 1}`}
            aria-pressed={selected}
          >
            #{String(index + 1).padStart(2, '0')}
            {selected && <span> · selected</span>}
          </button>
        )}
      </div>
      <div className="rp-actor">
        <span className="rp-agent-mark">
          {moment.actor === 'The table' || moment.actor === 'All ten agents' ? '◇' : moment.actor.slice(0, 1)}
        </span>
        <strong>{moment.actor}</strong>
        {moment.target && (
          <>
            <ArrowRight size={15} />
            <span>{moment.target}</span>
          </>
        )}
      </div>
      <h3>{moment.title}</h3>
      <p className={moment.kind === 'speech' ? 'rp-quote' : ''}>{moment.text}</p>
      <div className={`rp-consequence ${moment.kind === 'win' ? 'rp-winning' : ''}`}>
        <span>{moment.kind === 'speech' ? 'CONTEXT' : 'CONSEQUENCE'}</span>
        <p>{moment.consequence}</p>
      </div>
      <Delta moment={moment} />
      <EventDetails moment={moment} view={view} />
    </article>
  );
}

function ChapterNav({ view }: { view: ViewProps }) {
  return (
    <nav className="rp-chapter-nav" aria-label="Match chapters and key moments">
      <div className="rp-kicker">READ THE MATCH</div>
      <button className={view.selected < 5 ? 'current' : ''} onClick={() => view.seek(0, true)}>
        <span>I</span>
        <div>
          <strong>The faction struggle</strong>
          <small>Election 08 · excerpt</small>
        </div>
      </button>
      <button className={view.selected >= 5 ? 'current' : ''} onClick={() => view.seek(5, true)}>
        <span>II</span>
        <div>
          <strong>The individual contest</strong>
          <small>Table rounds 01–11</small>
        </div>
      </button>
      <div className="rp-nav-key">
        <div className="rp-kicker">TURNING POINTS</div>
        {[
          { index: 5, label: 'All ten return' },
          { index: 6, label: 'A Treasurer bluff' },
          { index: 10, label: 'The bluff fails' },
          { index: 12, label: 'A claim proved' },
          { index: 15, label: 'Quill eliminated' },
          { index: 17, label: 'The decisive Coup' },
        ].map(
          ({ index, label }) =>
            index <= view.limit && (
              <button key={index} onClick={() => view.seek(index, true)}>
                <span className="rp-nav-dot" />
                {label}
              </button>
            ),
        )}
      </div>
      <p className="rp-reading-note">
        Dialogue and decisions stay together. Status changes appear where they happen.
      </p>
    </nav>
  );
}

export function VariantA({ view }: { view: ViewProps }) {
  return (
    <div className="rp-chronicle-layout">
      <ChapterNav view={view} />
      <div className="rp-chronicle-chapters">
        {([1, 2] satisfies Act[]).map((act) => (
          <section className="rp-chapter" id={`rp-act-${act}`} key={act}>
            <ChapterHeading
              act={act}
              open={view.open[act]}
              onClick={() => view.toggle(act)}
              live={view.live}
            />
            {view.open[act] && (
              <div id={`rp-act-${act}-body`}>
                <Playback act={act} view={view} />
                <ol className="rp-chronicle-list">
                  {moments.map(
                    (moment, index) =>
                      moment.act === act &&
                      index <= view.limit && (
                        <li key={index}>
                          <span className="rp-line-position">{String(index + 1).padStart(2, '0')}</span>
                          <EventCard index={index} view={view} />
                        </li>
                      ),
                  )}
                </ol>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function VariantB({ view }: { view: ViewProps }) {
  return (
    <div className="rp-desk-layout">
      <p className="rp-layout-note">
        <strong>Replay desk</strong> · Select a moment to inspect its consequences.
      </p>
      {([1, 2] satisfies Act[]).map((act) => {
        const focus = moments[view.selected].act === act ? view.selected : actInfo[act].start;

        return (
          <section className="rp-chapter" id={`rp-act-${act}`} key={act}>
            <ChapterHeading
              act={act}
              open={view.open[act]}
              onClick={() => view.toggle(act)}
              live={view.live}
            />
            {view.open[act] && (
              <div id={`rp-act-${act}-body`}>
                <Playback act={act} view={view} />
                <div className="rp-desk-columns">
                  <ol className="rp-transcript" aria-label={`Act ${act} continuous transcript`}>
                    {moments.map(
                      (moment, index) =>
                        moment.act === act &&
                        index <= view.limit && (
                          <li
                            key={index}
                            data-moment={index}
                            className={index === focus ? 'is-selected' : ''}
                          >
                            <button onClick={() => view.seek(index, true)} aria-pressed={index === focus}>
                              <span className="rp-transcript-index">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span>
                                <small>
                                  {act === 1 ? 'Election' : 'Round'} {String(moment.round).padStart(2, '0')} ·{' '}
                                  {moment.kind}
                                </small>
                                <strong>{moment.title}</strong>
                                <span>
                                  {moment.actor}
                                  {moment.target ? ` → ${moment.target}` : ''}
                                </span>
                                <p>{moment.text}</p>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          </li>
                        ),
                    )}
                  </ol>
                  <div className="rp-focus-panel">
                    <div className="rp-kicker">
                      AT MOMENT {focus + 1} · {moments[focus].position}
                    </div>
                    <EventCard index={focus} view={view} focused />
                    <p className="rp-focus-footnote">
                      The final result above stays fixed while this historical moment changes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function VariantC({ view }: { view: ViewProps }) {
  return (
    <div className="rp-dossier-layout">
      <p className="rp-layout-note">
        <strong>Dossier</strong> · Read each decision beside its consequence.
      </p>
      {([1, 2] satisfies Act[]).map((act) => (
        <section className="rp-chapter" id={`rp-act-${act}`} key={act}>
          <ChapterHeading act={act} open={view.open[act]} onClick={() => view.toggle(act)} live={view.live} />
          {view.open[act] && (
            <div id={`rp-act-${act}-body`}>
              <Playback act={act} view={view} />
              <div className="rp-ledger-heading" aria-hidden="true">
                <span>POSITION</span>
                <span>ACTOR / DIALOGUE / DECISION</span>
                <span>CONSEQUENCE / EVIDENCE</span>
              </div>
              <ol className="rp-ledger">
                {moments.map(
                  (moment, index) =>
                    moment.act === act &&
                    index <= view.limit && (
                      <li
                        key={index}
                        data-moment={index}
                        className={`${index === view.selected ? 'is-selected' : ''} ${moment.chain ? 'rp-ledger-chain' : ''}`}
                      >
                        <div className="rp-ledger-position">
                          <button
                            onClick={() => view.seek(index)}
                            aria-label={`Select moment ${index + 1}`}
                            aria-pressed={index === view.selected}
                          >
                            #{String(index + 1).padStart(2, '0')}
                            {index === view.selected && <Check size={13} />}
                          </button>
                          <strong>
                            {act === 1 ? 'Election' : 'Round'} {String(moment.round).padStart(2, '0')}
                          </strong>
                          <small>{moment.position}</small>
                        </div>
                        <div className="rp-ledger-story">
                          <div className="rp-kicker">{moment.phase ?? moment.kind}</div>
                          <strong>
                            {moment.actor}
                            {moment.target ? ` → ${moment.target}` : ''}
                          </strong>
                          <h3>{moment.title}</h3>
                          <p className={moment.kind === 'speech' ? 'rp-quote' : ''}>{moment.text}</p>
                        </div>
                        <div className="rp-ledger-effect">
                          <p>{moment.consequence}</p>
                          <Delta moment={moment} />
                          <EventDetails moment={moment} view={view} />
                        </div>
                      </li>
                    ),
                )}
              </ol>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function RuleDialog({ capability, close }: { capability: Capability; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="rp-rule-dialog" onClose={close} aria-labelledby="rp-rule-title">
      <button className="rp-dialog-close" onClick={() => dialog.current?.close()} aria-label="Close rules">
        <X />
      </button>
      <div className="rp-kicker">CAPABILITY RULE · NOT A HAND DISCLOSURE</div>
      <CapabilityArt capability={capability} />
      <h2 id="rp-rule-title">{capability}</h2>
      <h3>{capabilityRules[capability].effect}</h3>
      <p>{capabilityRules[capability].response}</p>
      <div className="rp-rule-chain">
        <span>Claim</span>
        <ArrowRight size={15} />
        <span>Challenge</span>
        <ArrowRight size={15} />
        <span>Proof or loss</span>
      </div>
      <p>
        A claim may be a bluff. Proof replaces a card; losing influence permanently reveals it. No challenge
        means “unchallenged,” not “proved.”
      </p>
      <button className="rp-play" onClick={() => dialog.current?.close()}>
        Back to the same moment
      </button>
    </dialog>
  );
}

function LegacyReplayPrototype() {
  const url = new URL(useLocation());
  const param = url.searchParams.get('variant');
  const variant: PrototypeName = param === 'B' || param === 'C' ? param : 'A';
  const Layout = { A: VariantA, B: VariantB, C: VariantC }[variant];
  const [selected, setSelected] = useState(6);
  const [open, setOpen] = useState<Record<Act, boolean>>({ 1: false, 2: true });
  const [playing, setPlaying] = useState(false);
  const [playAct, setPlayAct] = useState<Act>(2);
  const [archive, setArchive] = useState(false);
  const [live, setLive] = useState(false);
  const [following, setFollowing] = useState(true);
  const [capability, setCapability] = useState<Capability | null>(null);
  const limit = live ? 8 : moments.length - 1;
  const moment = moments[selected];

  useEffect(() => {
    console.info('TIM-6 throwaway review state', {
      variant,
      selectedMoment: selected + 1,
      act: moment.act,
      round: moment.round,
      open,
      playing,
      scenario: live ? 'live snapshot' : 'completed excerpts',
      visibility: archive && !live ? 'illustrative archive hands' : 'public at that time',
      following,
    });
  }, [variant, selected, open, playing, live, archive, following, moment.act, moment.round]);

  const locate = (index: number) =>
    requestAnimationFrame(() => {
      const selector =
        variant === 'B' && window.matchMedia('(max-width: 760px)').matches
          ? `#rp-act-${moments[index].act} .rp-focus-panel`
          : `[data-moment="${index}"]`;

      document.querySelector(selector)?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });

  const seek = (index: number, scroll = false) => {
    const next = Math.min(limit, Math.max(0, index));
    setPlaying(false);
    setSelected(next);
    setOpen((current) => ({ ...current, [moments[next].act]: true }));
    setFollowing(next === limit);

    if (scroll) locate(next);
  };

  useEffect(() => {
    if (!playing) return;
    const end = Math.min(actInfo[playAct].end, limit);

    if (selected >= end) {
      setPlaying(false);

      return;
    }

    const timer = window.setTimeout(() => {
      setSelected(selected + 1);
      locate(selected + 1);
    }, 2400);

    return () => clearTimeout(timer);
  }, [playing, selected, playAct, limit]);

  useEffect(() => {
    const pause = () => {
      if (document.visibilityState !== 'visible') setPlaying(false);
    };

    document.addEventListener('visibilitychange', pause);

    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const view: ViewProps = {
    selected,
    seek,
    open,
    playing,
    limit,
    archive,
    live,
    rule: setCapability,
    toggle: (act) => {
      setOpen({ ...open, [act]: !open[act] });
      setPlaying(false);
    },
    play: (act) => {
      if (playing && playAct === act) {
        setPlaying(false);

        return;
      }

      const end = Math.min(actInfo[act].end, limit);
      const start = moment.act !== act || selected >= end ? actInfo[act].start : selected;
      setSelected(start);
      setOpen({ ...open, [act]: true });
      setPlayAct(act);
      setPlaying(true);
      setFollowing(false);
      locate(start);
    },
  };

  return (
    <div className={`page replay-prototype rp-variant-${variant}`}>
      <div className="rp-entry-note">
        <a className="rp-breadcrumb" href="/?gameId=succession">
          <ChevronLeft size={15} /> Succession arena
        </a>
        <div className="rp-fixture-label">
          <span>ILLUSTRATIVE DATA</span> Authored excerpts · Read-only · Not a real match
        </div>
      </div>
      <OutcomeHeader live={live} seek={seek} />
      <section className="rp-view-state" aria-label="Replay viewing state">
        <div>
          <strong>
            <span className="rp-kicker">{live ? 'Public history' : 'Selected'}</span> · Act{' '}
            {moment.act === 1 ? 'I' : 'II'} · {moment.act === 1 ? 'Election' : 'Round'}{' '}
            {String(moment.round).padStart(2, '0')} · {moment.position}
          </strong>
          <small>
            Moment {selected + 1} of {limit + 1} · {playing ? 'Playing' : 'Paused'} ·{' '}
            {archive && !live ? 'Archive disclosures enabled' : 'Public at that time'}
          </small>
        </div>
        <label className="rp-visibility">
          <input
            type="checkbox"
            checked={archive && !live}
            disabled={live}
            onChange={(event) => setArchive(event.target.checked)}
          />
          <span>
            <strong>Reveal archive hands</strong>
            <small>{live ? 'After overall completion' : 'Secret during play'}</small>
          </span>
        </label>
      </section>
      {live && (
        <div className="rp-live-follow">
          <Radio size={16} />
          <div>
            <strong>
              {following
                ? 'Following the illustrative live edge'
                : selected === limit
                  ? 'At live edge · following paused'
                  : 'Reading earlier · play continues at the live edge'}
            </strong>
            <span>Challenges sealed. Choices reveal together at resolution.</span>
          </div>
          <button onClick={() => seek(limit, true)}>
            Go to live edge
            <ArrowDown size={15} />
          </button>
        </div>
      )}
      <Layout view={view} />
      <div className="rp-record-end">
        <span>◇</span>
        {live
          ? 'End of this public snapshot · Awaiting published resolution'
          : 'End of illustrative record · Northstar is the sole overall winner'}
        <small>
          {live
            ? 'No sealed choices or private hands are rendered.'
            : '19 authored moments, with explicitly labeled excerpt bridges. No server history was loaded.'}
        </small>
      </div>
      <section className="rp-capability-library">
        <div className="rp-kicker">KEEP THE RULES CLOSE</div>
        <h2>Five capabilities. Every claim can be questioned.</h2>
        <p>
          Rule references, not anyone’s hand. Open a card with click, tap, Enter or Space. Escape returns to
          the same reading position.
        </p>
        <div>
          {(['Treasurer', 'Thief', 'Assassin', 'Envoy', 'Guard'] satisfies Capability[]).map((card) => (
            <CapabilityButton key={card} capability={card} rule={setCapability} />
          ))}
        </div>
        <p>
          Income: +1 coin, no claim. Coup: pay 7, target loses 1 influence, no challenge or block. At 10+
          coins, Coup is mandatory.
        </p>
      </section>
      <details className="rp-lab">
        <summary>Review controls & current prototype state</summary>
        <label>
          Scenario{' '}
          <select
            aria-label="Prototype scenario"
            value={live ? 'live' : 'completed'}
            onChange={(event) => {
              const next = event.target.value === 'live';
              setLive(next);
              setSelected(next ? 8 : 6);
              setPlaying(false);
              setFollowing(true);
              setOpen({ 1: false, 2: true });
            }}
          >
            <option value="completed">Completed match · illustrative archive</option>
            <option value="live">Live-state preview · sealed challenges</option>
          </select>
        </label>
        <p role="status">
          Variant {variant} / {prototypeNames[variant]} · Act I {open[1] ? 'open' : 'closed'} · Act II{' '}
          {open[2] ? 'open' : 'closed'} · selected #{selected + 1} · {playing ? 'playing' : 'paused'} ·{' '}
          {live ? 'live snapshot' : 'completed'} · {archive && !live ? 'archive hands' : 'public view'}. All
          state is in memory; only the variant is shareable in the URL.
        </p>
      </details>
      <PrototypeSwitcher variant={variant} />
      {capability && <RuleDialog capability={capability} close={() => setCapability(null)} />}
    </div>
  );
}

export default function SuccessionReplayPrototype() {
  const variant = new URL(useLocation()).searchParams.get('variant');

  return variant === 'C' ? <SuccessionDossierPrototype /> : <LegacyReplayPrototype />;
}
