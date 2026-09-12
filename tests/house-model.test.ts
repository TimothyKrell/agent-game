import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';
import { generateHouse, inferenceCost } from '../src/server/house-model';

const model = '@cf/qwen/qwen3-30b-a3b-fp8';

it('reads Qwen chat completions when the native response field is null', async () => {
  const run = vi.fn().mockResolvedValue({
    response: null,
    choices: [
      {
        finish_reason: 'stop',
        message: { content: JSON.stringify({ choice: 1, message: null, notes: 'Preserve safeguards.' }) },
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 30 },
  });

  const env = { AI: { run }, OPENAI_BASE_URL: 'https://api.openai.com/v1' };

  const result = await Effect.runPromise(
    generateHouse(
      env,
      { provider: 'workers-ai', model, policyVersion: 'house-4' },
      'Choose a policy.',
      Date.now() + 30_000,
      2,
    ),
  );

  expect(result).toMatchObject({ value: { choice: 1, message: null }, inputTokens: 1200, outputTokens: 30 });
  expect(run).toHaveBeenCalledWith(
    model,
    expect.objectContaining({
      messages: expect.arrayContaining([{ role: 'user', content: 'Choose a policy.\n/no_think' }]),
    }),
    expect.anything(),
  );
});

it('rejects a reasoning-only truncated completion rather than treating it as a game decision', async () => {
  const run = vi.fn().mockResolvedValue({
    response: null,
    choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'Consider choice 1...' } }],
    usage: { prompt_tokens: 1223, completion_tokens: 512 },
  });

  const env = { AI: { run }, OPENAI_BASE_URL: 'https://api.openai.com/v1' };

  await expect(
    Effect.runPromise(
      generateHouse(
        env,
        { provider: 'workers-ai', model, policyVersion: 'house-4' },
        'Choose a policy.',
        Date.now() + 30_000,
        2,
      ),
    ),
  ).rejects.toThrow('Model response was truncated.');
});

it('accounts Qwen at its own published input and output rates', () => {
  expect(inferenceCost(model, 1_000_000, 1_000_000)).toBeCloseTo(0.386);
});
