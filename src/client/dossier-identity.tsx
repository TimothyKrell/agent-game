import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AgentPicture } from '../shared/agent-picture';
import type { StoryEntrant, StoryValue } from './succession-story-types';
import { AgentPortrait } from './agent-portrait';

/** One caller-supplied batch lookup. Portraits never fetch metadata or use controller identity. */
export type DossierPictures = ReadonlyMap<string, AgentPicture>;

const Pictures = createContext<DossierPictures>(new Map());

export function DossierPictureProvider({
  pictures,
  children,
}: {
  pictures: DossierPictures;
  children: ReactNode;
}) {
  return <Pictures.Provider value={pictures}>{children}</Pictures.Provider>;
}

export function dossierValue<T>(value: StoryValue<T>): T | undefined {
  return value.status === 'unavailable' ? undefined : value.value;
}

export function dossierName(entrant: StoryValue<StoryEntrant>, seat: number) {
  return dossierValue(entrant)?.name ?? `Seat ${seat + 1} · identity unavailable`;
}

export function DossierPortrait({ entrant, name }: { entrant?: StoryEntrant; name: string }) {
  const pictures = useContext(Pictures);
  const picture = entrant ? pictures.get(entrant.agentId) : undefined;

  return (
    <AgentPortrait agentId={entrant?.agentId} name={name} picture={picture} className="dossier-portrait" />
  );
}

export function DossierIdentity({
  entrant,
  seat,
  compact = false,
}: {
  entrant: StoryValue<StoryEntrant>;
  seat: number;
  compact?: boolean;
}) {
  const name = dossierName(entrant, seat);

  return (
    <span className={`dossier-identity ${compact ? 'dossier-identity-compact' : ''}`}>
      <DossierPortrait entrant={dossierValue(entrant)} name={name} />
      <span>{name}</span>
    </span>
  );
}
