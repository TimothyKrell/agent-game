import type { ReactNode } from 'react';
import {
  ArrowRight,
  Ban,
  BookOpen,
  CircleOff,
  Coins,
  Crown,
  FileCheck2,
  FileText,
  Flag,
  Gavel,
  Handshake,
  Hourglass,
  Landmark,
  ListOrdered,
  Search,
  Shield,
  ShieldAlert,
  Shuffle,
  Skull,
  Swords,
  UserCheck,
  UserRoundCog,
  Users,
  Vote,
} from 'lucide-react';
import { InfluenceBack } from './deco';
import { storyRules, storyText } from './succession-story-rules';
import type { StoryRule } from './succession-story-rules';
import { RuleHelpTrigger } from './ui/rule-help';

function CapabilityMark({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 5h46v5h4v44h-4v5H9v-5H5V10h4Z" opacity=".45" />
      <path d={path} />
    </svg>
  );
}

// Retained approved C artwork. The vocabulary is the production, closed 36-term model.
const icons = {
  treasurer: <CapabilityMark path="M18 36h28M22 36V23h20v13M18 23l14-9 14 9M26 27v9m12-9v9M16 41h32" />,
  thief: (
    <CapabilityMark path="M14 25 24 22l8 3 8-3 10 3-2 13-8 5-8-6-8 6-8-5ZM19 29l9 2-4 5-5-2Zm26 0-9 2 4 5 5-2ZM14 27l-5-4m41 4 5-4" />
  ),
  assassin: <CapabilityMark path="M21 44 43 16l-6 20-16 8Zm4-6 12-16M18 38l9 9M17 48l6-7" />,
  envoy: <CapabilityMark path="M16 22h29l-6-6m6 6-6 6M48 42H19l6-6m-6 6 6 6M25 28h14v8H25Z" />,
  guard: <CapabilityMark path="m32 14 15 7v13L32 48 17 34V21ZM24 30l6 6 11-14" />,
  coins: <Coins />,
  influence: <InfluenceBack />,
  income: <Coins />,
  tax: <Landmark />,
  theft: (
    <CapabilityMark path="M14 25 24 22l8 3 8-3 10 3-2 13-8 5-8-6-8 6-8-5ZM19 29l9 2-4 5-5-2Zm26 0-9 2 4 5 5-2Z" />
  ),
  assassination: <CapabilityMark path="M21 44 43 16l-6 20-16 8Zm4-6 12-16M18 38l9 9M17 48l6-7" />,
  exchange: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 12h10v15H7Zm8-7h10v15h-5M4 8h7l-3-3m3 3-3 3M28 24h-7l3-3m-3 3 3 3" />
    </svg>
  ),
  coup: <Skull />,
  challenge: <Swords />,
  block: <Shield />,
  safeguard: <Shield />,
  override: <ShieldAlert />,
  veto: <Ban />,
  'election-tracker': <ListOrdered />,
  execution: <Skull />,
  investigation: <Search />,
  'special-election': <Flag />,
  'round-cap': <Hourglass />,
  coordinator: <UserRoundCog />,
  executor: <FileCheck2 />,
  overlord: <Crown />,
  cooperative: <Handshake />,
  rogue: <ShieldAlert />,
  government: <Users />,
  nomination: <UserCheck />,
  election: <Vote />,
  policy: <FileText />,
  chaos: <Shuffle />,
  'term-limits': <BookOpen />,
  'executive-power': <Gavel />,
  elimination: <CircleOff />,
} satisfies Record<StoryRule, ReactNode>;

export function DossierRuleIcon({ rule }: { rule: StoryRule }) {
  return (
    <span className="dossier-rule-icon" aria-hidden="true">
      {icons[rule]}
    </span>
  );
}

export function DossierRule({
  rule,
  children,
  value,
  before,
}: {
  rule: StoryRule;
  children?: string;
  value?: number | null;
  before?: number | null;
}) {
  const [title, description] = storyRules[rule];
  const resource = value !== undefined;
  const changed = before !== undefined && before !== value;

  return (
    <RuleHelpTrigger
      help={{ title, summary: title, description, icon: <DossierRuleIcon rule={rule} /> }}
      className={`dossier-term ${rule === 'coins' ? 'dossier-coins' : ''} ${resource ? 'dossier-resource' : ''}`}
      data-rule-term={title}
      aria-label={`${children ?? title} rules`}
      aria-description={
        resource ? `${changed ? `${before ?? 'Unknown'} to ` : ''}${value ?? 'Unknown'} ${title}` : undefined
      }
    >
      {rule === 'influence' && resource ? (
        <span className="dossier-influence-backs" aria-hidden="true">
          {[0, 1].map((index) => (
            <span key={index} className={value !== null && index >= value! ? 'is-lost' : ''}>
              <InfluenceBack />
            </span>
          ))}
        </span>
      ) : (
        <DossierRuleIcon rule={rule} />
      )}
      {resource && (
        <span className="dossier-numbers">
          {changed && (
            <>
              <span>{before ?? '?'}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </>
          )}
          <b>{value ?? '?'}</b>
        </span>
      )}
      <span>{children ?? title}</span>
    </RuleHelpTrigger>
  );
}

/** No name replacement, normalization or added whitespace inside source quotes. */
export function DossierText({ text }: { text: string }) {
  return storyText(text).map((part, index) =>
    part.rule ? (
      <DossierRule key={index} rule={part.rule}>
        {part.text}
      </DossierRule>
    ) : (
      part.text
    ),
  );
}
