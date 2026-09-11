export interface HouseModelConfig {
  provider: 'preview' | 'workers-ai' | 'openai';
  model: string;
  policyVersion: string;
}

export interface HouseJob {
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
