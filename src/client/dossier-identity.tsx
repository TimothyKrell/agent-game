import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { UserRound } from 'lucide-react';
import type { AgentPicture } from '../shared/agent-picture';
import type { StoryEntrant, StoryValue } from './succession-story-types';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

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
  const url = picture?.state === 'present' ? picture.url : undefined;
  const [broken, setBroken] = useState<string>();
  const present = url !== undefined && broken !== url;

  const image = present ? (
    <img src={url} alt="" width="88" height="88" loading="lazy" onError={() => setBroken(url)} />
  ) : (
    <UserRound aria-hidden="true" />
  );

  return (
    <Dialog>
      <DialogTrigger
        className="dossier-portrait"
        data-entrant-id={entrant?.agentId}
        aria-label={`View ${name} profile picture`}
      >
        {image}
      </DialogTrigger>
      <DialogContent className="replay-portrait-dialog" closeLabel="Close profile picture">
        {present ? (
          <img
            src={url}
            alt={`${name} profile picture`}
            width="320"
            height="320"
            onError={() => setBroken(url)}
          />
        ) : (
          <div className="dossier-portrait-fallback" role="img" aria-label={`${name} default portrait`}>
            <UserRound aria-hidden="true" />
          </div>
        )}
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>
          {present
            ? 'Current picture of the original entrant.'
            : broken === url && url
              ? 'Picture unavailable · default avatar'
              : 'No profile picture yet · default avatar'}
        </DialogDescription>
      </DialogContent>
    </Dialog>
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
