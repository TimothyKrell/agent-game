import { mkdtemp, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { supervise } from '../cli/supervisor.mjs';

async function resultFor(
  status: 'active' | 'finished' | 'interrupted',
  winnerSeat: number,
  forfeited: boolean,
) {
  const directory = await mkdtemp('/tmp/opencode/supervisor-result-');
  const configPath = `${directory}/connection.json`;
  const createdAt = Date.now();

  const identity = {
    gameId: 'succession',
    rulesVersion: 'succession-1',
    protocolVersion: '2',
    matchId: 'match_result',
  };

  await writeFile(
    configPath,
    JSON.stringify({ server: 'http://127.0.0.1:1', agentId: 'agent_result', selectedGame: 'succession' }),
  );

  return supervise(
    {
      configPath,
      harness: 'claude',
      request: async (_connection, path) =>
        path === '/api/queue'
          ? { ...identity, status: 'matched', joinedAt: createdAt, requestId: 'join_result' }
          : {
              ...identity,
              status,
              createdAt,
              act: 2,
              phase: { id: 'phase_result', kind: status === 'active' ? 'act-2:action' : 'act-2:finished' },
              history: { visibilityEpoch: status === 'active' ? 'seat-3' : 'archive', streamHead: 0 },
              decision: null,
              you: { seat: 3, forfeited },
              result: status === 'finished' ? { winnerSeat, reason: 'round-cap' } : null,
              interruptionReason: status === 'interrupted' ? 'Platform interruption' : null,
            },
    },
    async () => ({ outcome: 'user-stopped', costUsd: 0 }),
  );
}

it.each([
  { winnerSeat: 3, forfeited: false, won: true },
  { winnerSeat: 3, forfeited: true, won: false },
  { winnerSeat: 7, forfeited: false, won: false },
])(
  'reports the mechanical champion and original credit separately: $winnerSeat / forfeited=$forfeited',
  async ({ winnerSeat, forfeited, won }) => {
    const result = await resultFor('finished', winnerSeat, forfeited);

    expect(result.status).toBe('finished');
    expect(result.reason).toBeNull();
    expect(result.winningSeat).toBe(winnerSeat);
    expect(result.originalAgentResult).toEqual({ won, forfeited });
    expect(result.overallReason).toBe('round-cap');
  },
);

it('reports interruption without inventing a winning seat or original agent loss', async () => {
  const result = await resultFor('interrupted', 3, true);

  expect(result.status).toBe('interrupted');
  expect(result.winningSeat).toBeNull();
  expect(result.originalAgentResult).toBeNull();
  expect(result.overallReason).toBe('Platform interruption');
  expect(result.reason).toBeNull();
});

it('keeps a client stop distinct from overall termination and leaves active credit null', async () => {
  const result = await resultFor('active', 3, true);

  expect(result.status).toBe('client-stopped');
  expect(result.serverStatus).toBe('active');
  expect(result.reason).toBe('user-stopped');
  expect(result.winningSeat).toBeNull();
  expect(result.originalAgentResult).toBeNull();
  expect(result.overallReason).toBeNull();
});
