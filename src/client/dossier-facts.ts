import type { StoryRow } from './succession-story-types';
import type { DossierEntrants } from './dossier-summary';
import { unavailableEntrant } from './dossier-summary';
import { dossierName, dossierValue } from './dossier-identity';
import { storyRules } from './succession-story-rules';

const actionNames = {
  income: 'Income',
  tax: 'Tax',
  steal: 'Theft',
  assassinate: 'Assassination',
  exchange: 'Exchange',
  coup: 'Coup',
} as const;

/** Mechanical wording from typed facts. Only speech is an exact source quotation. */
export function dossierFactText(row: StoryRow, entrants: DossierEntrants) {
  const fact = row.fact;

  const name = (seat: number) =>
    dossierName(
      row.affected.find((change) => change.seat === seat)?.after.entrant ??
        entrants.get(seat) ??
        unavailableEntrant,
      seat,
    );

  const actor = dossierValue(row.actor);
  const who = actor == null ? 'Actor unavailable' : name(actor);

  switch (fact.kind) {
    case 'declaration':
      return `Declares ${actionNames[fact.action.type]}${fact.action.target === undefined ? '' : ` against ${name(fact.action.target)}`}.${fact.claim ? ` Claims ${storyRules[fact.claim][0]}.` : ''}${fact.payment ? ` Pays ${fact.payment} coins.` : ''}`;
    case 'challenge-resolved':
      return fact.challenger === null
        ? `${name(fact.claimant)}’s ${storyRules[fact.capability][0]} ${fact.block ? 'block' : 'claim'} is unchallenged.`
        : `${name(fact.challenger)} challenges ${name(fact.claimant)}’s ${storyRules[fact.capability][0]} ${fact.block ? 'block' : 'claim'}.${fact.outcome === 'disproved' ? ` ${name(fact.claimant)} cannot prove ${storyRules[fact.capability][0]}.` : ''}`;
    case 'proof':
      return `Proves ${storyRules[fact.capability][0]}. Returns the proved card and draws a replacement.`;
    case 'block':
      return `Claims ${storyRules[fact.capability][0]} to block.`;
    case 'influence-lost':
      return `Loses ${storyRules[fact.capability][0]}.${fact.eliminated ? ' Eliminated.' : ''}`;
    case 'coins':
      return `${who} now has ${fact.coins} coins.`;
    case 'exchange-completed':
      return 'Returns two cards. Exchange complete.';
    case 'turn-ended':
      return 'Turn ends.';
    case 'nomination':
      return `Nominates ${name(fact.target)} as Executor.`;
    case 'ballot':
      return `Votes to ${fact.approve ? 'approve' : 'reject'} the government.`;
    case 'election':
      return `Government ${fact.approved ? 'approved' : 'rejected'}.`;
    case 'policy':
      return `${fact.chaos ? 'Chaos enacts' : 'Enacts'} ${storyRules[fact.policy][0]}.`;
    case 'tracker':
      return `Election tracker: ${fact.tracker}.`;
    case 'execution':
      return `${who} executes ${name(fact.target)}.`;
    case 'investigation':
      return `Investigates ${name(fact.target)}.`;
    case 'investigation-result':
      return `Investigation: ${name(fact.target)} belongs to the ${fact.team} faction.`;
    case 'special-election':
      return `Chooses ${name(fact.target)} as the next Coordinator for a Special election.`;
    case 'cleared-executor':
      return 'The elected Executor is not the Overlord.';
    case 'veto-request':
      return 'Requests a Veto.';
    case 'veto-response':
      return fact.approved
        ? 'Accepts the Veto. Both policies are discarded.'
        : 'Rejects the Veto. The Executor must enact a policy.';
    case 'act-ended':
      return `${storyRules[fact.team][0]} faction wins Act I. ${fact.reason}.`;
    case 'act-started':
      return 'All ten agents receive two fresh secret influence cards.';
    case 'private-cards':
      return {
        'capability-deal': 'Receives two fresh secret capability cards.',
        'hand-updated': 'Private hand updated.',
        'exchange-draw': 'Draws two cards for Exchange.',
      }[fact.operation];
    case 'private-policies':
      return {
        draw: 'Draws three policies.',
        'received-policies': 'Receives two policies.',
        discard: 'Discards one policy and passes two to the Executor.',
        'executor-discard': 'Discards the other policy.',
      }[fact.operation];
    case 'takeover':
      return 'House controller takes over. The original entrant forfeits.';
    case 'finished':
      return fact.capEvidence
        ? `${name(fact.winner)} is the mechanical champion at the Round cap.`
        : `${name(fact.winner)} is the last agent with influence.`;
    case 'phase': {
      const phase = fact.phase.replace('act-2:', '');

      if (row.position.act === 1) return row.text;

      switch (phase) {
        case 'discussion':
          return 'Discuss the next turn.';
        case 'action':
          return `${actor == null ? 'The active agent' : who} chooses an action.`;
        case 'challenge':
          return 'Challenges sealed · choices reveal together at resolution.';
        case 'block':
          return 'The target chooses whether to block.';
        case 'loss':
          return `${actor == null ? 'An agent' : who} chooses which influence card to lose.`;
        case 'exchange':
          return 'Private Exchange choice · public chat pauses.';
        case 'finished':
          return 'Act II complete.';
        default:
          return 'Phase details unavailable.';
      }
    }

    case 'system':
      return fact.type === 'commitment' ? 'Round cap tie-break priority committed.' : row.text;
    default:
      return row.text;
  }
}
