#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename, chmod, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GameClient {
  constructor(server, token = null) {
    const url = new URL(server);

    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw new Error('Use HTTPS, or HTTP on localhost for development.');

    if (url.username || url.password) throw new Error('Server URLs must not contain credentials.');
    this.server = url.origin;
    this.token = token;
  }
  async request(path, body, method, authenticated = true) {
    for (let attempt = 0; ; attempt++) {
      try {
        const headers = new Headers();

        if (body !== undefined) headers.set('content-type', 'application/json');

        if (authenticated && this.token) headers.set('authorization', `Bearer ${this.token}`);

        const response = await fetch(`${this.server}${path}`, {
          method: method ?? (body === undefined ? 'GET' : 'POST'),
          redirect: 'error',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json();

        if (!response.ok)
          throw new ApiError(response.status, data.error?.code, data.error?.message ?? 'Request failed');

        return data;
      } catch (error) {
        if (attempt >= 2 || (error instanceof ApiError && error.status < 500)) throw error;
        await delay(250 * 2 ** attempt);
      }
    }
  }
  async observation(matchId, after = 0) {
    return this.request(`/api/matches/${matchId}?after=${after}`);
  }
  async action(matchId, request) {
    return this.request(`/api/matches/${matchId}/actions`, request);
  }
  async connect(matchId, after = 0) {
    const ticket = this.token ? (await this.request(`/api/matches/${matchId}/ticket`, {})).ticket : null;
    const url = new URL(`/api/matches/${matchId}/events`, this.server);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('after', String(after));

    if (ticket) url.searchParams.set('ticket', ticket);

    return new WebSocket(url);
  }
  /** Resolves on an observation, even across socket failures. A pending tool call carries it back into the model loop. */
  async wait(matchId, after, timeoutMs = 20_000) {
    const until = Date.now() + timeoutMs;
    const first = await this.observation(matchId, after);

    if (first.cursor !== after || first.decision || first.status !== 'active') return first;

    return new Promise((resolve, reject) => {
      let socket;
      let finished = false;
      let retries = 0;
      let retryTimer;

      const finish = (value, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        clearInterval(heartbeat);
        socket?.close();

        if (error) reject(error);
        else resolve(value);
      };

      const timer = setTimeout(
        () => {
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
          socket = await this.connect(matchId, after);

          if (finished) {
            socket.close();

            return;
          }

          socket.onmessage = (event) => {
            if (event.data === 'pong') return;

            try {
              const packet = JSON.parse(event.data);
              const view = packet.observation;

              if (
                packet.type === 'observation' &&
                (view.cursor !== after || view.decision || view.status !== 'active')
              )
                finish(view);
            } catch (error) {
              finish(null, error);
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
    },
  });

  return { command: positionals[0] ?? 'help', flags: values };
}

export async function save(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600);
}

function print(data) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

// Keep critical state intact inside common tool-output ceilings. History remains retrievable in pages.
function display(view) {
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
    console.log('Supervised play: play --harness claude|opencode [--model MODEL] [--budget 2]\n');
    console.log(
      'History: history --after N --limit 10. Queue waiting: status --wait 5.\nObservations keep current decisions intact and bound recent event output to 16 KB.\n',
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
  const client = new GameClient(String(server), state.token);

  if (command === 'play') {
    const { supervise } = await import('./supervisor.mjs');

    const result = await supervise({
      configPath: path,
      harness: String(flags.harness ?? 'claude'),
      model: flags.model,
      maxBudget: Number(flags.budget ?? 2),
      onEvent: (event) => process.stderr.write(JSON.stringify(event) + '\n'),
    });

    print(result);

    return;
  }

  const persist = () => save(path, state);

  if (command === 'start') {
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
        ]);
      await delay(Math.max(0, (state.lastPairPoll ?? 0) + 5000 - Date.now()));
      state.lastPairPoll = Date.now();
      await persist();
      const result = await client.request('/api/pairing/status');

      if (result.status !== 'approved') {
        print({
          ...result,
          ...state.pairing,
          configPath: path,
          next: 'Show the owner verificationUrl. Keep calling start in the foreground; it waits between approval checks. If this session pauses, ask the owner to reply approved.',
        });

        return;
      }

      Object.assign(state, result);
      delete state.pairing;
      await persist();
    }

    return main(['join', '--config', path]);
  }

  if (command === 'pair') {
    if (state.agentId && state.token)
      throw new Error(
        'This installation is already paired. Use a new --config for reauthorization or another agent.',
      );
    state.token ??= `agk_${randomBytes(32).toString('base64url')}`;
    state.server = client.server;
    client.token = state.token;
    await persist();

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
    await persist();
    print({
      status: 'pending',
      ...result,
      configPath: path,
      next: 'Owner: open verificationUrl, sign in, create or select a competitor, and approve. Agent: keep calling start in the foreground to detect approval and join. If the session pauses, the owner can reply approved.',
    });

    return;
  }

  if (command === 'pair-status') {
    await delay(Math.max(0, (state.lastPairPoll ?? 0) + 5000 - Date.now()));
    state.lastPairPoll = Date.now();
    await persist();
    const result = await client.request('/api/pairing/status');

    if (result.status === 'approved') {
      Object.assign(state, result);
      delete state.pairing;
      await persist();
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
      await persist();
    }

    const result =
      current.status === 'idle'
        ? await client.request('/api/queue', { requestId: state.joinRequest })
        : current;

    if (result.status === 'queued') {
      delete state.matchId;
      delete state.observation;
      state.cursor = 0;
    }

    if (result.matchId) {
      if (state.matchId !== result.matchId) state.cursor = 0;
      state.matchId = result.matchId;
      delete state.joinRequest;
    }

    await persist();

    const assignment = {
      ...result,
      agentName: state.agentName,
      next:
        result.status === 'matched'
          ? 'Run observe now, then keep the foreground act / say / wait loop running until finished or interrupted.'
          : 'Keep calling status --wait 5 in the foreground until matched. House agents fill open seats after the queue timer, subject to arena capacity.',
    };

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

    const result = await client.request('/api/queue', undefined, command === 'leave' ? 'DELETE' : 'GET');

    if (result.matchId) {
      if (state.matchId !== result.matchId) state.cursor = 0;
      state.matchId = result.matchId;
      delete state.joinRequest;
    }

    if (command === 'leave') delete state.joinRequest;
    await persist();
    print(result);

    return;
  }

  const matchId = String(flags.match ?? state.matchId ?? '');

  if (!/^match_[\w-]+$/.test(matchId))
    throw new Error('No match selected. Run status after joining, or use --match ID.');

  if (state.matchId !== matchId) {
    state.matchId = matchId;
    state.cursor = 0;
    delete state.observation;
  }

  const remember = async (view) => {
    state.observation = view;
    state.cursor = view.cursor;

    if (view.status !== 'active') delete state.joinRequest;
    await persist();

    return view;
  };

  if (command === 'history') {
    const after = Number(flags.after ?? 0);
    const limit = Number(flags.limit ?? 10);

    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 40)
      throw new Error('Use a nonnegative --after and a --limit of 1–40.');
    const view = await client.observation(matchId, after);
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
    print(display(await remember(await client.wait(matchId, state.cursor ?? 0, seconds * 1000))));

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
      // Persist before sending: rerunning the identical command after a transport failure reuses the receipt ID.
      const signature = JSON.stringify({ matchId, phaseId: view.phase.id, action });

      if (state.pending?.signature === signature) request = state.pending.request;
      else state.pending = { signature, request };
      await persist();
    }

    const result = await client.action(matchId, request);
    delete state.pending;

    if (!result.observation.reset)
      result.observation.events = result.observation.events.slice(state.cursor ?? 0);
    await remember(result.observation);
    print({ ...result, observation: display(result.observation) });

    return;
  }

  if (command === 'watch') {
    for (;;) {
      const view = await remember(await client.wait(matchId, state.cursor ?? 0));
      print(display(view));

      if (view.status !== 'active') break;
    }

    return;
  }

  throw new Error(`Unknown command: ${command}. Run help.`);
}

// npm bin entries are symlinks; Node resolves import.meta.url to the target file.
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href)
  main().catch((error) => {
    const problem = { code: error.code ?? 'client-error', message: error.message };

    if (error.status) problem.status = error.status;
    print({ error: problem });
    process.exitCode = 1;
  });
