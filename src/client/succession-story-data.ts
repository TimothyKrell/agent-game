import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { HistoryCheckpoint2Schema } from '../shared/history-checkpoint';
import { HistoryPage2Schema } from '../shared/succession';
import { api } from './api';
import { HistoryReset, matchReadKey } from './succession-replay-data';
import type { MatchReadScope } from './succession-replay-data';
import { readAuthorizedHistory } from './succession-history-data';

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

        if (result.matchId !== scope.matchId)
          throw new Error('The historical baseline belongs to a different match.');

        if ('reset' in result) {
          if (result.reset) throw new HistoryReset(scope);
          throw new Error('The checkpoint endpoint returned an unexpected history page.');
        }

        if (
          result.matchId !== scope.matchId ||
          result.visibilityEpoch !== scope.epoch ||
          result.through !== after
        )
          throw new Error('The historical baseline does not match this reading window.');

        return result.baseline ?? undefined;
      };

      try {
        const [baseline, events] = await Promise.all([
          checkpoint(),
          readAuthorizedHistory(scope, { after, through }, shared, STORY_WINDOW_EVENTS),
        ]);

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
