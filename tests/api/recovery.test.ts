import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, open } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Schema } from 'effect';
import { GameClient } from '../../cli/agent-game.mjs';
import { previewAction } from '../../src/game/preview';
import { AgentProfileSchema } from '../../src/shared/api';
import type { ApiRequestBody, QueueStatus } from '../../src/shared/api';

it('restarts the actual Worker during a required decision and recovers durable state without downtime forfeits', async () => {
  const directory = await mkdtemp('/tmp/opencode/agent-recovery-');
  const server = 'http://127.0.0.1:8811';
  const log = await open(`${directory}/server.log`, 'w');
  let child: ChildProcess | undefined;
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const stop = async () => {
    if (!child?.pid || child.exitCode !== null) return;
    const current = child;
    const exited = new Promise((resolve) => current.once('exit', resolve));

    try {
      process.kill(-current.pid!, 'SIGKILL');
    } catch {
      return;
    }

    await exited;
  };

  const start = async () => {
    child = spawn(process.execPath, ['scripts/dev.mjs', '--test'], {
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, PORT: '8811', TIME_SCALE: '0.1', PERSIST_TO: `${directory}/storage` },
    });

    for (let i = 0; i < 120; i++) {
      if (
        await fetch(`${server}/api/health`)
          .then((response) => response.ok)
          .catch(() => false)
      )
        return;

      if (child.exitCode !== null) throw new Error(`Recovery server failed. See ${directory}/server.log`);
      await pause(250);
    }

    throw new Error(`Recovery server did not start. See ${directory}/server.log`);
  };

  try {
    await start();

    const login = await fetch(`${server}/api/dev/login`, {
      method: 'POST',
      headers: { origin: server, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Durable recovery owner' }),
    });

    expect(login.status).toBe(200);

    const cookie = login.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ');

    const ownerPost = async (path: string, body: ApiRequestBody) => {
      const response = await fetch(server + path, {
        method: 'POST',
        headers: { cookie, origin: server, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(response.ok, await response.clone().text()).toBe(true);

      return response.json();
    };

    const agent = Schema.decodeUnknownSync(AgentProfileSchema)(
      await ownerPost('/api/owner/agents', { name: 'Durable contender' }),
    );

    const token = `agk_${randomBytes(32).toString('base64url')}`;
    const client = new GameClient(server, token);

    const pairing = await client.request<{ code: string }>('/api/pairing', {
      installation: 'Crash recovery fixture',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    });

    await ownerPost('/api/owner/pairing/approve', { code: pairing.code, agentId: agent.id });
    await client.request('/api/queue', { requestId: randomUUID() });
    let queue: QueueStatus;

    do {
      await pause(100);
      queue = await client.request<QueueStatus>('/api/queue');
    } while (!queue.matchId);

    const matchId = queue.matchId;
    let view = await client.observation(matchId);

    while (!view.decision) view = await client.wait(matchId, view.cursor, 500);
    const before = { role: view.private?.role, phaseId: view.phase.id, cursor: view.cursor };
    await stop();
    await pause(8000); // Exceed both decision windows while the platform is unavailable.
    await start();
    view = await client.observation(matchId);
    expect(view.status).toBe('active');
    expect(view.phase.id).not.toBe(before.phaseId);
    expect(view.private?.role).toBe(before.role);
    expect(view.you).toMatchObject({ forfeited: false, generation: 0 });
    expect(view.events.some((event) => event.type === 'recovered')).toBe(true);

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
      else view = await client.wait(matchId, view.cursor, 500);
    }

    expect(view.status).toBe('finished');
    expect(view.you?.forfeited).toBe(false);
  } finally {
    await stop();
    await log.close();
  }
}, 180_000);
