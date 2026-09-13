import type { Action2, Observation2 } from '../../shared/succession';

/** Complete observation-only policy; no access to another seat's cards or sealed reactions. */
export function previewSuccessionAction(
  observation: Observation2,
  random: (size: number) => number = (size) => Math.floor(Math.random() * size),
): Action2 | null {
  const options = observation.decision?.actions ?? [];
  if (!options.length) return null;
  if (observation.act === 1) {
    const enact = options.find(({ action }) => action.type === 'enact');
    if (enact) return enact.action;
    const approve = options.find(({ action }) => action.type === 'vote' && action.approve);
    if (approve) return approve.action;
    return options[random(options.length)].action;
  }
  const coup = options.filter(({ action }) => action.type === 'coup');
  if (coup.length) return coup[random(coup.length)].action;
  const pass = options.find(({ action }) => action.type === 'pass');
  if (pass) return pass.action;
  const tax = options.find(({ action }) => action.type === 'tax');
  if (tax) return tax.action;
  return options[random(options.length)].action;
}
export function previewSuccessionSpeech(observation: Observation2): string {
  return observation.act === 1
    ? 'The winning faction earns one extra coin, then all ten return for individual victory.'
    : 'I am watching claims, coins, and the twelve-round cap.';
}
