import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { HistoryCheckpoint2Schema } from '../shared/history-checkpoint';
import { HistoryPage2Schema } from '../shared/succession';
import { api } from './api';
import { HistoryReset, matchReadKey } from './succession-replay-data';
import type { MatchReadScope } from './succession-replay-data';
import { historyPath, SuccessionHistory } from './succession-stream';

export const STORY_WINDOW_EVENTS = 128;

export const STORY_WINDOW_SHIFT = 64;

const CheckpointResponse = Schema.Union([HistoryCheckpoint2Schema, HistoryPage2Schema]);

/** One selected read, with sibling cancellation and an exact exclusive-start baseline. */
export function storyWindowOptions(scope: MatchReadScope, after: number, through: number) {
  if (after < 0 || through < after || through - after > STORY_WINDOW_EVENTS)
    throw new Error('Invalid bounded story range.');

  return queryOptions({
    queryKey: [...matchReadKey(scope), 'story-window', after, through] as const,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const siblings = new AbortController();
      const shared = AbortSignal.any([signal, siblings.signal]);

      const checkpoint = async () => {
        const query = new URLSearchParams({ epoch: scope.epoch, through: String(after) });

        const result = await api(
          `/api/matches/${encodeURIComponent(scope.matchId)}/checkpoint?${query}`,
          CheckpointResponse,
          undefined,
          { signal: shared },
        );

        if ('reset' in result) throw new HistoryReset(scope);

        if (
          result.matchId !== scope.matchId ||
          result.visibilityEpoch !== scope.epoch ||
          result.through !== after
        )
          throw new Error('The historical baseline does not match this reading window.');

        return result.baseline ?? undefined;
      };

      const records = async () => {
        const reader = new SuccessionHistory();
        reader.observe({ visibilityEpoch: scope.epoch, streamHead: through });
        reader.seek(after, through);

        // Even a maximum-byte event must make progress. Never walk beyond this selected window.
        for (let requests = 0; reader.cursor < through && requests < STORY_WINDOW_EVENTS; requests++) {
          shared.throwIfAborted();
          const walk = { epoch: scope.epoch, after: reader.cursor, through };

          const page = await api(historyPath(scope.matchId, walk), HistoryPage2Schema, undefined, {
            signal: shared,
          });

          if (page.reset) throw new HistoryReset(scope);

          if (
            page.matchId !== scope.matchId ||
            page.events.length > 32 ||
            new TextEncoder().encode(JSON.stringify(page)).byteLength > 16_384 ||
            !reader.accept(page, walk)
          )
            throw new Error('The history page is incomplete or out of order. Retry this window.');
        }

        if (reader.cursor !== through) throw new Error('The history window did not complete.');

        return reader.events;
      };

      try {
        const [baseline, events] = await Promise.all([checkpoint(), records()]);
        shared.throwIfAborted();

        return {
          scope: { matchId: scope.matchId, visibilityEpoch: scope.epoch },
          after,
          through,
          baseline,
          events,
        };
      } finally {
        siblings.abort();
      }
    },
  });
}
