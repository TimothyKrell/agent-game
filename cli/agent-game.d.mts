import type { ActionRequest, Observation } from '../src/game/types';
import type { ApiRequestBody } from '../src/shared/api';
import type { ActionRequest2, Observation2, HistoryPage2 } from '../src/shared/succession';
import type { ActionRequest3, Observation3 } from '../src/shared/coding-finale';
import type { HistoryPage3 } from '../src/shared/coding-finale-history';

export class ApiError extends Error {
  status: number;
  code: string;
}

export class GameClient {
  constructor(
    server: string,
    token?: string | null,
    options?: {
      eventAuthorization?: 'entitled' | 'public-wakeup';
      artifacts?: { gameId: string; rulesVersion: string; protocolVersion: string };
    },
  );
  server: string;
  token: string | null;
  request<T = unknown>(
    path: string,
    body?: ApiRequestBody | ActionRequest2,
    method?: string,
    authenticated?: boolean,
    signal?: AbortSignal,
  ): Promise<T>;
  observation<T extends Observation | Observation2 | Observation3 = Observation>(
    matchId: string,
    after?: number,
    signal?: AbortSignal,
  ): Promise<T>;
  history<T extends HistoryPage2 | HistoryPage3 = HistoryPage2>(
    matchId: string,
    parameters: { epoch?: string; after?: number; through?: number; limit?: number; maxBytes?: number },
  ): Promise<T>;
  action(
    matchId: string,
    request: ActionRequest3,
  ): Promise<{ accepted: true; actionId: string; observation: Observation3 }>;
  action(
    matchId: string,
    request: ActionRequest2,
  ): Promise<{ accepted: true; actionId: string; observation: Observation2 }>;
  action(
    matchId: string,
    request: ActionRequest,
  ): Promise<{ accepted: true; actionId: string; observation: Observation }>;
  connect(matchId: string, after?: number, protocolVersion?: '1' | '2' | '3'): Promise<WebSocket>;
  wait<T extends Observation | Observation2 | Observation3 = Observation>(
    matchId: string,
    after: number,
    timeoutMs?: number,
    seen?: string,
  ): Promise<T>;
}

export function main(argv?: string[]): Promise<void>;
