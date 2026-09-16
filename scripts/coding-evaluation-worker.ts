import { Effect } from 'effect';
import { CODING_HOUSE_SYSTEM, codingHousePrompt, generateCodingHouse } from '../src/server/coding-house';
import { inferenceCost } from '../src/server/house-model';
import type {
  HouseCodingCandidate,
  HouseCodingContext,
  HouseCodingPractice,
  HouseModelConfig,
} from '../src/server/house-contract';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/health') return Response.json({ ok: true });

    if (request.method !== 'POST' || !['/quote', '/generate'].includes(path))
      return new Response('Not found', { status: 404 });

    if (Number(request.headers.get('content-length') ?? Infinity) > 120_000)
      return new Response('Too large', { status: 413 });

    const input = await request.json<{
      model: string;
      deadline: number;
      context: HouseCodingContext;
      candidate: HouseCodingCandidate | null;
      practice: HouseCodingPractice | null;
    }>();

    if (!['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'].includes(input.model))
      return new Response('Model rejected', { status: 400 });

    const config: HouseModelConfig = {
      provider: 'workers-ai',
      model: input.model,
      policyVersion: 'coding-calibration-1',
      coding: { language: 'javascript', maxOutputTokens: 8192, timeoutMs: 60_000 },
    };

    const prompt = codingHousePrompt(input.context, config, input.deadline, input.candidate, input.practice);

    // UTF-8 bytes overestimate token count; extra allowance covers generated JSON schema.
    const reservedUsd = inferenceCost(
      input.model,
      new TextEncoder().encode(prompt + CODING_HOUSE_SYSTEM).byteLength + 16_384,
      8192,
    );

    if (path === '/quote') return Response.json({ reservedUsd, prompt, config, system: CODING_HOUSE_SYSTEM });
    const startedAt = Date.now();

    try {
      const result = await Effect.runPromise(generateCodingHouse(env, config, prompt, input.deadline));

      return Response.json({
        ...result,
        startedAt,
        latencyMs: Date.now() - startedAt,
        costUsd:
          result.inputTokens !== null && result.outputTokens !== null
            ? inferenceCost(input.model, result.inputTokens, result.outputTokens)
            : null,
      });
    } catch (error) {
      return Response.json(
        { error: String(error), startedAt, latencyMs: Date.now() - startedAt },
        { status: 502 },
      );
    }
  },
};
