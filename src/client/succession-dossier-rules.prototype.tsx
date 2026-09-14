/** TIM-6 throwaway: inline rule vocabulary and small, anchored explanations. */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Struct } from 'effect';
import { ArrowRight, Coins, CircleHelp, Landmark, Shield, Skull, Swords, X } from 'lucide-react';
import { InfluenceBack } from './deco';
import { AgentText } from './succession-dossier-profiles.prototype';
import { capabilityRules } from './succession-replay-fixture.prototype';
import type { Capability } from './succession-replay-fixture.prototype';

const otherRules = {
  Coins: [
    'Pay for actions.',
    'Income gains 1 coin; Tax gains 3; Theft transfers up to 2. Assassination costs 3 and Coup costs 7. Paid costs are not refunded. At 10 or more coins, Coup is mandatory. Eliminated agents keep their frozen balance.',
  ],
  Influence: [
    'Each unrevealed capability card is 1 influence.',
    'Everyone starts Act II with 2 fresh cards. When you lose influence, choose a card to reveal permanently. At 0 you are eliminated. Proving a claim replaces the proved card; it does not cost influence.',
  ],
  Income: ['Gain 1 coin.', 'No capability claim or target. Income cannot be challenged or blocked.'],
  Tax: [
    'Claim Treasurer to gain 3 coins.',
    'Other living agents may challenge. A failed claim cancels the Tax. An unchallenged claim does not prove the agent holds Treasurer.',
  ],
  Theft: [
    'Claim Thief to take up to 2 coins from a target.',
    'The target may block with Thief or Envoy. Both the action claim and the block claim can be challenged.',
  ],
  Assassination: [
    'Claim Assassin and pay 3 coins.',
    'If the action resolves, the target chooses 1 influence to lose. The target may claim Guard to block. The cost remains spent if the claim fails or the action is blocked.',
  ],
  Exchange: [
    'Claim Envoy. Draw 2, then return exactly 2 cards.',
    'The claim can be challenged. Drawn and retained cards stay private during play. Public chat pauses during the private choice. The number of influence cards you keep does not change.',
  ],
  Coup: [
    'Pay 7 coins. The target loses 1 influence.',
    'No claim, challenge or block. At 10 or more coins, Coup is mandatory. The target chooses which card to lose.',
  ],
  Challenge: [
    'Question an action claim or a block claim.',
    'Living opponents submit challenge or pass in secret. Responses publish together; the first challenger clockwise from the original actor is selected. If the claim is proved, the challenger loses influence. Otherwise the claimant loses influence.',
  ],
  Block: [
    'The target claims a capability to stop an action.',
    'Thief or Envoy can block Theft; Guard can block Assassination. A block may be challenged. A proved or unchallenged block stops the action; a disproved block allows the action to continue if actor and target are still alive.',
  ],
  Safeguard: [
    'Five Safeguards win Act I for the cooperative faction.',
    'Policies are enacted by an elected government or by election chaos. An Act I faction victory awards a starting coin bonus, not the overall Succession victory.',
  ],
  Override: [
    'Six Overrides win Act I for the rogue faction.',
    'At ten seats, the first two Overrides grant an investigation, the third a special election, and the fourth and fifth an execution. Five Overrides unlock veto. After three Overrides, electing the Overlord as Executor also ends Act I. Chaos grants no executive power.',
  ],
  Veto: [
    'After five Overrides, the Executor may request a veto.',
    'The Coordinator accepts or rejects. Acceptance discards both remaining policies and advances the election tracker. Rejection requires the Executor to enact a policy.',
  ],
  'Election tracker': [
    'Three failed governments trigger chaos.',
    'A rejected government or accepted veto advances the tracker. At three, the top policy is enacted automatically, the tracker resets, and term limits clear. No executive power is awarded by chaos.',
  ],
  Execution: [
    'Remove an agent from the rest of Act I.',
    'The Coordinator chooses a living agent. Executing the Overlord ends Act I for the cooperative faction. All ten entrants return for Act II, including executed agents.',
  ],
  Investigation: [
    'Privately learn a target’s faction.',
    'The Coordinator learns cooperative or rogue allegiance, not the exact role. The result stays private during play; a public statement about it is a claim.',
  ],
  'Special election': [
    'Choose the next Coordinator for one election.',
    'After that election, ordinary Coordinator rotation resumes from the original position.',
  ],
  'Round cap': [
    'Act II ends after table round 12.',
    'Compare surviving influence, then coins, then the secret precommitted priority. The supplied decisive criterion determines the single mechanical winner. Eliminated ring positions are skipped, not renumbered.',
  ],
};

export type RuleTermName = Capability | keyof typeof otherRules;

function isCapability(term: RuleTermName): term is Capability {
  return term in capabilityRules;
}

export function RuleIcon({ term }: { term: RuleTermName }) {
  if (isCapability(term))
    return (
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 5h46v5h4v44h-4v5H9v-5H5V10h4Z" opacity=".45" />
        <path
          d={
            term === 'Thief'
              ? 'M14 25 24 22l8 3 8-3 10 3-2 13-8 5-8-6-8 6-8-5ZM19 29l9 2-4 5-5-2Zm26 0-9 2 4 5 5-2ZM14 27l-5-4m41 4 5-4'
              : capabilityRules[term].mark
          }
        />
      </svg>
    );

  if (term === 'Coins' || term === 'Income') return <Coins aria-hidden="true" />;

  if (term === 'Tax') return <Landmark aria-hidden="true" />;

  if (term === 'Theft') return <RuleIcon term="Thief" />;

  if (term === 'Assassination') return <RuleIcon term="Assassin" />;

  if (term === 'Exchange')
    return (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M7 12h10v15H7Zm8-7h10v15h-5M4 8h7l-3-3m3 3-3 3M28 24h-7l3-3m-3 3 3 3" />
      </svg>
    );

  if (term === 'Challenge') return <Swords aria-hidden="true" />;

  if (term === 'Influence') return <InfluenceBack />;

  if (term === 'Safeguard' || term === 'Block') return <Shield aria-hidden="true" />;

  if (term === 'Override' || term === 'Execution' || term === 'Coup') return <Skull aria-hidden="true" />;

  return <CircleHelp aria-hidden="true" />;
}

function ruleCopy(term: RuleTermName) {
  if (isCapability(term)) return [capabilityRules[term].effect, capabilityRules[term].response];

  return otherRules[term];
}

type Help = { term: RuleTermName; anchor: HTMLButtonElement; pinned: boolean };

const HelpContext = createContext({
  show: (_term: RuleTermName, _anchor: HTMLButtonElement, _pinned: boolean) => {},
  leave: () => {},
});

export function RuleTerm({
  term,
  children,
  value,
  before,
}: {
  term: RuleTermName;
  children?: ReactNode;
  value?: number;
  before?: number;
}) {
  const help = useContext(HelpContext);

  return (
    <button
      type="button"
      className={`dp-term ${term === 'Coins' ? 'dp-term-coins' : ''} ${value !== undefined ? 'dp-resource-term' : ''}`}
      data-rule-term={term}
      aria-label={`${children ?? term} rules`}
      aria-description={
        value === undefined
          ? undefined
          : `${before !== undefined && before !== value ? `${before} to ` : ''}${value} ${term}`
      }
      aria-haspopup="dialog"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') help.show(term, event.currentTarget, false);
      }}
      onPointerLeave={help.leave}
      onClick={(event) => help.show(term, event.currentTarget, true)}
    >
      {term === 'Influence' && value !== undefined ? (
        <span className="dp-influence-cards" aria-hidden="true">
          {[0, 1].map((index) => (
            <span key={index} className={index >= value ? 'is-lost' : ''}>
              <InfluenceBack />
            </span>
          ))}
        </span>
      ) : (
        <RuleIcon term={term} />
      )}
      {value !== undefined && (
        <span className="dp-numbers" aria-label={`${term}: ${before ?? value} to ${value}`}>
          {before !== undefined && before !== value && (
            <>
              <span>{before}</span>
              <ArrowRight size={13} />
            </>
          )}
          <b>{value}</b>
        </span>
      )}
      <span>{children ?? term}</span>
    </button>
  );
}

const terms: RuleTermName[] = [...Struct.keys(capabilityRules), ...Struct.keys(otherRules)];

const aliases = new Map(terms.map((term) => [term.toLowerCase(), term]));

aliases.set('coin', 'Coins');

aliases.set('safeguards', 'Safeguard');

aliases.set('overrides', 'Override');

aliases.set('challenges', 'Challenge');

const termPattern = new RegExp(
  `\\b(${[...aliases.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi',
);

export function RuleText({ text }: { text: string }) {
  return text.split(termPattern).map((part, index) => {
    const term = aliases.get(part.toLowerCase());

    return term ? (
      <RuleTerm key={index} term={term}>
        {part}
      </RuleTerm>
    ) : (
      <AgentText key={index} text={part} />
    );
  });
}

function HelpPopup({
  help,
  close,
  enter,
  leave,
}: {
  help: Help;
  close: () => void;
  enter: () => void;
  leave: () => void;
}) {
  const popup = useRef<HTMLDialogElement & HTMLDivElement>(null);
  const [effect, response] = ruleCopy(help.term);
  useLayoutEffect(() => {
    const element = popup.current;

    if (!element) return;

    if (help.pinned) element.showModal();
    const anchor = help.anchor.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, anchor.left))}px`;
    element.style.top = `${Math.max(12, Math.min(innerHeight - box.height - 12, anchor.bottom + 8))}px`;
  }, [help]);

  const body = (
    <>
      {help.pinned && (
        <button autoFocus className="dp-help-close" aria-label="Close rules" onClick={close}>
          <X size={18} />
        </button>
      )}
      <div className="dp-help-title">
        <RuleIcon term={help.term} />
        <h2 id="dp-rule-title">{help.term}</h2>
      </div>
      <strong>{effect}</strong>
      <p>{response}</p>
      <small>{help.pinned ? 'Rule reference' : 'Click to keep open'}</small>
    </>
  );

  return createPortal(
    help.pinned ? (
      <dialog
        ref={popup}
        className="dp-help"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          // This small reference dialog has one focusable control: its close button.
          if (event.key === 'Tab') {
            event.preventDefault();
            event.currentTarget.querySelector('button')?.focus();
          }
        }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();

          if (
            event.target === event.currentTarget &&
            (event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom)
          )
            close();
        }}
        aria-labelledby="dp-rule-title"
      >
        {body}
      </dialog>
    ) : (
      <div ref={popup} className="dp-help" role="tooltip" onPointerEnter={enter} onPointerLeave={leave}>
        {body}
      </div>
    ),
    document.body,
  );
}

export function RuleHelpProvider({ children }: { children: ReactNode }) {
  const [help, setHelp] = useState<Help | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverDismissed = useRef(false);

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const close = () => {
    enter();
    hoverDismissed.current = true;
    setHelp(null);

    if (help?.pinned) requestAnimationFrame(() => help.anchor.focus({ preventScroll: true }));
  };

  const leave = () => {
    enter();
    timer.current = setTimeout(() => setHelp((current) => (current?.pinned ? current : null)), 140);
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !help?.pinned) {
        hoverDismissed.current = true;
        setHelp(null);
      }
    };

    const pointerMoved = () => {
      hoverDismissed.current = false;
    };

    const scroll = () => setHelp((current) => (current?.pinned ? current : null));
    document.addEventListener('keydown', escape);
    document.addEventListener('pointermove', pointerMoved);
    window.addEventListener('scroll', scroll);

    return () => {
      enter();
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointermove', pointerMoved);
      window.removeEventListener('scroll', scroll);
    };
  }, [help?.pinned]);

  return (
    <HelpContext.Provider
      value={{
        show: (term, anchor, pinned) => {
          enter();

          if (!pinned && hoverDismissed.current) return;
          setHelp((current) => (current?.pinned && !pinned ? current : { term, anchor, pinned }));
        },
        leave,
      }}
    >
      {children}
      {help && (
        <HelpPopup
          key={help.pinned ? 'dialog' : 'hover'}
          help={help}
          close={close}
          enter={enter}
          leave={leave}
        />
      )}
    </HelpContext.Provider>
  );
}
