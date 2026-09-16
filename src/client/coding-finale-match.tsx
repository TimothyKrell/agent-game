import type { Observation3 } from '../shared/coding-finale';
import { ProgramSchema } from '../game/coding-finale/types';
import { api } from './api';
import { CodingFinale } from './coding-finale';
import { CodingFinaleActOne } from './coding-finale-act-one';
import { codingFinaleView } from './coding-finale-view';
import { useCodingFinaleMatch } from './use-coding-finale-match';

export function CodingFinaleMatch({ initial }: { initial: Observation3 }) {
  const match = useCodingFinaleMatch(initial);

  const presentation = codingFinaleView(match.view, {
    chat: match.history.events
      .filter((event) => event.type === 'chat' && event.seat !== undefined)
      .map((event) => ({
        id: event.eventKey,
        agentName:
          match.view.seats.find((seat) => seat.number === event.seat)?.name ??
          `Seat ${(event.seat ?? 0) + 1}`,
        text: event.text,
        at: new Date(event.at).toISOString(),
      })),
  });

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
      onChat={
        match.view.you && match.view.chat.open && !match.pending
          ? (text) => void match.act({ type: 'chat', text })
          : undefined
      }
      onOpenSource={(sequence) =>
        api(
          `/api/matches/${encodeURIComponent(match.view.matchId)}/coding/source?sequence=${sequence}`,
          ProgramSchema,
        )
      }
    />
  );
}
