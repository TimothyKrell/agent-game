import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { version } from '../package.json';
import { gameDescriptor } from '../src/game/descriptors';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { assertAct2Integrity } from '../src/game/succession/act2';
import { verifyCommitment } from '../src/game/succession/commitment';
import { settleSuccession } from '../src/game/succession/rating';
import type { Entrant } from '../src/game/types';
import type { Action2, Observation2 } from '../src/shared/succession';
import type { Evolution, RandomContext } from '../src/game/succession/types';

const minute = 60_000;

const origin = 1_800_000_000_000;

const seed = 7;

const matchId = `legal-long-path-${seed}`;

const run = promisify(execFile);

let installedDirectory: string;

let supervise: typeof import('../cli/supervisor.mjs').supervise;

function seededRandom(): RandomContext {
  let value = seed;
  let serial = 0;

  return {
    random(size) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

      return Math.floor((value / 4294967296) * size);
    },
    id: () => `long-path-${seed}-${serial++}`,
  };
}

function observedAction(view: Observation2, random: RandomContext): Action2 {
  if (!view.you || !view.decision) throw new Error('A required entitled decision is missing.');

  if (view.act === 1) {
    const action = previewSuccessionAction(view, random.random);

    if (!action) throw new Error('Act 1 preview policy did not select a legal action.');
    expect(view.decision.actions.map((choice) => choice.action)).toContainEqual(action);

    return action;
  }

  const target = (view.you.seat + 1) % 10;

  const choice = view.decision.actions.find(({ action }) => {
    switch (view.phase.kind) {
      case 'act-2:action':
        return action.type === 'steal' && action.target === target;
      case 'act-2:challenge':
        return action.type === 'pass';
      case 'act-2:block':
        return action.type === 'block' && action.capability === 'thief';
      default:
        throw new Error(`Unexpected required Act 2 window: ${view.phase.kind}`);
    }
  });

  if (!choice) throw new Error('The requested long-path action was not in the entitled legal choices.');

  return choice.action;
}

type Point = { at: number; view: Observation2 };

type Turn = { actor: number; target: number; claimPasses: number[]; blockPasses: number[]; blocked: boolean };

type Trace = {
  points: Point[];
  finishedAt: number;
  metrics: {
    seed: number;
    act1Ms: number;
    act2Ms: number;
    totalMs: number;
    act1Submissions: number;
    act2Submissions: number;
    act2Discussions: number;
    act2RequiredWindows: number;
    turns: number;
    survivors: number;
    initialResources: { coins: number; influence: number }[];
    winnerSeat: number | undefined;
    decisive: string | undefined;
    events: number;
    maxObservationBytes: number;
    eventDigest: string;
  };
};

async function legalTrace(): Promise<Trace> {
  const random = seededRandom();

  const entrants: Entrant[] = Array.from({ length: 10 }, (_, seat) => ({
    agentId: `long-path-agent-${seat}`,
    ownerId: `long-path-owner-${seat}`,
    name: `External ${seat}`,
    house: false,
    rating: 1000,
  }));

  const descriptor = gameDescriptor('succession');

  const initial = await createSuccession(matchId, entrants, origin, {
    random,
    salt: new Uint8Array(32).fill(seed),
    snapshot: {
      ...descriptor,
      mode: 'preview',
      houseModel: { provider: 'preview', model: 'scripted', policyVersion: descriptor.housePolicyVersion },
    },
  });

  let state = initial.state;
  let now = origin;
  let act2At: number | null = null;
  let resources: { coins: number; influence: number }[] | null = null;
  let events = 0;
  let entitledEvents = 0;
  let maxObservationBytes = 0;
  let act1Submissions = 0;
  let act2Submissions = 0;
  let act2Discussions = 0;
  let activeTurn: Turn | null = null;
  const turns: Turn[] = [];
  const points: Point[] = [];
  const windows = new Map<string, { kind: string; at: number; seats: number[] }>();
  const digest = createHash('sha256');

  function record(evolution: Evolution) {
    state = evolution.state;
    events += evolution.appendedEvents.length;
    entitledEvents += evolution.appendedEvents.filter(
      (event) => event.visibility === 'public' || event.visibility === 0,
    ).length;
    digest.update(JSON.stringify(evolution.appendedEvents));
    digest.update('\n');

    const view = observeSuccession(state, 0, {
      visibilityEpoch: state.status === 'active' ? 'long-path-seat-0' : 'long-path-archive',
      streamHead: state.status === 'active' ? entitledEvents : events,
    });

    points.push({ at: now, view });
    maxObservationBytes = Math.max(maxObservationBytes, Buffer.byteLength(JSON.stringify(view)));
    expect(state.seats.every((seat) => !seat.entrant.house && !seat.houseProfile && !seat.forfeited)).toBe(
      true,
    );

    if (state.stage.act === 2) {
      assertAct2Integrity(state.stage.board);

      const current = state.stage.board.resources.map((resource) => ({
        coins: resource.coins,
        influence: resource.hand.length,
      }));

      if (!resources) {
        resources = current;
        act2At = now;
      }

      expect(current).toEqual(resources);
      expect(state.seats.every((seat) => seat.alive)).toBe(true);
      expect(state.stage.board.round).toBeLessThanOrEqual(12);
    }
  }

  record(initial);

  while (state.status === 'active') {
    if (act1Submissions + act2Submissions > 4000) throw new Error('Unexpectedly unbounded legal trace.');
    const views = state.seats.map((seat) => observeSuccession(state, seat.number));
    const required = views.filter((view) => view.decision !== null);
    const act = state.stage.act;

    if (!required.length) {
      const view = observeSuccession(state);

      if (view.phase.deadline === null)
        throw new Error('Active engine has no required decision or discussion deadline.');

      if (act === 2) {
        expect(view.phase.kind).toBe('act-2:discussion');
        expect(view.phase.deadline - state.phase.startedAt).toBe(10_000);
        act2Discussions++;
      }

      now = view.phase.deadline;
      record(evolveSuccession(state, { type: 'advance', now }, random));
      continue;
    }

    const view = required[0];

    if (!view.you || !view.decision) throw new Error('Missing seat controller decision.');
    const action = observedAction(view, random);

    // Every responder in a sealed window arrives at the same instant, not serial 30-second waits.
    now = act === 1 ? state.phase.startedAt + 1000 : view.decision.deadline - 1;

    if (act === 2) {
      expect(view.decision.deadline - state.phase.startedAt).toBe(30_000);
      const window = windows.get(view.phase.id) ?? { kind: view.phase.kind, at: now, seats: [] };
      expect(window.at).toBe(now);
      expect(window.seats).not.toContain(view.you.seat);
      window.seats.push(view.you.seat);
      windows.set(view.phase.id, window);

      if (action.type === 'steal') {
        activeTurn = {
          actor: view.you.seat,
          target: action.target,
          claimPasses: [],
          blockPasses: [],
          blocked: false,
        };
        turns.push(activeTurn);
      } else if (action.type === 'block') {
        if (!activeTurn) throw new Error('Block without declaration.');
        expect(view.you.seat).toBe(activeTurn.target);
        expect(activeTurn.claimPasses).toHaveLength(9);
        activeTurn.blocked = true;
      } else if (action.type === 'pass') {
        if (!activeTurn) throw new Error('Reaction without declaration.');
        const responders = activeTurn.blocked ? activeTurn.blockPasses : activeTurn.claimPasses;
        responders.push(view.you.seat);
      }

      act2Submissions++;
    } else act1Submissions++;

    record(
      evolveSuccession(
        state,
        {
          type: 'act',
          seat: view.you.seat,
          generation: view.you.generation,
          now,
          request: {
            gameId: 'succession',
            actionId: random.id(),
            phaseId: view.phase.id,
            decisionId: view.decision.id,
            action,
          },
        },
        random,
      ),
    );
  }

  if (act2At === null || state.finishedAt === null || state.stage.act !== 2 || !resources)
    throw new Error('The full legal engine path did not finish both acts.');

  expect(act1Submissions).toBeGreaterThan(0);
  expect(act2Submissions).toBe(2400);
  expect(act2Discussions).toBe(120);
  expect(turns).toHaveLength(120);
  expect(windows.size).toBe(480);
  expect([...windows.values()].filter((window) => window.kind === 'act-2:challenge')).toHaveLength(240);

  for (const turn of turns) {
    expect(turn.blocked).toBe(true);
    expect(turn.claimPasses.toSorted()).toEqual(
      Array.from({ length: 10 }, (_, seat) => seat)
        .filter((seat) => seat !== turn.actor)
        .toSorted(),
    );
    expect(turn.blockPasses.toSorted()).toEqual(
      Array.from({ length: 10 }, (_, seat) => seat)
        .filter((seat) => seat !== turn.target)
        .toSorted(),
    );
  }

  expect(state.finishedAt - act2At).toBe(120 * (10_000 + 4 * 29_999));
  expect(state.status).toBe('finished');
  expect(state.result?.reason).toBe('round-cap');
  expect(state.stage.board.capEvidence?.scores).toHaveLength(10);
  expect(settleSuccession(state)?.participants.filter((participant) => participant.won)).toHaveLength(1);
  expect(await verifyCommitment(state.id, state.commitment)).toBe(true);
  expect(maxObservationBytes).toBeLessThanOrEqual(14_336);

  return {
    points,
    finishedAt: state.finishedAt,
    metrics: {
      seed,
      act1Ms: act2At - origin,
      act2Ms: state.finishedAt - act2At,
      totalMs: state.finishedAt - origin,
      act1Submissions,
      act2Submissions,
      act2Discussions,
      act2RequiredWindows: windows.size,
      turns: turns.length,
      survivors: state.seats.filter((seat) => seat.alive).length,
      initialResources: resources,
      winnerSeat: state.result?.winnerSeat,
      decisive: state.stage.board.capEvidence?.decisive,
      events,
      maxObservationBytes,
      eventDigest: digest.digest('hex'),
    },
  };
}

let trace: Trace;

beforeAll(async () => {
  trace = await legalTrace();
  installedDirectory = await mkdtemp('/tmp/opencode/installed-legal-long-path-');
  await run(process.execPath, ['scripts/package-cli.mjs']);
  await run('npm', [
    'install',
    '--prefix',
    installedDirectory,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    resolve(`public/downloads/agent-game-cli-${version}.tgz`),
  ]);

  const installed: typeof import('../cli/supervisor.mjs') = await import(
    pathToFileURL(`${installedDirectory}/node_modules/agent-game-cli/cli/supervisor.mjs`).href
  );

  supervise = installed.supervise;
  console.log('SUCCESSION_LEGAL_LONG_PATH', JSON.stringify(trace.metrics));
}, 60_000);

afterAll(async () => {
  if (installedDirectory) await rm(installedDirectory, { recursive: true, force: true });
});

function currentAt(now: number): Observation2 {
  let low = 0;
  let high = trace.points.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (trace.points[middle].at <= now) low = middle + 1;
    else high = middle;
  }

  return structuredClone(trace.points[Math.max(0, low - 1)].view);
}

it.each([120, 300])(
  'runs the actual two-act legal trace through installed supervision with %i-minute runtime',
  async (allowance) => {
    const directory = await mkdtemp('/tmp/opencode/long-path-participation-');
    const configPath = `${directory}/connection.json`;
    let now = origin;
    let invocations = 0;
    const sliceEnds: { elapsedMs: number; phaseId: string; act: number; status: string }[] = [];

    await writeFile(
      configPath,
      JSON.stringify({
        server: 'http://127.0.0.1:1',
        agentId: 'long-path-agent-0',
        selectedGame: 'succession',
      }),
    );

    try {
      const result = await supervise(
        {
          configPath,
          harness: 'claude',
          maxRuntimeMs: allowance === 120 ? undefined : allowance * minute,
          clock: {
            now: () => now,
            monotonic: () => now - origin,
            sleep: async () => {
              await sleep(1);
            },
          },
          request: async (_connection, path) =>
            path === '/api/queue'
              ? {
                  status: 'matched',
                  gameId: 'succession',
                  rulesVersion: 'succession-1',
                  protocolVersion: '2',
                  matchId,
                  requestId: 'join-legal-long-path',
                  joinedAt: origin,
                }
              : JSON.parse(JSON.stringify(currentAt(now))),
        },
        async (child) => {
          invocations++;
          expect(child.deadline).toBe(Math.min(now + 10 * minute, origin + allowance * minute));
          expect(child.remainingBudget).toBeCloseTo(2 - (invocations - 1) * 0.01);
          const saved = JSON.parse(await readFile(configPath, 'utf8'));
          expect(saved.participation).toEqual({ gameId: 'succession', matchId });
          await child.onSession(`ses_legal_long_path_${allowance}`);
          await child.onUsage({ scope: 'invocation', total: 0.01, final: true });
          now = Math.min(child.deadline, trace.finishedAt);
          const view = currentAt(now);
          sliceEnds.push({
            elapsedMs: now - origin,
            phaseId: view.phase.id,
            act: view.act,
            status: view.status,
          });

          return { outcome: now === trace.finishedAt ? 'returned' : 'rotated', exitCode: 0 };
        },
      );

      expect(result.invocations).toBe(invocations);
      expect(result.costUsd).toBeCloseTo(invocations * 0.01);
      expect(
        sliceEnds.every((slice) => trace.points.some((point) => point.view.phase.id === slice.phaseId)),
      ).toBe(true);

      if (allowance === 120) {
        expect(result.status).toBe('client-stopped');
        expect(result.reason).toBe('runtime-exhausted');
        expect(result.serverStatus).toBe('active');
        expect(result.originalAgentResult).toBeNull();
        expect(result.durationMs).toBe(120 * minute);
        expect(invocations).toBe(12);
        expect(trace.finishedAt).toBeGreaterThan(now);
      } else {
        expect(result.status).toBe('finished');
        expect(result.reason).toBeNull();
        expect(result.durationMs).toBe(trace.metrics.totalMs);
        expect(result.winningSeat).toBe(trace.metrics.winnerSeat);
        expect(result.overallReason).toBe('round-cap');
        expect(invocations).toBe(Math.ceil(trace.metrics.totalMs / (10 * minute)));
        expect(invocations).toBeGreaterThan(26);
      }

      console.log(
        'SUCCESSION_LEGAL_SUPERVISOR',
        JSON.stringify({
          allowanceMinutes: allowance,
          status: result.status,
          reason: result.reason,
          durationMs: result.durationMs,
          invocations,
          syntheticCostUsd: result.costUsd,
          sliceEnds,
        }),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
