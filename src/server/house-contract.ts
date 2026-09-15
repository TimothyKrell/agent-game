import type { GameId } from '../game/contracts';

/** One second of generation plus generateHouse's 150ms timeout allowance. */
export const HOUSE_CHAT_MIN_REMAINING_MS = 1150;

export function houseChatBudget(model: HouseModelConfig): number {
  return model.provider === 'preview' ? 0 : HOUSE_CHAT_MIN_REMAINING_MS;
}

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
