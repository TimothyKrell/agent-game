import { mkdir, writeFile } from 'node:fs/promises';
import { Schema } from 'effect';
import { evaluationLedger, lockEvaluation } from './evaluation-budget.mjs';
import { act, advance, createMatch, pendingSeats } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { terminal } from '../src/game/types';
import { housePrompt, inferenceCost, HOUSE_SYSTEM } from '../src/server/house-model';

const DecisionResult = Schema.Struct({
  value: Schema.optional(Schema.Struct({ choice: Schema.Number, notes: Schema.String })),
  inputTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  outputTokens: Schema.optional(Schema.NullOr(Schema.Number)),
  latencyMs: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
});

await mkdir('docs/evaluation', { recursive: true });

const endpoint = process.env.EVALUATION_URL ?? 'http://127.0.0.1:8794';

await lockEvaluation();

for (const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash']) {
  if ((await evaluationLedger()).remainingUsd < 2)
    throw new Error('Insufficient headroom in the approved model-evaluation budget.');
  const path = `docs/evaluation/stepped-${model.includes('llama') ? 'llama' : 'glm'}-${Date.now()}.json`;

  let state = createMatch(
    'model-game-' + crypto.randomUUID(),
    Array.from({ length: 10 }, (_, i) => ({
      agentId: `house-${i}`,
      ownerId: null,
      name: `Competitor ${i}`,
      house: true,
      rating: 1000,
    })),
    0,
    { mode: 'evaluation' },
  );

  const notes = Array<string>(10).fill('');
  let now = 0;
  let costUsd = 0;
  let accountedUsd = 0;
  const results: { latencyMs: number; choice: number; model: string }[] = [];
  const started = Date.now();

  const record = async (status: string, error?: string) =>
    writeFile(
      path,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          policyVersion: 'house-4',
          model,
          status,
          error,
          calls: results.length,
          costUsd,
          accountedUsd,
          durationMs: Date.now() - started,
          samples: results,
          replay: terminal(state) ? observe(state) : null,
        },
        null,
        2,
      ) + '\n',
    );

  await record('running');

  try {
    while (!terminal(state) && results.length < 500) {
      const pending = pendingSeats(state);

      if (!pending.length) {
        now = state.phase.deadline!;
        state = advance(state, now);
        continue;
      }

      const seat = pending[0];
      const view = observe(state, seat, 0, true);

      const prompt = housePrompt(
        view,
        'A concise strategist pursuing their team victory.',
        notes[seat],
        'action',
      );

      const estimate = inferenceCost(model, new TextEncoder().encode(prompt + HOUSE_SYSTEM).byteLength, 512);

      if (accountedUsd + estimate > 2) throw new Error('Per-game admission budget reached.');
      accountedUsd += estimate;
      await record('running'); // Reserve before the potentially billable request.

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          scenario: 'decision',
          prompt,
          choiceCount: view.decision!.actions.length,
        }),
        signal: AbortSignal.timeout(35_000),
      });

      const result = Schema.decodeUnknownSync(DecisionResult)(await response.json());

      if (!response.ok || !result.value || result.latencyMs === undefined)
        throw new Error(result.error ?? 'Decision generation failed');

      const measured =
        result.inputTokens != null && result.outputTokens != null
          ? inferenceCost(model, result.inputTokens, result.outputTokens)
          : estimate;

      costUsd += measured;
      accountedUsd += measured - estimate;
      notes[seat] = result.value.notes;
      const action = view.decision!.actions[result.value.choice]?.action;

      if (!action) throw new Error('Model returned an invalid legal choice');
      results.push({ model, latencyMs: result.latencyMs, choice: result.value.choice });
      state = act(
        state,
        seat,
        0,
        { actionId: crypto.randomUUID(), phaseId: state.phase.id, decisionId: view.decision!.id, action },
        now,
      );
      await record(state.phase.kind);
    }

    console.log(
      JSON.stringify({
        model,
        status: state.phase.kind,
        rounds: state.round,
        winner: state.winner,
        calls: results.length,
        costUsd,
        accountedUsd,
        path,
      }),
    );
  } catch (error) {
    process.exitCode = 1;
    await record('failed', error instanceof Error ? error.message : 'Unknown failure');
    console.log(
      JSON.stringify({
        model,
        status: 'failed',
        calls: results.length,
        costUsd,
        accountedUsd,
        error: error instanceof Error ? error.message : 'Unknown failure',
        path,
      }),
    );
  }
}
