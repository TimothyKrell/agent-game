import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import type { Observation3 } from '../src/shared/coding-finale';
import type { TransportActionRequest } from '../src/shared/api';
import { routingChallenge } from '../src/game/coding-finale/routing';
import { FINALE_RULES } from '../src/game/coding-finale/types';
import type { HouseCodingContext, HouseJob } from '../src/server/house-contract';
import { generateCodingHouse } from '../src/server/coding-house';
import { HouseSeatRunner } from '../src/server/house-runner';

const coordinator = {
  reserveInference: vi.fn().mockResolvedValue({ allowed: true }),
  recordInference: vi.fn().mockResolvedValue(undefined),
  retireInferenceWaiter: vi.fn().mockResolvedValue(undefined),
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const model = {
  provider: 'workers-ai',
  model: '@cf/qwen/qwen3-30b-a3b-fp8',
  policyVersion: 'coding-house-1',
} satisfies HouseJob['model'];

const candidate = (source: string) => ({
  program: { language: 'javascript', source },
  inputs: [],
  notes: 'Check public example.',
});

function harness() {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  const db = new DatabaseSync(':memory:');
  let alarm: number | null = null;
  const deadline = Date.now() + FINALE_RULES.durationMs;

  const view: Observation3 = {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'race',
    mode: 'evaluation',
    createdAt: Date.now(),
    finishedAt: null,
    serverNow: Date.now(),
    status: 'active',
    act: 2,
    round: 1,
    phase: { id: 'race-phase', kind: 'coding-race', startedAt: Date.now(), deadline, graceUntil: null },
    seats: [],
    actOne: null,
    finale: null,
    act1Result: { team: 'cooperative', reason: 'five safeguards' },
    result: null,
    interruptionReason: null,
    you: { seat: 0, agentId: 'agent', alive: true, forfeited: false, generation: 0 },
    chat: { open: false, maxCharacters: 700, cooldownMs: 5000, nextSpeakAt: null },
    decision: { id: 'tier-1-attempt-0', deadline, graceUntil: deadline, actions: [] },
    commitment: { digest: 'commit', reveal: null },
    history: { visibilityEpoch: 'epoch', streamHead: 0 },
  };

  const coding: HouseCodingContext = {
    challenge: { ...routingChallenge(1), challengeId: 'challenge', limits: FINALE_RULES },
    priorProgram: null,
    feedback: [],
  };

  const run = vi.fn().mockResolvedValue({
    response: candidate('export function solve() { return 7; }'),
    usage: { prompt_tokens: 1200, completion_tokens: 900 },
  });

  const match = {
    houseObservation: vi.fn(async () => ({
      observation: view,
      coding,
      persona: 'Analytical',
      recent: [],
      lastChat: null,
    })),
    houseCodingPractice: vi.fn().mockResolvedValue({
      ok: true,
      value: { stdout: '[7]', stderr: '', exitCode: 0, timedOut: false, truncated: false },
    }),
    submitHouse: vi.fn(async (_job: HouseJob, _request: TransportActionRequest) => ({ ok: true })),
  };

  const ctx = {
    storage: {
      sql: {
        exec(sql: string, ...values: (string | number | null)[]) {
          const statement = db.prepare(sql);
          const rows = statement.columns().length ? statement.all(...values) : [];
          const rowsWritten = statement.columns().length ? 0 : Number(statement.run(...values).changes);

          return {
            rowsWritten,
            toArray: () => rows,
            one: () => {
              if (rows.length !== 1) throw new Error('Expected one row');

              return rows[0];
            },
          };
        },
      },
      transactionSync<T>(fn: () => T) {
        return fn();
      },
      async setAlarm(at: number) {
        alarm = at;
      },
      async deleteAlarm() {
        alarm = null;
      },
    },
    waitUntil: (promise: Promise<void>) => promise,
  };

  const env = {
    ENVIRONMENT: 'development',
    AI: { run },
    MATCHES: { getByName: () => match },
    MATCHMAKING: { getByName: () => coordinator },
  };

  const cold = (): HouseSeatRunner => Reflect.construct(HouseSeatRunner, [ctx, env]);

  const job: HouseJob = {
    id: 'race:seat:0:decision:0:action',
    matchId: 'race',
    gameId: 'coding-finale',
    rulesVersion: 'coding-finale-1',
    seat: 0,
    generation: 0,
    phaseId: view.phase.id,
    decisionId: view.decision!.id,
    kind: 'action',
    dueAt: Date.now(),
    deadline,
    model,
  };

  const tick = async () => {
    vi.setSystemTime(Math.max(Date.now() + 1, alarm ?? 0));
    await cold().alarm();
  };

  return { db, cold, job, tick, run, match, coding, view };
}

it('retires an old Act 2 chat activation without model calls, spending, or submission', async () => {
  const h = harness();

  try {
    await h.cold().enqueue({ ...h.job, id: 'race:seat:0:chat:0', kind: 'chat' });
    await h.tick();
    expect(h.run).not.toHaveBeenCalled();
    expect(coordinator.reserveInference).not.toHaveBeenCalled();
    expect(h.match.submitHouse).not.toHaveBeenCalled();
    expect(h.db.prepare('SELECT outcome FROM jobs').get()).toEqual({ outcome: 'chat-closed' });
  } finally {
    h.db.close();
  }
});

it('resumes persisted source and practice across cold alarms, revises with actual output, and retries one formal receipt without reinference', async () => {
  const h = harness();

  try {
    h.run.mockResolvedValueOnce({
      response: candidate('export function solve() { return -1; }'),
      usage: { prompt_tokens: 1000, completion_tokens: 700 },
    });
    h.match.houseCodingPractice.mockResolvedValueOnce({
      ok: true,
      value: { stdout: '[-1]', stderr: '', exitCode: 0, timedOut: false, truncated: false },
    });
    h.match.submitHouse.mockRejectedValueOnce(new Error('Lost receipt acknowledgement'));
    await h.cold().enqueue(h.job);

    for (let step = 0; step < 7; step++) await h.tick();
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(h.match.houseCodingPractice).toHaveBeenCalledTimes(1);
    expect(h.match.houseCodingPractice.mock.calls[0]?.[1]).toEqual(
      candidate('export function solve() { return -1; }').program,
    );
    const revision = JSON.stringify(h.run.mock.calls[1]);
    expect(revision).toContain('revise-after-practice');
    expect(revision).toContain('[-1]');
    expect(h.match.submitHouse).toHaveBeenCalledTimes(2);
    const request = h.match.submitHouse.mock.calls[0][1];
    expect(request).toEqual(h.match.submitHouse.mock.calls[1][1]);
    expect(request.actionId).toMatch(/^[a-f0-9]{64}$/);
    expect(request.action).toMatchObject({
      type: 'submit-program',
      tier: 1,
      program: { source: 'export function solve() { return 7; }' },
    });
    expect(coordinator.reserveInference).toHaveBeenCalledTimes(2);
    expect(coordinator.recordInference).toHaveBeenCalledTimes(2);
    expect(coordinator.reserveInference.mock.calls.map(([input]) => input.id)).toEqual([
      `${h.job.id}:attempt:1`,
      `${h.job.id}:attempt:2`,
    ]);
    expect(h.db.prepare('SELECT outcome FROM jobs').get()).toEqual({ outcome: 'accepted' });

    // A later verdict unlocks a new decision under the same race phase and original deadline.
    h.coding.priorProgram = { language: 'javascript', source: 'export function solve() { return 7; }' };
    h.coding.challenge = { ...routingChallenge(2), challengeId: 'challenge', limits: FINALE_RULES };
    h.view.decision!.id = 'tier-2-attempt-1';

    const next = {
      ...h.job,
      id: 'race:seat:0:decision:1:action',
      decisionId: h.view.decision!.id,
      dueAt: Date.now(),
    };

    await h.cold().enqueue(next);

    for (let step = 0; step < 5; step++) await h.tick();
    expect(h.run).toHaveBeenCalledTimes(4);
    expect(h.match.submitHouse.mock.calls[2][1].action).toMatchObject({ type: 'submit-program', tier: 2 });
    expect(coordinator.reserveInference.mock.calls[2][0]).toMatchObject({
      matchId: 'race',
      deadline: h.job.deadline,
    });
    expect(JSON.stringify(h.run.mock.calls[2])).toContain('priorProgram');
  } finally {
    h.db.close();
  }
});

it('caps provider failures at four paid admissions and does not spend on a stale decision', async () => {
  const h = harness();

  try {
    h.run.mockRejectedValue(new Error('Provider failed'));
    await h.cold().enqueue(h.job);

    for (let step = 0; step < 7; step++) await h.tick();
    expect(h.run).toHaveBeenCalledTimes(4);
    expect(coordinator.recordInference.mock.calls).toHaveLength(4);
    expect(coordinator.recordInference.mock.calls.every(([, cost]) => cost === null)).toBe(true);
    expect(h.match.submitHouse).not.toHaveBeenCalled();
    h.view.decision!.id = 'tier-1-attempt-1';
    await h.cold().enqueue({ ...h.job, id: 'stale', dueAt: Date.now() });
    await h.tick();
    expect(h.run).toHaveBeenCalledTimes(4);
    expect(h.db.prepare('SELECT outcome FROM jobs WHERE id=?').get('stale')).toEqual({ outcome: 'obsolete' });
  } finally {
    h.db.close();
  }
});

it('loads own judge feedback on a retry and bounds uncertain practice dispatches before revising', async () => {
  const h = harness();

  try {
    h.coding.priorProgram = {
      language: 'typescript',
      source: 'export function solve(): number { return -1; }',
    };
    h.coding.feedback = [
      {
        sequence: 1,
        actionId: 'prior',
        seat: 0,
        generation: 0,
        tier: 1,
        fingerprint: 'hash',
        receivedAt: Date.now() - 1000,
        status: 'judged',
        verdict: 'wrong-answer',
      },
    ];
    h.match.houseCodingPractice.mockRejectedValue(new Error('Lost practice acknowledgement'));
    await h.cold().enqueue(h.job);

    for (let step = 0; step < 8; step++) await h.tick();
    expect(h.match.houseCodingPractice).toHaveBeenCalledTimes(2);
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.run.mock.calls[0])).toContain('wrong-answer');
    expect(JSON.stringify(h.run.mock.calls[0])).toContain('export function solve(): number');
    expect(JSON.stringify(h.run.mock.calls[1])).toContain('Practice result unavailable');
    expect(h.match.submitHouse).toHaveBeenCalledTimes(1);
    expect(coordinator.reserveInference).toHaveBeenCalledTimes(2);
  } finally {
    h.db.close();
  }
});

it('runs only the explicit preview fixture through practice and formal submission without model admission', async () => {
  const h = harness();

  try {
    await h.cold().enqueue({ ...h.job, model: { ...model, provider: 'preview' } });

    for (let step = 0; step < 5; step++) await h.tick();
    expect(h.run).not.toHaveBeenCalled();
    expect(coordinator.reserveInference).not.toHaveBeenCalled();
    expect(h.match.houseCodingPractice).toHaveBeenCalledTimes(1);
    expect(h.match.submitHouse).toHaveBeenCalledTimes(1);
    expect(h.db.prepare('SELECT text FROM notes').get()).toEqual({
      text: 'Deterministic preview fixture; not a model experiment.',
    });
  } finally {
    h.db.close();
  }
});

it('uses the code output budget, rejects UTF-8 overflow and cannot call a paid model as preview', async () => {
  const run = vi.fn().mockResolvedValue({
    response: candidate(`export const s = '${'é'.repeat(17_000)}';`),
    usage: { prompt_tokens: 50, completion_tokens: 8000 },
  });

  await expect(
    Effect.runPromise(
      generateCodingHouse(
        { AI: { run }, OPENAI_BASE_URL: 'https://api.openai.com/v1' },
        model,
        'Public challenge only',
        Date.now() + 300_000,
      ),
    ),
  ).rejects.toThrow('UTF-8 byte limit');
  expect(run).toHaveBeenCalledWith(
    model.model,
    expect.objectContaining({ max_tokens: 8192 }),
    expect.anything(),
  );
  await expect(
    Effect.runPromise(
      generateCodingHouse(
        { AI: { run }, OPENAI_BASE_URL: 'https://api.openai.com/v1' },
        { ...model, provider: 'preview' },
        'Preview',
        Date.now() + 300_000,
      ),
    ),
  ).rejects.toThrow('Preview is not model inference');
  expect(run).toHaveBeenCalledTimes(1);
});
