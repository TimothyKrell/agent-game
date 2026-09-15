import { useEffect, useRef, useState } from 'react';
import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Observation2 } from '../shared/succession';
import type { FeedReadingMemory } from './match-feed';
import {
  HistoryReset,
  historyAnchorOptions,
  matchReadKey,
  matchReadScope,
  replaySliceOptions,
  roundIndexOptions,
} from './succession-replay-data';

const missingAnchor = new Error('The previous reading anchor is not available in this archive.');

type Reading = {
  identity: string;
  through: number;
  displayed: number | null;
  playing: boolean;
  anchorKey: string | undefined;
  anchorApplied: boolean;
};

export function useSuccessionReplay({
  view,
  refresh,
  memory,
}: {
  view: Observation2;
  refresh: () => void;
  memory: React.MutableRefObject<FeedReadingMemory | null>;
}) {
  const client = useQueryClient();
  const scope = matchReadScope(view);
  const identity = hashKey(matchReadKey(scope));

  const start = (): Reading => ({
    identity,
    through: view.history.streamHead,
    displayed: null,
    playing: false,
    anchorKey: memory.current?.following === false ? memory.current.anchor?.identity : undefined,
    anchorApplied: false,
  });

  const [reading, setReading] = useState(start);

  // Reset local reading choices before children can render anything from a retired scope.
  if (reading.identity !== identity) setReading(start());
  const local = reading.identity === identity ? reading : start();
  const terminal = view.status !== 'active';
  const rounds = useQuery({ ...roundIndexOptions(scope), enabled: terminal });

  const anchor = useQuery({
    ...historyAnchorOptions(scope, local.anchorKey ?? ''),
    enabled: terminal && !!local.anchorKey,
  });

  if (anchor.data && anchor.data.cursor !== null && !local.anchorApplied) {
    setReading({
      ...local,
      anchorApplied: true,
      through: Math.min(view.history.streamHead, anchor.data.cursor + 16),
    });
  }

  const anchorLoading = !!local.anchorKey && !anchor.data && !anchor.isError;
  const options = replaySliceOptions(scope, local.through);
  const selection = hashKey(options.queryKey);
  const [ready, setReady] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setReady(selection), 80);

    return () => clearTimeout(timer);
  }, [selection]);

  const valid =
    Number.isSafeInteger(local.through) && local.through >= 0 && local.through <= view.history.streamHead;

  const requested = useQuery({
    ...options,
    enabled: terminal && valid && !anchorLoading && ready === selection,
  });

  const retained = useQuery({
    ...replaySliceOptions(scope, local.displayed ?? local.through),
    enabled: false,
  });

  if (
    requested.data &&
    local.displayed !== local.through &&
    (!anchor.data || anchor.data.cursor === null || local.anchorApplied)
  )
    setReading({ ...local, displayed: local.through });

  const previous = useRef(options.queryKey);
  useEffect(() => {
    const old = previous.current;
    previous.current = options.queryKey;

    if (hashKey(old) !== selection) {
      // A display-only observer retains successful data, not an abandoned manual refetch.
      // Another enabled reader still legitimately owns/shares its in-flight request.
      void client.cancelQueries({ queryKey: old, exact: true, type: 'inactive' });
    }
  }, [client, selection]);

  const error =
    requested.error ?? anchor.error ?? rounds.error ?? (anchor.data?.cursor === null ? missingAnchor : null);

  const reset = [requested.error, anchor.error, rounds.error].find((cause) => cause instanceof HistoryReset);
  const refreshed = useRef('');
  useEffect(() => {
    if (reset && refreshed.current !== identity) {
      refreshed.current = identity;
      refresh();
    }
  }, [reset, identity, refresh]);

  const displayed = requested.data ?? (local.displayed === null ? null : retained.data) ?? null;
  const paused = requested.isPaused || rounds.isPaused || anchor.isPaused;
  const loading = anchorLoading || ready !== selection || requested.isFetching;

  useEffect(() => {
    if (!local.playing) return;

    if (error || local.through >= view.history.streamHead) {
      setReading((value) => ({ ...value, playing: false }));

      return;
    }

    if (loading || paused || displayed?.frame.through !== local.through) return;

    const timer = setTimeout(
      () =>
        setReading((value) =>
          value.identity === identity && value.through === local.through
            ? { ...value, through: Math.min(view.history.streamHead, value.through + 1) }
            : value,
        ),
      700,
    );

    return () => clearTimeout(timer);
  }, [identity, local.playing, local.through, error, loading, paused, displayed, view.history.streamHead]);

  useEffect(() => {
    const pause = () => {
      if (document.visibilityState !== 'visible') setReading((value) => ({ ...value, playing: false }));
    };

    document.addEventListener('visibilitychange', pause);

    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  return {
    through: local.through,
    playing: local.playing,
    displayed,
    rounds: rounds.data ?? null,
    anchorLoading,
    loading,
    paused,
    error,
    seek: (through: number) => {
      if (Number.isSafeInteger(through) && through >= 0 && through <= view.history.streamHead)
        setReading((value) => ({ ...value, through, playing: false }));
    },
    togglePlayback: () =>
      setReading((value) => ({
        ...value,
        through: value.playing ? value.through : 0,
        playing: !value.playing,
      })),
    retry: () => {
      refreshed.current = '';

      if (anchor.isError || anchor.data?.cursor === null) void anchor.refetch();
      else if (valid) void requested.refetch();

      if (rounds.isError) void rounds.refetch();
    },
  };
}
