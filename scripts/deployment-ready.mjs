import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

export async function waitForDeployment(
  server,
  { timeoutMs = 90_000, intervalMs = 2_000, stableForMs = 10_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let healthySince = null;
  let failure = new Error('No healthy response received');

  do {
    try {
      const response = await fetch(server + '/api/health', {
        signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))),
      });

      const text = await response.text();

      assert.equal(response.status, 200, `/api/health: ${text.slice(0, 2048)}`);
      assert.deepEqual(JSON.parse(text), { ok: true, protocolVersion: '1' });

      healthySince ??= Date.now();

      if (Date.now() - healthySince >= stableForMs) return;
    } catch (error) {
      healthySince = null;
      failure = error instanceof Error ? error : new Error(String(error));
    }

    const remaining = deadline - Date.now();

    if (remaining <= 0) break;
    await setTimeout(Math.min(intervalMs, remaining));
  } while (Date.now() < deadline);

  throw new Error(`Deployment was not ready within ${timeoutMs}ms: ${failure.message}`, { cause: failure });
}
