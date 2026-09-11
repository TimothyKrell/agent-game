import { writeFile, mkdir } from 'node:fs/promises';
import { evaluationLedger, lockEvaluation } from './evaluation-budget.mjs';

// Explicit invocation is the spending boundary. Unit/API/browser tests never invoke this script.
const endpoint = process.env.EVALUATION_URL ?? 'http://127.0.0.1:8794';

const limit = Math.min(10, Number(process.env.EVALUATION_BUDGET_USD ?? '1'));

if (!Number.isFinite(limit) || limit <= 0)
  throw new Error('Set a positive evaluation budget (at most the approved $10).');

await mkdir('docs/evaluation', { recursive: true });

await lockEvaluation();

let accounted = 0;

const ready = await fetch(endpoint).then((response) => response.json());

const models = [
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  ...(ready.openaiConfigured ? ['gpt-4.1-mini-2025-04-14'] : []),
];

for (const model of models)
  for (const scenario of [
    'cooperative-policy',
    'rogue-policy',
    'coordinator-discard',
    'overlord-nomination',
    'execute-overlord',
    'discussion',
  ]) {
    for (let repetition = 0; repetition < 2; repetition++) {
      if (accounted + 0.02 > limit || (await evaluationLedger()).remainingUsd < 0.02)
        throw new Error(`Evaluation admission budget exhausted at $${accounted.toFixed(4)} accounted.`);
      const started = Date.now();
      const file = `docs/evaluation/sample-${started}.json`;
      await writeFile(
        file,
        JSON.stringify({ status: 'reserved', accountedUsd: 0.02, model, scenario }) + '\n',
      );
      let result;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, scenario }),
          signal: AbortSignal.timeout(40_000),
        });

        const text = await response.text();

        try {
          result = JSON.parse(text);
        } catch {
          result = { error: `Transport returned HTTP ${response.status}: ${text.slice(0, 150)}` };
        }
      } catch (error) {
        result = { error: error.message };
      }

      const row = {
        at: new Date().toISOString(),
        repetition,
        policyVersion: 'house-4',
        model,
        scenario,
        latencyMs: Date.now() - started,
        ...result,
      };

      accounted += result.costUsd ?? 0.02;
      await writeFile(file, JSON.stringify({ ...row, accountedUsd: result.costUsd ?? 0.02 }, null, 2) + '\n');
      console.log(
        JSON.stringify({
          model,
          scenario,
          valid: result.valid ?? false,
          intentional: result.intentional,
          latencyMs: row.latencyMs,
          costUsd: result.costUsd,
          error: result.error,
        }),
      );
    }
  }

console.log(
  JSON.stringify({
    accountedUsd: accounted,
    openai: ready.openaiConfigured ? 'evaluated' : 'not configured',
  }),
);
