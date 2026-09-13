import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Schema } from 'effect';
import type { SupervisorOptions } from '../cli/supervisor.mjs';
import { version } from '../package.json';

let supervise: typeof import('../cli/supervisor.mjs').supervise;

let SUCCESSION_CANDIDATE: typeof import('../cli/supervisor.mjs').SUCCESSION_CANDIDATE;

let installedDirectory: string;

let supervisorURL: string;

beforeAll(async () => {
  installedDirectory = await mkdtemp('/tmp/opencode/packaged-supervisor-');
  const run = promisify(execFile);
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
  supervisorURL = pathToFileURL(`${installedDirectory}/node_modules/agent-game-cli/cli/supervisor.mjs`).href;
  const installed: typeof import('../cli/supervisor.mjs') = await import(supervisorURL);
  supervise = installed.supervise;
  SUCCESSION_CANDIDATE = installed.SUCCESSION_CANDIDATE;
});

afterAll(async () => {
  await rm(installedDirectory, { recursive: true, force: true });
});

const minute = 60_000;

async function fixture(gameId = 'succession') {
  const directory = await mkdtemp('/tmp/opencode/supervisor-');
  const configPath = `${directory}/connection.json`;
  const origin = 1_800_000_000_000;
  let elapsed = 0;
  let wallOffset = 0;
  let ticking = false;

  const connection = {
    server: 'http://127.0.0.1:1',
    agentId: 'agent',
    selectedGame: gameId,
    pendingJoin: { gameId, requestId: 'join_one' },
  };

  await writeFile(configPath, JSON.stringify(connection));

  const view = {
    matchId: 'match_new',
    gameId,
    status: 'active',
    protocolVersion: gameId === 'succession' ? '2' : '1',
    rulesVersion: `${gameId}-1`,
    history: { visibilityEpoch: 'seat-1', streamHead: 0 },
    createdAt: origin,
    act: 1,
    phase: { id: 'phase_1', kind: 'discussion' },
    decision: null,
    you: { alive: true, forfeited: false },
    controller: { kind: 'external' },
    result: null,
  };

  const queue = {
    status: 'matched',
    gameId,
    protocolVersion: gameId === 'succession' ? '2' : '1',
    rulesVersion: `${gameId}-1`,
    matchId: 'match_new',
    joinedAt: origin,
    requestId: 'join_one',
  };

  const options: SupervisorOptions = {
    configPath,
    harness: 'claude',
    maxRuntimeMs: 120 * minute,
    clock: {
      now: () => origin + elapsed + wallOffset,
      monotonic: () => elapsed,
      sleep: async (ms) => {
        await sleep(1);

        if (ticking) elapsed += ms;
      },
    },
    request: async (_connection, path) => structuredClone(path === '/api/queue' ? queue : view),
  };

  return {
    options,
    view,
    queue,
    connection,
    configPath,
    origin,
    advance: (ms: number) => {
      elapsed += ms;
    },
    rollback: (ms: number) => {
      wallOffset -= ms;
    },
    tick: () => {
      ticking = true;
    },
    ledger: async () => JSON.parse(await readFile(`${configPath}.supervisor.json`, 'utf8')),
  };
}

it('polls a newly queued participation without starting a child or reusing an old terminal match', async () => {
  let polls = 0;
  let invoked = false;
  const f = await fixture('secret-overlord');

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/api/queue'
          ? ++polls < 3
            ? { ...f.queue, status: 'queued', matchId: null }
            : f.queue
          : { ...f.view, status: 'finished' },
      ),
    );
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));

  try {
    const { port } = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
    await writeFile(
      f.configPath,
      JSON.stringify({ ...f.connection, server: `http://127.0.0.1:${port}`, matchId: 'match_old' }),
    );
    const { request: _request, ...options } = f.options;

    const result = await supervise(options, async () => {
      invoked = true;

      return { exitCode: 0, costUsd: 0 };
    });

    expect(invoked).toBe(false);
    expect(result.matchId).toBe('match_new');
    expect(polls).toBe(3);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});

it.each([120, 300])(
  'supervises the 4h20 Act 2 virtual path under an explicit %i-minute allowance',
  async (allowance) => {
    const f = await fixture();
    f.options.maxRuntimeMs = allowance * minute;

    if (allowance === 120) delete f.options.maxRuntimeMs;
    f.view.act = 2;
    let activeMs = 0;
    const grants: (number | null)[] = [];

    const result = await supervise(f.options, async (child) => {
      grants.push(child.remainingBudget);
      expect(child.deadline).toBeLessThanOrEqual(f.origin + allowance * minute);
      await child.onSession('ses_continuity');
      await child.onUsage({ scope: 'invocation', total: 0.01, final: true });
      const duration = Math.min(10 * minute, 260 * minute - activeMs);
      activeMs += duration;
      f.advance(duration);
      f.view.phase.id = `turn_${Math.floor(activeMs / 130_000)}`;

      if (activeMs === 260 * minute) f.view.status = 'finished';

      return { exitCode: 0, outcome: 'rotated' };
    });

    expect(result.status).toBe(allowance === 120 ? 'client-stopped' : 'finished');
    expect(result.reason).toBe(allowance === 120 ? 'runtime-exhausted' : null);
    expect(result.durationMs).toBe((allowance === 120 ? 120 : 260) * minute);
    expect(result.invocations).toBe(allowance === 120 ? 12 : 26);
    expect(grants[0]).toBe(2);
    expect(grants.at(-1)).toBeCloseTo(2 - (result.invocations - 1) * 0.01);
    expect(result.costUsd).toBeCloseTo(result.invocations * 0.01);
    expect(SUCCESSION_CANDIDATE.frozen).toBe(true);
  },
);

it('retains the legacy 35-minute server-createdAt deadline', async () => {
  const f = await fixture('secret-overlord');
  delete f.options.maxRuntimeMs;
  f.advance(34 * minute);

  const result = await supervise(f.options, async (child) => {
    expect(child.remainingRuntimeMs).toBe(minute);
    expect(child.deadline).toBe(f.origin + 35 * minute);
    f.advance(minute);

    return { exitCode: 0, costUsd: 0 };
  });

  expect(result.reason).toBe('runtime-exhausted');
});

it.each(['execution-error', 'returned'] as const)(
  'stops after three consecutive %s outcomes without counting launches globally',
  async (outcome) => {
    const f = await fixture();
    f.tick();
    const result = await supervise(f.options, async () => ({ outcome, costUsd: 0 }));
    expect(result.invocations).toBe(3);
    expect(result.reason).toBe(outcome === 'returned' ? 'no-progress' : 'execution-error');

    const second = await supervise({ ...f.options, maxRuntimeMs: 999 * minute, maxBudget: 99 }, async () => {
      throw new Error('must not refill');
    });

    expect(second.invocations).toBe(3);
    expect((await f.ledger()).accounting.limit).toBe(2);
  },
);

it('healthy quiet rotations clear errors but neither clear nor increment a premature-final streak', async () => {
  const f = await fixture();
  f.tick();
  const outcomes = ['returned', 'execution-error', 'rotated', 'returned', 'rotated', 'returned'] as const;
  let index = 0;
  const result = await supervise(f.options, async () => ({ outcome: outcomes[index++], costUsd: 0 }));
  expect(result.reason).toBe('no-progress');
  expect(result.invocations).toBe(6);
  expect((await f.ledger()).errors).toBe(0);
});

it('phase change during child shutdown resets premature finals and act victory is not terminal', async () => {
  const f = await fixture();
  f.tick();
  let calls = 0;

  const result = await supervise(f.options, async () => {
    calls++;

    if (calls === 3) {
      f.view.act = 2;
      f.view.phase.id = 'act2';
      f.view.you.alive = true;
    }

    if (calls === 6) f.view.status = 'finished';

    return { outcome: 'returned', costUsd: 0 };
  });

  expect(result.status).toBe('finished');
  expect(calls).toBe(6);
});

it('reserves before spawning, deduplicates session totals, and retains unknown crash remainder across restart', async () => {
  const f = await fixture();

  const result = await supervise(f.options, async (child) => {
    expect((await f.ledger()).child.outstanding).toBe(2);
    await child.onSession('ses_shared');
    await child.onUsage({ scope: 'session', total: 0.4 });
    await child.onUsage({ scope: 'session', total: 0.4 });
    const partial = await f.ledger();
    expect(partial.accounting.known).toBe(0.4);
    expect(partial.child.outstanding).toBe(1.6);
    throw new Error('forced child death before final report');
  });

  expect(result.reason).toBe('accounting-unavailable');
  expect(result.accounting.remaining).toBe(0);
  expect(result.accounting.unresolvedGranted).toBe(1.6);
  f.advance(10 * minute);
  f.rollback(20 * minute);

  const resumed = await supervise({ ...f.options, maxBudget: 99 }, async () => {
    throw new Error('must not spawn');
  });

  expect(resumed.costUsd).toBe(0.4);
  expect(resumed.accounting.limit).toBe(2);
  expect(resumed.durationMs).toBeGreaterThanOrEqual(result.durationMs);
  await expect(supervise({ ...f.options, harness: 'opencode' })).rejects.toThrow('Incompatible accounting');
});

it('normalizes session-cumulative usage across healthy resumed invocations', async () => {
  const f = await fixture();
  let calls = 0;

  const result = await supervise(f.options, async (child) => {
    calls++;
    await child.onSession('ses_same');
    expect(child.remainingBudget).toBeCloseTo(calls === 1 ? 2 : 1.5);
    await child.onUsage({ scope: 'session', total: calls === 1 ? 0.5 : 0.7, final: true });

    if (calls === 2) f.view.status = 'finished';

    return { outcome: 'rotated' };
  });

  expect(result.costUsd).toBeCloseTo(0.7);
});

it('stops truthfully when reported cost exceeds the reserved grant', async () => {
  const f = await fixture();

  const result = await supervise(f.options, async (child) => {
    await child.onUsage({ scope: 'invocation', total: 2.1, final: true });

    return { outcome: 'rotated' };
  });

  expect(result.reason).toBe('budget-exhausted');
  expect(result.costUsd).toBe(2.1);
  expect(result.invocations).toBe(1);
});

it('reports provider-managed unknown dollars without manufacturing a zero or enforced remainder', async () => {
  const f = await fixture();
  f.options.harness = 'opencode';

  const result = await supervise(f.options, async () => {
    f.view.status = 'finished';

    return { exitCode: 0, sessionId: 'ses_provider' };
  });

  expect(result.costUsd).toBeNull();
  expect(result.accounting.mode).toBe('provider-managed');
  expect(result.accounting.remaining).toBeNull();
  expect(result.accounting.unknown).toBe(true);
  await expect(supervise({ ...f.options, maxBudget: 2 })).rejects.toThrow('provider-managed');
});

it.each(['cancelled', 'assigned', 'other-game-assigned', 'network-failed'] as const)(
  'keeps queue exhaustion selected when cancellation is %s',
  async (race) => {
    const f = await fixture();
    f.tick();
    f.options.queueAllowanceMs = 1000;
    let deleted = false;
    f.options.request = async (_connection, path, body, method) => {
      if (path !== '/api/queue') return race === 'other-game-assigned'
        ? { ...f.view, gameId: 'secret-overlord', protocolVersion: '1', rulesVersion: 'secret-overlord-1' }
        : f.view;

      if (method === 'DELETE') {
        expect(body).toEqual({ gameId: 'succession', requestId: 'join_one', joinedAt: f.origin });
        deleted = true;

        if (race === 'network-failed') throw new Error('lost response');

        if (race === 'other-game-assigned')
          return { ...f.queue, gameId: 'secret-overlord', protocolVersion: '1', rulesVersion: 'secret-overlord-1', requestId: 'replacement' };
        return race === 'assigned' ? f.queue : { status: 'idle', matchId: null };
      }

      return { ...f.queue, status: 'queued', matchId: null };
    };

    const result = await supervise(f.options, async () => {
      throw new Error('no child is allowed to wait in queue');
    });

    expect(deleted).toBe(true);
    expect(result.invocations).toBe(0);
    expect(result.reason).toBe('queue-exhausted');
    expect(result.matchId).toBe(race === 'assigned' || race === 'other-game-assigned' ? 'match_new' : null);
    expect(result.gameId).toBe(race === 'other-game-assigned' ? 'secret-overlord' : 'succession');
  },
);

it.each(['executed', 'eliminated', 'forfeited'])(
  'expires inside active child work while %s, aborting before the parent deadline',
  async (state) => {
    const f = await fixture();
    f.options.maxRuntimeMs = 3000;
    f.tick();
    f.view.you.alive = false;
    f.view.you.forfeited = state === 'forfeited';
    f.view.act = state === 'executed' ? 1 : 2;
    let childSignal: AbortSignal | undefined;

    const result = await supervise(f.options, async (child) => {
      childSignal = child.signal;

      return new Promise(() => {});
    });

    expect(childSignal?.aborted).toBe(true);
    expect(result.reason).toBe('runtime-exhausted');
    expect(result.serverStatus).toBe('active');
    expect(result.durationMs).toBe(3000);
  },
);

it('user stop interrupts child work and persists the stop with last-known controller authority', async () => {
  const f = await fixture();
  f.tick();
  const stop = new AbortController();
  f.options.signal = stop.signal;

  const result = await supervise(f.options, async (child) => {
    stop.abort();
    await child.onUsage({ scope: 'invocation', total: 0.1, final: true });

    return { outcome: 'user-stopped' };
  });

  expect(result.reason).toBe('user-stopped');
  expect(result.serverStatus).toBe('active');
  expect(result.costUsd).toBe(0.1);
});

it('does not permit two supervisors to reserve the same installation allowance', async () => {
  const f = await fixture();

  const result = await supervise(f.options, async () => {
    await expect(supervise(f.options, async () => ({ costUsd: 0 }))).rejects.toThrow('active supervisor');
    f.view.status = 'finished';

    return { exitCode: 0, costUsd: 0 };
  });

  expect(result.status).toBe('finished');
  expect(result.invocations).toBe(1);
});

it('uses the coordinator-frozen bounded Succession resource profile', async () => {
  const f = await fixture();
  delete f.options.maxRuntimeMs;
  f.view.status = 'finished';
  await supervise(f.options, async () => {
    throw new Error('terminal needs no model');
  });
  expect((await f.ledger()).allowances).toEqual({
    maxRuntimeMs: 120 * minute,
    queueAllowanceMs: 10 * minute,
    childSliceMs: 10 * minute,
  });
});

it('allows a child slice beyond the old 30-minute cutoff and queue waiting beyond the old total allowance', async () => {
  const f = await fixture();
  f.options.queueAllowanceMs = 45 * minute;
  f.options.childSliceMs = 40 * minute;
  let polls = 0;
  f.options.request = async (_connection, path) => {
    if (path !== '/api/queue') return f.view;

    if (++polls === 1) {
      f.advance(40 * minute);

      return { ...f.queue, status: 'queued', matchId: null };
    }

    f.view.createdAt = f.origin + 40 * minute;

    return f.queue;
  };

  const result = await supervise(f.options, async (child) => {
    expect(child.remainingRuntimeMs).toBe(120 * minute);
    expect(child.deadline).toBe(f.origin + 80 * minute);
    f.advance(35 * minute);
    f.view.status = 'finished';

    return { exitCode: 0, costUsd: 0.2 };
  });

  expect(result.status).toBe('finished');
  expect(result.queueDurationMs).toBe(40 * minute);
  expect(result.durationMs).toBe(35 * minute);
});

it('uses fresh allowances only for an authoritative new join, retaining the old ledger archive', async () => {
  const f = await fixture();
  f.tick();
  await supervise(f.options, async () => ({ outcome: 'returned', costUsd: 0 }));
  f.queue.requestId = 'join_two';
  f.queue.matchId = 'match_two';
  f.view.matchId = 'match_two';
  f.view.status = 'finished';

  const result = await supervise(f.options, async () => {
    throw new Error('terminal new match needs no child');
  });

  expect(result.matchId).toBe('match_two');
  expect(result.status).toBe('finished');
  expect(result.invocations).toBe(0);
});

it('recovers the dead-process lock without refunding a grant after actual supervisor process death', async () => {
  const f = await fixture();

  const script = `import { supervise } from ${JSON.stringify(supervisorURL)};
    await supervise({configPath:${JSON.stringify(f.configPath)},harness:'claude',maxRuntimeMs:7200000,
      clock:{now:()=>${f.origin},monotonic:()=>0,sleep:()=>new Promise(r=>setTimeout(r,1))},
      request:async(_c,path)=>path==='/api/queue'?${JSON.stringify(f.queue)}:${JSON.stringify(f.view)}},
      async child=>{await child.onSession('ses_crash');await child.onUsage({scope:'invocation',total:0.3});process.exit(7)});`;

  await expect(
    promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]),
  ).rejects.toMatchObject({ code: 7 });
  const crashed = await f.ledger();
  expect(crashed.stopReason).toBeNull();
  expect(crashed.child.outstanding).toBe(1.7);
  f.advance(11 * minute);

  const result = await supervise(f.options, async () => {
    throw new Error('no grant recovery by refill');
  });

  expect(result.reason).toBe('accounting-unavailable');
  expect(result.costUsd).toBe(0.3);
  expect(result.durationMs).toBe(11 * minute);
  expect(result.accounting.unresolvedGranted).toBe(1.7);
});

it('rejects an explicit different game but follows actual game without a flag', async () => {
  const f = await fixture();
  await expect(supervise({ ...f.options, requestedGame: 'secret-overlord' })).rejects.toThrow('conflicts');
  f.view.status = 'finished';

  const result = await supervise(f.options, async () => {
    throw new Error('already terminal');
  });

  expect(result.gameId).toBe('succession');
  expect(result.status).toBe('finished');
});

it('does not cancel a different same-clock replacement ticket during queue exhaustion', async () => {
  const f = await fixture();
  f.tick();
  f.options.queueAllowanceMs = 1000;
  let polls = 0;
  f.options.request = async (_connection, _path, _body, method) => {
    expect(method).not.toBe('DELETE');

    return {
      ...f.queue,
      status: 'queued',
      matchId: null,
      requestId: ++polls > 2 ? 'replacement' : 'join_one',
    };
  };

  const result = await supervise(f.options, async () => {
    throw new Error('no model work');
  });

  expect(result.reason).toBe('queue-exhausted');
  expect(result.invocations).toBe(0);
});

it('legacy run evidence without historical usage fails closed instead of receiving a fresh known budget', async () => {
  const f = await fixture();
  await mkdtemp(`${f.configPath.replace('/connection.json', '')}/run-`);

  const result = await supervise(f.options, async () => {
    throw new Error('legacy spend is unavailable');
  });

  expect(result.reason).toBe('accounting-unavailable');
  expect(result.costUsd).toBeNull();
});

it('joins an idle installation in the parent using a durable stable request before launching any child', async () => {
  const f = await fixture();
  let joined = false;
  f.options.request = async (_connection, path, body) => {
    if (path !== '/api/queue') return { ...f.view, status: 'finished' };

    if (body) {
      expect(body).toEqual({ gameId: 'succession', requestId: 'join_one' });
      expect((await f.ledger()).pendingJoin.requestId).toBe('join_one');
      joined = true;
    }

    return joined ? f.queue : { status: 'idle', matchId: null, gameId: null };
  };

  const result = await supervise(f.options, async () => {
    throw new Error('parent handles joining and terminal inspection');
  });

  expect(joined).toBe(true);
  expect(result.invocations).toBe(0);
  expect(result.status).toBe('finished');
});

it('makes a parent-created assignment usable by the first child CLI command', async () => {
  const f = await fixture();
  let joined = false;
  f.options.request = async (_connection, path, _body, method) => {
    if (path !== '/api/queue') return f.view;
    if (method === undefined && _body) joined = true;
    return joined ? f.queue : { status: 'idle', gameId: null, matchId: null };
  };
  const result = await supervise(f.options, async () => {
    const saved = JSON.parse(await readFile(f.configPath, 'utf8'));
    expect(saved.matchId).toBe('match_new');
    expect(saved.participation).toEqual({ gameId: 'succession', matchId: 'match_new' });
    f.view.status = 'finished';
    return { outcome: 'returned', exitCode: 0, costUsd: 0.01 };
  });
  expect(joined).toBe(true);
  expect(result.status).toBe('finished');
  expect(result.invocations).toBe(1);
});
