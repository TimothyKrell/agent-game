import type { ActionRequest, Observation } from '../src/game/types';
import type { ApiRequestBody } from '../src/shared/api';

export class ApiError extends Error {
  status: number;
  code: string;
}

export class GameClient {
  constructor(server: string, token?: string | null);
  server: string;
  token: string | null;
  request<T = unknown>(
    path: string,
    body?: ApiRequestBody,
    method?: string,
    authenticated?: boolean,
  ): Promise<T>;
  observation(matchId: string, after?: number): Promise<Observation>;
  action(
    matchId: string,
    request: ActionRequest,
  ): Promise<{ accepted: true; actionId: string; observation: Observation }>;
  connect(matchId: string, after?: number): Promise<WebSocket>;
  wait(matchId: string, after: number, timeoutMs?: number): Promise<Observation>;
}

export function main(argv?: string[]): Promise<void>;
