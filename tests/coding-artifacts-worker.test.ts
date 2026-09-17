import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import {
  createCodingFinale,
  evolveCodingFinale,
  inspectCodingFinale,
  observeCodingFinale,
} from '../src/game/coding-finale/game';
import { gameDescriptor } from '../src/game/descriptors';
import { previewAction } from '../src/game/preview';
import { CodingSubmissionReportSchema } from '../src/shared/coding-finale-artifacts';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

const program = { language: 'javascript', source: 'export function solve() { return 0; }' };

beforeAll(async () => {
  worker = await unstable_dev('tests/fixtures/coding-artifact-worker.ts', {
    config: 'wrangler.jsonc',
    local: true,
    persist: false,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      ENVIRONMENT: 'production',
      APP_URL: 'https://archive.example.test',
      CODING_MAX_CONCURRENT_MATCHES: '0',
    },
    experimental: {
      forceLocal: true,
      disableExperimentalWarning: true,
      watch: false,
      enableContainers: false,
    },
  });
}, 30_000);

afterAll(async () => {
  await worker?.stop();
});

async function archived(id: string, judged: boolean) {
  let seed = 17;
  let serial = 0;

  const random = {
    random(size: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % size;
    },
    id: () => `fixture-${serial++}`,
  };

  let { state } = await createCodingFinale(
    id,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `archive-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Archived ${seat}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'scripted', policyVersion: 'coding-finale-1' },
      },
      random,
    },
  );

  for (let step = 0; !state.finale && step < 2000; step++) {
    const inspection = inspectCodingFinale(state);
    const seat = inspection.pendingSeats[0];
    const view = observeCodingFinale(state, seat ?? null);

    state =
      seat === undefined
        ? evolveCodingFinale(state, { type: 'advance', now: inspection.nextDeadline! }, random).state
        : evolveCodingFinale(
            state,
            {
              type: 'act',
              seat,
              generation: state.seats[seat].generation,
              request: {
                gameId: 'coding-finale',
                phaseId: view.phase.id,
                decisionId: view.decision?.id,
                actionId: `fixture-${serial++}`,
                action: previewAction(view.actOne!)!,
              },
              now: state.phase.startedAt + 1,
            },
            random,
          ).state;
  }

  expect(state.finale?.status).toBe('preparing');
  state = evolveCodingFinale(state, { type: 'prepare-ready', now: state.phase.startedAt + 1 }).state;
  const finalist = state.finale!.finalists[0];
  state = evolveCodingFinale(state, {
    type: 'act',
    seat: finalist.seat,
    generation: finalist.generation,
    now: state.phase.startedAt + 1,
    fingerprint: 'a'.repeat(64),
    request: {
      gameId: 'coding-finale',
      phaseId: state.phase.id,
      actionId: 'old-program',
      action: {
        type: 'submit-program',
        tier: 1,
        challengeId: state.finale!.challengeId,
        program: { ...program, language: 'javascript' },
      },
    },
  }).state;

  if (judged)
    state = evolveCodingFinale(state, {
      type: 'judge-result',
      sequence: 1,
      verdict: 'wrong-answer',
      now: state.phase.startedAt + 2,
    }).state;
  state = evolveCodingFinale(state, {
    type: 'interrupt',
    reason: 'Archived fixture ended',
    now: state.phase.startedAt + 3,
  }).state;
  expect(state.status).toBe('interrupted');

  const response = await worker.fetch('/api/__fixture/archive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, state: JSON.stringify(state), program: JSON.stringify(program) }),
  });

  expect(response.status).toBe(200);

  return state;
}

it.each([true, false])(
  'reads old terminal submissions without inventing or rerunning judge evidence (judged=%s)',
  async (judged) => {
    const id = `match_archived-${judged}`;
    const state = await archived(id, judged);
    const path = `/api/matches/${id}/coding/submission?sequence=1`;
    const headers = { 'X-Agent-Game-Protocols': '3' };
    expect((await worker.fetch(path)).status).toBe(426);
    const response = await worker.fetch(path, { headers });
    expect(response.status, await response.clone().text()).toBe(200);
    const report = Schema.decodeUnknownSync(CodingSubmissionReportSchema)(await response.json());
    expect(report).toMatchObject({
      seat: state.finale!.submissions[0].seat,
      sequence: 1,
      tier: 1,
      verdict: judged ? 'wrong-answer' : null,
      program,
      evidence: { status: 'unavailable', reason: judged ? 'not-recorded' : 'not-judged' },
    });
    expect(await (await worker.fetch(path, { headers })).json()).toEqual(report);
    expect((await worker.fetch(`/api/matches/${id}/coding/challenge?tier=1`, { headers })).status).toBe(200);
    expect((await worker.fetch(`/api/matches/${id}/coding/challenge?tier=2`, { headers })).status).toBe(409);
  },
);

it('purges retired Durable Object state and source idempotently and rejects archive reads', async () => {
  const id = 'match_retired-fixture';

  const { state } = await createCodingFinale(
    id,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `retired-${seat}`,
      ownerId: null,
      name: `Retired ${seat}`,
      house: true,
      rating: 0,
    })),
    Date.now(),
  );

  await worker.fetch('/api/__fixture/archive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, state: JSON.stringify(state), program: JSON.stringify(program) }),
  });

  const response = await worker.fetch('/api/__fixture/retire', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });

  expect(response.status, await response.clone().text()).toBe(200);

  const tables = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ name: Schema.String, rows: Schema.Int })),
  )(await response.json());

  expect(tables.filter((table) => table.name !== 'meta').every((table) => table.rows === 0)).toBe(true);
  expect(
    (await worker.fetch(`/api/matches/${id}`, { headers: { 'X-Agent-Game-Protocols': '3' } })).status,
  ).toBe(410);
});

it('atomically reclaims only for the original entrant and never through ordinary reads', async () => {
  const id = 'match_recoverable';
  let serial = 0;

  let { state } = await createCodingFinale(
    id,
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `recover-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Recover ${seat}`,
      house: false,
      rating: 1000,
    })),
    Date.now(),
    {
      snapshot: {
        ...gameDescriptor('coding-finale'),
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'scripted', policyVersion: 'coding-finale-1' },
      },
      random: { random: (size) => serial++ % size, id: () => `recover-id-${serial++}` },
    },
  );

  state = evolveCodingFinale(state, { type: 'advance', now: state.phase.deadline! }).state;
  const coveredSeat = state.seats[state.actOne.coordinator];
  state = evolveCodingFinale(state, { type: 'advance', now: state.phase.deadline! }).state;
  state = evolveCodingFinale(state, {
    type: 'advance',
    now: state.phase.deadline! + state.snapshot.timing.grace,
  }).state;
  expect(state.seats[coveredSeat.number]).toMatchObject({
    houseProfile: `relief-${coveredSeat.number}`,
    recoveryCount: 1,
    forfeited: false,
  });
  expect(state.status).toBe('active');
  expect(state.phase.replacements[String(coveredSeat.number)]).toBeGreaterThan(Date.now());

  expect(
    (
      await worker.fetch('/api/__fixture/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, state: JSON.stringify(state) }),
      })
    ).status,
  ).toBe(200);
  const headers = { 'X-Agent-Game-Protocols': '3' };

  const RecoveryReadSchema = Schema.Struct({
    status: Schema.String,
    seats: Schema.Array(Schema.Unknown),
    phase: Schema.Unknown,
  });

  const before = Schema.decodeUnknownSync(RecoveryReadSchema)(
    await (await worker.fetch(`/api/matches/${id}`, { headers })).json(),
  );

  const again = Schema.decodeUnknownSync(RecoveryReadSchema)(
    await (await worker.fetch(`/api/matches/${id}`, { headers })).json(),
  );

  expect(again).toMatchObject({
    status: before.status,
    seats: before.seats,
    phase: before.phase,
  });

  const reclaim = (agentId: string, requestId = 'reclaim-request-1', expectedGeneration = 1) =>
    worker.fetch('/api/__fixture/reclaim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, agentId, requestId, expectedGeneration }),
    });

  expect((await reclaim('recover-wrong')).status).toBe(403);

  const [first, second] = await Promise.all([
    reclaim(coveredSeat.entrant.agentId),
    reclaim(coveredSeat.entrant.agentId),
  ]);

  const failures = await Promise.all([first.clone().json(), second.clone().json()]);
  expect([first.status, second.status], JSON.stringify(failures)).toEqual([200, 200]);
  const success = first;
  expect(await success.json()).toMatchObject({
    ok: true,
    value: {
      reclaimed: true,
      generation: 2,
      observation: {
        you: {
          control: 'entrant',
          recoveryCount: 1,
          recoveryLimit: 3,
          canReclaim: false,
        },
      },
    },
  });

  let secondCoverage = evolveCodingFinale(state, {
    type: 'reclaim',
    seat: coveredSeat.number,
    now: state.phase.startedAt + 1,
  }).state;

  secondCoverage = evolveCodingFinale(secondCoverage, {
    type: 'advance',
    now: secondCoverage.phase.replacements[String(coveredSeat.number)],
  }).state;
  expect(secondCoverage.seats[coveredSeat.number]).toMatchObject({
    generation: 3,
    recoveryCount: 2,
    houseProfile: `relief-${coveredSeat.number}`,
  });
  await worker.fetch('/api/__fixture/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, state: JSON.stringify(secondCoverage) }),
  });

  const oldRetry = await reclaim(coveredSeat.entrant.agentId);
  expect(oldRetry.status).toBe(200);
  expect(await oldRetry.json()).toMatchObject({
    value: {
      generation: 2,
      observation: { you: { generation: 3, control: 'temporary-house', recoveryCount: 2 } },
    },
  });
  expect((await reclaim(coveredSeat.entrant.agentId, 'reclaim-request-2', 1)).status).toBe(409);

  const terminal = evolveCodingFinale(secondCoverage, {
    type: 'interrupt',
    reason: 'Terminal handoff fixture',
    now: secondCoverage.phase.startedAt + 1,
  }).state;

  await worker.fetch('/api/__fixture/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, state: JSON.stringify(terminal) }),
  });
  const terminalReclaim = await reclaim(coveredSeat.entrant.agentId, 'terminal-reclaim', 3);
  expect(terminalReclaim.status).toBe(409);
  expect(await terminalReclaim.json()).toMatchObject({ error: { code: 'match-ended' } });
  expect((await reclaim(coveredSeat.entrant.agentId)).status).toBe(200);
});
