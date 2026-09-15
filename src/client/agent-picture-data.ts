import { queryOptions } from '@tanstack/react-query';
import {
  AgentPicturesSchema,
  missingAgentPicture,
  PICTURE_BATCH_LIMIT,
  type AgentPicture,
} from '../shared/agent-picture';
import { api, ApiError } from './api';
import { activeAgentPictures } from './active-agent-pictures';

export type AgentPictureMap = ReadonlyMap<string, AgentPicture>;

/** IDs are the original persistent competitors, never their current controllers or display names. */
export interface PictureIdentity {
  id: string;
  picture?: AgentPicture;
}

export function pictureAgentIds(agentIds: readonly string[]) {
  return [...new Set(agentIds.filter((id) => id.length > 0))].sort();
}

/** One parent read for a fixed roster. Larger public lists use bounded batches, not per-row GETs. */
export async function readAgentPictures(
  agentIds: readonly string[],
  signal?: AbortSignal,
): Promise<AgentPictureMap> {
  const ids = pictureAgentIds(agentIds);
  const pictures = new Map<string, AgentPicture>();
  signal?.throwIfAborted();

  for (let start = 0; start < ids.length; start += PICTURE_BATCH_LIMIT) {
    const batch = ids.slice(start, start + PICTURE_BATCH_LIMIT);
    const parameters = new URLSearchParams(batch.map((id) => ['agentId', id]));
    const rows = await api(`/api/agent-pictures?${parameters}`, AgentPicturesSchema, undefined, { signal });
    const received = new Set(rows.map((row) => row.agentId));

    // Decodable metadata for another roster must not be assigned by row position or name.
    if (
      rows.length !== batch.length ||
      received.size !== batch.length ||
      batch.some((id) => !received.has(id))
    ) {
      throw new ApiError('The server returned picture metadata for a different roster.', undefined, 200);
    }

    for (const row of rows) pictures.set(row.agentId, row.picture);
  }

  return pictures;
}

export function agentPictureOptions(agentIds: readonly string[]) {
  const ids = pictureAgentIds(agentIds);

  return queryOptions({
    queryKey: ['agent-pictures-v1', ids] as const,
    queryFn: async ({ signal, client }) => {
      const pictures = await readAgentPictures(ids, signal);
      signal.throwIfAborted();
      const known = activeAgentPictures(client);
      known.publish(pictures);

      return mergeAgentPictures(
        ids.map((id) => ({ id })),
        pictures,
        known.getSnapshot(),
      );
    },
    enabled: ids.length > 0,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Only current profile fields belong here; immutable mutation receipts are not current metadata. */
export function mergeAgentPictures(
  agents: readonly PictureIdentity[],
  ...current: (AgentPictureMap | undefined)[]
): AgentPictureMap {
  const pictures = new Map<string, AgentPicture>();

  for (const agent of agents) {
    if (!agent.id) continue;
    let picture = agent.picture ?? missingAgentPicture;

    for (const source of current) {
      const loaded = source?.get(agent.id);

      if (loaded && loaded.revision > picture.revision) picture = loaded;
    }

    const previous = pictures.get(agent.id);

    if (!previous || picture.revision > previous.revision) pictures.set(agent.id, picture);
  }

  return pictures;
}
