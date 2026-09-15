import { requireCondition } from './preview-artifact.ts';

export function previewTarget(prNumber: number, subdomain: string) {
  requireCondition(
    Number.isSafeInteger(prNumber) && prNumber > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain),
    'Invalid trusted preview target',
  );
  const stage = `pr-${prNumber}`;
  const workerName = `agent-game-${stage}`;

  return {
    stage,
    workerName,
    origin: `https://${workerName}.${subdomain}.workers.dev`,
    policy: 'scripted-zero-budget-unranked' as const,
  };
}
