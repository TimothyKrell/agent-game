import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentPictureOptions, mergeAgentPictures, type PictureIdentity } from './agent-picture-data';

/** Mount once at the roster parent and pass its map and recovery callback to every portrait. */
export function useAgentPictures(
  agents: readonly PictureIdentity[],
  { lookup = 'current' }: { lookup?: 'current' | 'provided' } = {},
) {
  const options = agentPictureOptions(agents.map((agent) => agent.id));
  const identity = JSON.stringify(options.queryKey);
  const recovery = useRef({ identity, attempted: false });

  if (recovery.current.identity !== identity) recovery.current = { identity, attempted: false };

  const query = useQuery({ ...options, enabled: options.enabled && lookup === 'current' });
  const { refetch } = query;

  const revalidateUnavailable = useCallback(() => {
    if (!options.enabled || recovery.current.identity !== identity || recovery.current.attempted) return;
    recovery.current.attempted = true;
    // Concurrent failures across seats, mentions and results join one whole-roster read. The budget
    // is per mounted roster, not per returned version, so even changing broken URLs cannot loop.
    void refetch({ cancelRefetch: false });
  }, [identity, options.enabled, refetch]);

  return {
    pictures: mergeAgentPictures(agents, query.data),
    revalidateUnavailable,
    refresh: () => refetch({ cancelRefetch: false, throwOnError: true }),
    isFetching: query.isFetching,
    error: query.error,
  };
}
