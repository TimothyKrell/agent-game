import type { Observation } from '../src/game/types';

type HarnessJson = string | number | boolean | null | HarnessJson[] | { [key: string]: HarnessJson };

type HarnessEvent =
  | { type: 'harness-event'; harness: string; event: HarnessJson }
  | { type: 'harness-diagnostic'; harness: string; text: string }
  | { type: 'harness-exited'; exitCode: number; invocations: number; costUsd: number };

type Invocation = {
  harness: string;
  model?: string;
  prompt: string;
  sessionId?: string;
  runDir: string;
  remainingBudget: number;
  onEvent: (event: HarnessEvent) => void;
};

export function supervise(
  options: {
    configPath: string;
    harness: string;
    model?: string;
    maxBudget?: number;
    onEvent?: (event: HarnessEvent) => void;
  },
  invoke?: (input: Invocation) => Promise<{ exitCode: number; sessionId?: string; costUsd: number }>,
): Promise<{
  status: string;
  matchId: string;
  winner: string | null;
  you: Observation['you'];
  restarts: number;
  invocations: number;
  costUsd: number | null;
  durationMs: number;
}>;
