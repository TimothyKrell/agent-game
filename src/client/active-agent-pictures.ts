import type { QueryClient } from '@tanstack/react-query';
import { missingAgentPicture, type AgentPicture } from '../shared/agent-picture';
import type { AgentPictureMap } from './agent-picture-data';

/** Current knowledge lives only as long as at least one mounted roster still includes the ID. */
export class ActiveAgentPictures {
  private readers = new Map<string, number>();
  private pictures: AgentPictureMap = new Map();
  private listeners = new Set<() => void>();

  getSnapshot = () => this.pictures;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(pictures: AgentPictureMap) {
    this.pictures = pictures;

    for (const listener of this.listeners) listener();
  }

  retain(agentIds: readonly string[]) {
    const ids = [...new Set(agentIds)];
    const pictures = new Map(this.pictures);

    for (const id of ids) {
      this.readers.set(id, (this.readers.get(id) ?? 0) + 1);

      if (!pictures.has(id)) pictures.set(id, missingAgentPicture);
    }

    if (pictures.size !== this.pictures.size) this.notify(pictures);
    let retained = true;

    return () => {
      if (!retained) return;
      retained = false;
      const remaining = new Map(this.pictures);

      for (const id of ids) {
        const readers = (this.readers.get(id) ?? 1) - 1;

        if (readers) this.readers.set(id, readers);
        else {
          this.readers.delete(id);
          remaining.delete(id);
        }
      }

      if (remaining.size !== this.pictures.size) this.notify(remaining);
    };
  }

  /** Publish decoded current reads/profile fields, never mutation receipts or inactive IDs. */
  publish(incoming: AgentPictureMap) {
    let updated: Map<string, AgentPicture> | undefined;

    for (const [id, picture] of incoming) {
      const known = this.pictures.get(id);

      if (!known || picture.revision <= known.revision) continue;
      updated ??= new Map(this.pictures);
      updated.set(id, picture);
    }

    if (updated) this.notify(updated);
  }
}

// Weak client ownership isolates providers; retain/release removes all ID metadata at last unmount.
const active = new WeakMap<QueryClient, ActiveAgentPictures>();

export function activeAgentPictures(client: QueryClient) {
  let pictures = active.get(client);

  if (!pictures) {
    pictures = new ActiveAgentPictures();
    active.set(client, pictures);
  }

  return pictures;
}
