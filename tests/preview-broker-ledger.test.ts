import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { PlatformQueue } from '../src/server/coordinator';
import type { PreviewBrokerIntent, PreviewInference } from '../src/shared/preview-broker';

function harness() {
  const db = new DatabaseSync(':memory:');

  const storage = {
    sql: {
      exec(sql: string, ...values: (string | number | null)[]) {
        const rows = db.prepare(sql).all(...values);

        return {
          toArray: () => rows,
          one: () => {
            if (rows.length !== 1) throw new Error('Expected one row');

            return rows[0];
          },
        };
      },
    },
    transactionSync<T>(fn: () => T): T {
      db.exec('SAVEPOINT broker_test');

      try {
        const result = fn();
        db.exec('RELEASE broker_test');

        return result;
      } catch (error) {
        db.exec('ROLLBACK TO broker_test; RELEASE broker_test');
        throw error;
      }
    },
    async setAlarm() {},
  };

  const env = {
    HOUSE_PROVIDER: 'openai',
    HOUSE_MODEL: 'gpt-4.1-mini',
    HOUSE_DAILY_BUDGET_USD: '5',
    HOUSE_MATCH_RESERVATION_USD: '1.5',
    HOUSE_SUCCESSION_MATCH_RESERVATION_USD: '',
    MAX_CONCURRENT_MATCHES: '3',
    TIME_SCALE: '1',
    QUEUE_WAIT_SECONDS: '30',
  };

  const queue: PlatformQueue = Reflect.construct(PlatformQueue, [
    { storage, waitUntil: (p: Promise<void>) => p },
    env,
  ]);

  const production = (id: string, reservation = 1.5) =>
    db
      .prepare(
        "INSERT INTO allocations(id,state,entries,grants,created_at,reservation) VALUES (?,'active','[]','{\"agent-prod\":\"grant-prod\"}',?,?)",
      )
      .run(id, Date.now(), reservation);

  return { db, queue, env, production };
}

function intent(requestId = 'request-broker-1', origin = 'https://preview-a.example'): PreviewBrokerIntent {
  return {
    requestId,
    targetOrigin: origin,
    targetMatchId: `match-${requestId}`,
    incarnation: 'incarnation-1',
    commit: 'a'.repeat(40),
    gameId: 'secret-overlord',
    rulesVersion: 'secret-overlord-1',
    policyVersion: 'house-4',
    tickets: [
      {
        agentId: 'agent-source-1',
        ownerId: 'owner-source-1',
        grantId: 'grant-target-1',
        handoffId: 'handoff-source-1',
        queueRequestId: 'queue-request-1',
        joinedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
    ],
  };
}

function inference(allocationId: string, overrides: Partial<PreviewInference> = {}): PreviewInference {
  return {
    allocationId,
    commit: 'a'.repeat(40),
    jobId: 'match-seat-1:phase-1:action',
    attempt: 1,
    phaseId: 'phase-1',
    seat: 1,
    generation: 0,
    deadline: Date.now() + 60000,
    kind: 'required',
    policyVersion: 'house-4',
    system: 'Choose a legal action.',
    prompt: 'Test observation.',
    choices: ['{"type":"vote","approve":true}'],
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

it('shares one preview slot and the existing global three slots/$5 ledger without resetting production rows', async () => {
  const { db, queue, production } = harness();
  production('production-one');
  production('production-two');

  const attempts = await Promise.allSettled(
    [1, 2, 3].map(async (n) =>
      queue.preview.allocate(
        intent(`request-preview-${n}`, `https://preview-${n}.example`),
        `fingerprint-${n}`,
        'b'.repeat(40),
      ),
    ),
  );

  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(queue.preview.status()).toMatchObject({
    activeAllocations: 3,
    livePreviewAllocations: 1,
    activeReservedUsd: 4.5,
    accountedUsd: 0,
    capacity: 'busy',
  });
  expect(db.prepare('SELECT count(*) AS n FROM allocations WHERE id LIKE ?').get('production-%')).toEqual({
    n: 2,
  });
  expect(queue.status('unjoined').capacity).toBe('busy');
});

it('keeps full production and preview reservations across midnight and honors the source Succession override', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T23:59:59Z'));
  const { queue, env, production } = harness();
  env.HOUSE_SUCCESSION_MATCH_RESERVATION_USD = '2';
  production('production-one');

  const admitted = queue.preview.allocate(
    { ...intent(), gameId: 'succession', rulesVersion: 'succession-1', policyVersion: 'succession-1' },
    'same',
    'b'.repeat(40),
  );

  expect(admitted.reservationUsd).toBe(2);
  expect(admitted.snapshot).toMatchObject({
    mode: 'preview',
    houseModel: { provider: 'openai', model: 'gpt-4.1-mini' },
  });
  vi.setSystemTime(new Date('2026-09-16T00:00:01Z'));
  expect(queue.preview.status('succession')).toMatchObject({
    day: '2026-09-16',
    activeReservedUsd: 3.5,
    remainingAdmissionUsd: 1.5,
  });
  queue.preview.close(admitted.allocationId);
  expect(queue.preview.status('succession').capacity).toBe('available');
  queue.reserveInference({
    id: 'prod-usage',
    matchId: 'production-one',
    mandatory: true,
    deadline: Date.now() + 10000,
    estimate: 2,
  });
  queue.recordInference('prod-usage', 2);
  expect(queue.preview.status('succession').capacity).toBe('budget');
});

it('hard-bounds mixed previews while preserving the production mixed required exemption and funding tiers', () => {
  const { queue, production } = harness();
  const receipt = queue.preview.allocate(intent(), 'same', 'b'.repeat(40));
  production('production-one');

  const reserve = (
    id: string,
    estimate: number,
    mandatory: boolean,
    optionalKind: 'initial' | 'followup' = 'initial',
  ) =>
    queue.reserveInference({
      id,
      matchId: receipt.allocationId,
      estimate,
      mandatory,
      optionalKind,
      deadline: Date.now() + 60000,
    });

  expect(
    queue.reserveInference({
      id: 'prod-required',
      matchId: 'production-one',
      estimate: 6,
      mandatory: true,
      deadline: Date.now() + 60000,
    }).allowed,
  ).toBe(true);
  expect(reserve('preview-required-too-large', 1.51, true)).toMatchObject({
    allowed: false,
    reason: 'match-budget',
    retryable: false,
  });
  queue.recordInference('prod-required', 0);
  expect(reserve('preview-initial', 0.55, false).allowed).toBe(true);
  queue.recordInference('preview-initial', 0.55);
  expect(reserve('preview-followup', 0.18, false, 'followup').allowed).toBe(true);
  queue.recordInference('preview-followup', 0.18);
  expect(reserve('preview-followup-over', 0.01, false, 'followup')).toMatchObject({
    allowed: false,
    reason: 'followup-budget',
    retryable: false,
  });
  expect(reserve('preview-optional-over', 0.03, false)).toMatchObject({
    allowed: false,
    reason: 'optional-budget',
    retryable: false,
  });
  expect(reserve('preview-required-rest', 0.76, true).allowed).toBe(true);
  queue.recordInference('preview-required-rest', null);
  expect(reserve('preview-required-over', 0.02, true)).toMatchObject({
    allowed: false,
    reason: 'match-budget',
    retryable: false,
  });
  expect(queue.inferenceSummary(receipt.allocationId).accountedUsd).toBeCloseTo(1.49);
});

it('recovers allocation and dispatched receipts without duplicate billing; unknown dispatches hold closed allocations', () => {
  vi.useFakeTimers();
  const { queue } = harness();
  const original = intent();
  const receipt = queue.preview.allocate(original, 'same', 'b'.repeat(40));
  expect(queue.preview.allocate(original, 'same', 'c'.repeat(40))).toEqual(receipt);
  expect(() =>
    queue.preview.allocate({ ...original, commit: 'd'.repeat(40) }, 'changed', 'b'.repeat(40)),
  ).toThrow('Allocation intent changed');
  const input = inference(receipt.allocationId);
  expect(queue.preview.begin(input, 'request-fingerprint').dispatch).toBe(true);
  expect(queue.preview.begin(input, 'request-fingerprint').dispatch).toBe(false);
  expect(() => queue.preview.begin(input, 'changed')).toThrow('Logical inference input changed');
  expect(() => queue.preview.begin({ ...input, attempt: 2 }, 'request-fingerprint')).toThrow(
    'Previous attempt',
  );
  vi.advanceTimersByTime(27000);
  expect(queue.preview.begin(input, 'request-fingerprint').result).toEqual({ state: 'unknown' });
  expect(queue.preview.begin({ ...input, attempt: 2 }, 'request-fingerprint').dispatch).toBe(true);
  expect(queue.inferenceSummary(receipt.allocationId).calls).toBe(2);
  queue.preview.close(receipt.allocationId);
  expect(queue.preview.status().livePreviewAllocations).toBe(1);
  expect(() => queue.preview.begin(input, 'request-fingerprint')).toThrow('Allocation is closed');
  queue.preview.finish(input, 'request-fingerprint', { state: 'failed' }, null);
  expect(queue.preview.status().livePreviewAllocations).toBe(1);
  queue.preview.finish({ ...input, attempt: 2 }, 'request-fingerprint', { state: 'failed' }, null);
  expect(queue.preview.status().livePreviewAllocations).toBe(0);
  expect(queue.inferenceSummary(receipt.allocationId).unknownUsageCalls).toBe(2);
  expect(queue.inferenceSummary(receipt.allocationId).accountedUsd).toBeGreaterThan(0);
});

it('records actual above estimate honestly and retires only the exact allocation waiter without touching charges', () => {
  const { db, queue } = harness();
  const receipt = queue.preview.allocate(intent(), 'same', 'b'.repeat(40));
  const input = inference(receipt.allocationId);
  queue.preview.begin(input, 'same');
  queue.preview.finish(
    input,
    'same',
    {
      state: 'completed',
      value: { choice: 0, message: null, notes: '' },
      inputTokens: 100,
      outputTokens: 20,
      accountedUsd: 2,
    },
    2,
  );
  expect(queue.preview.begin(input, 'same')).toMatchObject({
    dispatch: false,
    result: { state: 'completed', accountedUsd: 2 },
  });
  expect(queue.inferenceSummary(receipt.allocationId).accountedUsd).toBe(2);
  const next = inference(receipt.allocationId, { jobId: 'next-job' });
  expect(queue.preview.begin(next, 'next').result).toMatchObject({ state: 'denied', reason: 'match-budget' });
  const waiterId = JSON.stringify([input.allocationId, input.jobId, 1]);
  db.prepare('INSERT INTO inference_waiters VALUES (?,?,?,?)').run(
    waiterId,
    receipt.allocationId,
    'required',
    Date.now() + 10000,
  );
  queue.preview.retire({ ...input, allocationId: 'different-allocation' });
  expect(db.prepare('SELECT count(*) AS n FROM inference_waiters').get()).toEqual({ n: 1 });
  queue.preview.retire(input);
  queue.preview.retire(input);
  expect(db.prepare('SELECT count(*) AS n FROM inference_waiters').get()).toEqual({ n: 0 });
  expect(queue.inferenceSummary(receipt.allocationId).accountedUsd).toBe(2);
});
