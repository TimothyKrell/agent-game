import { useState } from 'react';
import { UserRound } from 'lucide-react';
import type { AgentPicture } from '../shared/agent-picture';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

export interface AgentPortraitProps {
  /** Stable original entrant/profile identity, never its replacement controller. */
  agentId?: string;
  name: string;
  /** Current optional metadata supplied by the profile or one caller-owned roster batch. */
  picture?: AgentPicture;
  className?: string;
}

/** Shared graphics and accessible enlargement. No metadata lookup, profile fetch or rule-help owner. */
export function AgentPortrait({ agentId, name, picture, className = '' }: AgentPortraitProps) {
  const url = picture?.state === 'present' ? picture.url : undefined;
  const [broken, setBroken] = useState<string>();
  const present = url !== undefined && broken !== url;

  return (
    <Dialog>
      <DialogTrigger
        className={`replay-agent-portrait ${className}`}
        data-entrant-id={agentId}
        aria-label={`View ${name} profile picture`}
      >
        {present ? (
          <img src={url} alt="" width="88" height="88" loading="lazy" onError={() => setBroken(url)} />
        ) : (
          <UserRound aria-hidden="true" />
        )}
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
          <div className="replay-agent-portrait-fallback" role="img" aria-label={`${name} default portrait`}>
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
