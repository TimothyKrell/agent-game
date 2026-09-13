import type { Observation } from '../src/game/types';
export type HarnessJson = string | number | boolean | null | HarnessJson[] | { [key: string]: HarnessJson };
export type Outcome =
  | 'rotated'
  | 'returned'
  | 'execution-error'
  | 'user-stopped'
  | 'runtime-exhausted'
  | 'budget-exhausted'
  | 'accounting-unavailable';
export type HarnessEvent =
  | { type: 'harness-event'; harness: string; event: HarnessJson }
  | { type: 'harness-diagnostic'; harness: string; text: string }
  | {
      type: 'harness-exited';
      outcome: Outcome;
      exitCode: number | null;
      invocations: number;
      costUsd: number | null;
    };
export type UsageReport = { scope: 'invocation' | 'session'; total: number; final?: boolean };
export type Invocation = {
  harness: string;
  model?: string;
  prompt: string;
  sessionId?: string;
  runDir: string;
  remainingBudget: number | null;
  remainingRuntimeMs: number;
  timeoutMs?: number;
  deadline: number;
  signal: AbortSignal;
  onEvent: (event: HarnessEvent) => void;
  onSession: (id: string) => Promise<void>;
  onUsage: (report: UsageReport) => Promise<void>;
};
export type InvocationResult = {
  exitCode?: number;
  outcome?: Outcome;
  sessionId?: string;
  costUsd?: number;
  acceptedDecision?: boolean;
};
export type SupervisorOptions = {
  configPath: string;
  harness: string;
  model?: string;
  maxBudget?: number;
  requestedGame?: 'secret-overlord' | 'succession';
  maxRuntimeMs?: number;
  queueAllowanceMs?: number;
  childSliceMs?: number;
  onEvent?: (event: HarnessEvent) => void;
  signal?: AbortSignal;
  clock?: { now: () => number; monotonic: () => number; sleep: (ms: number) => Promise<void> };
  request?: (
    connection: { server: string; token?: string },
    path: string,
    body: unknown,
    method: string | undefined,
    signal: AbortSignal,
  ) => Promise<unknown>;
};
export type SupervisorResult = {
  status: string;
  reason: string | null;
  gameId: string;
  matchId: string | null;
  winner: string | null;
  result: unknown;
  you: Observation['you'] | null;
  controller: unknown;
  serverStatus: string | null;
  observedAt: number | null;
  snapshotStale: boolean;
  invocations: number;
  restarts: number;
  costUsd: number | null;
  accounting: {
    mode: string;
    limit: number | null;
    known: number;
    observed: boolean;
    unknown: boolean;
    exceeded: boolean;
    remaining: number | null;
    unresolvedGranted: number | null;
  };
  durationMs: number;
  queueDurationMs: number;
  queue: unknown;
};
export const SUCCESSION_CANDIDATE: Readonly<{
  maxRuntimeMs: number;
  queueAllowanceMs: number;
  childSliceMs: number;
  frozen: true;
}>;
export function interruptSession(sessionId: string, runDir: string, timeoutMs: number): Promise<void>;
export function invokeHarness(input: Invocation): Promise<InvocationResult>;
export function supervise(
  options: SupervisorOptions,
  invoke?: (input: Invocation) => Promise<InvocationResult>,
): Promise<SupervisorResult>;
