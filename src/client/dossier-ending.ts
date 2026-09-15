import type { StoryRow } from './succession-story-types';
import { dossierValue } from './dossier-identity';

/** Only a canonical terminal row can establish the final action; trailing audits are not moves. */
export function dossierEnding(rows: readonly StoryRow[]) {
  const terminal = rows.findLast((row) => row.fact.kind === 'finished' && row.visibility === 'public');

  if (!terminal) return null;

  // At the round cap the model clears the active action on turn-ended, before
  // publishing the terminal phase/result. Only that adjacent completed turn is
  // eligible; an intervening next-turn phase or activity breaks the connection.
  const previous = rows
    .slice(0, rows.indexOf(terminal))
    .findLast(
      (row) => row.fact.kind !== 'audit' && !(row.fact.kind === 'phase' && row.fact.phase === 'finished'),
    );

  const completed =
    previous?.fact.kind === 'turn-ended' &&
    previous.position.act === terminal.position.act &&
    terminal.source.cursor - previous.source.cursor === rows.indexOf(terminal) - rows.indexOf(previous);

  const action = dossierValue(terminal.action) ?? (completed ? dossierValue(previous.action) : undefined);

  const declaration = action && dossierValue(action.declaration);
  const source = declaration?.kind === 'event' ? declaration : terminal.source;

  return {
    source,
    act: terminal.position.act,
    label: declaration?.kind === 'event' ? 'Final move' : 'Terminal record',
  } as const;
}
