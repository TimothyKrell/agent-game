import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import { PreviewArenaSchema, PreviewCodeSchema, PreviewSignedSchema } from '../src/shared/preview';

interface Worker {
  fetch(path: string, options?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

const secret = () => randomBytes(32).toString('base64url');

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const privateKey = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const incarnation = 'identity-incarnation-1';

const commit = 'a'.repeat(40);

let source: Worker;

let target: Worker;

let sourceOrigin: string;

let targetOrigin: string;

let directory: string;

let sourceCookie: string;

let ownerId: string;

let agentId: string;

let sourceToken: string;

let sourceGrant: string;

const observations: string[] = [];

const evidenceDirectory =
  process.env.TIM27_IDENTITY_EVIDENCE_DIR ??
  `test-results/preview-identity/identity-${process.pid}-${randomUUID()}`;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  return address.port;
}

async function startWorker(origin: string, store: string, sourceUrl = ''): Promise<Worker> {
  const runtime = await unstable_dev('tests/fixtures/preview-identity-worker.ts', {
    config: 'tests/preview-identity.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: store,
    port: Number(new URL(origin).port),
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      APP_URL: origin,
      PREVIEW_SOURCE_URL: sourceUrl,
      BETTER_AUTH_SECRET: `${sourceUrl ? 'target' : 'source'}-identity-fixture-secret-at-least-32-characters`,
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });

  return { fetch: (path, options) => fetch(origin + path, options), stop: () => runtime.stop() };
}

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

function post(
  worker: Worker,
  path: string,
  body: string,
  cookie = '',
  origin?: string,
  token?: string,
): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (cookie) headers.set('cookie', cookie);

  if (origin) headers.set('origin', origin);

  if (token) headers.set('authorization', `Bearer ${token}`);

  return worker.fetch(path, { method: 'POST', body, headers, redirect: 'manual' });
}

async function decoded<A, I>(response: Response, schema: Schema.Codec<A, I>): Promise<A> {
  const value = await response.json();
  expect(response.ok, JSON.stringify(value)).toBe(true);

  return Schema.decodeUnknownSync(schema)(value);
}

async function query<A, I>(
  worker: Worker,
  sql: string,
  values: (string | number | null)[],
  schema: Schema.Codec<A, I>,
): Promise<A> {
  return decoded(await post(worker, '/fixture/db', JSON.stringify({ sql, values })), schema);
}

async function sql(
  worker: Worker,
  statement: string,
  values: (string | number | null)[] = [],
): Promise<void> {
  await query(worker, statement, values, Schema.Array(Schema.Unknown));
}

async function count(worker: Worker, table: string): Promise<number> {
  const rows = await query(
    worker,
    `SELECT count(*) AS n FROM ${table}`,
    [],
    Schema.Array(Schema.Struct({ n: Schema.Number })),
  );

  return rows[0].n;
}

async function createCompetitor(worker: Worker, cookie: string, origin: string, name: string) {
  const response = await post(worker, '/api/owner/agents', JSON.stringify({ name }), cookie, origin);
  expect(response.status, await response.clone().text()).toBe(201);

  return decoded(response, Schema.Struct({ id: Schema.String, name: Schema.String }));
}

async function crash(worker: Worker, phase: string): Promise<void> {
  expect((await post(worker, '/fixture/crash', JSON.stringify(phase))).status).toBe(200);
}

async function restartTarget(): Promise<void> {
  await target.stop();
  target = await startWorker(targetOrigin, `${directory}/target`, sourceOrigin);
}

async function register(revision = commit, epoch = incarnation): Promise<void> {
  expect(
    (
      await post(
        source,
        '/fixture/register',
        JSON.stringify({ origin: targetOrigin, incarnation: epoch, commit: revision, publicKey }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        target,
        '/fixture/configure',
        JSON.stringify({ incarnation: epoch, commit: revision, privateKey }),
      )
    ).status,
  ).toBe(200);
}

interface OwnerExchange {
  requestId: string;
  browserProof: string;
  browserCookie: string;
  code: string;
}

async function ownerExchange(cookie = sourceCookie): Promise<OwnerExchange> {
  const requestId = randomUUID();
  const browserProof = secret();

  const start = await post(
    target,
    '/api/preview/owner-start',
    JSON.stringify({ requestId, browserProof }),
    '',
    targetOrigin,
  );

  expect(start.status, await start.clone().text()).toBe(200);

  const code = await decoded(
    await post(source, '/api/preview/owner-handoffs', JSON.stringify({ requestId }), cookie, sourceOrigin),
    PreviewCodeSchema,
  );

  return { requestId, browserProof, browserCookie: cookies(start), code: code.code };
}

function complete(
  exchange: OwnerExchange,
  origin = targetOrigin,
  cookie = exchange.browserCookie,
): Promise<Response> {
  return post(
    target,
    '/api/auth/preview/complete',
    JSON.stringify({ requestId: exchange.requestId, code: exchange.code }),
    cookie,
    origin,
  );
}

interface AgentExchange {
  requestId: string;
  code: string;
  verifier: string;
  token: string;
}

async function agentExchange(token = sourceToken): Promise<AgentExchange> {
  const verifier = secret();
  const targetToken = `agk_${secret()}`;

  const intent = {
    requestId: randomUUID(),
    targetOrigin,
    incarnation,
    commit,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    tokenHash: hash(targetToken),
  };

  const code = await decoded(
    await post(source, '/api/preview/agent-handoffs', JSON.stringify(intent), '', undefined, token),
    PreviewCodeSchema,
  );

  return { ...code, verifier, token: targetToken };
}

function exchangeAgent(exchange: AgentExchange, token = exchange.token): Promise<Response> {
  return post(
    target,
    '/api/preview/agent-exchange',
    JSON.stringify({ requestId: exchange.requestId, code: exchange.code, verifier: exchange.verifier }),
    '',
    undefined,
    token,
  );
}

function signed(
  path: string,
  payload: string,
  at = Date.now(),
  epoch = incarnation,
  arena = targetOrigin,
): string {
  const nonce = secret();

  const signature = sign(
    'sha256',
    Buffer.from(JSON.stringify([1, 'POST', sourceOrigin, path, arena, epoch, at, nonce, payload])),
    { key: keys.privateKey, dsaEncoding: 'ieee-p1363' },
  ).toString('base64');

  return JSON.stringify({ origin: arena, incarnation: epoch, at, nonce, payload, signature });
}

beforeAll(async () => {
  await mkdir(evidenceDirectory, { recursive: true });
  directory = await mkdtemp('/tmp/opencode/agent-game-identity-');
  sourceOrigin = `http://localhost:${await freePort()}`;
  targetOrigin = `http://127.0.0.1:${await freePort()}`;
  await Promise.all(
    ['source', 'target'].map((side) =>
      promisify(execFile)(process.execPath, [
        'node_modules/wrangler/bin/wrangler.js',
        'd1',
        'migrations',
        'apply',
        'preview-identity-test',
        '--config',
        'tests/preview-identity.wrangler.jsonc',
        '--local',
        '--persist-to',
        `${directory}/${side}`,
      ]),
    ),
  );
  [source, target] = await Promise.all([
    startWorker(sourceOrigin, `${directory}/source`),
    startWorker(targetOrigin, `${directory}/target`, sourceOrigin),
  ]);
  await register();

  const login = await post(
    source,
    '/api/dev/login',
    JSON.stringify({ name: 'Identity Owner' }),
    '',
    sourceOrigin,
  );

  expect(login.status).toBe(200);
  sourceCookie = cookies(login);

  const owner = await decoded(
    await source.fetch('/api/owner', { headers: { cookie: sourceCookie } }),
    Schema.Struct({ owner: Schema.Struct({ id: Schema.String }) }),
  );

  ownerId = owner.owner.id;

  const agent = await post(
    source,
    '/api/owner/agents',
    JSON.stringify({ name: 'Identity Competitor', description: 'Source metadata' }),
    sourceCookie,
    sourceOrigin,
  );

  expect(agent.status).toBe(201);
  agentId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await agent.json()).id;
  sourceToken = `agk_${secret()}`;
  sourceGrant = `connection_${randomUUID()}`;
  await sql(
    source,
    'INSERT INTO agent_grants (id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [
      sourceGrant,
      agentId,
      hash(sourceToken),
      'Existing installed source agent',
      Date.now(),
      Date.now() + 86400000,
    ],
  );
}, 60000);

afterAll(async () => {
  await Promise.all([source?.stop(), target?.stop()]);
  await writeFile(
    join(evidenceDirectory, 'identity-result.json'),
    JSON.stringify(
      {
        sourceOrigin,
        targetOrigin,
        observations,
        runtime: 'Wrangler 4.129.1 / local workerd D1 / Better Auth 1.7.3',
        paidCalls: 0,
      },
      null,
      2,
    ) + '\n',
  );
});

it('imports agent before owner with independent credentials, IDs, metadata and ratings', async () => {
  const arenas = await decoded(await source.fetch('/api/preview/arenas'), Schema.Array(PreviewArenaSchema));
  expect(arenas[0]).toMatchObject({
    origin: targetOrigin,
    ownerEntryUrl: `${targetOrigin}/preview`,
    livePlay: false,
  });
  const exchange = await agentExchange();
  const response = await exchangeAgent(exchange);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(
    (await target.fetch('/api/queue', { headers: { authorization: `Bearer ${exchange.token}` } })).status,
  ).toBe(200);

  const queueCount = async () =>
    (await decoded(await target.fetch('/api/bootstrap'), Schema.Struct({ queueCount: Schema.Number })))
      .queueCount;

  expect(await queueCount()).toBe(0);

  const admission = await post(
    target,
    '/api/queue',
    JSON.stringify({ requestId: randomUUID(), gameId: 'secret-overlord' }),
    '',
    undefined,
    exchange.token,
  );

  expect(admission.status).toBe(503);
  expect(await admission.json()).toMatchObject({ error: { code: 'preview-allocation-pending' } });
  expect(await queueCount()).toBe(0);
  expect(
    await (
      await target.fetch('/api/queue', { headers: { authorization: `Bearer ${exchange.token}` } })
    ).json(),
  ).toMatchObject({ status: 'idle', requestId: null, matchId: null, joinedAt: null });
  expect(
    (await target.fetch('/api/queue', { headers: { authorization: `Bearer ${sourceToken}` } })).status,
  ).toBe(401);
  const owner = await ownerExchange();
  const completed = await complete(owner);
  expect(completed.status, await completed.clone().text()).toBe(200);
  const targetCookie = cookies(completed);
  expect(targetCookie).not.toContain('better-auth.session_token');
  expect(completed.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  expect(completed.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);

  const profile = await decoded(
    await target.fetch('/api/owner', { headers: { cookie: targetCookie } }),
    Schema.Struct({ owner: Schema.Struct({ id: Schema.String }) }),
  );

  expect(profile.owner.id).toBe(ownerId);
  expect(await count(target, 'owners')).toBe(1);
  expect(await count(target, 'user')).toBe(1);
  expect(await count(target, 'account')).toBe(0);
  expect(await count(target, 'matches')).toBe(0);
  expect((await target.fetch('/api/owner', { headers: { cookie: sourceCookie } })).status).toBe(401);
  expect((await source.fetch('/api/owner', { headers: { cookie: targetCookie } })).status).toBe(401);
  observations.push(
    'Agent-first then owner import converges; credentials, auth users, accounts and history isolated.',
  );
});

it('enforces exact browser origin, initiating browser, token proof and registered signed target', async () => {
  const exchange = await ownerExchange();
  expect((await complete(exchange, sourceOrigin)).status).toBe(403);
  expect((await complete(exchange, targetOrigin, '')).status).toBe(401);
  expect((await complete({ ...exchange, code: secret() })).status).toBe(401);
  const agent = await agentExchange();
  expect((await exchangeAgent(agent, `agk_${secret()}`)).status).toBe(401);
  expect((await exchangeAgent({ ...agent, verifier: secret() })).status).toBe(401);
  expect((await post(source, '/api/preview/arenas', '{}')).status).toBe(404);
  const path = '/api/preview/introspect';
  expect(
    (
      await post(
        source,
        path,
        signed(path, JSON.stringify({ requestId: agent.requestId }), Date.now() - 70000),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await post(
        source,
        path,
        signed(path, JSON.stringify({ requestId: agent.requestId }), Date.now(), 'wrong-incarnation'),
      )
    ).status,
  ).toBe(401);
  const proof = signed(path, JSON.stringify({ requestId: agent.requestId }));
  expect((await post(source, path, proof)).status).toBe(200);
  expect((await post(source, path, proof)).status).toBe(401);

  const tampered = Schema.decodeUnknownSync(PreviewSignedSchema)(
    JSON.parse(signed(path, JSON.stringify({ requestId: agent.requestId }))),
  );

  expect((await post(source, path, JSON.stringify({ ...tampered, payload: '{}' }))).status).toBe(401);
  const other = 'http://localhost:11111';
  expect(
    (
      await post(
        source,
        '/fixture/register',
        JSON.stringify({ origin: other, incarnation, commit, publicKey }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        source,
        path,
        signed(path, JSON.stringify({ requestId: agent.requestId }), Date.now(), incarnation, other),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await post(
        target,
        '/api/auth/preview/complete',
        JSON.stringify({ requestId: exchange.requestId, code: 'x'.repeat(5000) }),
        exchange.browserCookie,
        targetOrigin,
      )
    ).status,
  ).toBe(413);
  expect((await complete(exchange)).status).toBe(200);
  observations.push(
    'Foreign origin/port, missing browser, bad verifier/token, wrong incarnation, expired and replayed signatures rejected.',
  );
});

it('recovers a write-ahead owner start and lost source redemption acknowledgement after cold restart', async () => {
  const input = { requestId: randomUUID(), browserProof: secret() };
  await crash(target, 'pending');
  expect(
    (await post(target, '/api/preview/owner-start', JSON.stringify(input), '', targetOrigin)).status,
  ).toBe(500);
  await restartTarget();
  const started = await post(target, '/api/preview/owner-start', JSON.stringify(input), '', targetOrigin);
  expect(started.status).toBe(200);

  const code = await decoded(
    await post(
      source,
      '/api/preview/owner-handoffs',
      JSON.stringify({ requestId: input.requestId }),
      sourceCookie,
      sourceOrigin,
    ),
    PreviewCodeSchema,
  );

  const exchange = { ...input, browserCookie: cookies(started), code: code.code };
  await crash(source, 'redeem');
  expect((await complete(exchange)).status).toBe(503);

  const redeemed = await query(
    source,
    'SELECT redeemed_at FROM preview_handoffs WHERE id=?',
    [input.requestId],
    Schema.Array(Schema.Struct({ redeemed_at: Schema.Number })),
  );

  expect(redeemed[0].redeemed_at).toBeGreaterThan(0);
  await source.stop();
  source = await startWorker(sourceOrigin, `${directory}/source`);
  await restartTarget();
  expect((await complete(exchange)).status).toBe(200);
  observations.push(
    'Pending intent and consumed source receipt survive lost acknowledgements and target cold restarts.',
  );
}, 30000);

it('recovers actual Better Auth session insertion and lineage commits without duplicate or resurrected sessions', async () => {
  for (const phase of ['session', 'lineage']) {
    const exchange = await ownerExchange();
    const before = await count(target, 'session');
    await crash(target, phase);
    const interrupted = await complete(exchange);
    expect(interrupted.status, await interrupted.clone().text()).toBe(500);
    expect(interrupted.headers.has('set-cookie')).toBe(false);
    expect(await count(target, 'session')).toBe(before + 1);

    const pending = await query(
      target,
      'SELECT session_committed FROM preview_pending WHERE id=?',
      [exchange.requestId],
      Schema.Array(Schema.Struct({ session_committed: Schema.Number })),
    );

    const lineage = await query(
      target,
      "SELECT count(*) AS n FROM preview_authorities WHERE kind='session' AND handoff_id=?",
      [exchange.requestId],
      Schema.Array(Schema.Struct({ n: Schema.Number })),
    );

    expect(pending[0].session_committed).toBe(phase === 'session' ? 0 : 1);
    expect(lineage[0].n).toBe(phase === 'session' ? 0 : 1);
    await restartTarget();
    const response = await complete(exchange);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await count(target, 'session')).toBe(before + 1);
    expect((await complete(exchange)).status).toBe(200);
    expect(await count(target, 'session')).toBe(before + 1);
    const cookie = cookies(response);
    expect((await post(target, '/api/auth/sign-out', '{}', cookie, targetOrigin)).status).toBe(200);
    expect(
      (await post(target, '/fixture/stale-session-insert', JSON.stringify({ requestId: exchange.requestId })))
        .status,
    ).toBe(500);
    expect((await complete(exchange)).status).toBe(401);
    expect(await count(target, 'session')).toBe(before);
  }

  observations.push(
    'Crashes after library session insert and lineage commit recover one session; sign-out cannot be undone by replay.',
  );
}, 30000);

it('concurrent completion and grant retry recover a single durable receipt', async () => {
  const owner = await ownerExchange();
  const before = await count(target, 'session');
  const results = await Promise.all([complete(owner), complete(owner), complete(owner)]);
  expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
  expect(new Set(results.map(cookies)).size).toBe(1);
  expect(await count(target, 'session')).toBe(before + 1);
  const agent = await agentExchange();
  const grants = await count(target, 'agent_grants');
  const first = await decoded(await exchangeAgent(agent), Schema.Struct({ connectionId: Schema.String }));
  await restartTarget();
  const again = await decoded(await exchangeAgent(agent), Schema.Struct({ connectionId: Schema.String }));
  expect(again.connectionId).toBe(first.connectionId);
  expect(await count(target, 'agent_grants')).toBe(grants + 1);
  await sql(target, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [Date.now(), first.connectionId]);
  expect((await exchangeAgent(agent)).status).toBe(401);
  observations.push(
    'Concurrent native D1 owner completion and cold agent retry produce one receipt; local grant revocation persists.',
  );
}, 30000);

it('expires unused codes while permitting only bounded proof-bound receipt recovery', async () => {
  const expired = await ownerExchange();
  await sql(source, 'UPDATE preview_handoffs SET expires_at=? WHERE id=?', [
    Date.now() - 1,
    expired.requestId,
  ]);
  expect((await complete(expired)).status).toBe(401);
  const used = await ownerExchange();
  const cookie = cookies(await complete(used));
  await sql(source, 'UPDATE preview_handoffs SET expires_at=? WHERE id=?', [Date.now() - 1, used.requestId]);
  expect((await complete(used)).status).toBe(200);
  await sql(source, 'UPDATE preview_handoffs SET redeemed_at=? WHERE id=?', [
    Date.now() - 600001,
    used.requestId,
  ]);
  expect((await complete(used)).status).toBe(401);
  expect((await target.fetch('/api/auth/list-sessions', { headers: { cookie } })).status).toBe(200);
  observations.push(
    'Unused 60-second codes expire; consumed receipts require the same proof within ten minutes; existing authority remains usable.',
  );
});

it('recovers an atomically committed grant after lost acknowledgement and cold restart', async () => {
  const agent = await agentExchange();
  const before = await count(target, 'agent_grants');
  await crash(target, 'grant');
  expect((await exchangeAgent(agent)).status).toBe(500);
  expect(await count(target, 'agent_grants')).toBe(before + 1);
  await restartTarget();

  const result = await decoded(
    await exchangeAgent(agent),
    Schema.Struct({ connectionId: Schema.String, agentId: Schema.String }),
  );

  expect(result.agentId).toBe(agentId);
  expect(await count(target, 'agent_grants')).toBe(before + 1);
  observations.push(
    'Target grant + lineage batch survives interrupted acknowledgement; retry recovers the same connection.',
  );
}, 30000);

it('suffixes real source/target name collisions atomically and preserves identities on repeated import', async () => {
  const owner = await ownerExchange();
  const targetCookie = cookies(await complete(owner));
  const longNames = ['😀'.repeat(39) + '🚀', '😀'.repeat(39) + '🌍'];
  const names = ['Shared name', ...longNames, 'İ' + 'A'.repeat(39)];

  for (const name of names) await createCompetitor(target, targetCookie, targetOrigin, name);
  const reserved = await createCompetitor(target, targetCookie, targetOrigin, 'Shared name (source 1)');
  expect(
    (await post(target, `/api/owner/agents/${reserved.id}/retire`, '{}', targetCookie, targetOrigin)).status,
  ).toBe(200);

  for (let index = 1; index <= 9; index++)
    await createCompetitor(target, targetCookie, targetOrigin, '😀'.repeat(29) + ` (source ${index})`);

  const rows = () =>
    query(
      target,
      'SELECT id,name,name_key,retired_at FROM agents WHERE owner_id=? ORDER BY id',
      [ownerId],
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          name_key: Schema.String,
          retired_at: Schema.NullOr(Schema.Number),
        }),
      ),
    );

  const localBefore = await rows();
  const imported = [];

  for (const name of names)
    imported.push(
      await createCompetitor(
        source,
        sourceCookie,
        sourceOrigin,
        name === 'Shared name' ? '  Ｓhared name  ' : name,
      ),
    );
  expect(longNames.every((name) => name.length === 80 && [...name].length === 40)).toBe(true);
  const token = `agk_${secret()}`;
  await sql(
    source,
    'INSERT INTO agent_grants (id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [
      `connection_${randomUUID()}`,
      imported[0].id,
      hash(token),
      'Collision source grant',
      Date.now(),
      Date.now() + 86400000,
    ],
  );
  const exchanges = await Promise.all([ownerExchange(), ownerExchange(), ownerExchange()]);
  const agent = await agentExchange(token);

  const completions = await Promise.all([
    ...exchanges.map((exchange) => complete(exchange)),
    exchangeAgent(agent),
  ]);

  for (const response of completions) expect(response.status, await response.clone().text()).toBe(200);

  const after = await rows();
  expect(after.filter((row) => localBefore.some((local) => local.id === row.id))).toEqual(localBefore);
  const additions = imported.map((item) => after.find((row) => row.id === item.id)!);
  expect(additions[0].name).toBe('Shared name (source 2)');
  expect(
    additions
      .slice(1, 3)
      .map((row) => row.name)
      .sort(),
  ).toEqual([10, 11].map((index) => '😀'.repeat(28) + ` (source ${index})`));
  expect(additions[3].name).toBe('İ' + 'A'.repeat(28) + ' (source 1)');

  for (const row of additions) {
    expect([...row.name].length).toBeLessThanOrEqual(40);
    expect(row.name_key).toBe(row.name.normalize('NFKC').toLowerCase());

    const provenance = await query(
      target,
      "SELECT local_id FROM preview_sources WHERE origin=? AND kind='agent' AND source_id=?",
      [sourceOrigin, row.id],
      Schema.Array(Schema.Struct({ local_id: Schema.String })),
    );

    expect(provenance).toEqual([{ local_id: row.id }]);
  }

  expect((await complete(await ownerExchange())).status).toBe(200);
  expect((await exchangeAgent(await agentExchange(token))).status).toBe(200);
  expect(await rows()).toEqual(after);
  observations.push(
    'Real creation APIs: local names/tombstones stay intact; concurrent owner/agent imports suffix source IDs, handle 80-code-unit names and Unicode keys, and repeat without duplicates.',
  );
});

it('restricts signed agent introspection to its exact competitor while retaining owner roster scope', async () => {
  const other = await createCompetitor(source, sourceCookie, sourceOrigin, 'Same owner different agent');
  const agent = await agentExchange();
  expect((await exchangeAgent(agent)).status).toBe(200);
  const path = '/api/preview/introspect';

  const inspect = (requestId: string, inspectedAgent?: string) =>
    post(source, path, signed(path, JSON.stringify({ requestId, agentId: inspectedAgent })));

  expect((await inspect(agent.requestId, agentId)).status).toBe(200);
  expect((await inspect(agent.requestId)).status).toBe(200);
  const wrong = await inspect(agent.requestId, other.id);
  expect(wrong.status).toBe(401);
  expect(await wrong.json()).toMatchObject({ error: { code: 'preview-scope' } });
  expect((await inspect(agent.requestId, '')).status).toBe(401);
  const owner = await ownerExchange();
  expect((await complete(owner)).status).toBe(200);
  expect((await inspect(owner.requestId, agentId)).status).toBe(200);
  expect((await inspect(owner.requestId, other.id)).status).toBe(200);
  expect((await inspect(owner.requestId, 'agent_missing')).status).toBe(401);
  expect(
    (await post(source, `/api/owner/agents/${other.id}/retire`, '{}', sourceCookie, sourceOrigin)).status,
  ).toBe(200);
  expect((await inspect(owner.requestId, other.id)).status).toBe(401);
  observations.push(
    'Correctly signed agent-scope introspection rejects another active same-owner competitor; owner roster scope keeps live eligibility checks.',
  );
});

it('handles owner-first import, local identity collisions and paginated rosters without copying source history', async () => {
  const login = await post(
    source,
    '/api/dev/login',
    JSON.stringify({ name: 'Owner First' }),
    '',
    sourceOrigin,
  );

  const cookie = cookies(login);

  const profile = await decoded(
    await source.fetch('/api/owner', { headers: { cookie } }),
    Schema.Struct({ owner: Schema.Struct({ id: Schema.String }) }),
  );

  const otherOwner = profile.owner.id;
  const ids: string[] = [];

  for (let index = 0; index < 28; index++) {
    const id = `agent_import-${randomUUID()}`;
    ids.push(id);
    await sql(
      source,
      'INSERT INTO agents (id,owner_id,name,name_key,description,created_at,rating,games) VALUES (?,?,?,?,?,?,?,?)',
      [
        id,
        otherOwner,
        `Competitor ${index}`,
        `competitor ${index}`,
        'Source description',
        Date.now(),
        1700,
        10,
      ],
    );
  }

  const exchange = await ownerExchange(cookie);
  expect((await complete(exchange)).status).toBe(200);

  const imported = await query(
    target,
    'SELECT id,rating,games FROM agents WHERE owner_id=?',
    [otherOwner],
    Schema.Array(Schema.Struct({ id: Schema.String, rating: Schema.Number, games: Schema.Number })),
  );

  expect(imported).toHaveLength(28);
  expect(imported.every((agent) => agent.rating === 0 && agent.games === 0)).toBe(true);
  const token = `agk_${secret()}`;
  await sql(
    source,
    'INSERT INTO agent_grants (id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [
      `connection_${randomUUID()}`,
      ids[0],
      hash(token),
      'Owner-first source grant',
      Date.now(),
      Date.now() + 86400000,
    ],
  );
  expect((await exchangeAgent(await agentExchange(token))).status).toBe(200);
  const conflictId = `agent_conflict-${randomUUID()}`;
  await sql(source, 'INSERT INTO agents (id,owner_id,name,name_key,created_at) VALUES (?,?,?,?,?)', [
    conflictId,
    otherOwner,
    'Collision',
    'collision',
    Date.now(),
  ]);
  await sql(target, 'INSERT INTO agents (id,owner_id,name,name_key,created_at) VALUES (?,?,?,?,?)', [
    conflictId,
    ownerId,
    'Local identity',
    'local identity',
    Date.now(),
  ]);
  const collision = await ownerExchange(cookie);
  expect((await complete(collision)).status).toBe(409);
  expect((await complete(collision)).status).toBe(409);
  observations.push(
    'Owner-first/agent-second and 28-agent paginated imports preserve IDs and reset history; a conflicting local ID fails on every retry.',
  );
});

it('preserves local metadata and retirement across repeated owner/agent imports and same-incarnation redeploy', async () => {
  await sql(target, 'UPDATE owners SET name=? WHERE id=?', ['Locally edited owner', ownerId]);
  await sql(target, 'UPDATE agents SET name=?,description=?,retired_at=?,rating=? WHERE id=?', [
    'Locally edited competitor',
    'Local description',
    Date.now(),
    1234,
    agentId,
  ]);
  const exchange = await ownerExchange();
  expect((await complete(exchange)).status).toBe(200);
  const pending = await ownerExchange();
  expect(
    (
      await post(
        target,
        '/fixture/configure',
        JSON.stringify({ incarnation, commit: 'b'.repeat(40), privateKey }),
      )
    ).status,
  ).toBe(200);
  expect((await complete(pending)).status).toBe(401);
  await register();
  await register('b'.repeat(40));
  expect((await complete(pending)).status).toBe(401);
  expect((await complete(exchange)).status).toBe(200);
  await register();

  const row = (
    await query(
      target,
      'SELECT name,description,retired_at,rating FROM agents WHERE id=?',
      [agentId],
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          description: Schema.String,
          retired_at: Schema.Number,
          rating: Schema.Number,
        }),
      ),
    )
  )[0];

  expect(row).toMatchObject({
    name: 'Locally edited competitor',
    description: 'Local description',
    rating: 1234,
  });
  expect((await exchangeAgent(await agentExchange())).status).toBe(401);
  await sql(target, 'UPDATE agents SET retired_at=NULL WHERE id=?', [agentId]);
  observations.push(
    'Insert-only metadata and retirement survive import/redeploy; stale unconsumed commit-bound codes fail.',
  );
});

it('source revocation gates Better Auth library sessions, application routes and derived pairing grants', async () => {
  const oldOwner = await ownerExchange();
  const oldCookie = cookies(await complete(oldOwner));

  const relogin = await post(
    source,
    '/api/dev/login',
    JSON.stringify({ name: 'Identity Owner' }),
    '',
    sourceOrigin,
  );

  const newSourceCookie = cookies(relogin);
  expect(
    (await source.fetch('/api/auth/list-sessions', { headers: { cookie: newSourceCookie } })).status,
  ).toBe(200);
  const newOwner = await ownerExchange(newSourceCookie);
  const newCookie = cookies(await complete(newOwner));

  const newer = await query(
    target,
    'SELECT token FROM session WHERE preview_request_id=?',
    [newOwner.requestId],
    Schema.Array(Schema.Struct({ token: Schema.String })),
  );

  const token = `agk_${secret()}`;

  const pair = await decoded(
    await post(
      target,
      '/api/pairing',
      JSON.stringify({ installation: 'Target owner-derived pairing', tokenHash: hash(token) }),
    ),
    Schema.Struct({ code: Schema.String }),
  );

  expect(
    (
      await post(
        target,
        '/api/owner/pairing/approve',
        JSON.stringify({ code: pair.code, agentId }),
        oldCookie,
        targetOrigin,
      )
    ).status,
  ).toBe(200);
  expect((await target.fetch('/api/queue', { headers: { authorization: `Bearer ${token}` } })).status).toBe(
    200,
  );
  expect((await post(source, '/api/auth/sign-out', '{}', sourceCookie, sourceOrigin)).status).toBe(200);

  for (const path of ['/api/auth/get-session', '/api/auth/list-sessions', '/api/owner'])
    expect((await target.fetch(path, { headers: { cookie: oldCookie } })).status, path).toBe(401);

  for (const path of [
    '/api/auth/revoke-sessions',
    '/api/auth/revoke-other-sessions',
    '/api/auth/revoke-session',
  ])
    expect(
      (await post(target, path, JSON.stringify({ token: newer[0].token }), oldCookie, targetOrigin)).status,
      path,
    ).toBe(401);
  expect((await target.fetch('/api/owner', { headers: { cookie: newCookie } })).status).toBe(200);
  expect((await target.fetch('/api/queue', { headers: { authorization: `Bearer ${token}` } })).status).toBe(
    401,
  );
  expect((await complete(oldOwner)).status).toBe(401);
  sourceCookie = newSourceCookie;
  observations.push(
    'Revoked source cookie cannot list/revoke newer target sessions; owner-derived pairing authority revokes with its source session.',
  );
});

it('source grant revocation and retirement apply to privileged HTTP; public reads remain available', async () => {
  const exchange = await agentExchange();
  expect((await exchangeAgent(exchange)).status).toBe(200);
  const headers = { authorization: `Bearer ${exchange.token}` };
  expect((await target.fetch('/api/queue', { headers })).status).toBe(200);
  expect(
    (await post(target, '/api/matches/match_identity-test/ticket', '{}', '', undefined, exchange.token))
      .status,
  ).toBe(403);
  expect(
    (await target.fetch('/api/matches/match_identity-test/events?ticket=old-private-ticket')).status,
  ).toBe(403);
  await sql(source, 'UPDATE agents SET retired_at=? WHERE id=?', [Date.now(), agentId]);
  expect((await target.fetch('/api/queue', { headers })).status).toBe(401);
  await sql(source, 'UPDATE agents SET retired_at=NULL WHERE id=?', [agentId]);
  await sql(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [Date.now(), sourceGrant]);
  expect((await target.fetch('/api/queue', { headers })).status).toBe(401);
  expect((await exchangeAgent(exchange)).status).toBe(401);
  expect((await target.fetch('/api/agents')).status).toBe(200);
  observations.push(
    'Source retirement/grant revocation blocks private HTTP; derived private socket tickets denied and public reads unaffected.',
  );
});

it('exercises the actual two-origin browser cookie continuation', async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${targetOrigin}/preview`);
    await page.getByRole('button', { name: 'Continue to source sign-in' }).click();
    await page.waitForURL(`${sourceOrigin}/preview/continue?*`);
    await page.getByRole('button', { name: 'Local test sign-in' }).click();
    await page.getByRole('status').filter({ hasText: 'Signed in locally.' }).waitFor();
    await page.getByRole('button', { name: 'Authorize preview' }).click();
    await page.waitForURL(`${targetOrigin}/preview/return`);
    expect(page.url()).not.toContain('#');
    await page.getByRole('button', { name: 'Complete sign-in' }).click();
    await page.getByRole('status').filter({ hasText: 'Signed in.' }).waitFor();
    const response = await context.request.get(`${targetOrigin}/api/owner`);
    expect(response.status()).toBe(200);
    expect((await context.cookies(targetOrigin)).some((cookie) => cookie.name.includes('better-auth'))).toBe(
      false,
    );
    expect((await context.cookies(sourceOrigin)).some((cookie) => cookie.name.includes('preview-auth'))).toBe(
      false,
    );
    await page.screenshot({ path: join(evidenceDirectory, 'identity-browser.png') });
    observations.push(
      'Chromium: target start → source local Better Auth login → source authorization → fragment-stripped target completion → authenticated owner HTTP.',
    );
  } finally {
    await browser.close();
  }
}, 30000);

it('fails closed during a source outage and recovers existing authority after source restart', async () => {
  const exchange = await ownerExchange();
  const cookie = cookies(await complete(exchange));
  await source.stop();
  expect((await target.fetch('/api/auth/list-sessions', { headers: { cookie } })).status).toBe(401);
  expect((await target.fetch('/api/owner', { headers: { cookie } })).status).toBe(401);
  source = await startWorker(sourceOrigin, `${directory}/source`);
  expect((await target.fetch('/api/auth/list-sessions', { headers: { cookie } })).status).toBe(200);
  observations.push(
    'Live authority fails closed during source outage, then recovers after a source cold restart without re-pairing.',
  );
}, 30000);

it('permanently retires closed incarnations and rejects self-registration', async () => {
  const exchange = await ownerExchange();
  const cookie = cookies(await complete(exchange));
  expect(
    (
      await post(
        source,
        '/api/preview/arenas',
        JSON.stringify({ origin: targetOrigin, incarnation, commit, publicKey }),
      )
    ).status,
  ).toBe(404);
  expect(
    (await post(source, '/fixture/close', JSON.stringify({ origin: targetOrigin, incarnation }))).status,
  ).toBe(200);
  expect((await target.fetch('/api/auth/list-sessions', { headers: { cookie } })).status).toBe(401);
  expect(
    (
      await post(
        source,
        '/fixture/register',
        JSON.stringify({ origin: targetOrigin, incarnation, commit, publicKey }),
      )
    ).status,
  ).toBe(500);
  observations.push(
    'Only trusted controller registration exists; closed incarnations cannot reopen old authorities.',
  );
});
