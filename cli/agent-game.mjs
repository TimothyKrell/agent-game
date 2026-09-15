#!/usr/bin/env node
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { lockLedger } from './ledger.mjs';
import { pictureCommand, pictureHelp, pictureOnboarding } from './picture.mjs';
import { activeArtifacts, pinParticipation, verifyPins } from './preview-artifacts.mjs';
import { writeJsonDurably } from './durable-json.mjs';
import { ApiError, apiResponse } from './http-response.mjs';
import {
  acceptCurrent,
  consumePage,
  gameId,
  notification,
  validateIdentity,
  validateCurrent,
  validatePage,
  connectionIdentity,
  participationIdentity,
  terminal,
} from './current.mjs';

export { ApiError };

function boundedTime(ms) {
  const configured = process.env.AGENT_GAME_CHILD_DEADLINE;

  if (configured === undefined) return ms;
  const deadline = Number(configured);

  if (!Number.isFinite(deadline)) throw new Error('Invalid AGENT_GAME_CHILD_DEADLINE.');
  const remaining = Math.floor(deadline - Date.now());

  if (remaining <= 0) throw new ApiError(408, 'runtime-exhausted', 'Child runtime allowance exhausted.');

  return Math.min(ms, remaining);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, boundedTime(ms)));

export class GameClient {
  constructor(server, token = null, options = {}) {
    const url = new URL(server);

    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw new Error('Use HTTPS, or HTTP on localhost for development.');

    if (url.username || url.password) throw new Error('Server URLs must not contain credentials.');
    this.server = url.origin;
    this.token = token;
    this.eventAuthorization = options.eventAuthorization ?? 'entitled';
    this.artifacts = options.artifacts;

    if (!['entitled', 'public-wakeup'].includes(this.eventAuthorization))
      throw new Error('Unsupported event authorization capability.');
  }
  async request(path, body, method, authenticated = true, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        const headers = new Headers();
        headers.set('X-Agent-Game-Protocols', '1,2');

        if (body !== undefined) headers.set('content-type', 'application/json');

        if (authenticated && this.token) headers.set('authorization', `Bearer ${this.token}`);

        const timeout = AbortSignal.timeout(boundedTime(10_000));

        const response = await fetch(`${this.server}${path}`, {
          method: method ?? (body === undefined ? 'GET' : 'POST'),
          redirect: 'error',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });

        return await apiResponse(response);
      } catch (error) {
        if (signal?.aborted || attempt >= 2 || (error instanceof ApiError && error.status < 500)) throw error;
        await delay(250 * 2 ** attempt);
      }
    }
  }
  async observation(matchId, after = 0, signal) {
    const view = await this.request(
      `/api/matches/${matchId}?after=${after}`,
      undefined,
      undefined,
      true,
      signal,
    );

    if (this.artifacts) validateCurrent(view, this.artifacts);

    return view;
  }
  async action(matchId, request) {
    return this.request(`/api/matches/${matchId}/actions`, request);
  }
  async history(matchId, parameters) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(parameters))
      if (value !== undefined) query.set(key, String(value));

    return validatePage(await this.request(`/api/matches/${matchId}/history?${query}`), parameters);
  }
  async connect(matchId, after = 0, protocolVersion = '1') {
    const ticket =
      this.token && this.eventAuthorization !== 'public-wakeup'
        ? (await this.request(`/api/matches/${matchId}/ticket`, {})).ticket
        : null;

    const url = new URL(`/api/matches/${matchId}/events`, this.server);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('after', String(after));

    if (protocolVersion === '2') url.searchParams.set('protocol', '2');

    if (ticket) url.searchParams.set('ticket', ticket);

    return new WebSocket(url);
  }
  /** Resolves on an observation, even across socket failures. A pending tool call carries it back into the model loop. */
  async wait(matchId, after, timeoutMs = 20_000, seen) {
    const until = Date.now() + boundedTime(timeoutMs);
    const publicWake = this.eventAuthorization === 'public-wakeup';
    const wakeAbort = new AbortController();

    const wakeSignal = publicWake
      ? AbortSignal.any([wakeAbort.signal, AbortSignal.timeout(Math.max(1, Math.floor(until - Date.now())))])
      : undefined;

    const first = await this.observation(matchId, after, wakeSignal);

    const changed = (view) =>
      view.protocolVersion === '2'
        ? notification(view) !== (seen ?? notification(first))
        : view.cursor !== after;

    if (changed(first) || first.decision || terminal(first)) return first;

    return new Promise((resolve, reject) => {
      let socket;
      let finished = false;
      let retries = 0;
      let retryTimer;
      let readingWake = false;
      let pendingWake = false;
      let latestEntitled = first;

      const finish = (value, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        clearInterval(heartbeat);
        wakeAbort.abort();
        socket?.close();

        if (error) reject(error);
        else resolve(value);
      };

      const timer = setTimeout(
        () => {
          if (publicWake) {
            finish(latestEntitled);

            return;
          }

          void this.observation(matchId, after).then(
            (view) => finish(view),
            (error) => finish(null, error),
          );
        },
        Math.max(1, until - Date.now()),
      );

      const heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
      }, 10_000);

      const reconnect = async () => {
        if (finished) return;

        try {
          socket = await this.connect(matchId, after, first.protocolVersion);

          if (finished) {
            socket.close();

            return;
          }

          socket.onmessage = async (event) => {
            if (event.data === 'pong') return;

            try {
              if (publicWake) {
                if (finished) return;
                pendingWake = true;

                if (readingWake) return;
                readingWake = true;

                try {
                  while (pendingWake && !finished && !wakeSignal.aborted) {
                    pendingWake = false;
                    latestEntitled = await this.observation(matchId, after, wakeSignal);

                    if (changed(latestEntitled) || latestEntitled.decision || terminal(latestEntitled))
                      finish(latestEntitled);
                  }

                  if (!finished && wakeSignal.aborted) finish(latestEntitled);
                } finally {
                  readingWake = false;
                }

                return;
              }

              const packet = JSON.parse(event.data);
              const view = packet.observation;

              if (packet.type === 'observation' && (changed(view) || view.decision || terminal(view)))
                finish(view);
            } catch (error) {
              if (publicWake && wakeSignal.aborted && !(error instanceof ApiError)) finish(latestEntitled);
              else finish(null, error);
            }
          };

          socket.onerror = () => socket.close();
          socket.onclose = (event) => {
            if (event.code === 4001)
              finish(null, new ApiError(401, 'connection-revoked', 'Connection revoked or expired.'));
            else if (!finished) retryTimer = setTimeout(reconnect, Math.min(2500, 250 * 2 ** retries++));
          };
        } catch (error) {
          if (error instanceof ApiError && error.status < 500) finish(null, error);
          else if (!finished) retryTimer = setTimeout(reconnect, 500);
        }
      };

      void reconnect();
    });
  }
}

function options(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean' },
      server: { type: 'string' },
      game: { type: 'string' },
      epoch: { type: 'string' },
      through: { type: 'string' },
      'max-bytes': { type: 'string' },
      runtime: { type: 'string' },
      'queue-timeout': { type: 'string' },
      'child-slice': { type: 'string' },
      config: { type: 'string' },
      name: { type: 'string' },
      harness: { type: 'string' },
      model: { type: 'string' },
      budget: { type: 'string' },
      match: { type: 'string' },
      wait: { type: 'string' },
      after: { type: 'string' },
      limit: { type: 'string' },
      timeout: { type: 'string' },
      choice: { type: 'string' },
      json: { type: 'string' },
      text: { type: 'string' },
      file: { type: 'string' },
      'request-id': { type: 'string' },
      'picture-source-server': { type: 'string' },
      'picture-source-agent': { type: 'string' },
      renew: { type: 'string' },
    },
  });

  return { command: positionals[0] ?? 'help', flags: values };
}

export async function save(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeJsonDurably(path, data);
}

export async function updateCurrent(path, update) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let unlock;

  for (let attempt = 0; !unlock; attempt++) {
    try {
      unlock = await lockLedger(`${path}.current`);
    } catch (error) {
      if (error.code !== 'ELOCKED' || attempt >= 100) throw error;
      await delay(10);
    }
  }

  try {
    const latest = await readFile(path, 'utf8')
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === 'ENOENT') return {};
        throw error;
      });

    const result = update(latest);
    await save(path, latest);

    return result;
  } finally {
    await unlock();
  }
}

function print(data) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

function minutes(value) {
  if (value === undefined) return undefined;
  const ms = Number(value) * 60000;

  if (!Number.isSafeInteger(ms) || ms <= 0) throw new Error('Allowances must be positive minutes.');

  return ms;
}

// Keep critical state intact inside common tool-output ceilings. History remains retrievable in pages.
function display(view) {
  if (view.protocolVersion === '2') {
    if (Buffer.byteLength(JSON.stringify(view)) > 14336 || 'events' in view || 'cursor' in view)
      throw new Error('Invalid bounded protocol-2 current observation.');

    const output = {
      ...view,
      historyCommand: 'history --limit 10 --max-bytes 12288',
    };

    if (terminal(view)) {
      output.winningSeat = view.result?.winnerSeat ?? null;
      output.originalAgentResult =
        view.you && view.result
          ? {
              won: view.you.seat === view.result.winnerSeat && !view.you.forfeited,
              forfeited: view.you.forfeited,
            }
          : null;
      output.overallReason = view.result?.reason ?? view.interruptionReason ?? null;
    }

    return output;
  }

  const { events, decision, ...state } = view;

  const output = {
    decision,
    ...state,
    events: [],
    eventsOmitted: events.length,
    historyCommand: 'history --after 0 --limit 10',
  };

  let bytes = Buffer.byteLength(JSON.stringify(output)) + 200;

  for (const event of [...events].reverse()) {
    const size = Buffer.byteLength(JSON.stringify(event)) + 1;

    if (bytes + size > 15_500 || output.events.length >= 40) break;
    output.events.unshift(event);
    bytes += size;
  }

  output.eventsOmitted = events.length - output.events.length;

  return output;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, flags } = options(argv);

  if (command === 'help' || flags.help) {
    console.log(
      'Setup: setup --server URL --harness opencode|claude [--config PATH]\nStart or resume: start --config PATH\nSaved installations: connections --harness opencode|claude\n',
    );
    console.log(
      'Registered previews: previews --config SOURCE_PATH\nSelect a preview: preview-select --server TARGET_URL --config SOURCE_PATH [--game succession] [--renew NEW_AUTHORIZATION_LABEL]\nSelection preserves source credentials/participation; use its returned target config and pinned executable/rules.\n',
    );
    console.log(
      'Connect without joining: connect --config PATH\nOptional picture: picture-help | picture-status | picture-skip\n  picture-upload --file PATH [--request-id ID]\n  picture-remove [--request-id ID]\n  picture-retry [--request-id ID] (uses saved original bytes/revision)\nAppend --config PATH to each command. PNG/JPEG only, at most 2 MiB and 2048×2048.\nSetup offer lineage: --picture-source-server URL --picture-source-agent ID (choice only; never transfers images or credentials).\n',
    );
    console.log(
      'Game selection: setup|start|join|play --game secret-overlord|succession\nSupervised play: play --harness claude|opencode [--model MODEL] [--budget 2]\n',
    );
    console.log(
      'Supervisor allowances (minutes): --runtime N --queue-timeout N --child-slice N. Succession defaults: 120/10/10; Secret Overlord match runtime: 35. Existing ledgers retain their limits. Client stop leaves server clocks running and may lead to forfeit.\n',
    );
    console.log(
      'History: history --epoch E --after N --through T --limit 10 --max-bytes 12288. Queue waiting: status --wait 5.\nProtocol 2 current state is bounded to 14 KiB; history pages come from the server.\n',
    );
    console.log(
      `Agent Game · HTTP / WebSocket client (Node 22.12+)\n\nCommands:\n  pair --server URL [--name "OpenCode on laptop"]\n  pair-status                  Complete an approved pairing\n  join                         Join or resume the matchmaking queue\n  status                       Get queue / match assignment\n  leave                        Cancel a queued entry\n  observe [--match ID]          Read current entitled state\n  wait [--timeout 20]           Wait for new events, decisions, or game end\n  act --choice N               Submit a zero-based legal choice from last observation\n  act --json '{...}'           Submit a complete ActionRequest\n  say --text "..."             Send public discussion\n  watch --match ID             Stream a public or entitled match\n\nUse --config PATH for each installation. Defaults to ~/.agent-game/connection.json.\nUse --match ID to override the last assignment. All output except help is JSON.\nKeep calling wait in the foreground until the match ends. A socket alone does not wake a model.\n`,
    );

    return;
  }

  if (command === 'setup' || command === 'connections') {
    const { setup, connections } = await import('./setup.mjs');
    print(command === 'setup' ? await setup(flags) : await connections(flags.harness));

    return;
  }

  if (command === 'preview-select' || command === 'previews') {
    const { previewSelect } = await import('./preview-select.mjs');
    print(await previewSelect(flags, command === 'previews'));

    return;
  }

  if (command === 'picture-help') {
    print(pictureHelp);

    return;
  }

  const path = resolve(
    String(flags.config ?? process.env.AGENT_GAME_CONFIG ?? `${homedir()}/.agent-game/connection.json`),
  );

  const state = await readFile(path, 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return {};
      throw error;
    });

  if (flags.server && state.server && new URL(String(flags.server)).origin !== state.server && state.token)
    throw new Error('Use a separate --config for a different server.');
  const server = flags.server ?? state.server;

  if (!server)
    throw new Error(
      'Arena URL missing. Use setup --server URL --harness opencode|claude, or pair --server URL. Ask the owner for the arena URL if it was not supplied.',
    );
  await verifyPins(activeArtifacts(state));

  const client = new GameClient(String(server), state.token, {
    eventAuthorization: state.preview ? 'public-wakeup' : state.eventAuthorization,
    artifacts: activeArtifacts(state),
  });

  if (
    ['picture-status', 'picture-skip', 'picture-upload', 'picture-remove', 'picture-retry'].includes(command)
  ) {
    print(await pictureCommand(client, state, path, command, flags));

    return;
  }

  let baseline = structuredClone(state);

  const change = (update) => {
    const identity = connectionIdentity(baseline);

    return updateCurrent(path, (latest) => {
      if (connectionIdentity(latest) !== identity)
        throw new ApiError(
          409,
          'connection-changed',
          'The installation changed while this command was running.',
        );
      const result = update(latest);
      baseline = structuredClone(latest);

      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, latest);

      return result;
    });
  };

  state.selectedGame = gameId(flags.game ?? state.selectedGame);

  if (['connect', 'start', 'pair', 'join', 'play'].includes(command))
    await change((latest) => {
      latest.selectedGame = state.selectedGame;
    });

  if (command === 'play') {
    const { supervise } = await import('./supervisor.mjs');

    const result = await supervise({
      configPath: path,
      harness: String(flags.harness ?? 'claude'),
      requestedGame: flags.game,
      model: flags.model,
      maxBudget: flags.budget === undefined ? undefined : Number(flags.budget),
      maxRuntimeMs: minutes(flags.runtime),
      queueAllowanceMs: minutes(flags['queue-timeout']),
      childSliceMs: minutes(flags['child-slice']),
      onEvent: (event) => process.stderr.write(JSON.stringify(event) + '\n'),
    });

    print(result);

    return;
  }

  const persist = (fields) => {
    const before = participationIdentity(baseline);
    const incoming = structuredClone(state);

    return change((latest) => {
      if (
        participationIdentity(latest) !== before &&
        participationIdentity(latest) !== participationIdentity(incoming) &&
        !(latest.matchId && latest.matchId === incoming.matchId && baseline.matchId !== latest.matchId)
      )
        throw new ApiError(
          409,
          'stale-participation',
          'A newer command changed the participation. Run status again.',
        );

      if (
        fields.includes('pending') &&
        incoming.pending &&
        latest.pending?.request.actionId !== incoming.pending.request.actionId
      ) {
        const current = latest.observation;

        if (
          current &&
          (terminal(current) ||
            current.phase.id !== incoming.pending.request.phaseId ||
            current.you?.generation !== incoming.observation?.you?.generation ||
            current.decision?.id !== incoming.pending.request.decisionId)
        )
          throw new ApiError(
            409,
            'stale-decision',
            'The current decision changed before submission. Run observe.',
          );
      }

      if (fields.includes('matchId') && latest.matchId !== incoming.matchId) {
        for (const key of ['observation', 'historyWalk', 'currentNotification', 'pending'])
          delete latest[key];
        latest.cursor = 0;
      }

      for (const key of fields) {
        if (incoming[key] === undefined) delete latest[key];
        else latest[key] = key === 'lastPairPoll' ? Math.max(latest[key] ?? 0, incoming[key]) : incoming[key];
      }
    });
  };

  if (command === 'start' || command === 'connect') {
    if (!state.agentId) {
      if (!state.pairing || state.pairing.expiresAt <= Date.now())
        return main([
          'pair',
          '--server',
          client.server,
          '--config',
          path,
          '--name',
          state.installation ?? 'Agent installation',
          ...(flags.game ? ['--game', flags.game] : []),
        ]);
      await delay(Math.max(0, (state.lastPairPoll ?? 0) + 5000 - Date.now()));
      state.lastPairPoll = Date.now();
      await persist(['lastPairPoll']);
      const result = await client.request('/api/pairing/status');

      if (result.status !== 'approved') {
        print({
          ...result,
          ...state.pairing,
          configPath: path,
          next: `Show the owner verificationUrl. Keep calling ${command} in the foreground; it waits between approval checks. If this session pauses, ask the owner to reply approved.`,
        });

        return;
      }

      Object.assign(state, result);
      delete state.pairing;
      await persist(['status', 'connectionId', 'agentId', 'agentName', 'expiresAt', 'pairing']);
    }

    if (command === 'connect') {
      const current = await client.request('/api/queue');

      if (current.status !== 'idle') return main(['status', '--config', path]);
      print({
        status: 'ready',
        agentId: state.agentId,
        agentName: state.agentName,
        configPath: path,
        picture: await pictureOnboarding(
          client,
          state,
          async () => (await client.request('/api/queue')).status === 'idle',
        ),
        next: 'Connection is ready. If picture.askOwner is true, read picture-help for the one-time optional offer. Run start to join; an answer, image tools or upload never gate play.',
      });

      return;
    }

    return main(['join', '--config', path, ...(flags.game ? ['--game', flags.game] : [])]);
  }

  if (command === 'pair') {
    if (state.agentId && state.token)
      throw new Error(
        'This installation is already paired. Use a new --config for reauthorization or another agent.',
      );
    state.token ??= `agk_${randomBytes(32).toString('base64url')}`;
    state.server = client.server;
    client.token = state.token;
    await persist(['token', 'server']);

    const result = await client.request(
      '/api/pairing',
      {
        installation: String(flags.name ?? state.installation ?? 'Agent installation'),
        tokenHash: createHash('sha256').update(state.token).digest('hex'),
      },
      undefined,
      false,
    );

    state.pairing = result;
    await persist(['pairing']);
    print({
      status: 'pending',
      ...result,
      configPath: path,
      next: 'Owner: open verificationUrl, sign in, create or select a competitor, and approve. Agent: keep calling connect in the foreground for setup before joining, or start to join immediately. If the session pauses, the owner can reply approved.',
    });

    return;
  }

  if (command === 'pair-status') {
    await delay(Math.max(0, (state.lastPairPoll ?? 0) + 5000 - Date.now()));
    state.lastPairPoll = Date.now();
    await persist(['lastPairPoll']);
    const result = await client.request('/api/pairing/status');

    if (result.status === 'approved') {
      Object.assign(state, result);
      delete state.pairing;
      await persist(['status', 'connectionId', 'agentId', 'agentName', 'expiresAt', 'pairing']);
    }

    print({
      ...result,
      next:
        result.status === 'approved'
          ? 'Run start to join or resume one match.'
          : 'Show the owner the pairing URL and call start to check again.',
    });

    return;
  }

  if (command === 'join') {
    const current = await client.request('/api/queue');

    if (current.status === 'idle') {
      state.joinRequest ??= randomUUID();
      state.pendingJoin ??= { gameId: state.selectedGame, requestId: state.joinRequest };
      pinParticipation(state, state.pendingJoin.requestId, state.selectedGame, path);
      client.artifacts = activeArtifacts(state);

      if (state.pendingJoin.gameId !== state.selectedGame)
        throw new Error('A pending join belongs to another game. Resume or cancel it first.');
      await persist(['joinRequest', 'pendingJoin', 'previewParticipation']);
    }

    if (current.status !== 'idle' && flags.game && gameId(current.gameId) !== flags.game)
      throw new Error(`Agent busy in ${gameId(current.gameId)}.`);

    let result = current;

    if (current.status === 'idle') {
      const request = { requestId: state.pendingJoin.requestId };

      if (state.pendingJoin.gameId === 'succession') request.gameId = 'succession';
      result = await client.request('/api/queue', request);
    }

    if (result.status !== 'idle') validateIdentity(result, activeArtifacts(state));

    if (result.status === 'queued') {
      delete state.matchId;
      delete state.observation;
      delete state.historyWalk;
      delete state.currentNotification;
      delete state.participation;
      state.cursor = 0;
    }

    if (result.matchId) {
      if (state.matchId !== result.matchId) {
        state.cursor = 0;
        delete state.observation;
        delete state.historyWalk;
        delete state.currentNotification;
      }

      state.matchId = result.matchId;
      state.participation = { gameId: gameId(result.gameId), matchId: result.matchId };

      if (state.previewParticipation) state.previewParticipation.matchId = result.matchId;
      delete state.joinRequest;
      delete state.pendingJoin;
    }

    await persist(['matchId', 'participation', 'joinRequest', 'pendingJoin', 'previewParticipation']);

    const assignment = {
      ...result,
      agentName: state.agentName,
      next:
        result.status === 'matched'
          ? 'Run observe now, then keep the foreground act / say / wait loop running until finished or interrupted.'
          : 'Keep calling status --wait 5 in the foreground until matched. House agents fill open seats after the queue timer, subject to arena capacity.',
    };

    if (state.preview) assignment.artifacts = activeArtifacts(state);

    if (result.matchId) assignment.watchUrl = `${client.server}/matches/${result.matchId}`;
    print(assignment);

    return;
  }

  if (command === 'status' || command === 'leave') {
    if (command === 'status' && flags.wait !== undefined) {
      const seconds = Number(flags.wait);

      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 20)
        throw new Error('Queue wait must be 0–20 seconds.');
      await delay(seconds * 1000);
    }

    // Name the pending operation so a stale leave cannot cancel a replacement queue entry.
    const pin = state.previewParticipation;

    const cancellation =
      command === 'leave'
        ? (state.pendingJoin ??
          (pin && !pin.matchId ? { gameId: pin.artifacts.gameId, requestId: pin.queueRequestId } : undefined))
        : undefined;

    const result = await client.request('/api/queue', cancellation, command === 'leave' ? 'DELETE' : 'GET');

    if (result.status !== 'idle') validateIdentity(result, activeArtifacts(state));

    if (result.matchId) {
      if (state.matchId !== result.matchId) {
        state.cursor = 0;
        delete state.observation;
        delete state.historyWalk;
        delete state.currentNotification;
      }

      state.matchId = result.matchId;
      state.participation = { gameId: gameId(result.gameId), matchId: result.matchId };

      if (state.previewParticipation) state.previewParticipation.matchId = result.matchId;
      delete state.joinRequest;
      delete state.pendingJoin;
    }

    if (command === 'leave' && result.status === 'idle') {
      if (
        pin &&
        !pin.matchId &&
        pin.queueRequestId === cancellation?.requestId &&
        pin.artifacts.gameId === cancellation.gameId
      ) {
        state.cancelledPreviewParticipations ??= {};
        state.cancelledPreviewParticipations[pin.queueRequestId] ??= structuredClone(pin);
        delete state.previewParticipation;
      }

      delete state.joinRequest;
      delete state.pendingJoin;
    }

    await persist([
      'matchId',
      'participation',
      'joinRequest',
      'pendingJoin',
      'previewParticipation',
      'cancelledPreviewParticipations',
    ]);
    print(result);

    return;
  }

  const matchId = String(flags.match ?? state.matchId ?? '');

  if (!/^match_[\w-]+$/.test(matchId))
    throw new Error('No match selected. Run status after joining, or use --match ID.');

  if (state.matchId !== matchId) {
    const before = participationIdentity(baseline);
    state.matchId = matchId;
    state.cursor = 0;
    delete state.observation;
    await change((latest) => {
      if (participationIdentity(latest) !== before)
        throw new ApiError(409, 'stale-match', 'A newer command selected another participation.');
      latest.matchId = matchId;
      latest.cursor = 0;
      delete latest.observation;
      delete latest.historyWalk;
      delete latest.currentNotification;
      delete latest.pending;
    });
  }

  let currentParticipation = participationIdentity(state);

  const remember = async (view) => {
    validateCurrent(view, activeArtifacts(state));

    return change((latest) => {
      if (
        participationIdentity(latest) !== currentParticipation ||
        (latest.matchId && latest.matchId !== matchId)
      ) {
        if (latest.observation) return latest.observation;
        throw new ApiError(409, 'stale-match', 'A newer command selected another match.');
      }

      view = acceptCurrent(latest.observation, view);
      latest.server ??= client.server;
      latest.matchId = view.matchId;
      latest.observation = view;
      latest.participation = { gameId: gameId(view.gameId), matchId: view.matchId };

      if (view.protocolVersion === '2') latest.currentNotification = notification(view);
      else latest.cursor = view.cursor;

      if (terminal(view)) delete latest.joinRequest;
      currentParticipation = participationIdentity(latest);
      Object.assign(state, latest);

      return view;
    });
  };

  if (command === 'history') {
    const after = Number(flags.after ?? 0);
    const limit = Number(flags.limit ?? 10);
    const current = await client.observation(matchId, after);

    if (current.protocolVersion === '2') {
      const accepted = await remember(current);
      const automatic = flags.after === undefined && flags.epoch === undefined && flags.through === undefined;

      const walk =
        state.historyWalk?.epoch === accepted.history.visibilityEpoch ? state.historyWalk : undefined;

      const pageAfter = automatic ? (walk?.cursor ?? 0) : after;
      const pageThrough = automatic && walk?.through > pageAfter ? walk.through : accepted.history.streamHead;

      const pageRequest = {
        matchId,
        epoch: flags.epoch ?? accepted.history.visibilityEpoch,
        after: pageAfter,
        through: flags.through === undefined ? pageThrough : Number(flags.through),
        limit,
        maxBytes: Number(flags['max-bytes'] ?? 12288),
      };

      const { matchId: requestedMatch, ...parameters } = pageRequest;
      const page = await client.history(requestedMatch, parameters);

      if (page.reset && page.visibilityEpoch !== accepted.history.visibilityEpoch)
        await remember(await client.observation(matchId));
      const latest = JSON.parse(await readFile(path, 'utf8')).observation;

      if (
        !latest?.history ||
        page.matchId !== latest.matchId ||
        page.visibilityEpoch !== latest.history.visibilityEpoch
      ) {
        print({ status: 'stale-page', matchId, history: latest?.history });

        return;
      }

      if (automatic) {
        const applied = await change((latestState) => {
          const next = consumePage(latestState.historyWalk, page, latestState.observation, pageRequest);

          if (next === latestState.historyWalk) return false;
          latestState.historyWalk = next;

          return true;
        });

        if (!applied) {
          print({ status: 'stale-page', matchId, history: latest.history });

          return;
        }
      }

      print(page);

      return;
    }

    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 40)
      throw new Error('Use a nonnegative --after and a --limit of 1–40.');
    const view = current;
    const events = [];
    let bytes = 500;

    for (const event of view.events.filter((event) => event.id > after)) {
      const size = Buffer.byteLength(JSON.stringify(event)) + 1;

      if (events.length >= limit || bytes + size > 15_000) break;
      events.push(event);
      bytes += size;
    }

    const next = events.at(-1)?.id ?? after;
    print({ matchId, events, next, cursor: view.cursor, hasMore: next < view.cursor, reset: view.reset });

    return;
  }

  if (command === 'observe') {
    print(display(await remember(await client.observation(matchId))));

    return;
  }

  if (command === 'wait') {
    const seconds = Number(flags.timeout ?? 20);

    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60)
      throw new Error('Timeout must be between 1 and 60 seconds.');
    print(
      display(
        await remember(
          await client.wait(matchId, state.cursor ?? 0, seconds * 1000, state.currentNotification),
        ),
      ),
    );

    return;
  }

  if (command === 'act' || command === 'say') {
    let request;

    if (flags.json) request = JSON.parse(String(flags.json));
    else {
      const view = state.observation;

      if (!view || view.matchId !== matchId) throw new Error('Run observe or wait before acting.');
      const index = Number(flags.choice);

      const action =
        command === 'say'
          ? { type: 'chat', text: String(flags.text ?? '') }
          : Number.isInteger(index) && index >= 0
            ? view.decision?.actions[index]?.action
            : null;

      if (!action) throw new Error('Choose a valid zero-based --choice from the most recent observation.');
      request = {
        actionId: randomUUID(),
        phaseId: view.phase.id,
        action,
      };

      if (view.decision) request.decisionId = view.decision.id;

      if (view.protocolVersion === '2') request.gameId = 'succession';

      // Persist before sending: rerunning the identical command after a transport failure reuses the receipt ID.
      const signature =
        view.protocolVersion === '2'
          ? JSON.stringify({
              matchId,
              gameId: view.gameId,
              phaseId: view.phase.id,
              decisionId: view.decision?.id,
              generation: view.you?.generation,
              action,
            })
          : JSON.stringify({ matchId, phaseId: view.phase.id, action });

      if (state.pending?.signature === signature) request = state.pending.request;
      else state.pending = { signature, request };
      await persist(['pending']);
    }

    const result = await client.action(matchId, request);
    await change((latest) => {
      if (latest.pending?.request.actionId === request.actionId) delete latest.pending;
    });
    delete state.pending;

    if (result.observation.protocolVersion !== '2' && !result.observation.reset)
      result.observation.events = result.observation.events.slice(state.cursor ?? 0);

    try {
      result.observation = await remember(result.observation);
    } catch (error) {
      if (error.code !== 'stale-match') throw error;
      print({ accepted: result.accepted, actionId: result.actionId, status: 'stale-current', matchId });

      return;
    }

    print({ ...result, observation: display(result.observation) });

    return;
  }

  if (command === 'watch') {
    for (;;) {
      const view = await remember(
        await client.wait(matchId, state.cursor ?? 0, 20000, state.currentNotification),
      );

      print(display(view));

      if (terminal(view)) break;
    }

    return;
  }

  throw new Error(`Unknown command: ${command}. Run help.`);
}

// npm bin entries are symlinks; Node resolves import.meta.url to the target file.
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href)
  main().catch((error) => {
    const problem = { ...error.details, code: error.code ?? 'client-error', message: error.message };

    if (error.status) problem.status = error.status;
    print({ error: problem });
    process.exitCode = 1;
  });
