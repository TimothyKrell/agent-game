import { useState } from 'react';
import type { CSSProperties } from 'react';
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

const portraitColors = [
  '#bd91b3',
  '#80c9bd',
  '#edb471',
  '#94b6d5',
  '#91b294',
  '#ccbf89',
  '#b5c088',
  '#86bcbf',
  '#b49ad5',
  '#cca18c',
] as const;

/** Stable entrant-keyed color. Display names can change without changing the fallback portrait. */
export function agentPortraitColor(agentId?: string) {
  const identity = agentId || 'missing-entrant-identity';
  let hash = 2166136261;

  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return portraitColors[(hash >>> 0) % portraitColors.length];
}

function RobotPortrait() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <rect width="128" height="128" className="portrait-robot-background" />
      <path d="M8 24V8h16m80 0h16v16M8 104v16h16m80 0h16v-16" className="portrait-robot-corners" />
      <circle cx="64" cy="60" r="44" className="portrait-robot-halo" />
      <path d="M22 128v-22l18-15h48l18 15v22" className="portrait-robot-body" />
      <path d="M55 82v14l9 9 9-9V82" className="portrait-robot-neck" />
      <path d="M35 35h58v36L79 85H49L35 71Z" className="portrait-robot-head" />
      <path d="M43 43h42v25l-9 9H52l-9-9Z" className="portrait-robot-face" />
      <g className="portrait-robot-lines">
        <circle cx="54" cy="56" r="4" />
        <circle cx="74" cy="56" r="4" />
        <path d="M54 69h20M64 35V22m-4-4h8v5h-8Z" />
      </g>
      <path d="M27 48h8v18h-8m66-18h8v18h-8" className="portrait-robot-ears" />
      <path d="M37 111h54" className="portrait-robot-chest" />
    </svg>
  );
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

  const colorStyle: CSSProperties & { '--replay-portrait-color': string } = {
    '--replay-portrait-color': agentPortraitColor(agentId),
  };

  const portraitStyle: CSSProperties & { '--replay-portrait-color': string } = { ...colorStyle };

  if (size !== undefined) {
    portraitStyle.width = size;
    portraitStyle.height = size;
  }

  const failed = () => {
    setBroken(url);
    onImageError?.();
  };

  return (
    <Dialog>
      <DialogTrigger
        className={`replay-agent-portrait ${className}`}
        style={portraitStyle}
        data-entrant-id={agentId}
        data-portrait-fallback={present ? undefined : 'robot'}
        aria-label={`View ${name} profile picture`}
      >
        {present ? (
          <img src={url} alt="" width="88" height="88" loading="lazy" onError={failed} />
        ) : (
          <RobotPortrait />
        )}
      </DialogTrigger>
      <DialogContent className="replay-portrait-dialog" closeLabel="Close profile picture">
        {present ? (
          <img src={url} alt={`${name} profile picture`} width="320" height="320" onError={failed} />
        ) : (
          <div
            className="replay-agent-portrait-fallback"
            style={colorStyle}
            role="img"
            aria-label={`${name} default portrait`}
          >
            <RobotPortrait />
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
