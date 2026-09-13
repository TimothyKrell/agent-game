import type { GameId } from '../game/contracts';

export interface HouseModelConfig {
  provider: 'preview' | 'workers-ai' | 'openai';
  model: string;
  policyVersion: string;
}

export interface HouseJob {
  gameId?: GameId;
  rulesVersion?: 'secret-overlord-1' | 'succession-1';
  decisionId?: string;
  id: string;
  matchId: string;
  seat: number;
  generation: number;
  phaseId: string;
  kind: 'action' | 'chat';
  dueAt: number;
  deadline: number;
  model: HouseModelConfig;
}
