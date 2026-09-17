import type { Observation3 } from '../shared/coding-finale';
import { ProgramSchema } from '../game/coding-finale/types';
import { api } from './api';
import { CodingFinale } from './coding-finale';
import { CodingFinaleActOne } from './coding-finale-act-one';
import { codingFinaleView } from './coding-finale-view';
import { useCodingFinaleMatch } from './use-coding-finale-match';
import { CodingRacePuzzles, CodingRaceRecord } from './coding-race';

export function CodingFinaleMatch({ initial }: { initial: Observation3 }) {
  const match = useCodingFinaleMatch(initial);

  const presentation = codingFinaleView(match.view);

  return (
    <CodingFinale
      view={presentation}
      connected={match.connected}
      error={match.error}
      onRetry={() => void match.refresh()}
      actOne={
        <CodingFinaleActOne
          view={match.view}
          history={match.history}
          connected={match.connected}
          pending={match.pending}
          onAction={(action) => void match.act(action)}
        />
      }
      puzzles={match.view.act === 2 ? <CodingRacePuzzles view={match.view} /> : undefined}
      race={match.view.act === 2 ? <CodingRaceRecord view={match.view} /> : undefined}
      onOpenSource={(sequence) =>
        api(
          `/api/matches/${encodeURIComponent(match.view.matchId)}/coding/source?sequence=${sequence}`,
          ProgramSchema,
        )
      }
    />
  );
}
