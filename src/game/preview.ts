import type { GameAction, Observation } from './types';

/** Deliberate, observation-only moves for local previews and deterministic protocol tests. */
export function previewAction(view: Observation): GameAction | null {
  const options = view.decision?.actions ?? [];

  if (!options.length) return null;
  const rogue = view.private?.role !== 'cooperative';
  const desired = rogue ? 'override' : 'safeguard';
  const hand = view.private?.hand ?? [];

  const preferredCard = hand.find((card) =>
    view.phase.kind === 'coordinator-discard' ? card.policy !== desired : card.policy === desired,
  );

  if (preferredCard) {
    const option = options.find(
      ({ action }) =>
        (action.type === 'discard' || action.type === 'enact') && action.cardId === preferredCard.id,
    );

    if (option) return option.action;
  }

  if (view.phase.kind === 'executor-policy' && !rogue && hand.every((card) => card.policy === 'override')) {
    const veto = options.find(({ action }) => action.type === 'request-veto');

    if (veto) return veto.action;
  }

  if (view.phase.kind === 'veto-response') {
    const approve = hand.every((card) => card.policy !== desired);

    return { type: 'veto', approve };
  }

  if (
    view.phase.kind === 'nomination' &&
    rogue &&
    view.tracks.overrides >= 3 &&
    view.private?.knownOverlord !== null
  ) {
    const nominee = options.find(
      ({ action }) => action.type === 'nominate' && action.target === view.private?.knownOverlord,
    );

    if (nominee) return nominee.action;
  }

  if (view.phase.kind === 'executive-action') {
    const knownRogues = new Set([
      ...(view.private?.knownRogues ?? []),
      view.private?.knownOverlord,
      view.you?.seat,
    ]);

    const target = options.find(
      ({ action }) =>
        'target' in action &&
        action.target !== view.you?.seat &&
        (action.type !== 'execute' || !rogue || !knownRogues.has(action.target)),
    );

    if (target) return target.action;
  }

  return options[0].action;
}

export function previewSpeech(view: Observation, persona: string): string {
  const speaker = view.you?.seat ?? 0;
  const name = view.seats[view.coordinator].name;

  const choices = [
    `${name}, make the case for your nomination. I want an explanation we can check against the next policy.`,
    `We have ${view.tracks.safeguards} safeguards and ${view.tracks.overrides} overrides. Judge governments by their decisions, not their confidence.`,
    'A claim is not evidence. If this government passes, both officeholders should account for the policies they received.',
    'Watch who changes their standard when an ally is nominated. Consistency tells us more than volume.',
    'I am willing to approve a new pairing, but not a blank check. Keep the policy history in view.',
    view.tracks.overrides >= 3
      ? 'The Overlord election condition is active. The Executor nomination matters more than ever.'
      : 'We can afford a careful experiment. We cannot afford to stop comparing stories.',
  ];

  const style = persona.includes('coalition')
    ? 'Let’s find common ground. '
    : persona.includes('skeptic')
      ? 'One objection: '
      : '';

  return style + choices[(view.round + speaker) % choices.length];
}
