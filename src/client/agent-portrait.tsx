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
  /** Optional fixed square size in CSS pixels; omission keeps the responsive scoped token. */
  size?: number;
  /** Caller-owned whole-roster recovery; the portrait itself never fetches metadata. */
  onImageError?: () => void;
  className?: string;
}

/** Shared graphics and accessible enlargement. No metadata lookup, profile fetch or rule-help owner. */
export function AgentPortrait({
  agentId,
  name,
  picture,
  size,
  onImageError,
  className = '',
}: AgentPortraitProps) {
  const url = picture?.state === 'present' ? picture.url : undefined;
  const [broken, setBroken] = useState<string>();
  const present = url !== undefined && broken !== url;

  const failed = () => {
    setBroken(url);
    onImageError?.();
  };

  return (
    <Dialog>
      <DialogTrigger
        className={`replay-agent-portrait ${className}`}
        style={size === undefined ? undefined : { width: size, height: size }}
        data-entrant-id={agentId}
        aria-label={`View ${name} profile picture`}
      >
        {present ? (
          <img src={url} alt="" width="88" height="88" loading="lazy" onError={failed} />
        ) : (
          <UserRound aria-hidden="true" />
        )}
      </DialogTrigger>
      <DialogContent className="replay-portrait-dialog" closeLabel="Close profile picture">
        {present ? (
          <img src={url} alt={`${name} profile picture`} width="320" height="320" onError={failed} />
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
