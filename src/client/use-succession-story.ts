import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { hashKey, useQueryClient } from '@tanstack/react-query';
import type { Observation2 } from '../shared/succession';
import { ContinuousSuccessionHistory } from './continuous-succession-history';
import type { ContinuousStoryOptions, StoryReadingAnchor } from './continuous-succession-history';
import { matchReadKey, matchReadScope } from './succession-replay-data';

export type { StoryReadingAnchor } from './continuous-succession-history';

export function useSuccessionStory(
  current: Observation2,
  options: ContinuousStoryOptions & { enabled?: boolean; onReset?: () => void } = {},
) {
  const client = useQueryClient();
  const scope = hashKey(matchReadKey(matchReadScope(current)));
  const latest = useRef(current);
  latest.current = current;
  const reset = useRef(options.onReset);
  reset.current = options.onReset;
  const memory = useRef<{ matchId: string; act?: 1 | 2; anchor: StoryReadingAnchor | null } | null>(null);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  const reader = useMemo(
    () =>
      new ContinuousSuccessionHistory(
        client,
        latest.current,
        { act: options.act, initial: options.initial },
        () => reset.current?.(),
      ),
    [client, scope, options.act, options.initial],
  );

  const snapshot = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);

  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);

    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    const previous = memory.current;

    if (previous?.matchId === current.matchId && previous.act === options.act && previous.anchor) {
      reader.restoreAnchor(previous.anchor);
    }

    return () => {
      memory.current = { matchId: current.matchId, act: options.act, anchor: reader.getAnchor() };
      reader.dispose();
    };
  }, [reader, current.matchId, options.act]);

  useEffect(() => {
    reader.observe(current);
  }, [reader, current]);
  useEffect(() => {
    reader.setEnabled(options.enabled !== false && visible);
  }, [reader, options.enabled, visible]);

  return {
    ...snapshot,
    loadEarlier: reader.loadEarlier,
    loadLater: reader.loadLater,
    jumpStart: reader.jumpStart,
    jumpEnd: reader.jumpEnd,
    follow: reader.follow,
    detach: reader.detach,
    retry: reader.retry,
    seek: reader.seek,
    rememberAnchor: reader.rememberAnchor,
    getAnchor: reader.getAnchor,
  };
}

export type SuccessionStoryReader = ReturnType<typeof useSuccessionStory>;
