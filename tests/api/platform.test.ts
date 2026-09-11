import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { ApiError, GameClient } from '../../cli/agent-game.mjs';
import { supervise } from '../../cli/supervisor.mjs';
import { previewAction } from '../../src/game/preview';
import type { ActionRequest, Observation } from '../../src/game/types';
import { AgentProfileSchema } from '../../src/shared/api';
import type { AgentProfile, ApiRequestBody, QueueStatus } from '../../src/shared/api';

const server = process.env.TEST_URL ?? 'http://127.0.0.1:8791';

const run = promisify(execFile);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function browser(path: string, cookie = '', body?: ApiRequestBody) {
  return fetch(`${server}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, origin: server, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function owner(name = `Owner ${randomUUID().slice(0, 8)}`) {
  const response = await browser('/api/dev/login', '', { name });
  expect(response.status, await response.clone().text()).toBe(200);

  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function profile(cookie: string, name = `Agent ${randomUUID().slice(0, 8)}`) {
  const response = await browser('/api/owner/agents', cookie, { name });
  expect(response.status).toBe(201);

  return Schema.decodeUnknownSync(AgentProfileSchema)(await response.json());
}

async function pair(cookie: string, agentId: string) {
  const token = `agk_${randomBytes(32).toString('base64url')}`;
  const client = new GameClient(server, token);

  const request = await client.request<{ code: string }>(
    '/api/pairing',
    { installation: 'API test', tokenHash: createHash('sha256').update(token).digest('hex') },
    undefined,
    false,
  );

  const approval = await browser('/api/owner/pairing/approve', cookie, { code: request.code, agentId });
  expect(approval.status, await approval.clone().text()).toBe(200);
  const grant = await client.request<{ status: string; connectionId: string }>('/api/pairing/status');
  expect(grant.status).toBe('approved');

  return { client, token, grant };
}

async function assignment(client: GameClient) {
  await client.request('/api/queue', { requestId: randomUUID() });

  for (let i = 0; i < 100; i++) {
    const status = await client.request<QueueStatus>('/api/queue');

    if (status.status === 'matched' && status.matchId) return status.matchId;
    await pause(100);
  }

  throw new Error('Matchmaking did not assign a table');
}

describe('real Worker, D1, durable matches, and CLI protocol', () => {
  it('supervises a premature harness final answer through to the authoritative match result', async () => {
    const cookie = await owner();
    const agent = await profile(cookie);
    const { client, token } = await pair(cookie, agent.id);
    const matchId = await assignment(client);
    const dir = await mkdtemp('/tmp/opencode/agent-supervisor-');
    const configPath = `${dir}/connection.json`;
    await writeFile(configPath, JSON.stringify({ server, token, agentId: agent.id, matchId }), {
      mode: 0o600,
    });
    let calls = 0;

    const result = await supervise({ configPath, harness: 'claude' }, async (invocation) => {
      calls++;

      if (calls === 1) {
        invocation.onEvent({
          type: 'harness-event',
          harness: 'claude',
          event: { type: 'result', result: 'The match has finished!' },
        });

        return { exitCode: 0, sessionId: 'test-session', costUsd: 0 };
      }

      expect(invocation.sessionId).toBe('test-session');
      expect(invocation.prompt).toContain('is ACTIVE');
      let view = await client.observation(matchId);

      while (view.status === 'active') {
        const action = previewAction(view);

        if (action && view.decision)
          view = (
            await client.action(matchId, {
              actionId: randomUUID(),
              phaseId: view.phase.id,
              decisionId: view.decision.id,
              action,
            })
          ).observation;
        else view = await client.wait(matchId, view.cursor, 1000);
      }

      return { exitCode: 0, sessionId: 'test-session', costUsd: 0 };
    });

    expect(result.status).toBe('finished');
    expect(result.you?.forfeited).toBe(false);
    expect(result.restarts).toBe(1);
    expect(result.winner).toBe((await client.observation(matchId)).winner);
  });
  it('completes a full externally controlled match with retry receipts, reconnect replay, and private isolation', async () => {
    const cookie = await owner();
    const agent = await profile(cookie);
    const { client } = await pair(cookie, agent.id);
    const second = await pair(cookie, agent.id);
    const matchId = await assignment(client);
    const publicClient = new GameClient(server);
    await expect(second.client.observation(matchId)).rejects.toMatchObject({ status: 403 });
    const initial = await client.observation(matchId);
    expect(initial.private?.role).toBeTruthy();
    expect(initial.seats).toHaveLength(10);
    const spectators = await publicClient.observation(matchId);
    expect(spectators.private).toBeNull();
    expect(spectators.events.some((event) => event.type === 'role')).toBe(false);
    const otherCookie = await owner();
    expect(
      (await browser('/api/owner/pairing/approve', otherCookie, { code: 'INVALID', agentId: agent.id }))
        .status,
    ).toBe(404);
    let view = initial;
    let count = 0;
    let receipt: ActionRequest | null = null;
    let waited = false;
    const socket = await client.connect(matchId, initial.cursor);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Socket failed'));
    });

    const closed = new Promise<number>((resolve) => {
      socket.onclose = (event) => resolve(event.code);
    });

    socket.close(); // Empty peer close frames must receive a valid server response.
    expect(await closed).toBe(1000);

    // Reconnect via wait, resuming the authorized cursor.
    for (let i = 0; view.status === 'active' && i < 500; i++) {
      const action = previewAction(view);

      if (action && view.decision) {
        const request = {
          actionId: randomUUID(),
          phaseId: view.phase.id,
          decisionId: view.decision.id,
          action,
        };

        try {
          const response = await client.action(matchId, request);
          view = response.observation;
          count++;
          receipt ??= request;
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'stale-phase') throw error;
          view = await client.observation(matchId);
        }
      } else {
        view = await client.wait(matchId, view.cursor, 2000);
        waited = true;
      }

      if (view.status === 'active') expect(view.you?.forfeited).toBe(false);
    }

    expect(view.status).toBe('finished');
    expect(waited).toBe(true);
    expect(count).toBeGreaterThan(0);
    expect(view.you?.forfeited).toBe(false);
    expect(receipt).not.toBeNull();
    const replayed = await client.action(matchId, receipt!);
    expect(replayed.accepted).toBe(true);
    await expect(
      client.action(matchId, { ...receipt!, action: { type: 'chat', text: 'conflicting receipt' } }),
    ).rejects.toMatchObject({ code: 'action-id-conflict' });
    const replay = await publicClient.observation(matchId, spectators.cursor);
    expect(replay.reset).toBe(true);
    expect(replay.events.filter((event) => event.type === 'role')).toHaveLength(10);
    expect(replay.seats.every((seat) => seat.role)).toBe(true);

    for (let i = 0; i < 30; i++) {
      const queue = await client.request<QueueStatus>('/api/queue');

      if (queue.status === 'idle') break;
      await pause(100);
    }

    expect((await client.request<QueueStatus>('/api/queue')).status).toBe('idle');

    const result = await publicClient.request<{ agent: AgentProfile; history: unknown[] }>(
      `/api/agents/${agent.id}`,
    );

    expect(result.history).toHaveLength(1);
    expect(result.agent.games).toBe(0);
    expect(result.agent.rating).toBe(1000); // Preview games are never ranked.
  });

  it('runs the actual CLI pairing and queue commands, preserving private credentials and honoring revocation', async () => {
    const dir = await mkdtemp('/tmp/opencode/agent-cli-');
    const config = `${dir}/connection.json`;

    const cli = async (...args: string[]) =>
      JSON.parse(
        (
          await run(process.execPath, ['cli/agent-game.mjs', ...args, '--config', config], {
            cwd: process.cwd(),
            env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: `${dir}/config` },
          })
        ).stdout,
      );

    const setup = await cli(
      'setup',
      '--server',
      server,
      '--harness',
      'opencode',
      '--name',
      'OpenCode test installation',
    );

    expect(setup.skillPath).toBe(`${dir}/config/opencode/skills/agent-game/SKILL.md`);
    const pairing = await cli('start');
    expect(pairing.verificationUrl).toContain('/connect?code=');
    expect(pairing.token).toBeUndefined();
    const pending = await cli('start');
    expect(pending.status).toBe('pending');
    expect(pending.verificationUrl).toBe(pairing.verificationUrl);
    const cookie = await owner();
    const agent = await profile(cookie);
    expect(
      (await browser('/api/owner/pairing/approve', cookie, { code: pairing.code, agentId: agent.id })).status,
    ).toBe(200);
    const admission = await cli('start');
    expect(['queued', 'starting', 'matched']).toContain(admission.status);
    const connection = JSON.parse(await readFile(config, 'utf8'));
    expect(connection.agentId).toBe(agent.id);
    expect(connection.token).toMatch(/^agk_/);
    const resumed = await cli('start');
    expect(resumed.joinedAt).toBe(admission.joinedAt);
    const saved = await cli('connections', '--harness', 'opencode');
    expect(saved.connections[0].agentId).toBe(agent.id);
    expect(JSON.stringify(saved)).not.toContain(connection.token);
    const credentials = new GameClient(server, connection.token);
    expect(
      (await browser('/api/owner/connections/' + connection.connectionId + '/revoke', cookie, {})).status,
    ).toBe(200);
    await expect(credentials.request('/api/queue')).rejects.toMatchObject({ status: 401 });
    // Browser sessions never authorize agent actions; play credentials never authorize owner management.
    expect((await browser('/api/queue', cookie)).status).toBe(401);
    await expect(credentials.request('/api/owner')).rejects.toMatchObject({ status: 401 });
  });

  it('revokes a connected installation immediately without handing its active seat to another installation', async () => {
    const cookie = await owner();
    const agent = await profile(cookie);
    const original = await pair(cookie, agent.id);
    const alternate = await pair(cookie, agent.id);
    const matchId = await assignment(original.client);
    const socket = await original.client.connect(matchId);

    try {
      const initial = await new Promise<Observation>((resolve, reject) => {
        socket.onmessage = (event) => resolve(JSON.parse(String(event.data)).observation);
        socket.onerror = () => reject(new Error('Could not open the entitled event stream'));
      });

      expect(initial.private?.role).toBeTruthy();
      expect(initial.status).toBe('active');
      const started = Date.now();

      const closed = new Promise<number>((resolve) => {
        socket.onclose = (event) => resolve(event.code);
      });

      const revoke = await browser(
        `/api/owner/connections/${original.grant.connectionId}/revoke`,
        cookie,
        {},
      );

      expect(revoke.status).toBe(200);
      await expect(original.client.observation(matchId)).rejects.toMatchObject({ status: 401 });
      await expect(alternate.client.observation(matchId)).rejects.toMatchObject({ status: 403 });
      expect(Date.now() - started).toBeLessThan(5000);
      // The local Wrangler proxy can delay the client's close event even after the
      // Durable Object has completed its handshake. Authorization must stop first.
      expect(await closed).toBe(4001);
    } finally {
      socket.close();
    }
  });

  it('keeps same-owner agents in different matches, preserves the oldest queue clock, and recovers abandoned seats with public forfeits', async () => {
    const cookie = await owner();
    const a = await profile(cookie);
    const b = await profile(cookie);
    const first = await pair(cookie, a.id);
    const second = await pair(cookie, b.id);
    const before = await first.client.request<QueueStatus>('/api/queue', { requestId: randomUUID() });
    const after = await second.client.request<QueueStatus>('/api/queue', { requestId: randomUUID() });
    expect(after.fillAt).toBe(before.fillAt);
    const ids = await Promise.all([assignment(first.client), assignment(second.client)]);
    expect(ids[0]).not.toBe(ids[1]);

    for (const [i, client] of [first.client, second.client].entries()) {
      let view = await client.observation(ids[i]);

      for (let step = 0; view.status === 'active' && step < 1000; step++) {
        await pause(100);
        view = await client.observation(ids[i], view.cursor);
      }

      expect(view.status).toBe('finished');
      expect(view.you?.forfeited).toBe(true);
      const full = await client.observation(ids[i]);
      expect(full.events.some((event) => event.type === 'takeover' && event.seat === view.you?.seat)).toBe(
        true,
      );
    }
  });
});
