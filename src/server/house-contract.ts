import type { GameId } from '../game/contracts';
import type { RoutingInput, routingChallenge } from '../game/coding-finale/routing';
import type { FinaleSubmission, Program, FINALE_RULES } from '../game/coding-finale/types';
import type { RpcResult } from '../shared/api';

/** One second of generation plus generateHouse's 150ms timeout allowance. */
export const HOUSE_CHAT_MIN_REMAINING_MS = 1150;

export function houseChatBudget(model: HouseModelConfig): number {
  return model.provider === 'preview' ? 0 : HOUSE_CHAT_MIN_REMAINING_MS;
}

export interface HouseModelConfig {
  provider: 'preview' | 'workers-ai' | 'openai';
  model: string;
  policyVersion: string;
  coding?: {
    language?: 'javascript' | 'typescript';
    maxOutputTokens?: number;
    timeoutMs?: number;
  };
}

export interface HouseCodingContext {
  challenge: ReturnType<typeof routingChallenge> & { challengeId: string; limits: typeof FINALE_RULES };
  priorProgram: Program | null;
  feedback: FinaleSubmission[];
}

export interface HouseCodingCandidate {
  program: Program;
  inputs: RoutingInput[];
  notes: string;
}

export type HouseCodingPractice = RpcResult<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}>;

export interface HouseJob {
  gameId?: GameId;
  rulesVersion?: 'secret-overlord-1' | 'succession-1' | 'coding-finale-1';
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
