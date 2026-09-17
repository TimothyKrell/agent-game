import type { Observation3 } from '../src/shared/coding-finale';

export type CompactCurrent = Pick<
  Observation3,
  | 'gameId'
  | 'protocolVersion'
  | 'matchId'
  | 'status'
  | 'act'
  | 'round'
  | 'serverNow'
  | 'phase'
  | 'you'
  | 'decision'
  | 'chat'
  | 'act1Result'
  | 'result'
  | 'interruptionReason'
  | 'history'
> & {
  format: 'coding-finale-compact-1';
  seats: Pick<
    Observation3['seats'][number],
    | 'number'
    | 'name'
    | 'alive'
    | 'role'
    | 'vote'
    | 'control'
    | 'forfeited'
    | 'qualification'
    | 'recoveryCount'
  >[];
  actOne: Pick<
    NonNullable<Observation3['actOne']>,
    'coordinator' | 'executor' | 'power' | 'tracks' | 'lastGovernment' | 'private'
  > | null;
  finale: Pick<
    NonNullable<Observation3['finale']>,
    'challengeId' | 'status' | 'deadline' | 'finalists' | 'submissions' | 'you' | 'provisionalResult'
  > | null;
};

export function compactCurrent(view: Observation3): CompactCurrent;
