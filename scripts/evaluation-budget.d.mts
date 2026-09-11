export const APPROVED_EVALUATION_USD: number;

export function evaluationLedger(): Promise<{
  entries: { source: string; accountedUsd: number }[];
  accountedUsd: number;
  remainingUsd: number;
}>;
export function lockEvaluation(): Promise<void>;
