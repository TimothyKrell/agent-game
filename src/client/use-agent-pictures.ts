import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentPictureOptions, mergeAgentPictures, type PictureIdentity } from './agent-picture-data';
import { activeAgentPictures } from './active-agent-pictures';
import { refreshAgentPictures } from './refresh-agent-pictures';

/** Mount once at the roster parent and pass its map and recovery callback to every portrait. */
export function useAgentPictures(
  agents: readonly PictureIdentity[],
  { lookup = 'current' }: { lookup?: 'current' | 'provided' } = {},
) {
  const options = agentPictureOptions(agents.map((agent) => agent.id));
  const identity = JSON.stringify(options.queryKey);
  const client = useQueryClient();
  const known = activeAgentPictures(client);
  const shared = useSyncExternalStore(known.subscribe, known.getSnapshot);

  // Canonical identity covers ids/order/deduplication; a return A→B→A creates a new lifetime.
  const scope = useMemo(
    () => ({ ids: options.queryKey[1], controller: new AbortController(), attempted: false }),
    [client, identity],
  );

  useLayoutEffect(() => {
    const controller = new AbortController();
    scope.controller = controller;
    scope.attempted = false;
    const release = known.retain(scope.ids);

    return () => {
      controller.abort();
      release();
    };
  }, [known, scope]);

  const query = useQuery({ ...options, enabled: options.enabled && lookup === 'current' });
  useLayoutEffect(() => {
    known.publish(mergeAgentPictures(agents, query.data));
  });

  const refresh = useCallback(
    () => refreshAgentPictures(client, scope.ids, scope.controller.signal),
    [client, scope],
  );

  const revalidateUnavailable = useCallback(() => {
    if (!scope.ids.length || scope.controller.signal.aborted || scope.attempted) return;
    scope.attempted = true;
    // Concurrent failures across seats, mentions and results join one whole-roster read. The budget
    // is per mounted roster, not per returned version, so even changing broken URLs cannot loop.
    void refresh().catch(() => {});
  }, [scope, refresh]);

  return {
    pictures: mergeAgentPictures(agents, query.data, shared),
    revalidateUnavailable,
    refresh,
    isFetching: query.isFetching,
    error: query.error,
  };
}
