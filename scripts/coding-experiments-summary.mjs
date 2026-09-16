import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const rows = readFileSync('docs/evaluation/coding-finale-race-2.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);

const ledger = JSON.parse(readFileSync('docs/evaluation/coding-finale-budget.json', 'utf8'));

const terminal = rows.findLast((row) => row.type === 'terminal').current;

const provenance = rows.find((row) => row.type === 'provenance');

const calls = ledger.calls.filter((call) => call.race === 2);

const sum = (items, fn) => items.reduce((total, item) => total + fn(item), 0);

const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const summary = {
  label: 'SCRIPTED ACT1 + REAL CODING FINALE',
  race: 2,
  matchId: terminal.id,
  startedAt: terminal.startedAt,
  finishedObservedAt: rows.find((row) => row.current?.status === 'finished').at,
  winner: terminal.result,
  winningReceiptSeconds: (terminal.submissions.at(-1).receivedAt - terminal.startedAt) / 1000,
  knownUsageUsd: sum(calls, (call) => call.costUsd ?? 0),
  unknownUsageReservedUsd: sum(
    calls.filter((call) => call.costUsd == null),
    (call) => call.reservedUsd,
  ),
  accountedUsd: sum(calls, (call) => call.costUsd ?? call.reservedUsd),
  inputTokens: sum(calls, (call) => call.inputTokens ?? 0),
  outputTokens: sum(calls, (call) => call.outputTokens ?? 0),
  calls: calls.length,
  completedCalls: calls.filter((call) => call.status === 'completed').length,
  interruptedCalls: calls.filter((call) => call.status !== 'completed').length,
  practiceRuns: rows.filter((row) => row.type === 'practice').length,
  practiceMedianMs: median(rows.filter((row) => row.type === 'practice').map((row) => row.latencyMs)),
  formalPostCount: rows.filter((row) => row.type === 'submission').length,
  uniqueReceipts: terminal.submissions.length,
  duplicates: rows.filter((row) => row.type === 'submission' && row.receipt.duplicate).length,
  filesAtStart: provenance.files,
  filesAtEnd: Object.fromEntries(
    Object.keys(provenance.files).map((path) => [
      path,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  ),
  contestants: rows
    .filter((row) => row.type === 'contestant')
    .map((contestant) => {
      const own = calls.filter((call) => call.seat === contestant.seat);

      return {
        seat: contestant.seat,
        model: contestant.model,
        calls: own.length,
        completedCalls: own.filter((call) => call.status === 'completed').length,
        medianCompletedCallMs: median(
          own.filter((call) => call.status === 'completed').map((call) => call.latencyMs),
        ),
        practiceRuns: rows.filter((row) => row.type === 'practice' && row.seat === contestant.seat).length,
        accountedUsd: sum(own, (call) => call.costUsd ?? call.reservedUsd),
        completedTier: terminal.finalists.find((finalist) => finalist.seat === contestant.seat).completedTier,
        submissions: terminal.submissions
          .filter((submission) => submission.seat === contestant.seat)
          .map((submission) => ({
            ...submission,
            elapsedSeconds: (submission.receivedAt - terminal.startedAt) / 1000,
          })),
      };
    }),
};

writeFileSync('docs/evaluation/coding-finale-race-2-summary.json', JSON.stringify(summary, null, 2) + '\n');

console.log(JSON.stringify(summary, null, 2));
