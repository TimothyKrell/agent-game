import { execFile } from 'node:child_process';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { promisify } from 'node:util';
import { crc32 } from 'node:zlib';
import { Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import {
  AgentProfileSchema,
  DashboardSchema,
  AgentHistorySchema,
  QueueStatusSchema,
  ObservationSchema,
} from '../src/shared/api';
import { AgentPictureSchema, AgentPicturesSchema } from '../src/shared/agent-picture';
import { DEFAULT_TIMING } from '../src/game/types';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

const origin = 'http://127.0.0.1:8828';

const takeoverCase =
  'keeps the entrant portrait through an actual house takeover and uses current identity metadata for final games';

let runtime: Awaited<ReturnType<typeof unstable_dev>>;

let persistTo: string;

let captureTakeoverFailure: (() => Promise<void>) | undefined;

interface TakeoverProgress {
  stage: string;
  queue?: typeof QueueStatusSchema.Type;
  match?: Pick<
    typeof ObservationSchema.Type,
    'matchId' | 'status' | 'phase' | 'cursor' | 'seats' | 'winReason'
  >;
  lastEvents?: typeof ObservationSchema.Type.events;
  clockSteps?: { advanced: boolean; reason: string }[];
}

const worker = {
  fetch(path: string, options?: RequestInit) {
    return fetch(`http://${runtime.address}:${runtime.port}${path}`, options);
  },
};

async function browser(path: string, cookie = '', body?: Record<string, string>) {
  return worker.fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function owner() {
  const response = await browser('/api/dev/login', '', { name: `Owner ${randomUUID().slice(0, 8)}` });
  expect(response.status, await response.clone().text()).toBe(200);

  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function agent(cookie: string) {
  const response = await browser('/api/owner/agents', cookie, {
    name: `Portrait ${randomUUID().slice(0, 8)}`,
  });

  expect(response.status, await response.clone().text()).toBe(201);

  return Schema.decodeUnknownSync(AgentProfileSchema)(await response.json());
}

async function pair(cookie: string, agentId: string) {
  const token = `agk_${randomBytes(32).toString('base64url')}`;

  const response = await browser('/api/pairing', '', {
    installation: 'Picture test',
    tokenHash: createHash('sha256').update(token).digest('hex'),
  });

  const input = Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(await response.json());
  expect((await browser('/api/owner/pairing/approve', cookie, { code: input.code, agentId })).status).toBe(
    200,
  );

  return token;
}

function change(
  agentId: string,
  credential: string,
  revision: number,
  options: { remove?: boolean; key?: string; bytes?: Buffer; type?: string } = {},
) {
  const agentAuth = credential.startsWith('agk_');

  const headers = new Headers(
    agentAuth ? { authorization: `Bearer ${credential}` } : { cookie: credential, origin },
  );

  headers.set('If-Match', `"${revision}"`);
  headers.set('Idempotency-Key', options.key ?? randomUUID());

  if (!options.remove) headers.set('content-type', options.type ?? 'image/png');

  return worker.fetch(`/api/${agentAuth ? '' : 'owner/'}agents/${agentId}/picture`, {
    method: options.remove ? 'DELETE' : 'PUT',
    headers,
    body: options.remove ? undefined : Uint8Array.from(options.bytes ?? png),
  });
}

async function picture(response: Response) {
  expect(response.status, await response.clone().text()).toBe(200);

  return Schema.decodeUnknownSync(AgentPictureSchema)(await response.json());
}

beforeEach(async ({ task }) => {
  captureTakeoverFailure = undefined;
  const root = resolve(process.env.GAME_FIXTURE_EVIDENCE_DIR ?? 'test-results/agent-pictures');
  await mkdir(root, { recursive: true });
  persistTo = await mkdtemp(`${root}/agent-pictures-`);
  await promisify(execFile)(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'migrations',
    'apply',
    'tim28',
    '--local',
    '--config',
    'tests/fixtures/agent-pictures/wrangler.jsonc',
    '--persist-to',
    persistTo,
  ]);
  const takeover = task.name === takeoverCase;
  runtime = await unstable_dev(
    takeover ? 'tests/fixtures/agent-pictures/portrait-worker.ts' : 'tests/fixtures/agent-pictures/worker.ts',
    {
      config: 'tests/fixtures/agent-pictures/wrangler.jsonc',
      local: true,
      persist: true,
      persistTo,
      port: 0,
      inspectorPort: 0,
      logLevel: 'error',
      vars: takeover ? { TIME_SCALE: '1' } : undefined,
      experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
    },
  );
}, 60_000);

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') await captureTakeoverFailure?.();
  } finally {
    await runtime?.stop();
  }
});

describe('local Worker / D1 / R2 stable agent pictures', () => {
  it('supports owner upload, explicit missing, binary delivery, replacement, removal, and durable retry receipts', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    expect(profile.picture).toEqual({ state: 'missing', revision: 0 });
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(profile.picture);
    const key = randomUUID();
    const first = await picture(await change(profile.id, cookie, 0, { key }));
    expect(first).toMatchObject({
      state: 'present',
      revision: 1,
      contentType: 'image/png',
      width: 1,
      height: 1,
      bytes: png.length,
    });
    expect(await picture(await change(profile.id, cookie, 0, { key }))).toEqual(first);

    if (first.state !== 'present') throw new Error('Missing uploaded image');
    const image = await worker.fetch(first.url);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(image.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
    expect(
      (await worker.fetch(first.url, { headers: { 'if-none-match': `"${first.version}"` } })).status,
    ).toBe(304);
    expect(await (await worker.fetch(first.url, { method: 'HEAD' })).text()).toBe('');
    const second = await picture(await change(profile.id, cookie, 1));
    expect(second.revision).toBe(2);
    expect((await worker.fetch(first.url)).status).toBe(404);
    expect(await picture(await change(profile.id, cookie, 0, { key }))).toEqual(first);
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(second);
    expect((await change(profile.id, cookie, 1)).status).toBe(412);
    expect((await change(profile.id, cookie, 1, { key })).status).toBe(409);
    const removal = randomUUID();
    expect(await picture(await change(profile.id, cookie, 2, { remove: true, key: removal }))).toEqual({
      state: 'missing',
      revision: 3,
    });
    expect(await picture(await change(profile.id, cookie, 2, { remove: true, key: removal }))).toEqual({
      state: 'missing',
      revision: 3,
    });
    const restored = await picture(await change(profile.id, cookie, 3));
    expect(restored.revision).toBe(4);
    expect((await change(profile.id, cookie, 0)).status).toBe(412);

    const dashboard = Schema.decodeUnknownSync(DashboardSchema)(
      await (await browser('/api/owner', cookie)).json(),
    );

    expect(dashboard.agents.find((item) => item.id === profile.id)?.picture).toEqual(restored);

    const history = Schema.decodeUnknownSync(AgentHistorySchema)(
      await (await worker.fetch(`/api/agents/${profile.id}`)).json(),
    );

    expect(history.agent.picture).toEqual(restored);

    const batch = Schema.decodeUnknownSync(AgentPicturesSchema)(
      await (
        await worker.fetch(`/api/agent-pictures?agentId=${profile.id}&agentId=house-axiom&agentId=missing-id`)
      ).json(),
    );

    expect(batch).toEqual([
      { agentId: profile.id, picture: restored },
      { agentId: 'house-axiom', picture: { state: 'missing', revision: 0 } },
      { agentId: 'missing-id', picture: { state: 'missing', revision: 0 } },
    ]);
    expect(
      (
        await worker.fetch(
          `/api/agent-pictures?${Array.from({ length: 51 }, () => 'agentId=house-axiom').join('&')}`,
        )
      ).status,
    ).toBe(400);
  });

  it('uses existing owner/session and one-agent bearer authorization including revoked and retired identities', async () => {
    const cookie = await owner();
    const stranger = await owner();
    const profile = await agent(cookie);
    const other = await agent(stranger);
    const token = await pair(cookie, profile.id);
    expect((await change(profile.id, stranger, 0)).status).toBe(404);
    expect((await change(profile.id, '', 0)).status).toBe(401);
    expect((await change(other.id, token, 0)).status).toBe(404);
    expect(
      (
        await worker.fetch(`/api/owner/agents/${profile.id}/picture`, {
          method: 'PUT',
          headers: { cookie, origin: 'https://wrong.test' },
          body: png,
        })
      ).status,
    ).toBe(403);
    expect((await picture(await change(profile.id, token, 0))).revision).toBe(1);

    const dashboard = Schema.decodeUnknownSync(DashboardSchema)(
      await (await browser('/api/owner', cookie)).json(),
    );

    expect(
      (await browser(`/api/owner/connections/${dashboard.connections[0].id}/revoke`, cookie, {})).status,
    ).toBe(200);
    expect((await change(profile.id, token, 1)).status).toBe(401);
    const second = await pair(cookie, profile.id);
    expect((await browser(`/api/owner/agents/${profile.id}/retire`, cookie, {})).status).toBe(200);
    expect((await change(profile.id, second, 1)).status).toBe(401);
    expect((await change(profile.id, cookie, 1)).status).toBe(409);
    expect(await picture(await change(profile.id, cookie, 1, { remove: true }))).toEqual({
      state: 'missing',
      revision: 2,
    });
  });

  it('retains the existing picture on invalid, mismatched, truncated, oversized and unbounded uploads', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    const original = await picture(await change(profile.id, cookie, 0));

    for (const options of [
      { bytes: Buffer.from('<svg onload="alert(1)"/>') },
      { bytes: png.subarray(0, png.length - 1) },
      {
        bytes: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
          'base64',
        ),
      },
      { bytes: png, type: 'image/jpeg' },
      { bytes: png, type: 'image/svg+xml' },
      { bytes: Buffer.alloc(2 * 1024 * 1024 + 1) },
    ])
      expect((await change(profile.id, cookie, 1, options)).status).toBeGreaterThanOrEqual(400);
    const huge = Buffer.from(png);
    huge.writeUInt32BE(2049, 16);
    huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29);
    const dimensions = await change(profile.id, cookie, 1, { bytes: huge });
    expect(dimensions.status).toBe(400);
    expect(await dimensions.text()).toContain('picture-dimensions');
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(original);

    for (const query of ['', '?lying=1']) {
      const bounded = Schema.decodeUnknownSync(
        Schema.Struct({ status: Schema.Number, cancelled: Schema.Boolean, chunks: Schema.Number }),
      )(await (await worker.fetch(`/__probe/bounded${query}`)).json());

      expect(bounded).toMatchObject({ status: 413, cancelled: true });
      expect(bounded.chunks).toBeLessThanOrEqual(34);
    }
  });

  it('fences concurrent replacements/removals and identical retries without deleting the winning asset', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    const token = await pair(cookie, profile.id);
    const key = randomUUID();

    const same = await Promise.all([
      change(profile.id, cookie, 0, { key }),
      change(profile.id, cookie, 0, { key }),
    ]);

    const first = await picture(same[0]);
    expect(await picture(same[1])).toEqual(first);

    const writes = await Promise.all([
      change(profile.id, cookie, 1),
      change(profile.id, token, 1),
      change(profile.id, cookie, 1, { remove: true }),
    ]);

    expect(writes.map((result) => result.status).sort()).toEqual([200, 412, 412]);
    const current = await picture(await worker.fetch(`/api/agents/${profile.id}/picture`));
    expect(current.revision).toBe(2);
    const winner = current.state === 'present' ? current : await picture(await change(profile.id, cookie, 2));
    expect((await worker.fetch('/__probe/collect')).status).toBe(200);

    if (winner.state !== 'present') throw new Error('Expected a winning asset');
    expect((await worker.fetch(winner.url)).status).toBe(200);
    expect(await picture(await change(profile.id, cookie, 0, { key }))).toEqual(first);
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(winner);
  });

  it('recovers a D1 failure after R2 put and collects the orphan while preserving the previous winner', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    const original = await picture(await change(profile.id, cookie, 0));
    const key = randomUUID();
    expect((await worker.fetch('/__probe/fail-commit')).status).toBe(200);
    expect((await change(profile.id, cookie, 1, { key })).status).toBe(500);
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(original);

    const before = Schema.decodeUnknownSync(Schema.Struct({ assets: Schema.Number }))(
      await (await worker.fetch('/__probe/counts')).json(),
    );

    const collected = Schema.decodeUnknownSync(Schema.Struct({ keys: Schema.Array(Schema.String) }))(
      await (await worker.fetch('/__probe/collect')).json(),
    );

    expect(collected.keys.length).toBeLessThan(before.assets);

    if (original.state !== 'present') throw new Error('Expected prior picture');
    expect((await worker.fetch(original.url)).status).toBe(200);
    expect((await worker.fetch('/__probe/restore-commit')).status).toBe(200);
    const replacement = await picture(await change(profile.id, cookie, 1, { key }));
    expect(replacement.revision).toBe(2);
  });

  it('accepts actual JPEG bytes and fences retirement/revocation occurring after initial authorization', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    const jpeg = await readFile('tests/fixtures/agent-pictures/fixture.jpg');
    const original = await picture(await change(profile.id, cookie, 0, { bytes: jpeg, type: 'image/jpeg' }));
    expect(original).toMatchObject({ contentType: 'image/jpeg', width: 8, height: 8 });
    const token = await pair(cookie, profile.id);

    const revoked = await worker.fetch(`/api/agents/${profile.id}/picture`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'image/png',
        'if-match': '"1"',
        'idempotency-key': randomUUID(),
        'x-tim28-revoke-on-read': profile.id,
      },
      body: png,
    });

    expect(revoked.status, await revoked.text()).toBe(412);
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(original);

    const retired = await worker.fetch(`/api/owner/agents/${profile.id}/picture`, {
      method: 'PUT',
      headers: {
        cookie,
        origin,
        'content-type': 'image/png',
        'if-match': '"1"',
        'idempotency-key': randomUUID(),
        'x-tim28-retire-on-read': profile.id,
      },
      body: png,
    });

    expect(retired.status, await retired.text()).toBe(412);
    expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(original);
  });

  it(
    takeoverCase,
    async ({ signal }) => {
      const clockSteps: { advanced: boolean; reason: string }[] = [];
      const progress: TakeoverProgress = { stage: 'owner setup', clockSteps };

      captureTakeoverFailure = async () => {
        const record = JSON.stringify({ at: Date.now(), ...progress }, null, 2) + '\n';
        console.error('Agent portrait takeover first failure:', record);
        await writeFile(`${persistTo}/takeover-failure.json`, record);
      };

      const cookie = await owner();
      const profile = await agent(cookie);
      const original = await picture(await change(profile.id, cookie, 0));
      const token = await pair(cookie, profile.id);
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      progress.stage = 'queue admission';
      expect(
        (
          await worker.fetch('/api/queue', {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({ requestId: randomUUID() }),
          })
        ).status,
      ).toBe(200);
      let matchId: string | null = null;

      for (let attempt = 0; attempt < 100; attempt++) {
        const queue = Schema.decodeUnknownSync(QueueStatusSchema)(
          await (await worker.fetch('/api/queue', { headers, signal })).json(),
        );

        progress.queue = queue;
        matchId = queue.matchId;

        if (matchId) break;
        await pause(100, undefined, { signal });
      }

      expect(matchId).toBeTruthy();
      progress.stage = 'takeover and game completion';
      let view;

      for (let attempt = 0; attempt < 400; attempt++) {
        view = Schema.decodeUnknownSync(ObservationSchema)(
          await (await worker.fetch(`/api/matches/${matchId}`, { signal })).json(),
        );

        progress.match = {
          matchId: view.matchId,
          status: view.status,
          phase: view.phase,
          cursor: view.cursor,
          seats: view.seats,
          winReason: view.winReason,
        };
        progress.lastEvents = view.events.slice(-16);

        expect(view.status, view.winReason ?? 'Portrait fixture interrupted').not.toBe('interrupted');

        if (view.status === 'finished') break;

        const step = Schema.decodeUnknownSync(
          Schema.Struct({ advanced: Schema.Boolean, reason: Schema.String }),
        )(
          await (
            await worker.fetch(`/__probe/portrait/${matchId}/clock`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ phaseId: view.phase.id, agentId: profile.id }),
              signal,
            })
          ).json(),
        );

        clockSteps.push(step);
        await pause(100, undefined, { signal });
      }

      expect(view?.status).toBe('finished');
      progress.stage = 'finished entrant identity and portrait replacement';
      const seat = view?.seats.find((candidate) => candidate.agentId === profile.id);
      expect(seat).toMatchObject({ house: true, originalHouse: false, forfeited: true, agentId: profile.id });

      const displayed = Schema.decodeUnknownSync(AgentPicturesSchema)(
        await (await worker.fetch(`/api/agent-pictures?agentId=${seat?.agentId}`)).json(),
      );

      expect(displayed[0].picture).toEqual(original);
      const replacement = await picture(await change(profile.id, cookie, 1));
      expect(replacement.revision).toBe(2);
      expect(
        Schema.decodeUnknownSync(ObservationSchema)(
          await (await worker.fetch(`/api/matches/${matchId}`)).json(),
        ),
      ).toEqual(view);
      expect(await picture(await worker.fetch(`/api/agents/${seat?.agentId}/picture`))).toEqual(replacement);

      const proof = await (await worker.fetch(`/__probe/portrait/${matchId}/progress`)).json();
      expect(proof).toMatchObject({ timing: DEFAULT_TIMING, accepted: true });

      const measured = Schema.decodeUnknownSync(
        Schema.Struct({
          elapsedMs: Schema.Number,
          delay: Schema.Struct({ completedAt: Schema.Number, deadline: Schema.Number }),
        }),
      )(proof);

      expect(measured.elapsedMs).toBeGreaterThanOrEqual(1000);
      expect(measured.delay.completedAt).toBeLessThan(measured.delay.deadline);
      expect(clockSteps.filter((step) => step.advanced && step.reason === 'human-grace')).toHaveLength(1);
      await writeFile(
        `${persistTo}/takeover-completed.json`,
        JSON.stringify({ ...progress, proof }, null, 2),
      );
    },
    60_000,
  );

  it('isolates same stable IDs and version URLs in an independent local arena', async () => {
    const cookie = await owner();
    const profile = await agent(cookie);
    const original = await picture(await change(profile.id, cookie, 0));
    const token = await pair(cookie, profile.id);
    const isolatedStorage = await mkdtemp(`${persistTo}/isolation-`);
    await promisify(execFile)(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'migrations',
      'apply',
      'tim28',
      '--local',
      '--config',
      'tests/fixtures/agent-pictures/wrangler.jsonc',
      '--persist-to',
      isolatedStorage,
    ]);

    const isolated = await unstable_dev('tests/fixtures/agent-pictures/worker.ts', {
      config: 'tests/fixtures/agent-pictures/wrangler.jsonc',
      local: true,
      persist: true,
      persistTo: isolatedStorage,
      port: 0,
      inspectorPort: 0,
      logLevel: 'error',
      experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
    });

    try {
      const base = `http://${isolated.address}:${isolated.port}`;

      const imported = await fetch(`${base}/__probe/identity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: profile.id, ownerId: profile.ownerId }),
      });

      expect(imported.status).toBe(200);
      expect(await picture(await fetch(`${base}/api/agents/${profile.id}/picture`))).toEqual({
        state: 'missing',
        revision: 0,
      });

      if (original.state !== 'present') throw new Error('Expected source picture');
      expect((await fetch(`${base}${original.url}`)).status).toBe(404);
      expect((await fetch(`${base}/api/owner`, { headers: { cookie } })).status).toBe(401);
      expect(
        (
          await fetch(`${base}/api/agents/${profile.id}/picture`, {
            method: 'PUT',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
            body: png,
          })
        ).status,
      ).toBe(401);
      expect(await picture(await worker.fetch(`/api/agents/${profile.id}/picture`))).toEqual(original);
    } finally {
      await isolated.stop();
    }
  }, 30_000);
});
