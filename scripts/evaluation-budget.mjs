import { readFile, readdir, mkdir, open } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';

export const APPROVED_EVALUATION_USD = 10;

/** Includes historical unknown-usage reservations and Claude's reported token accounting. */
export async function evaluationLedger() {
  const entries = [
    { source: 'Claude initial foreground run', accountedUsd: 0.906607 },
    { source: 'Sample lost across Worker restart', accountedUsd: 0.02 },
  ];

  const samples = await readFile('docs/evaluation/model-samples.jsonl', 'utf8').catch(() => '');

  if (samples.trim())
    entries.push({
      source: 'model-samples.jsonl',
      accountedUsd: samples
        .trim()
        .split('\n')
        .reduce((sum, line) => sum + (JSON.parse(line).costUsd ?? 0.02), 0),
    });

  for (const source of await readdir('docs/evaluation')) {
    if (!/^(full-|stepped-|live-|sample-|claude-supervised).*\.json$/.test(source)) continue;
    const result = JSON.parse(await readFile(`docs/evaluation/${source}`, 'utf8'));
    entries.push({ source, accountedUsd: result.accountedUsd ?? result.costUsd ?? 2 });
  }

  const accountedUsd = entries.reduce((sum, entry) => sum + entry.accountedUsd, 0);

  return { entries, accountedUsd, remainingUsd: APPROVED_EVALUATION_USD - accountedUsd };
}

/** One local driver may admit paid evaluation calls at a time. Artifacts reserve before I/O. */
export async function lockEvaluation() {
  await mkdir('.agent-game', { recursive: true });
  const path = '.agent-game/evaluation.lock';
  let lock;

  try {
    lock = await open(path, 'wx');
  } catch {
    throw new Error(
      'Another evaluation holds .agent-game/evaluation.lock. If its process has stopped, remove that stale lock before continuing.',
    );
  }

  await lock.writeFile(String(process.pid));
  await lock.close();
  process.once('exit', () => {
    try {
      unlinkSync(path);
    } catch {
      /* Already released. */
    }
  });
}
