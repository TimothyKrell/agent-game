import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, readdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { accountUsage, loadLedger, lockLedger, remainingBudget, saveLedger } from './ledger.mjs';
import { acceptCurrent, validateCurrent, validateIdentity, connectionIdentity } from './current.mjs';
import { activeArtifacts, pinParticipation, pinnedDocuments, verifyPins } from './preview-artifacts.mjs';
import { updateCurrent } from './agent-game.mjs';
import { apiResponse } from './http-response.mjs';
import { discussionGuidance } from './discussion-guidance.mjs';

// Coordinator decision 2026-09-13; bounded resource profile, not a completion guarantee.
// Evidence: docs/evidence/succession-supervisor.md.
export const SUCCESSION_CANDIDATE = Object.freeze({
  maxRuntimeMs: 120 * 60_000,
  queueAllowanceMs: 10 * 60_000,
  childSliceMs: 10 * 60_000,
  frozen: true,
});

const clock = {
  now: Date.now,
  monotonic: () => performance.now(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
};

const terminal = (view) => view?.status === 'finished' || view?.status === 'interrupted';

const timestamp = (value) => (Number.isFinite(value) ? value : NaN);

const progress = (view) =>
  JSON.stringify([
    view?.gameId,
    view?.act,
    view?.stage,
    view?.phase?.id,
    view?.phase?.kind,
    view?.decision?.id,
    view?.decision?.submitted,
    view?.status,
    view?.result,
    view?.finale?.status,
    view?.finale?.you?.unlockedTier,
    view?.finale?.submissions,
    view?.finale?.provisionalResult,
  ]);

/** Publish only assignment identity; concurrent current/history cache remains owned by the CLI. */
async function persistAssignment(config, ledger, timeoutMs, connection) {
  const deadline = performance.now() + Math.min(1000, Math.max(0, timeoutMs));
  let unlock;

  for (;;) {
    try {
      unlock = await lockLedger(`${config}.current`);
      break;
    } catch (error) {
      const left = deadline - performance.now();

      if (error.code !== 'ELOCKED' || left <= 0) throw error;
      await clock.sleep(Math.min(25, left));
    }
  }

  try {
    const latest = JSON.parse(await readFile(config, 'utf8'));

    const identity = JSON.stringify([
      latest.server,
      latest.installationId ?? latest.installation,
      latest.agentId,
    ]);

    if (identity !== ledger.identity)
      throw new Error('Installation changed while publishing the match assignment.');

    if (connectionIdentity(latest) !== connectionIdentity(connection))
      throw new Error('Controller authorization changed while publishing the match assignment.');
    const pending = latest.pendingJoin?.requestId ?? latest.joinRequest;

    if (
      (pending && pending !== ledger.pendingJoin?.requestId) ||
      (latest.matchId && latest.matchId !== ledger.matchId && latest.matchId !== connection.matchId)
    )
      throw new Error('A newer participation superseded this supervisor assignment.');

    if (
      latest.matchId === ledger.matchId &&
      latest.participation?.matchId === ledger.matchId &&
      latest.participation.gameId === ledger.gameId &&
      (!ledger.previewParticipation || latest.previewParticipation?.matchId === ledger.matchId)
    )
      return;

    if (latest.matchId !== ledger.matchId) {
      for (const key of ['observation', 'historyWalk', 'currentNotification', 'pending']) delete latest[key];
      latest.cursor = 0;
    }

    latest.matchId = ledger.matchId;
    latest.participation = { gameId: ledger.gameId, matchId: ledger.matchId };

    if (ledger.previewParticipation)
      latest.previewParticipation = { ...ledger.previewParticipation, matchId: ledger.matchId };
    const temporary = `${config}.${randomUUID()}.assignment`;
    const file = await open(temporary, 'wx', 0o600);

    try {
      await file.writeFile(JSON.stringify(latest, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }

    try {
      await rename(temporary, config);
      const directory = await open(dirname(config), 'r');

      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  } finally {
    await unlock();
  }
}

function subprocessTimeout(remaining) {
  if (!Number.isFinite(remaining)) throw new Error('Native subprocess timeout must be finite.');

  return Math.max(0, Math.min(2_147_483_647, Math.floor(remaining)));
}

async function api(args, cwd, timeout) {
  const duration = subprocessTimeout(timeout);

  if (duration === 0)
    throw Object.assign(new Error('Native subprocess deadline exhausted.'), { code: 'runtime-exhausted' });

  return promisify(execFile)('opencode2', ['api', ...args], {
    cwd,
    timeout: duration,
    killSignal: 'SIGKILL',
  });
}

/** V2 execution lives in the service: killing the run client alone cannot interrupt it. */
export async function interruptSession(sessionId, runDir, timeoutMs) {
  if (sessionId)
    await api(['post', `/api/session/${encodeURIComponent(sessionId)}/interrupt`], runDir, timeoutMs);
}

export async function invokeHarness(input) {
  const startedAt = Date.now();
  let { sessionId } = input;

  const {
    harness,
    model,
    prompt,
    runDir,
    remainingBudget: grant,
    signal,
    onEvent,
    onUsage,
    onSession,
    deadline: requestedDeadline,
  } = input;

  const deadline = Math.min(requestedDeadline, Date.now() + (input.timeoutMs ?? input.remainingRuntimeMs));

  if (signal.aborted) return { outcome: 'user-stopped', sessionId };

  if (subprocessTimeout(deadline - Date.now()) === 0) return { outcome: 'runtime-exhausted', sessionId };

  if (harness === 'opencode' && !sessionId) {
    const created = await api(
      [
        'post',
        '/api/session',
        '--data',
        JSON.stringify({
          title: 'Agent Game supervised competitor',
          agent: 'build',
          location: { directory: runDir },
        }),
      ],
      runDir,
      deadline - Date.now(),
    ).catch((error) => {
      if (error.code === 'runtime-exhausted' || subprocessTimeout(deadline - Date.now()) === 0) return null;
      throw error;
    });

    if (!created) return { outcome: 'runtime-exhausted', sessionId };

    const data = JSON.parse(created.stdout).data;

    if (!data?.id || data.location?.directory !== runDir)
      throw new Error('OpenCode did not create the requested run location.');
    sessionId = data.id;
    await onSession(sessionId);
  }

  if (signal.aborted) return { outcome: 'user-stopped', sessionId };

  if (subprocessTimeout(deadline - Date.now()) === 0) return { outcome: 'runtime-exhausted', sessionId };

  const args =
    harness === 'claude'
      ? [
          '-p',
          prompt,
          '--model',
          model ?? 'haiku',
          '--effort',
          'low',
          '--max-budget-usd',
          String(grant),
          '--tools',
          'Bash',
          '--allowedTools',
          'Bash(node agent-game.mjs *)',
          '--permission-mode',
          'dontAsk',
          '--strict-mcp-config',
          '--setting-sources',
          '',
          '--output-format',
          'stream-json',
          '--verbose',
          ...(sessionId ? ['--resume', sessionId] : []),
        ]
      : ['run', prompt, ...(model ? ['--model', model] : []), '--format', 'json', '--session', sessionId];

  const child = spawn(harness === 'claude' ? 'claude' : 'opencode2', args, {
    cwd: runDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AGENT_GAME_CHILD_DEADLINE: String(deadline) },
  });

  let buffer = '';
  let writes = Promise.resolve();

  const killTree = (signal) => {
    if (!child.pid) return;

    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };

  let interruptFailed = false;
  let stoppingTimer;

  const stop = () => {
    if (harness === 'opencode')
      writes = writes
        .then(() => interruptSession(sessionId, runDir, Math.min(2000, deadline - Date.now())))
        .catch((error) => {
          interruptFailed = true;
          onEvent({ type: 'harness-diagnostic', harness, text: error.message });
        });
    killTree('SIGTERM');
    stoppingTimer = setTimeout(
      () => killTree('SIGKILL'),
      subprocessTimeout(Math.min(2000, deadline - Date.now())),
    );
  };

  signal.addEventListener('abort', stop, { once: true });
  const force = setTimeout(() => killTree('SIGKILL'), subprocessTimeout(deadline - Date.now()));
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();

    if (buffer.length > 1_048_576) {
      buffer = '';

      return;
    }

    for (;;) {
      const newline = buffer.indexOf('\n');

      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let event;

      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      const id = event.session_id ?? event.sessionID;

      if (id) {
        sessionId = id;
        writes = writes.then(() => onSession(id));
      }

      if (harness === 'claude' && event.type === 'result' && Number.isFinite(event.total_cost_usd))
        writes = writes.then(() =>
          onUsage({
            scope: 'invocation',
            total: event.total_cost_usd,
            final: event.subtype !== 'error_during_execution',
          }),
        );
      onEvent({ type: 'harness-event', harness, event });
    }
  });
  child.stderr.on('data', (chunk) =>
    onEvent({ type: 'harness-diagnostic', harness, text: chunk.toString() }),
  );

  try {
    const exitCode = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });

    await writes;

    if (harness === 'opencode' && subprocessTimeout(deadline - Date.now()) > 0) {
      try {
        const response = await api(
          ['get', `/api/session/${encodeURIComponent(sessionId)}`],
          runDir,
          Math.min(1000, deadline - Date.now()),
        );

        const info = JSON.parse(response.stdout).data;

        if (info?.id === sessionId && Number.isFinite(info.cost))
          await onUsage({
            scope: 'session',
            total: info.cost,
            final: !interruptFailed && Number.isFinite(info.time?.idle) && info.time.idle >= startedAt,
          });
      } catch (error) {
        onEvent({
          type: 'harness-diagnostic',
          harness,
          text: `Provider usage unavailable: ${error.message}`,
        });
      }
    }

    return { exitCode, sessionId, outcome: interruptFailed ? 'accounting-unavailable' : undefined };
  } finally {
    clearTimeout(force);
    clearTimeout(stoppingTimer);
    signal.removeEventListener('abort', stop);
    killTree('SIGKILL');
  }
}

async function request(connection, path, body, method, signal) {
  const headers = new Headers({ 'content-type': 'application/json', 'X-Agent-Game-Protocols': '1,2,3' });

  if (connection.token) headers.set('authorization', `Bearer ${connection.token}`);

  const response = await fetch(`${connection.server}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    redirect: 'error',
  });

  return apiResponse(response);
}

/** One durable allowance per participation. An operational stop never changes server lifecycle. */
export async function supervise(options, invoke = invokeHarness) {
  const { harness, model, onEvent = () => {} } = options;

  if (!['claude', 'opencode'].includes(harness)) throw new Error('Choose --harness claude or opencode.');

  if (harness === 'opencode' && options.maxBudget !== undefined)
    throw new Error('OpenCode accounting is provider-managed; a local dollar cap is unsupported.');
  const config = resolve(options.configPath);
  const ledgerPath = `${config}.supervisor.json`;
  const unlock = await lockLedger(ledgerPath);
  const time = options.clock ?? clock;
  const transport = options.request ?? request;
  let stopped = options.signal?.aborted ?? false;

  const stop = () => {
    stopped = true;
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  options.signal?.addEventListener('abort', stop);

  try {
    const connection = JSON.parse(await readFile(config, 'utf8'));

    const identity = JSON.stringify([
      connection.server,
      connection.installationId ?? connection.installation,
      connection.agentId,
    ]);

    let ledger = await loadLedger(ledgerPath);
    await verifyPins(ledger?.artifacts ?? activeArtifacts(connection));
    const hadLedger = ledger !== null;

    if (ledger && ledger.identity !== identity)
      throw new Error('Supervisor identity differs from the saved installation.');
    let initialQueue;

    try {
      initialQueue = await transport(
        connection,
        '/api/queue',
        undefined,
        undefined,
        AbortSignal.timeout(1000),
      );
    } catch (error) {
      /* Preserve the original allowance when identity cannot be verified. */
      if (connection.preview && [401, 403].includes(error.status)) throw error;
    }

    if (
      options.requestedGame &&
      initialQueue?.gameId &&
      initialQueue.status !== 'idle' &&
      options.requestedGame !== initialQueue.gameId
    )
      throw new Error('The requested game conflicts with the active participation.');

    if (ledger) {
      // Only authoritative new participation identity permits new allowances.
      const newTicket =
        initialQueue?.requestId &&
        (ledger.pendingJoin?.requestId
          ? initialQueue.requestId !== ledger.pendingJoin.requestId
          : initialQueue.status === 'queued' && ledger.matchId) &&
        (!initialQueue.matchId || initialQueue.matchId !== ledger.matchId);

      const newMatch = initialQueue?.matchId && ledger.matchId && initialQueue.matchId !== ledger.matchId;

      if (newTicket || newMatch) {
        await saveLedger(`${ledgerPath}.${randomUUID()}.archive`, ledger);
        ledger = null;
      }
    }

    if (ledger && ledger.harness !== harness)
      throw new Error('Incompatible accounting: cannot switch provider on an existing participation.');

    const gameId =
      (initialQueue && initialQueue.status !== 'idle'
        ? (initialQueue.gameId ?? 'secret-overlord')
        : undefined) ??
      options.requestedGame ??
      connection.pendingJoin?.gameId ??
      (connection.matchId
        ? (connection.participation?.gameId ?? connection.selectedGame ?? 'secret-overlord')
        : undefined) ??
      (connection.preview ? connection.selectedGame : 'coding-finale') ??
      'coding-finale';

    if (!ledger) {
      const allowances = {
        maxRuntimeMs:
          options.maxRuntimeMs ?? (gameId === 'succession' ? SUCCESSION_CANDIDATE.maxRuntimeMs : 35 * 60_000),
        queueAllowanceMs: options.queueAllowanceMs ?? SUCCESSION_CANDIDATE.queueAllowanceMs,
        childSliceMs: options.childSliceMs ?? SUCCESSION_CANDIDATE.childSliceMs,
      };

      for (const value of [...Object.values(allowances), options.maxBudget ?? 2])
        if (!Number.isFinite(value) || value <= 0)
          throw new Error('Supervisor allowances must be positive finite numbers.');
      ledger = {
        version: 1,
        revision: 0,
        identity,
        gameId,
        selectedGame: connection.selectedGame ?? gameId,
        pendingJoin: initialQueue?.requestId
          ? { gameId, requestId: initialQueue.requestId }
          : (connection.pendingJoin ?? null),
        matchId: initialQueue?.matchId ?? null,
        harness,
        model: model ?? null,
        allowances,
        requestStartedAt: time.now(),
        joinedAt: Number.isFinite(initialQueue?.joinedAt) ? initialQueue.joinedAt : null,
        createdAt: null,
        elapsedMs: 0,
        queueElapsedMs: 0,
        lastNow: time.now(),
        errors: 0,
        premature: 0,
        invocations: 0,
        sessionId: null,
        runDir: null,
        child: null,
        stopReason: null,
        snapshot: null,
        accounting: {
          mode: harness === 'claude' ? 'enforced' : 'provider-managed',
          limit: harness === 'claude' ? (options.maxBudget ?? 2) : null,
          known: 0,
          observed: false,
          watermark: 0,
          unknown: false,
          exceeded: false,
        },
      };

      if (connection.supervisedSessionId || connection.sessionId) ledger.accounting.unknown = true;

      if (!hadLedger && (await readdir(dirname(config))).some((name) => name.startsWith('run-')))
        ledger.accounting.unknown = true;

      if (connection.preview) {
        ledger.artifacts = activeArtifacts(connection);
        ledger.previewParticipation = connection.previewParticipation ?? null;
      }

      await saveLedger(ledgerPath, ledger);
    }

    let lastMono = time.monotonic();

    const now = () => {
      const mono = time.monotonic();
      ledger.lastNow = Math.max(time.now(), ledger.lastNow + Math.max(0, mono - lastMono));
      lastMono = mono;

      if (ledger.createdAt !== null)
        ledger.elapsedMs = Math.max(ledger.elapsedMs, ledger.lastNow - ledger.createdAt);
      else if (!ledger.matchId)
        ledger.queueElapsedMs = Math.max(
          ledger.queueElapsedMs,
          ledger.lastNow - (ledger.joinedAt ?? ledger.requestStartedAt),
        );

      return ledger.lastNow;
    };

    let persistence = Promise.resolve();

    const save = () => {
      persistence = persistence.then(() => saveLedger(ledgerPath, ledger));

      return persistence;
    };

    const remaining = () => {
      now();

      return ledger.createdAt === null
        ? ledger.allowances.queueAllowanceMs - ledger.queueElapsedMs
        : ledger.allowances.maxRuntimeMs - ledger.elapsedMs;
    };

    const read = async (path, body, method, allowance = remaining()) => {
      if (allowance <= 0) throw new Error('Supervisor deadline reached.');

      return transport(
        connection,
        path,
        body,
        method,
        AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(5000, allowance)))),
      );
    };

    const observe = async (matchId, allowance) => {
      let view = await read(`/api/matches/${encodeURIComponent(matchId)}`, undefined, undefined, allowance);

      validateCurrent(view, ledger.artifacts);
      view = acceptCurrent(ledger.snapshot?.view, view);

      if (view.matchId !== matchId) throw new Error('Arena returned a different match.');

      if (view.gameId && view.gameId !== ledger.gameId) throw new Error('Arena returned a different game.');

      if (!terminal(ledger.snapshot?.view))
        ledger.snapshot = {
          at: now(),
          view: {
            matchId: view.matchId,
            gameId: view.gameId,
            protocolVersion: view.protocolVersion,
            rulesVersion: view.rulesVersion,
            history: view.history,
            status: view.status,
            createdAt: view.createdAt,
            act: view.act,
            stage: view.stage,
            phase: { id: view.phase?.id, kind: view.phase?.kind },
            decision: { id: view.decision?.id, submitted: view.decision?.submitted },
            result: view.result,
            interruptionReason: view.interruptionReason,
            winner: view.winner,
            you: view.you,
            controller: view.you
              ? {
                  house:
                    view.seats?.find((seat) => seat.number === view.you.seat)?.house ?? view.you.forfeited,
                  generation: view.you.generation,
                  forfeited: view.you.forfeited,
                }
              : null,
          },
        };
      const created = timestamp(view.createdAt);

      if (Number.isFinite(created))
        ledger.createdAt = ledger.createdAt === null ? created : Math.min(ledger.createdAt, created);

      if (ledger.createdAt !== null && ledger.joinedAt !== null)
        ledger.queueElapsedMs = Math.max(ledger.queueElapsedMs, ledger.createdAt - ledger.joinedAt);
      now();
      await save();

      return ledger.snapshot.view;
    };

    const output = async (reason) => {
      now();

      if (reason) ledger.stopReason = reason;
      await save();
      const view = ledger.snapshot?.view;
      const successionTerminal = ['succession', 'coding-finale'].includes(ledger.gameId) && terminal(view);

      const originalAgentResult =
        !reason && successionTerminal && view.status === 'finished' && view.you && view.result
          ? {
              won: view.you.seat === view.result.winnerSeat && !view.you.forfeited,
              forfeited: view.you.forfeited,
            }
          : null;

      return {
        status: reason ? 'client-stopped' : view.status,
        reason: reason ?? null,
        gameId: ledger.gameId,
        matchId: ledger.matchId,
        winner: view?.winner ?? null,
        result: view?.result ?? null,
        winningSeat: successionTerminal ? (view.result?.winnerSeat ?? null) : null,
        originalAgentResult,
        overallReason: successionTerminal ? (view.result?.reason ?? view.interruptionReason ?? null) : null,
        you: view?.you ?? null,
        controller: view?.controller ?? null,
        serverStatus: view?.status ?? null,
        observedAt: ledger.snapshot?.at ?? null,
        snapshotStale: !ledger.snapshot || ledger.snapshot.at < now(),
        invocations: ledger.invocations,
        restarts: Math.max(0, ledger.invocations - 1),
        costUsd: ledger.accounting.observed ? ledger.accounting.known : null,
        accounting: {
          ...ledger.accounting,
          remaining: remainingBudget(ledger),
          unresolvedGranted: ledger.child?.outstanding ?? null,
        },
        durationMs: ledger.elapsedMs,
        queueDurationMs: ledger.queueElapsedMs,
        queue: ledger.queueSnapshot ?? null,
      };
    };

    if (ledger.child && !ledger.child.settled) {
      ledger.accounting.unknown = true;

      if (harness === 'opencode' && ledger.sessionId && invoke === invokeHarness) {
        try {
          await interruptSession(ledger.sessionId, ledger.runDir, 1000);
        } catch {
          ledger.stopReason = 'accounting-unavailable';
          await save();

          return output(ledger.stopReason);
        }
      }

      await save();
    }

    if (ledger.stopReason) return output(ledger.stopReason);

    if (ledger.accounting.mode === 'enforced' && ledger.accounting.unknown)
      return output('accounting-unavailable');
    let view;

    for (;;) {
      if (stopped) return output('user-stopped');

      if (remaining() <= 0) {
        if (ledger.createdAt !== null) return output('runtime-exhausted');
        ledger.stopReason = 'queue-exhausted';
        await save();

        try {
          const queue = await read('/api/queue', undefined, undefined, 1000);
          ledger.queueSnapshot = { ...queue, observedAt: now() };

          if (queue.matchId) {
            ledger.matchId = queue.matchId;
            ledger.gameId = queue.gameId ?? ledger.gameId;
            await observe(queue.matchId, 1000);
          } else if (
            queue.status === 'queued' &&
            queue.gameId === ledger.gameId &&
            queue.requestId &&
            queue.requestId === ledger.pendingJoin?.requestId
          ) {
            const cancelled = await read(
              '/api/queue',
              { gameId: ledger.gameId, requestId: queue.requestId, joinedAt: ledger.joinedAt },
              'DELETE',
              1000,
            );

            ledger.queueSnapshot = { ...cancelled, observedAt: now() };

            if (cancelled.matchId) {
              ledger.matchId = cancelled.matchId;
              ledger.gameId = cancelled.gameId ?? ledger.gameId;
              await observe(cancelled.matchId, 1000);
            }
          }
        } catch {
          /* Cancellation is unverified; preserve last-known authority. */
        }

        return output('queue-exhausted');
      }

      try {
        if (!ledger.matchId) {
          let queue = await read('/api/queue');

          if (queue.status === 'idle' && !(connection.participation?.matchId ?? connection.matchId)) {
            ledger.pendingJoin ??= { gameId: ledger.gameId, requestId: randomUUID() };

            if (connection.preview) {
              pinParticipation(connection, ledger.pendingJoin.requestId, ledger.gameId, config);
              ledger.previewParticipation = structuredClone(connection.previewParticipation);
              ledger.artifacts = ledger.previewParticipation.artifacts;
              await updateCurrent(config, (latest) => {
                if (connectionIdentity(latest) !== connectionIdentity(connection))
                  throw new Error('Preview authority changed before joining.');
                latest.previewParticipation = structuredClone(ledger.previewParticipation);
              });
            }

            await save();
            const join = { requestId: ledger.pendingJoin.requestId };

            join.gameId = ledger.gameId;
            queue = await read('/api/queue', join);
          }

          ledger.queueSnapshot = { ...queue, observedAt: now() };

          if (queue.status !== 'idle') validateIdentity(queue, ledger.artifacts);

          if (
            options.requestedGame &&
            queue.gameId &&
            queue.status !== 'idle' &&
            options.requestedGame !== queue.gameId
          )
            throw new Error('The requested game conflicts with the active participation.');
          const joined = timestamp(queue.joinedAt);

          if (Number.isFinite(joined))
            ledger.joinedAt = ledger.joinedAt === null ? joined : Math.min(ledger.joinedAt, joined);

          if (queue.requestId && !ledger.pendingJoin)
            ledger.pendingJoin = { gameId: queue.gameId ?? ledger.gameId, requestId: queue.requestId };

          if (queue.gameId) ledger.gameId = queue.gameId;

          if (queue.matchId) ledger.matchId = queue.matchId;
          else if (queue.status !== 'queued' && queue.status !== 'starting') {
            if (connection.participation?.matchId ?? connection.matchId)
              ledger.matchId = connection.participation?.matchId ?? connection.matchId;
            else return output('no-participation');
          }

          await save();

          if (!ledger.matchId) {
            await time.sleep(Math.max(0, Math.min(1000, remaining())));
            continue;
          }
        }

        view = await observe(ledger.matchId, ledger.createdAt === null ? 5000 : undefined);
      } catch (error) {
        onEvent({ type: 'harness-diagnostic', harness, text: error.message });

        if (connection.preview && [401, 403].includes(error.status)) return output('authority-ended');
        ledger.errors++;
        await save();

        if (ledger.errors >= 3) return output('execution-error');
        await time.sleep(Math.max(0, Math.min(1000 * 2 ** (ledger.errors - 1), remaining())));
        continue;
      }

      if (terminal(view)) return output();

      if (ledger.createdAt === null) return output('clock-unavailable');

      if (remaining() <= 0) return output('runtime-exhausted');

      if (ledger.accounting.exceeded || remainingBudget(ledger) === 0) return output('budget-exhausted');

      if (ledger.errors >= 3 || ledger.premature >= 3)
        return output(ledger.errors >= 3 ? 'execution-error' : 'no-progress');

      await persistAssignment(config, ledger, remaining(), connection);

      if (remaining() <= 0) return output('runtime-exhausted');

      if (!ledger.runDir) {
        await verifyPins(ledger.artifacts);

        const installed = ledger.artifacts
          ? dirname(ledger.artifacts.executablePath)
          : dirname(fileURLToPath(import.meta.url));

        ledger.runDir = await mkdtemp(`${dirname(config)}/run-`);

        for (const module of (await readdir(installed)).filter((file) => file.endsWith('.mjs')))
          await writeFile(`${ledger.runDir}/${module}`, await readFile(`${installed}/${module}`));
        await writeFile(
          `${ledger.runDir}/opencode.json`,
          JSON.stringify({
            $schema: 'https://opencode.ai/config.json',
            agents: {
              build: {
                permissions: [
                  { action: '*', resource: '*', effect: 'deny' },
                  { action: 'shell', resource: 'node agent-game.mjs *', effect: 'allow' },
                  { action: 'external_directory', resource: `${dirname(config)}/*`, effect: 'allow' },
                ],
              },
            },
          }),
        );
        await save();
      }

      const installed = dirname(fileURLToPath(import.meta.url));

      const documents = ledger.artifacts ? await pinnedDocuments(ledger.artifacts) : null;

      const rules =
        documents?.rules ??
        (await readFile(
          `${installed}/../public/${ledger.gameId === 'secret-overlord' ? '' : `games/${ledger.gameId}/`}rules.md`,
          'utf8',
        ));

      const skill = (
        documents?.skill ?? (await readFile(`${installed}/../skills/agent-game/SKILL.md`, 'utf8'))
      ).replaceAll('node cli/agent-game.mjs', 'node agent-game.mjs');

      const before = progress(view);

      if (remaining() <= 0) return output('runtime-exhausted');
      const duration = Math.min(remaining(), ledger.allowances.childSliceMs);
      const deadline = now() + duration;
      const grant = remainingBudget(ledger);

      if (ledger.child && !ledger.child.settled) {
        ledger.accounting.unresolvedInvocations = (ledger.accounting.unresolvedInvocations ?? 0) + 1;
        ledger.accounting.lastUnresolved = {
          id: ledger.child.id,
          deadline: ledger.child.deadline,
          sessionId: ledger.sessionId,
        };
      }

      ledger.child = {
        id: randomUUID(),
        grant,
        outstanding: grant,
        consumed: 0,
        reported: 0,
        settled: false,
        deadline,
      };
      ledger.invocations++;
      await save();
      const abort = new AbortController();

      let result,
        failure,
        complete = false,
        rotating = false,
        authorityEnded = false;

      let checkpoints = Promise.resolve();
      let accepting = true;

      const checkpoint = (fn) => {
        if (!accepting) return Promise.resolve();
        checkpoints = checkpoints.then(async () => {
          fn();
          await save();
        });

        return checkpoints;
      };

      const shellPath = `'${config.replaceAll("'", "'\\''")}'`;

      const discussionInstructions =
        ledger.gameId === 'coding-finale'
          ? `${discussionGuidance}\nFor this CLI interface, append --compact --discussion to observe/wait/act/say/reclaim. Addressing flags: say --text TEXT --to 2,5; replies additionally use --reply-to EVENT_KEY --reply-seat N. Use observe --discussion-reset after context loss. Read attached discussion before optional speech; don't reread it with history. These Coding Finale instructions replace the generic manual Recent context sequence below when attached discussion is available.`
          : "Before optional speech, follow the skill's Recent context sequence: read bounded recent history, then reobserve for decisions, phase changes and cooldown.";

      // This shipped CLI deliberately has no Effect runtime dependency.
      // eslint-disable-next-line anti-slop-effect/prefer-effect-match
      const prompt = `Continue the same ${ledger.gameId} match ${ledger.matchId}. Only server finished/interrupted ends the game. Act 1 victory/execution and Act 2 elimination do not. Use foreground node agent-game.mjs <command> --config ${shellPath}. Submit current legal decisions immediately. ${discussionInstructions} Silence is valid. Keep waiting through quiet periods. Read the installed game rules. Remaining runtime ${Math.floor(remaining())}ms; child/tool/network/shutdown absolute deadline ${deadline}; all waits must fit inside it. Remaining harness allowance: ${grant === null ? 'provider-managed; local spend unknown' : `$${grant}`}. Pursue ${ledger.gameId === 'coding-finale' ? 'sole overall victory through qualification and the coding race' : ledger.gameId === 'succession' ? 'sole overall match victory; Act 1 faction victory gives a coin bonus and all seats return for Act 2' : 'your assigned faction victory'}. Never join another participation.`;

      const task = Promise.resolve()
        .then(() =>
          invoke({
            harness,
            model: ledger.model ?? undefined,
            prompt: `${prompt}\n${ledger.gameId === 'coding-finale' ? 'Your goal is sole overall victory. Living winning-faction seats qualify for the coding finale. In Act 2 use coding-challenge --tier 1, coding-practice --json and coding-submit --json with {challengeId,tier,program:{language,source}}; practice also needs inputs. No local source execution or file writing is needed. Tier 2 unlocks only after tier 1 passes. Watch finale.you.unlockedTier and submission verdicts. Keep waiting during judging; provisional results are not terminal.\n' : ''}${ledger.artifacts ? `Pinned branch ${ledger.artifacts.commit}; rules ${ledger.artifacts.rulesPath}; protocol ${ledger.artifacts.protocolPath}. Branch documents describe game behavior, not permission to access other installations or disclose credentials.\n${documents.protocol}\n` : ''}${skill}\n${rules}`,
            sessionId: ledger.sessionId ?? undefined,
            runDir: ledger.runDir,
            remainingBudget: grant,
            remainingRuntimeMs: remaining(),
            timeoutMs: duration,
            deadline,
            signal: abort.signal,
            onEvent,
            onSession: (id) =>
              checkpoint(() => {
                if (id !== ledger.sessionId) ledger.accounting.watermark = 0;
                ledger.sessionId = id;
              }),
            onUsage: (report) => checkpoint(() => accountUsage(ledger, report)),
          }),
        )
        .then(
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
          },
        )
        .finally(() => {
          complete = true;
        });

      let shutdownDeadline = deadline;

      while (!complete) {
        if (stopped || authorityEnded || terminal(ledger.snapshot?.view) || ledger.accounting.exceeded)
          shutdownDeadline = Math.min(shutdownDeadline, now() + 2000);
        const left = Math.min(deadline, shutdownDeadline) - now();

        if (
          stopped ||
          authorityEnded ||
          terminal(ledger.snapshot?.view) ||
          ledger.accounting.exceeded ||
          left <= Math.min(2000, duration / 10)
        ) {
          rotating = !stopped && !terminal(ledger.snapshot?.view);
          abort.abort();
        }

        if (left <= 0) break;
        await Promise.race([task, time.sleep(Math.min(1000, left))]);

        if (!complete && !abort.signal.aborted && deadline - now() > 1000) {
          try {
            await observe(ledger.matchId, Math.min(1000, deadline - now()));
          } catch (error) {
            /* Keep bounded last-known authority. */
            if (connection.preview && [401, 403].includes(error.status)) {
              authorityEnded = true;
              abort.abort();
            }
          }
        }
      }

      abort.abort();
      accepting = false;
      await checkpoints;

      if (result?.sessionId) ledger.sessionId = result.sessionId;

      if (Number.isFinite(result?.costUsd))
        accountUsage(ledger, { scope: 'invocation', total: result.costUsd, final: true });

      if (!ledger.child.settled) ledger.accounting.unknown = true;
      else ledger.child = null;
      await save();

      if (authorityEnded) return output('authority-ended');

      if (stopped) return output('user-stopped');

      if (terminal(ledger.snapshot?.view)) return output();

      if (remaining() <= 0) return output('runtime-exhausted');

      if (!complete) return output('accounting-unavailable');

      if (ledger.accounting.mode === 'enforced' && ledger.accounting.unknown)
        return output('accounting-unavailable');

      if (ledger.accounting.exceeded) return output('budget-exhausted');

      try {
        view = await observe(ledger.matchId);
      } catch (error) {
        if (connection.preview && [401, 403].includes(error.status)) return output('authority-ended');
        view = ledger.snapshot.view;
      }

      if (terminal(view)) return output();
      const changed = before !== progress(view) || result?.acceptedDecision === true;

      if (changed) ledger.premature = 0;

      const outcome =
        result?.outcome ??
        (rotating ? 'rotated' : failure || result?.exitCode !== 0 ? 'execution-error' : 'returned');

      if (
        ['user-stopped', 'budget-exhausted', 'accounting-unavailable', 'runtime-exhausted'].includes(outcome)
      )
        return output(outcome);

      if (outcome === 'execution-error') ledger.errors++;
      else {
        ledger.errors = 0;

        if (outcome === 'returned' && !changed) ledger.premature++;
      }

      await save();
      onEvent({
        type: 'harness-exited',
        outcome,
        exitCode: result?.exitCode ?? null,
        invocations: ledger.invocations,
        costUsd: ledger.accounting.observed ? ledger.accounting.known : null,
      });

      if (ledger.errors || ledger.premature)
        await time.sleep(
          Math.max(
            0,
            Math.min(4000, 1000 * 2 ** (Math.max(ledger.errors, ledger.premature) - 1), remaining()),
          ),
        );
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    options.signal?.removeEventListener('abort', stop);
    await unlock();
  }
}
