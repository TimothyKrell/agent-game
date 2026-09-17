import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentProfileSchema } from '../src/shared/api';
import type { ApiRequestBody, ReclaimRequest } from '../src/shared/api';
import type { Program } from '../src/game/coding-finale/types';
import type { CodingInput } from '../src/game/coding-finale/puzzle-input';
import { Observation3Schema } from '../src/shared/coding-finale';
import {
  PublicCodingChallengeSchema,
  CodingSubmissionReportSchema,
} from '../src/shared/coding-finale-artifacts';
import type { ActionRequest3, Observation3 } from '../src/shared/coding-finale';
import { previewAction } from '../src/game/preview';
import { solveRouting, routingChallenge } from '../src/game/coding-finale/routing';

const origin = process.env.FINALE_PRODUCTION_ORIGIN ?? 'http://127.0.0.1:8797';

const sockets = new Set<WebSocket>();

type Controller = { token: string; agentId: string; rating: number };

type RequestBody = ApiRequestBody | ReclaimRequest | { program: Program; inputs: CodingInput[] };

type HistoryPage = {
  cursor: number;
  through: number;
  hasMore: boolean;
  reset: boolean;
  events: { id: number; type: string; act: number; text: string }[];
};

afterEach(() => {
  for (const socket of sockets) socket.close();
  sockets.clear();
});

async function request(path: string, body?: RequestBody, controller?: Controller, cookie = '') {
  const headers = new Headers({
    origin,
    cookie,
    'content-type': 'application/json',
    'X-Agent-Game-Protocols': '3',
  });

  if (controller) headers.set('authorization', `Bearer ${controller.token}`);

  return fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

async function data<T>(path: string, body?: RequestBody, controller?: Controller, cookie = ''): Promise<T> {
  const response = await request(path, body, controller, cookie);
  const text = await response.text();
  expect(response.ok, `${path}: ${response.status} ${text}`).toBe(true);
  const value: T = JSON.parse(text);

  return value;
}

async function observe(id: string, controller?: Controller): Promise<Observation3> {
  return Schema.decodeUnknownSync(Observation3Schema)(
    await data(`/api/matches/${id}`, undefined, controller),
  );
}

async function installation(index: number): Promise<Controller> {
  const name = `Finale ${index} ${randomUUID().slice(0, 8)}`;
  const login = await request('/api/dev/login', { name });
  expect(login.status).toBe(200);

  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  const agent = Schema.decodeUnknownSync(AgentProfileSchema)(
    await data('/api/owner/agents', { name }, undefined, cookie),
  );

  const token = `agk_${randomBytes(32).toString('base64url')}`;
  const controller = { token, agentId: agent.id, rating: agent.rating };

  const pairing = await data<{ code: string }>('/api/pairing', {
    installation: 'production integration',
    tokenHash: createHash('sha256').update(token).digest('hex'),
  });

  await data('/api/owner/pairing/approve', { code: pairing.code, agentId: agent.id }, undefined, cookie);
  expect(await data('/api/pairing/status', undefined, controller)).toMatchObject({ status: 'approved' });

  return controller;
}

async function stream(id: string, controller?: Controller) {
  const url = new URL(`/api/matches/${id}/events?protocol=3`, origin.replace('http:', 'ws:'));

  if (controller)
    url.searchParams.set(
      'ticket',
      (await data<{ ticket: string }>(`/api/matches/${id}/ticket`, {}, controller)).ticket,
    );
  const frames: Observation3[] = [];
  const socket = new WebSocket(url);
  sockets.add(socket);
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const packet: { type: string; observation?: Observation3 } = JSON.parse(event.data);

    if (packet.type === 'observation' && packet.observation) frames.push(packet.observation);
  });
  await expect.poll(() => frames.length, { timeout: 10_000 }).toBeGreaterThan(0);

  return frames;
}

async function history(id: string, view: Observation3) {
  const events: HistoryPage['events'] = [];
  let cursor = 0;

  do {
    const page = await data<HistoryPage>(
      `/api/matches/${id}/history?epoch=${view.history.visibilityEpoch}&after=${cursor}&through=${view.history.streamHead}&limit=64`,
    );

    expect(page.reset).toBe(false);
    events.push(...page.events);
    cursor = page.cursor;

    if (!page.hasMore) break;
  } while (cursor < view.history.streamHead);

  return events;
}

async function previewOnly() {
  const config = Schema.decodeUnknownSync(
    Schema.Struct({ provider: Schema.Literal('preview'), origin: Schema.String }),
  )(
    JSON.parse(
      await readFile(
        process.env.FINALE_PRODUCTION_CONFIG ?? '.agent-game/finale-production/connection.json',
        'utf8',
      ),
    ),
  );

  expect(config.provider).toBe('preview');
  expect(config.origin).toBe(origin);
}

describe.skipIf(process.env.FINALE_PRODUCTION !== '1')(
  'production Coding Finale HTTP and real Sandbox',
  () => {
    it('runs admitted house seats through both acts and archives one unranked champion', async () => {
      await previewOnly();
      const created = await data<{ matchId: string }>('/api/dev/exhibition', { gameId: 'coding-finale' });
      const id = created.matchId;
      const frames = await stream(id);
      await expect
        .poll(async () => (await observe(id)).status, { timeout: 180_000, interval: 200 })
        .not.toBe('active');
      const final = await observe(id);
      expect(final.status, final.interruptionReason ?? '').toBe('finished');
      expect(final).toMatchObject({
        gameId: 'coding-finale',
        protocolVersion: '3',
        mode: 'preview',
        act: 2,
        result: { kind: 'individual', reason: 'tier-two' },
      });
      expect(final.act1Result).not.toBeNull();
      expect(final.finale!.deadline! - final.finale!.startedAt!).toBe(300_000);
      expect(final.seats[final.result!.winnerSeat].qualification).toBe('finalist');
      expect(final.seats[final.result!.winnerSeat].alive).toBe(true);
      expect(final.commitment.reveal).not.toBeNull();
      const events = await history(id, final);
      expect(events.some((event) => event.act === 1 && event.type === 'act-ended')).toBe(true);
      expect(events.some((event) => event.act === 2 && event.type === 'submission-accepted')).toBe(true);

      const source = await data<{ language: string; source: string }>(
        `/api/matches/${id}/coding/source?sequence=${final.result!.submission}`,
      );

      expect(source.source).toContain('solve');

      const report = Schema.decodeUnknownSync(CodingSubmissionReportSchema)(
        await data(`/api/matches/${id}/coding/submission?sequence=${final.result!.submission}`),
      );

      expect(report.program).toEqual(source);
      expect(report.evidence).toMatchObject({ status: 'recorded', totalCases: 24, passedCases: 24 });
      await expect.poll(() => frames.at(-1)?.status, { timeout: 10_000 }).toBe('finished');
      expect(frames.every((view) => view.you === null && view.finale?.you == null)).toBe(true);
      expect(frames.some((view) => view.act === 1)).toBe(true);
      expect(frames.some((view) => view.finale?.status === 'preparing')).toBe(true);

      for (const seat of final.seats) {
        const profile = await data<{ agent: { games: number; rating: number; rank: number | null } }>(
          `/api/agents/${seat.agentId}?gameId=coding-finale`,
        );

        expect(profile.agent).toMatchObject({ games: 0, rating: seat.rating, rank: null });
      }
    }, 210_000);

    it('admits installations, gates tiers, preserves receipts and sources, and settles without ratings', async () => {
      await previewOnly();
      const controllers = await Promise.all(Array.from({ length: 10 }, (_, index) => installation(index)));
      await Promise.all(
        controllers.map((controller) =>
          data('/api/queue', { gameId: 'coding-finale', requestId: randomUUID() }, controller),
        ),
      );
      let id = '';
      await expect
        .poll(
          async () => {
            const status = await data<{ status: string; matchId: string | null }>(
              '/api/queue',
              undefined,
              controllers[0],
            );

            id = status.matchId ?? '';

            return status.status;
          },
          { timeout: 20_000, interval: 50 },
        )
        .toBe('matched');
      const frames = await stream(id);
      const privateFrames = await stream(id, controllers[0]);
      const initial = await observe(id);
      expect(initial.mode).toBe('preview');
      expect(initial.seats.every((seat) => !seat.house)).toBe(true);
      // Normal production timing includes unskippable Act I discussion windows in
      // addition to the deliberate action deadline and grace used by this test.
      const deadline = Date.now() + 480_000;
      let view = initial;
      let recoveryController: Controller | null = null;
      let recoveryComplete = false;

      while (view.act === 1 && view.status === 'active' && Date.now() < deadline) {
        await Promise.all(
          controllers.map(async (controller) => {
            const current = await observe(id, controller);

            if (controller === recoveryController && current.you?.canReclaim && !recoveryComplete) {
              const covered = current.you;
              const readAgain = await observe(id, controller);
              expect(readAgain.you).toMatchObject({
                generation: covered.generation,
                control: 'temporary-house',
                recoveryCount: 1,
              });
              const other = controllers.find((entry) => entry !== controller)!;
              expect(
                (
                  await request(
                    `/api/matches/${id}/reclaim`,
                    { requestId: randomUUID(), expectedGeneration: covered.generation },
                    other,
                  )
                ).status,
              ).toBe(409);
              const reclaim = { requestId: randomUUID(), expectedGeneration: covered.generation };

              const reclaimed = await data<{
                reclaimed: true;
                generation: number;
                observation: Observation3;
              }>(`/api/matches/${id}/reclaim`, reclaim, controller);

              expect(reclaimed).toMatchObject({
                reclaimed: true,
                generation: covered.generation + 1,
                observation: {
                  you: { control: 'entrant', recoveryCount: 1, canReclaim: false },
                },
              });
              expect(
                await data<{ generation: number }>(`/api/matches/${id}/reclaim`, reclaim, controller),
              ).toMatchObject({ generation: covered.generation + 1 });
              expect(
                (
                  await request(
                    `/api/matches/${id}/reclaim`,
                    { requestId: randomUUID(), expectedGeneration: covered.generation },
                    controller,
                  )
                ).status,
              ).toBe(409);
              recoveryComplete = true;

              return;
            }

            if (!current.actOne || !current.decision) return;

            if (!recoveryController) {
              recoveryController = controller;

              return;
            }

            if (controller === recoveryController && !recoveryComplete) return;
            const action = previewAction(current.actOne);

            if (!action) return;

            const body: ActionRequest3 = {
              gameId: 'coding-finale',
              phaseId: current.phase.id,
              decisionId: current.decision.id,
              actionId: randomUUID(),
              action,
            };

            const response = await request(`/api/matches/${id}/actions`, body, controller);
            expect([200, 409]).toContain(response.status);
          }),
        );
        await pause(20);
        view = await observe(id);
      }

      expect(view.act, view.interruptionReason ?? 'Act 1 deadline exceeded').toBe(2);
      expect(recoveryComplete).toBe(true);
      await expect
        .poll(async () => (await observe(id)).finale?.status, { timeout: 120_000, interval: 100 })
        .not.toBe('preparing');
      view = await observe(id);
      expect(view.finale?.status, view.interruptionReason ?? '').toBe('racing');
      expect(view.seats.every((seat) => !seat.forfeited)).toBe(true);
      const finalist = view.seats.find((seat) => seat.qualification === 'finalist')!;
      const spectator = view.seats.find((seat) => seat.qualification !== 'finalist')!;
      const controller = controllers.find((entry) => entry.agentId === finalist.agentId)!;
      const spectatorController = controllers.find((entry) => entry.agentId === spectator.agentId)!;
      expect(
        (await request(`/api/matches/${id}/coding/challenge?tier=2`, undefined, controller)).status,
      ).toBe(409);
      expect(
        (await request(`/api/matches/${id}/coding/challenge?tier=1`, undefined, spectatorController)).status,
      ).toBe(200);
      expect(view.chat.open).toBe(false);

      const challenge = Schema.decodeUnknownSync(PublicCodingChallengeSchema)(
        await data(`/api/matches/${id}/coding/challenge?tier=1`),
      );

      // Deterministic fixture source is never used by the real-provider launcher.
      const source = `export const solve = (${solveRouting.toString()});`;
      const privateView = await observe(id, controller);

      const submit = (tier: 1 | 2, actionId: string): ActionRequest3 => ({
        gameId: 'coding-finale',
        phaseId: privateView.phase.id,
        actionId,
        action: {
          type: 'submit-program',
          tier,
          challengeId: challenge.challengeId,
          program: { language: 'typescript', source },
        },
      });

      expect((await request(`/api/matches/${id}/actions`, submit(2, randomUUID()), controller)).status).toBe(
        409,
      );
      expect(
        (
          await request(
            `/api/matches/${id}/actions`,
            {
              gameId: 'coding-finale',
              phaseId: privateView.phase.id,
              actionId: randomUUID(),
              action: { type: 'chat', text: 'Spectators must remain read-only.' },
            },
            spectatorController,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request(
            `/api/matches/${id}/actions`,
            {
              gameId: 'coding-finale',
              phaseId: privateView.phase.id,
              actionId: randomUUID(),
              action: { type: 'chat', text: 'Even finalists cannot chat during the coding race.' },
            },
            controller,
          )
        ).status,
      ).toBe(409);

      const practice = await data<{ exitCode: number; stdout: string }>(
        `/api/matches/${id}/coding/practice`,
        {
          program: { language: 'typescript', source },
          inputs: [routingChallenge(1).example.input],
        },
        controller,
      );

      expect(practice.exitCode).toBe(0);
      expect(JSON.parse(practice.stdout)).toEqual([7]);

      const variedPractice = await data<{ exitCode: number; stdout: string }>(
        `/api/matches/${id}/coding/practice`,
        {
          program: {
            language: 'javascript',
            source:
              'export function solve(input) { return input.values.reduce((sum, value) => sum + value, 0); }',
          },
          inputs: [{ values: [-2, 4, 7] }, { values: [] }],
        },
        controller,
      );

      expect(variedPractice.exitCode).toBe(0);
      expect(JSON.parse(variedPractice.stdout)).toEqual([9, 0]);

      const flawed: ActionRequest3 = {
        ...submit(1, randomUUID()),
        action: {
          type: 'submit-program',
          tier: 1,
          challengeId: challenge.challengeId,
          program: {
            language: 'javascript',
            source: 'export function solve(input) { return input.start === input.target ? 0 : -999; }',
          },
        },
      };

      await data(`/api/matches/${id}/actions`, flawed, controller);
      expect((await request(`/api/matches/${id}/coding/submission?sequence=1`)).status).toBe(409);
      await expect
        .poll(async () => (await observe(id, controller)).finale?.submissions[0]?.verdict, {
          timeout: 30_000,
        })
        .toBe('wrong-answer');
      expect((await observe(id)).finale?.submissions[0]).toMatchObject({ status: 'judged', verdict: null });
      expect((await request(`/api/matches/${id}/coding/challenge?tier=2`)).status).toBe(409);
      const tierOne = submit(1, randomUUID());
      await data(`/api/matches/${id}/actions`, tierOne, controller);
      expect((await request(`/api/matches/${id}/coding/source?sequence=1`)).status).toBe(409);
      await expect
        .poll(async () => (await observe(id, controller)).finale?.you?.unlockedTier, { timeout: 30_000 })
        .toBe(2);
      await data(`/api/matches/${id}/actions`, tierOne, controller);
      expect((await observe(id, controller)).finale?.submissions).toHaveLength(2);
      expect(
        (await request(`/api/matches/${id}/coding/challenge?tier=2`, undefined, controller)).status,
      ).toBe(200);
      expect((await request(`/api/matches/${id}/coding/challenge?tier=2`)).status).toBe(200);

      const otherFinalist = view.seats.find(
        (seat) => seat.qualification === 'finalist' && seat.number !== finalist.number,
      )!;

      const otherController = controllers.find((entry) => entry.agentId === otherFinalist.agentId)!;
      expect(
        (await request(`/api/matches/${id}/actions`, submit(2, randomUUID()), otherController)).status,
      ).toBe(409);
      expect((await request(`/api/matches/${id}/coding/submission?sequence=2`)).status).toBe(409);
      expect(JSON.stringify(await observe(id))).not.toContain(source);
      await data(`/api/matches/${id}/actions`, submit(2, randomUUID()), controller);
      await expect.poll(async () => (await observe(id)).status, { timeout: 30_000 }).toBe('finished');
      const final = await observe(id);
      expect(final.result).toMatchObject({
        kind: 'individual',
        winnerSeat: finalist.number,
        reason: 'tier-two',
        credited: true,
      });
      expect(await data(`/api/matches/${id}/coding/source?sequence=2`)).toEqual({
        language: 'typescript',
        source,
      });

      const failedReport = Schema.decodeUnknownSync(CodingSubmissionReportSchema)(
        await data(`/api/matches/${id}/coding/submission?sequence=1`),
      );

      expect(failedReport).toMatchObject({
        seat: finalist.number,
        tier: 1,
        verdict: 'wrong-answer',
        evidence: { status: 'recorded', totalCases: 24, passedCases: 1 },
      });
      expect(failedReport.evidence.status).toBe('recorded');

      if (failedReport.evidence.status === 'recorded') {
        expect(failedReport.evidence.cases.length).toBeLessThanOrEqual(6);
        expect(
          failedReport.evidence.cases.some(
            (test) => test.status === 'passed' && test.actual === test.expected,
          ),
        ).toBe(true);
        expect(
          failedReport.evidence.cases.some((test) => test.status === 'failed' && test.actual === -999),
        ).toBe(true);
      }

      const winningReport = Schema.decodeUnknownSync(CodingSubmissionReportSchema)(
        await data(`/api/matches/${id}/coding/submission?sequence=${final.result!.submission}`),
      );

      expect(winningReport).toMatchObject({
        verdict: 'passed',
        evidence: { status: 'recorded', totalCases: 24, passedCases: 24 },
      });
      expect((await request(`/api/matches/${id}/coding/submission?sequence=999`)).status).toBe(404);
      expect((await request(`/api/matches/${id}/coding/submission?sequence=0`)).status).toBe(400);
      const events = await history(id, final);
      expect(events.some((event) => event.type === 'finale-finished')).toBe(true);
      expect(
        (
          await request(
            `/api/matches/${id}/checkpoint?through=${final.history.streamHead}&epoch=${final.history.visibilityEpoch}`,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            `/api/matches/${id}/replay?through=${final.history.streamHead}&epoch=${final.history.visibilityEpoch}`,
          )
        ).status,
      ).toBe(200);
      expect((await request(`/api/matches/${id}/rounds?epoch=${final.history.visibilityEpoch}`)).status).toBe(
        200,
      );
      await expect.poll(() => frames.at(-1)?.status, { timeout: 10_000 }).toBe('finished');
      expect(privateFrames.some((frame) => frame.you?.agentId === controllers[0].agentId)).toBe(true);

      for (const entry of controllers) {
        const profile = await data<{ agent: { games: number; rating: number; rank: number | null } }>(
          `/api/agents/${entry.agentId}?gameId=coding-finale`,
        );

        expect(profile.agent).toMatchObject({ games: 0, rating: entry.rating, rank: null });
      }
    }, 600_000);
  },
);
