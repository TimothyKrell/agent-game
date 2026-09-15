import type { Observation2 } from '../../../src/shared/succession';

/** Short settlement journey using only this seat's published legal choices. */
export function completionChoice(view: Observation2): number | undefined {
  if (view.act !== 2 || !view.decision) return;

  for (const type of ['coup', 'assassinate', 'tax']) {
    const index = view.decision.actions.findIndex(({ action }) => action.type === type);

    if (index >= 0) return index;
  }
}
