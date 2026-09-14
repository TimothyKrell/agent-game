import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { HistoryPage2Schema, ReplayFrame2Schema } from '../shared/succession';
import type { AuthorizedEvent2, HistoryPage2, Observation2, ReplayFrame2 } from '../shared/succession';
import { HistoryAnchor2Schema, RoundIndex2Schema } from '../shared/history';
import { api } from './api';
import { historyPath, SuccessionHistory } from './succession-stream';

/** Cookie owner identity is not the match's controller audience. Never put credentials in keys. */
export function matchReadScope(view: Observation2, credentialRevision = 0) {
  return {
    matchId: view.matchId,
    epoch: view.history.visibilityEpoch,
    credentialRevision,
    audience: view.you
      ? {
          kind: 'agent' as const,
          agentId: view.you.agentId,
          generation: view.you.generation,
          forfeited: view.you.forfeited,
        }
      : { kind: 'public' as const },
    generations: view.seats.map((seat) => [seat.number, seat.generation, seat.forfeited] as const),
  };
}

export type MatchReadScope = ReturnType<typeof matchReadScope>;

export function matchReadKey(scope: MatchReadScope) {
  return [
    'match-read-v1',
    scope.matchId,
    '2',
    scope.audience,
    scope.credentialRevision,
    scope.generations,
    scope.epoch,
  ] as const;
}

export class HistoryReset extends Error {
  constructor(readonly scope: MatchReadScope) {
    super('The record visibility changed. Retry loading the current record.');
    this.name = 'HistoryReset';
  }
}

export type ReplaySlice = { frame: ReplayFrame2; events: AuthorizedEvent2[] };

const FrameResponse = Schema.Union([ReplayFrame2Schema, HistoryPage2Schema]);

const RoundsResponse = Schema.Union([RoundIndex2Schema, HistoryPage2Schema]);

const AnchorResponse = Schema.Union([HistoryAnchor2Schema, HistoryPage2Schema]);

const policy = {
  retry: false,
  gcTime: 0,
  staleTime: Infinity,
  networkMode: 'online',
  throwOnError: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const;

function requireScope(result: { matchId: string; visibilityEpoch: string }, scope: MatchReadScope) {
  if (result.matchId !== scope.matchId || result.visibilityEpoch !== scope.epoch)
    throw new Error('The replay record changed while loading.');
}

function rejectReset(page: HistoryPage2, scope: MatchReadScope): never {
  if (page.matchId === scope.matchId && page.reset) throw new HistoryReset(scope);
  throw new Error('The replay endpoint returned an unexpected history page.');
}

export function replaySliceOptions(scope: MatchReadScope, through: number) {
  return queryOptions({
    ...policy,
    queryKey: [...matchReadKey(scope), 'replay-slice', { through, window: 32 }] as const,
    queryFn: async ({ signal }): Promise<ReplaySlice> => {
      if (!Number.isSafeInteger(through) || through < 0) throw new Error('Invalid replay cursor.');
      const siblings = new AbortController();
      const shared = AbortSignal.any([signal, siblings.signal]);
      const query = new URLSearchParams({ epoch: scope.epoch, through: String(through) });

      const loadFrame = async () => {
        const frame = await api(
          `/api/matches/${encodeURIComponent(scope.matchId)}/replay?${query}`,
          FrameResponse,
          undefined,
          { signal: shared },
        );

        if ('reset' in frame) rejectReset(frame, scope);
        requireScope(frame, scope);

        if (frame.through !== through || frame.you !== null || frame.private !== null)
          throw new Error('The replay frame does not match the selected non-actionable record.');

        return frame;
      };

      const loadWindow = async () => {
        const history = new SuccessionHistory();
        history.observe({ visibilityEpoch: scope.epoch, streamHead: through });
        history.seek(Math.max(0, through - 32), through);

        for (let pageNumber = 0; history.cursor < through && pageNumber < 32; pageNumber++) {
          shared.throwIfAborted();
          const walk = { epoch: scope.epoch, after: history.cursor, through };

          const page = await api(historyPath(scope.matchId, walk), HistoryPage2Schema, undefined, {
            signal: shared,
          });

          if (page.reset) rejectReset(page, scope);
          requireScope(page, scope);

          if (
            page.events.length > 32 ||
            new TextEncoder().encode(JSON.stringify(page)).byteLength > 16384 ||
            !history.accept(page, walk)
          )
            throw new Error('The replay history page changed while loading.');
        }

        if (history.cursor !== through) throw new Error('The selected replay window is incomplete.');

        return history.events;
      };

      try {
        const [frame, events] = await Promise.all([loadFrame(), loadWindow()]);
        shared.throwIfAborted();

        return { frame, events };
      } finally {
        // A failed/reset constituent must not leave its sibling walking or reading a body.
        siblings.abort();
      }
    },
  });
}

export function roundIndexOptions(scope: MatchReadScope) {
  return queryOptions({
    ...policy,
    queryKey: [...matchReadKey(scope), 'rounds'] as const,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ epoch: scope.epoch });

      const result = await api(
        `/api/matches/${encodeURIComponent(scope.matchId)}/rounds?${query}`,
        RoundsResponse,
        undefined,
        { signal },
      );

      if ('reset' in result) rejectReset(result, scope);
      requireScope(result, scope);

      return result;
    },
  });
}

export function historyAnchorOptions(scope: MatchReadScope, eventKey: string) {
  return queryOptions({
    ...policy,
    queryKey: [...matchReadKey(scope), 'anchor', eventKey] as const,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ epoch: scope.epoch, eventKey });

      const result = await api(
        `/api/matches/${encodeURIComponent(scope.matchId)}/history-anchor?${query}`,
        AnchorResponse,
        undefined,
        { signal },
      );

      if ('reset' in result) rejectReset(result, scope);
      requireScope(result, scope);

      if (result.cursor !== null && (!Number.isSafeInteger(result.cursor) || result.cursor < 0))
        throw new Error('The archive returned an invalid reading anchor.');

      return result;
    },
  });
}
