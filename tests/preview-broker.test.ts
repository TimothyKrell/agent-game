import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { Schema } from 'effect';
import {
  PreviewBrokerReceiptSchema,
  PreviewBrokerStatusSchema,
  PreviewInferenceResultSchema,
} from '../src/shared/preview-broker';
import type {
  PreviewBrokerIntent,
  PreviewBrokerReceipt,
  PreviewInference,
} from '../src/shared/preview-broker';
import { PreviewCodeSchema } from '../src/shared/preview';
import { ObservationSchema } from '../src/shared/api';
import { gameDescriptor } from '../src/game/descriptors';
import type { GameId } from '../src/game/contracts';
import { Observation2Schema } from '../src/shared/succession';

interface Worker {
  origin: string;
  fetch(path: string, options?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

interface Arena {
  origin: string;
  incarnation: string;
  keys: { privateKey: KeyObject; publicKey: KeyObject };
  worker: Worker;
  store: string;
}

const commit = 'a'.repeat(40);

const sourceRevision = 'b'.repeat(40);

const secret = () => randomBytes(32).toString('base64url');

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const evidenceRoot = process.env.TIM27_BROKER_EVIDENCE_DIR ?? `.tim27-broker/runs/native-${randomUUID()}`;

let evidence: string;

const portBase = process.env.TIM27_BROKER_PORT_BASE ? Number(process.env.TIM27_BROKER_PORT_BASE) : 0;

if (!Number.isInteger(portBase) || portBase < 0 || portBase > 65532)
  throw new Error(
    'TIM27_BROKER_PORT_BASE must start a valid four-port range, or be zero for assigned ports.',
  );

let nextPort: number;

let directory: string;

let source: Worker;

let arenas: Arena[];

let providerUrl: string;

let ownerId: string;

let agentId: string;

let providerDelay = 0;

let missingUsage = false;

let providerTokens = 100;

const captures: { model: string; maxTokens: number; aborted: boolean; authorization: boolean }[] = [];

const observations: string[] = [];

let provider: ReturnType<typeof createServer>;

function createProvider() {
  return createServer((request, response) => {
    void (async () => {
      let raw = '';

      for await (const part of request) raw += part;

      const body = Schema.decodeUnknownSync(
        Schema.Struct({
          model: Schema.String,
          max_output_tokens: Schema.Number,
          store: Schema.Literal(false),
          input: Schema.Array(
            Schema.Struct({
              role: Schema.String,
              content: Schema.Array(Schema.Struct({ text: Schema.String })),
            }),
          ),
        }),
      )(JSON.parse(raw));

      expect(request.url).toBe('/v1/responses');
      const prompt = JSON.parse(body.input.find((message) => message.role === 'user')!.content[0].text);
      const input = Schema.decodeUnknownSync(Schema.Struct({ task: Schema.String }))(prompt);

      const capture = {
        model: body.model,
        maxTokens: body.max_output_tokens,
        aborted: false,
        authorization: request.headers.authorization === 'Bearer fixture-only-broker-key',
      };

      captures.push(capture);
      response.on('close', () => {
        if (!response.writableFinished) capture.aborted = true;
      });

      if (providerDelay) await new Promise((resolve) => setTimeout(resolve, providerDelay));

      if (response.destroyed) return;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: `resp_${randomUUID()}`,
          object: 'response',
          model: body.model,
          created_at: Math.floor(Date.now() / 1000),
          output: [
            {
              id: 'msg_fixture',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    choice: input.task === 'chat' ? -1 : 0,
                    message: null,
                    notes: 'Fixture decision',
                  }),
                  annotations: [],
                },
              ],
            },
          ],
          usage: missingUsage
            ? undefined
            : {
                input_tokens: providerTokens,
                output_tokens: 20,
                total_tokens: providerTokens + 20,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
        }),
      );
    })().catch((error) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });
}

async function port(): Promise<number> {
  if (portBase) return nextPort++;
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return address.port;
}

async function start(origin: string, store: string, sourceUrl = ''): Promise<Worker> {
  const runtime = await unstable_dev('tests/fixtures/preview-broker-worker.ts', {
    config: 'tests/preview-broker.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: store,
    port: Number(new URL(origin).port),
    inspectorPort: 0,
    logLevel: 'error',
    vars: {
      APP_URL: origin,
      PREVIEW_SOURCE_URL: sourceUrl,
      BETTER_AUTH_SECRET: `${sourceUrl ? 'target' : 'source'}-broker-fixture-secret-at-least-32-characters`,
      HOUSE_PROVIDER: sourceUrl ? 'preview' : 'openai',
      HOUSE_MODEL: sourceUrl ? 'scripted' : 'gpt-4.1-mini',
      OPENAI_BASE_URL: sourceUrl ? '' : providerUrl,
      OPENAI_API_KEY: sourceUrl ? '' : 'fixture-only-broker-key',
      TIME_SCALE: sourceUrl ? '0.1' : '1',
    },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });

  let stopped = false;

  return {
    origin,
    fetch: (path, options) => fetch(origin + path, options),
    stop: async () => {
      if (stopped) return;

      stopped = true;
      await runtime.stop();
    },
  };
}

type FixtureInput = Schema.Json | PreviewBrokerIntent | PreviewInference;

function post(worker: Worker, path: string, input: FixtureInput, token?: string, cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json', origin: worker.origin });
  headers.set('X-Agent-Game-Protocols', '1,2');

  if (token) headers.set('authorization', `Bearer ${token}`);

  if (cookie) headers.set('cookie', cookie);

  return worker.fetch(path, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: JSON.stringify(input),
  });
}

async function decoded<A, I>(response: Response, schema: Schema.Codec<A, I>): Promise<A> {
  const body = await response.json();
  expect(response.ok, JSON.stringify(body)).toBe(true);

  return Schema.decodeUnknownSync(schema)(body);
}

async function query<A, I>(
  worker: Worker,
  sql: string,
  values: (string | number | null)[],
  schema: Schema.Codec<A, I>,
  coordinator = false,
): Promise<A> {
  return decoded(
    await post(worker, coordinator ? '/fixture/coordinator' : '/fixture/db', { sql, values }),
    schema,
  );
}

async function sql(
  worker: Worker,
  statement: string,
  values: (string | number | null)[] = [],
  coordinator = false,
) {
  await query(worker, statement, values, Schema.Array(Schema.Unknown), coordinator);
}

async function count(worker: Worker, table: string, coordinator = true) {
  return (
    await query(
      worker,
      `SELECT count(*) AS n FROM ${table}`,
      [],
      Schema.Array(Schema.Struct({ n: Schema.Number })),
      coordinator,
    )
  )[0].n;
}

function broker(arena: Arena, operation: string, input: FixtureInput): Promise<Response> {
  const path = `/api/preview/broker/${operation}`;
  const at = Date.now();
  const nonce = secret();
  const payload = JSON.stringify(input);

  const signature = sign(
    'sha256',
    Buffer.from(
      JSON.stringify([1, 'POST', source.origin, path, arena.origin, arena.incarnation, at, nonce, payload]),
    ),
    { key: arena.keys.privateKey, dsaEncoding: 'ieee-p1363' },
  ).toString('base64');

  return post(source, path, {
    origin: arena.origin,
    incarnation: arena.incarnation,
    at,
    nonce,
    payload,
    signature,
  });
}

async function connection(arena: Arena) {
  const sourceToken = `agk_${secret()}`;
  const sourceGrant = `connection_${randomUUID()}`;
  const expiresAt = Date.now() + 3600000;
  await sql(
    source,
    'INSERT INTO agent_grants(id,agent_id,secret_hash,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',
    [sourceGrant, agentId, hash(sourceToken), 'Existing installation', Date.now(), expiresAt],
  );
  const verifier = secret();
  const token = `agk_${secret()}`;

  const code = await decoded(
    await post(
      source,
      '/api/preview/agent-handoffs',
      {
        requestId: randomUUID(),
        targetOrigin: arena.origin,
        incarnation: arena.incarnation,
        commit,
        challenge: createHash('sha256').update(verifier).digest('base64url'),
        tokenHash: hash(token),
      },
      sourceToken,
    ),
    PreviewCodeSchema,
  );

  const exchanged = await decoded(
    await post(arena.worker, '/api/preview/agent-exchange', { ...code, verifier }, token),
    Schema.Struct({ connectionId: Schema.String, expiresAt: Schema.Number }),
  );

  const intent: PreviewBrokerIntent = {
    requestId: randomUUID(),
    targetMatchId: `match_${randomUUID()}`,
    targetOrigin: arena.origin,
    incarnation: arena.incarnation,
    commit,
    gameId: 'secret-overlord',
    rulesVersion: 'secret-overlord-1',
    policyVersion: 'house-4',
    tickets: [
      {
        agentId,
        ownerId,
        grantId: exchanged.connectionId,
        handoffId: code.requestId,
        queueRequestId: randomUUID(),
        joinedAt: Date.now(),
        expiresAt: exchanged.expiresAt,
      },
    ],
  };

  return { token, sourceToken, sourceGrant, intent };
}

function inference(
  receipt: PreviewBrokerReceipt,
  overrides: Partial<PreviewInference> = {},
): PreviewInference {
  return {
    allocationId: receipt.allocationId,
    commit,
    jobId: `job-${randomUUID()}`,
    attempt: 1,
    phaseId: 'phase-fixture',
    seat: 0,
    generation: 0,
    deadline: Date.now() + 60000,
    kind: 'required',
    policyVersion: 'house-4',
    system: 'Choose only the given legal action.',
    prompt: JSON.stringify({ task: 'action' }),
    choices: ['{"type":"vote","approve":true}'],
    ...overrides,
  };
}

async function settle(arena: Arena, input: PreviewInference) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await decoded(await broker(arena, 'inference', input), PreviewInferenceResultSchema);

    if (result.state !== 'pending') return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Native fixture inference did not settle');
}

async function close(arena: Arena, allocationId: string) {
  expect((await broker(arena, 'complete', { allocationId, commit })).status).toBe(200);
}

const PendingSchema = Schema.Struct({
  match_id: Schema.String,
  intent: Schema.String,
  receipt: Schema.NullOr(Schema.String),
  init_dispatched: Schema.Number,
  closed: Schema.Number,
});

async function pending(arena: Arena, queueRequestId: string) {
  return (
    await query(
      arena.worker,
      "SELECT * FROM preview_target_allocations WHERE json_extract(intent,'$.tickets[0].queueRequestId')=?",
      [queueRequestId],
      Schema.Array(PendingSchema),
      true,
    )
  )[0];
}

async function stage(arena: Arena, gameId: GameId = 'secret-overlord') {
  const connected = await connection(arena);
  const requestId = randomUUID();

  const response = await post(arena.worker, '/api/queue', { requestId, gameId }, connected.token);

  expect(await response.json()).toMatchObject({ status: 'queued', requestId });
  await sql(
    arena.worker,
    'UPDATE tickets SET joined_at=? WHERE agent_id=?',
    [Date.now() - 31000, agentId],
    true,
  );

  return { ...connected, requestId };
}

async function waitFor(check: () => Promise<boolean>, timeout = 8000) {
  const until = Date.now() + timeout;

  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  throw new Error('Timed out waiting for durable fixture state');
}

async function releaseTarget(arena: Arena, matchId: string) {
  expect((await post(arena.worker, '/fixture/complete', { matchId })).status).toBe(200);
  await post(arena.worker, '/fixture/queue-alarm', {});
  await waitFor(
    async () =>
      (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
        .livePreviewAllocations === 0,
  );
}

function useFixture(name: string) {
  beforeAll(async () => {
    evidence = join(evidenceRoot, name);
    observations.length = 0;
    captures.length = 0;
    providerDelay = 0;
    providerTokens = 100;
    missingUsage = false;
    nextPort = portBase + 1;
    provider = createProvider();
    await mkdir(evidence, { recursive: true });
    directory = await mkdtemp(join(tmpdir(), 'tim27-broker-'));
    await new Promise<void>((resolve) => provider.listen(portBase, '127.0.0.1', resolve));
    providerUrl = `http://127.0.0.1:${Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(provider.address()).port}/v1`;
    const sourceOrigin = `http://localhost:${await port()}`;
    const targetOrigins = [`http://127.0.0.1:${await port()}`, `http://127.0.0.1:${await port()}`];
    await Promise.all(
      ['source', 'target-a', 'target-b'].map((side) =>
        promisify(execFile)(process.execPath, [
          'node_modules/wrangler/bin/wrangler.js',
          'd1',
          'migrations',
          'apply',
          'preview-broker-test',
          '--config',
          'tests/preview-broker.wrangler.jsonc',
          '--env-file',
          '/dev/null',
          '--local',
          '--persist-to',
          `${directory}/${side}`,
        ]),
      ),
    );
    source = await start(sourceOrigin, `${directory}/source`);
    arenas = await Promise.all(
      targetOrigins.map(async (origin, index) => ({
        origin,
        incarnation: `incarnation-${index + 1}`,
        keys: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        store: `${directory}/target-${index ? 'b' : 'a'}`,
        worker: await start(origin, `${directory}/target-${index ? 'b' : 'a'}`, sourceOrigin),
      })),
    );

    for (const arena of arenas) {
      expect(
        (
          await post(source, '/fixture/register', {
            origin: arena.origin,
            incarnation: arena.incarnation,
            commit,
            publicKey: arena.keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await post(arena.worker, '/fixture/configure', {
            incarnation: arena.incarnation,
            commit,
            privateKey: arena.keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
          })
        ).status,
      ).toBe(200);
      expect(
        (await post(arena.worker, '/fixture/broker-config', { enabled: true, revision: commit })).status,
      ).toBe(200);
    }

    const login = await post(source, '/api/dev/login', { name: 'Broker Owner' });

    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');

    ownerId = (
      await decoded(
        await source.fetch('/api/owner', { headers: { cookie } }),
        Schema.Struct({ owner: Schema.Struct({ id: Schema.String }) }),
      )
    ).owner.id;
    agentId = (
      await decoded(
        await post(source, '/api/owner/agents', { name: 'Broker Competitor' }, undefined, cookie),
        Schema.Struct({ id: Schema.String }),
      )
    ).id;
  }, 60000);

  afterAll(async () => {
    await Promise.all([source?.stop(), ...(arenas ?? []).map((arena) => arena.worker.stop())]);
    provider.closeAllConnections();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    await writeFile(
      `${evidence}/result.json`,
      JSON.stringify(
        {
          directory,
          observations,
          providerRequests: captures.length,
          allSourceModel: captures.every((capture) => capture.model === 'gpt-4.1-mini'),
          allSourceOutputBound: captures.every((capture) => capture.maxTokens === 512),
          allSourceCredentials: captures.every((capture) => capture.authorization),
          aborted: captures.filter((capture) => capture.aborted).length,
          paidCalls: 0,
        },
        null,
        2,
      ) + '\n',
    );
  });
}

describe.sequential('shared production and preview competition', () => {
  useFixture('shared');

  it('defaults off, authenticates current targets and exposes the actual shared operating ledger without credentials', async () => {
    expect((await broker(arenas[0], 'status', { commit })).status).toBe(503);
    expect(
      (await post(source, '/fixture/broker-config', { enabled: true, revision: sourceRevision })).status,
    ).toBe(200);
    const status = await decoded(await broker(arenas[0], 'status', { commit }), PreviewBrokerStatusSchema);
    expect(status).toMatchObject({
      sourceRevision,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      secretOverlord: {
        accountedUsd: 0,
        activeReservedUsd: 0,
        maxConcurrent: 3,
        dailyTargetUsd: 5,
        reservationUsd: 1.5,
      },
    });
    expect(JSON.stringify(status)).not.toContain('fixture-only-broker-key');
    expect((await broker(arenas[0], 'status', { commit: 'c'.repeat(40) })).status).toBe(401);
    const connected = await connection(arenas[0]);
    await post(arenas[0].worker, '/fixture/broker-config', { enabled: false, revision: commit });

    const disabled = await post(
      arenas[0].worker,
      '/api/queue',
      { requestId: randomUUID(), gameId: 'secret-overlord' },
      connected.token,
    );

    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toMatchObject({ error: { code: 'preview-allocation-pending' } });
    expect(await count(arenas[0].worker, 'tickets')).toBe(0);
    await post(arenas[0].worker, '/fixture/broker-config', { enabled: true, revision: commit });
    expect((await broker(arenas[1], 'allocate', connected.intent)).status).toBe(401);
    expect(
      (
        await broker(arenas[0], 'allocate', {
          ...connected.intent,
          tickets: [{ ...connected.intent.tickets[0], agentId: 'agent-wrong-source' }],
        })
      ).status,
    ).toBe(401);
    expect((await broker(arenas[0], 'allocate', { ...connected.intent, tickets: [] })).status).toBe(400);
    observations.push(
      'Broker defaults off; exact signed target/revision/source competitor checks; source operating ledger status contains no provider credentials.',
    );
  });

  it('serializes two PR arenas and production admissions inside the existing native coordinator', async () => {
    const first = await connection(arenas[0]);
    const second = await connection(arenas[1]);

    const results = await Promise.all([
      broker(arenas[0], 'allocate', first.intent),
      broker(arenas[1], 'allocate', second.intent),
      post(source, '/fixture/production', {}),
      post(source, '/fixture/production', {}),
    ]);

    expect(
      results
        .slice(0, 2)
        .map((response) => response.status)
        .sort(),
    ).toEqual([200, 503]);
    const index = results[0].status === 200 ? 0 : 1;
    const receipt = await decoded(results[index], PreviewBrokerReceiptSchema);

    const production = await Promise.all(
      results
        .slice(2)
        .map((response) =>
          decoded(
            response,
            Schema.Struct({ ok: Schema.Literal(true), value: Schema.Struct({ matchId: Schema.String }) }),
          ),
        ),
    );

    const status = await decoded(await broker(arenas[0], 'status', { commit }), PreviewBrokerStatusSchema);
    expect(status.secretOverlord).toMatchObject({
      activeAllocations: 3,
      livePreviewAllocations: 1,
      activeReservedUsd: 4.5,
      capacity: 'busy',
    });
    await close(arenas[index], receipt.allocationId);

    for (const match of production)
      expect((await post(source, '/fixture/complete', { matchId: match.value.matchId })).status).toBe(200);
    observations.push(
      'Two actual target origins race production exhibition admission: one live preview, three total full reservations in secret-overlord.',
    );
  });

  it('uses the same native usage rows and priority waiters for preview and production; repeated retirement keeps charges intact', async () => {
    const arena = arenas[0];
    const connected = await connection(arena);

    const receipt = await decoded(
      await broker(arena, 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const productionRequest = randomUUID();
    expect(
      (
        await post(
          source,
          '/api/queue',
          { requestId: productionRequest, gameId: 'secret-overlord' },
          connected.sourceToken,
        )
      ).status,
    ).toBe(200);
    await sql(source, 'UPDATE tickets SET joined_at=? WHERE agent_id=?', [Date.now() - 31000, agentId], true);
    await post(source, '/fixture/queue-alarm', {});

    const production = (
      await query(
        source,
        'SELECT match_id AS matchId FROM joins WHERE id=?',
        [`${agentId}:${productionRequest}`],
        Schema.Array(Schema.Struct({ matchId: Schema.String })),
        true,
      )
    )[0];

    const requiredId = randomUUID();

    const reservation = await post(source, '/fixture/reserve', {
      id: requiredId,
      matchId: receipt.allocationId,
      estimate: 1.5,
      deadline: Date.now() + 60000,
      mandatory: true,
    });

    expect(await reservation.json()).toMatchObject({ allowed: true });
    const required = inference(receipt);
    expect(await settle(arena, required)).toMatchObject({
      state: 'denied',
      reason: 'match-budget',
      retryable: true,
    });

    const ordinaryOptional = {
      id: randomUUID(),
      matchId: production.matchId,
      estimate: 0.001,
      deadline: Date.now() + 60000,
      mandatory: false,
    };

    expect(await (await post(source, '/fixture/reserve', ordinaryOptional)).json()).toMatchObject({
      allowed: false,
      reason: 'required-priority',
    });
    const ordinaryRequired = { ...ordinaryOptional, id: randomUUID(), estimate: 6, mandatory: true };
    expect(await (await post(source, '/fixture/reserve', ordinaryRequired)).json()).toMatchObject({
      allowed: true,
    });
    expect((await broker(arenas[1], 'retire', required)).status).toBe(401);
    expect((await broker(arenas[1], 'complete', { allocationId: receipt.allocationId, commit })).status).toBe(
      401,
    );

    for (let retry = 0; retry < 2; retry++)
      expect((await broker(arena, 'retire', required)).status).toBe(200);

    const retained = await query(
      source,
      'SELECT reserved,done FROM usage WHERE id=?',
      [requiredId],
      Schema.Array(Schema.Struct({ reserved: Schema.Number, done: Schema.Number })),
      true,
    );

    expect(retained).toEqual([{ reserved: 1.5, done: 0 }]);
    await post(source, '/fixture/record', { id: ordinaryRequired.id, actual: 0 });
    expect(await (await post(source, '/fixture/reserve', ordinaryOptional)).json()).toMatchObject({
      allowed: true,
    });
    await post(source, '/fixture/record', { id: ordinaryOptional.id, actual: 0 });
    // Admission without dispatch can release proven-unused funds; unknown dispatched provider work cannot.
    await post(source, '/fixture/record', { id: requiredId, actual: 0 });
    expect(await settle(arena, required)).toMatchObject({ state: 'completed' });
    await close(arena, receipt.allocationId);
    await post(source, '/fixture/complete', { matchId: production.matchId });
    observations.push(
      'Native source preview required pressure blocks production optional while production mixed required retains its exemption; exact repeated waiter retirement leaves reservations intact.',
    );
  });

  it('persists an owned close tombstone even before allocation admission so delayed requests cannot reopen it', async () => {
    const arena = arenas[0];
    const connected = await connection(arena);
    await close(arena, `preview_${connected.intent.requestId}`);
    expect((await broker(arena, 'allocate', connected.intent)).status).toBe(409);
    const another = await connection(arena);
    await close(arenas[1], `preview_${another.intent.requestId}`);

    const receipt = await decoded(
      await broker(arena, 'allocate', another.intent),
      PreviewBrokerReceiptSchema,
    );

    await close(arena, receipt.allocationId);
    observations.push(
      'Owned close-before-admission tombstone prevents late allocation creation; another arena cannot tombstone or close its peer’s allocation.',
    );
  });

  it('enforces the source rolling RPM counters and keeps previous-day active reservations in admission', async () => {
    const arena = arenas[0];
    const connected = await connection(arena);

    const receipt = await decoded(
      await broker(arena, 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await sql(
      source,
      'UPDATE allocations SET created_at=? WHERE id=?',
      [Date.now() - 86400000, receipt.allocationId],
      true,
    );
    await sql(
      source,
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<250)
    INSERT INTO usage(id,match_id,day,created_at,expires_at,reserved,actual,done,kind)
    SELECT 'fixture-rpm-'||i,?,?,?, ?,0,0,1,'required' FROM n`,
      [receipt.allocationId, yesterday, Date.now() - 1000, Date.now() + 85000],
      true,
    );
    const input = inference(receipt, { deadline: Date.now() + 85000 });
    const before = captures.length;
    expect(await settle(arena, input)).toMatchObject({
      state: 'denied',
      reason: 'rate-limit',
      retryable: true,
    });

    const optional = inference(receipt, {
      deadline: Date.now() + 85000,
      kind: 'initial',
      choices: [],
      prompt: JSON.stringify({ task: 'chat' }),
    });

    expect(await settle(arena, optional)).toMatchObject({
      state: 'denied',
      reason: 'rate-limit',
      retryable: true,
    });
    expect(captures.length).toBe(before);
    expect(
      (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
        .activeReservedUsd,
    ).toBe(1.5);
    await sql(
      source,
      "UPDATE usage SET created_at=? WHERE id LIKE 'fixture-rpm-%'",
      [Date.now() - 61000],
      true,
    );
    expect(await settle(arena, input)).toMatchObject({ state: 'completed' });
    expect(await settle(arena, optional)).toMatchObject({ state: 'completed' });
    await close(arena, receipt.allocationId);
    expect(
      await query(
        source,
        "SELECT count(*) AS n FROM usage WHERE id LIKE 'fixture-rpm-%'",
        [],
        Schema.Array(Schema.Struct({ n: Schema.Number })),
        true,
      ),
    ).toEqual([{ n: 250 }]);
    observations.push(
      'Native shared rolling RPM counters deny required/optional calls without provider dispatch; aged counters recover, previous-day active reservation remains held and prior usage IDs remain recorded.',
    );
  });

  it('runs actual generateHouse via source-only HTTP with saved results, immutable fingerprints and no duplicate concurrent bills', async () => {
    const connected = await connection(arenas[0]);

    const receipt = await decoded(
      await broker(arenas[0], 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const input = inference(receipt);
    const before = captures.length;
    providerDelay = 100;

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        broker(arenas[0], 'inference', { ...input, model: 'untrusted-model', actual: 0, estimate: 0 }),
      ),
    );

    for (const response of responses) expect(response.status).toBe(202);
    const result = await settle(arenas[0], input);
    expect(result).toMatchObject({
      state: 'completed',
      value: { choice: 0 },
      inputTokens: 100,
      outputTokens: 20,
      accountedUsd: 0.000072,
    });
    expect(captures.length - before).toBe(1);
    expect(await settle(arenas[0], input)).toEqual(result);
    expect(
      (
        await broker(arenas[0], 'inference', {
          ...input,
          prompt: JSON.stringify({ task: 'action', changed: true }),
        })
      ).status,
    ).toBe(409);
    expect((await broker(arenas[0], 'inference', { ...input, attempt: 3 })).status).toBe(400);
    expect((await broker(arenas[1], 'inference', input)).status).toBe(401);
    expect(JSON.stringify(result)).not.toMatch(/fixture-only-broker-key|agk_|encrypted_key/);
    providerDelay = 0;
    missingUsage = true;
    expect(await settle(arenas[0], inference(receipt))).toMatchObject({
      state: 'completed',
      inputTokens: null,
      outputTokens: null,
    });
    missingUsage = false;
    providerDelay = 2500;
    expect(await settle(arenas[0], inference(receipt, { deadline: Date.now() + 1800 }))).toEqual({
      state: 'failed',
    });
    providerDelay = 0;
    await close(arenas[0], receipt.allocationId);

    const usage = await query(
      source,
      'SELECT actual,reserved,done FROM usage WHERE match_id=?',
      [receipt.allocationId],
      Schema.Array(
        Schema.Struct({ actual: Schema.NullOr(Schema.Number), reserved: Schema.Number, done: Schema.Number }),
      ),
      true,
    );

    expect(usage).toHaveLength(3);
    expect(usage.filter((row) => row.actual === null)).toHaveLength(2);
    expect(usage.every((row) => row.done === 1 && row.reserved > 0)).toBe(true);
    observations.push(
      'Real source generateHouse HTTP: concurrent calls bill once, saved response retry, model/output authority, unknown/aborted usage retains estimates.',
    );
  });

  it('recovers lost allocation acknowledgements and source cold restart without allocating again', async () => {
    const connected = await connection(arenas[0]);
    await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('fault','allocation')", [], true);
    const before = await count(source, 'preview_broker_allocations');
    expect((await broker(arenas[0], 'allocate', connected.intent)).status).toBe(500);
    expect(await count(source, 'preview_broker_allocations')).toBe(before + 1);
    const origin = source.origin;
    await source.stop();
    source = await start(origin, `${directory}/source`);

    const receipt = await decoded(
      await broker(arenas[0], 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    expect(receipt.allocationId).toBe(`preview_${connected.intent.requestId}`);
    expect(await count(source, 'preview_broker_allocations')).toBe(before + 1);
    await close(arenas[0], receipt.allocationId);
    observations.push(
      'Native coordinator allocation persists before lost RPC acknowledgement and survives source cold restart with the same ID.',
    );
  });

  it('holds unknown dispatch gaps across restart and closure; a second allowed attempt reserves separately', async () => {
    const connected = await connection(arenas[0]);

    const receipt = await decoded(
      await broker(arenas[0], 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const input = inference(receipt);
    await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('fault','dispatch')", [], true);
    const before = captures.length;
    expect((await broker(arenas[0], 'inference', input)).status).toBe(500);
    const origin = source.origin;
    await source.stop();
    source = await start(origin, `${directory}/source`);
    expect((await broker(arenas[0], 'inference', input)).status).toBe(202);
    expect(captures.length).toBe(before);
    await sql(
      source,
      'UPDATE preview_broker_calls SET deadline=? WHERE allocation_id=?',
      [Date.now() - 1, receipt.allocationId],
      true,
    );
    expect(await settle(arenas[0], input)).toEqual({ state: 'unknown' });
    expect(await settle(arenas[0], { ...input, attempt: 2 })).toMatchObject({ state: 'completed' });
    expect(captures.length).toBe(before + 1);
    await close(arenas[0], receipt.allocationId);
    const held = await decoded(await broker(arenas[0], 'status', { commit }), PreviewBrokerStatusSchema);
    expect(held.secretOverlord.livePreviewAllocations).toBe(1);
    expect(held.secretOverlord.activeReservedUsd).toBe(1.5);
    expect((await broker(arenas[0], 'inference', input)).status).toBe(409);
    // Trusted fixture reconciliation records a conservative UNKNOWN terminal charge, never fake measured zero.
    expect((await post(source, '/fixture/reconcile', input)).status).toBe(200);

    const usage = await query(
      source,
      'SELECT actual,reserved FROM usage WHERE match_id=?',
      [receipt.allocationId],
      Schema.Array(Schema.Struct({ actual: Schema.NullOr(Schema.Number), reserved: Schema.Number })),
      true,
    );

    expect(usage).toHaveLength(2);
    expect(usage.some((row) => row.actual === null && row.reserved > 0)).toBe(true);
    observations.push(
      'Crash after durable dispatch cannot redispatch or free the allocation. New attempt bills separately; source-only unknown settlement retains its full estimate.',
    );
  });

  it('persists the exact target intent before source I/O and recovers a lost allocation ack through target cold restart', async () => {
    const arena = arenas[0];
    const staged = await stage(arena);
    const before = await count(source, 'preview_broker_allocations');
    await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('fault','allocation')", [], true);
    expect((await post(arena.worker, '/fixture/queue-alarm', {})).status).toBe(200);
    const intent = await pending(arena, staged.requestId);
    expect(intent).toMatchObject({ receipt: null, init_dispatched: 0, closed: 0 });
    expect(JSON.parse(intent.intent)).toMatchObject({
      targetMatchId: intent.match_id,
      targetOrigin: arena.origin,
      incarnation: arena.incarnation,
      commit,
      tickets: [
        {
          agentId,
          ownerId,
          handoffId: staged.intent.tickets[0].handoffId,
          grantId: staged.intent.tickets[0].grantId,
          queueRequestId: staged.requestId,
        },
      ],
    });
    expect(await count(source, 'preview_broker_allocations')).toBe(before + 1);
    await arena.worker.stop();
    arena.worker = await start(arena.origin, arena.store, source.origin);
    expect((await post(arena.worker, '/fixture/queue-alarm', {})).status).toBe(200);
    const recovered = await pending(arena, staged.requestId);
    expect(recovered.intent).toBe(intent.intent);
    expect(recovered.init_dispatched).toBe(1);
    expect(await count(source, 'preview_broker_allocations')).toBe(before + 1);
    const receipt = Schema.decodeUnknownSync(PreviewBrokerReceiptSchema)(JSON.parse(recovered.receipt!));
    expect(receipt.snapshot).toMatchObject({
      mode: 'preview',
      houseModel: { provider: 'openai', model: 'gpt-4.1-mini', policyVersion: 'house-4' },
    });
    expect(receipt.snapshot.timing).toEqual(gameDescriptor('secret-overlord').timing);

    const stored = await decoded(
      await post(arena.worker, '/fixture/match', {
        matchId: intent.match_id,
        sql: 'SELECT count(*) AS n FROM game',
        values: [],
      }),
      Schema.Array(Schema.Struct({ n: Schema.Number })),
    );

    expect(stored[0].n).toBe(1);
    expect(await count(arena.worker, 'usage')).toBe(0);
    await releaseTarget(arena, intent.match_id);
    observations.push(
      'Target persists exact ticket/grant/handoff/game/commit intent before source allocation; lost acknowledgement + cold restart recover one source allocation and one real Match.',
    );
  });

  it('cancels a creating ticket while source allocation waits and never initializes the absent match', async () => {
    const arena = arenas[0];
    const staged = await stage(arena);
    await sql(source, "INSERT OR REPLACE INTO broker_test_controls VALUES ('allocate-delay','600')");
    const allocation = post(arena.worker, '/fixture/queue-alarm', {});
    await waitFor(async () => !!(await pending(arena, staged.requestId)));
    const intent = await pending(arena, staged.requestId);

    const cancelled = await arena.worker.fetch('/api/queue', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${staged.token}`,
        origin: arena.origin,
      },
      body: JSON.stringify({ gameId: 'secret-overlord', requestId: staged.requestId }),
    });

    expect(cancelled.status, await cancelled.clone().text()).toBe(200);
    expect(await cancelled.json()).toMatchObject({ status: 'idle', requestId: null });
    expect((await allocation).status).toBe(200);
    await sql(source, "DELETE FROM broker_test_controls WHERE key='allocate-delay'");
    expect(await pending(arena, staged.requestId)).toMatchObject({ init_dispatched: 0, closed: 1 });

    const stored = await decoded(
      await post(arena.worker, '/fixture/match', {
        matchId: intent.match_id,
        sql: 'SELECT count(*) AS n FROM game',
        values: [],
      }),
      Schema.Array(Schema.Struct({ n: Schema.Number })),
    );

    expect(stored[0].n).toBe(0);
    expect(await count(arena.worker, 'tickets')).toBe(0);
    await waitFor(
      async () =>
        (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
          .livePreviewAllocations === 0,
    );

    const retry = await post(
      arena.worker,
      '/api/queue',
      { requestId: staged.requestId, gameId: 'secret-overlord' },
      staged.token,
    );

    expect(await retry.json()).toMatchObject({ status: 'idle', matchId: null });
    observations.push(
      'Authenticated cancellation interleaves with the real source allocate request; exact ticket recheck abandons the uninitialized intent and source reservation.',
    );
  });

  it('rechecks revocation, local ticket identity and deployed revision in creating-allocation recovery before first initialization', async () => {
    const arena = arenas[0];

    for (const boundary of [
      'source-revoke',
      'local-revoke',
      'local-retire',
      'ticket-expiry',
      'ticket-replace',
      'commit-change',
    ]) {
      const staged = await stage(arena);
      await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('fault','allocation')", [], true);
      await post(arena.worker, '/fixture/queue-alarm', {});
      const intent = await pending(arena, staged.requestId);
      expect(intent.receipt).toBeNull();
      expect(intent.closed).toBe(0);

      if (boundary === 'source-revoke')
        await sql(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [
          Date.now(),
          staged.sourceGrant,
        ]);

      if (boundary === 'local-revoke')
        await sql(arena.worker, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [
          Date.now(),
          staged.intent.tickets[0].grantId,
        ]);

      if (boundary === 'local-retire')
        await sql(arena.worker, 'UPDATE agents SET retired_at=? WHERE id=?', [Date.now(), agentId]);

      if (boundary === 'ticket-expiry')
        await sql(
          arena.worker,
          'UPDATE tickets SET expires_at=? WHERE agent_id=?',
          [Date.now() - 1, agentId],
          true,
        );

      if (boundary === 'ticket-replace')
        await sql(
          arena.worker,
          'UPDATE tickets SET request_id=? WHERE agent_id=?',
          [randomUUID(), agentId],
          true,
        );

      if (boundary === 'commit-change') {
        await sql(arena.worker, 'UPDATE preview_runtime SET commit_id=? WHERE id=1', ['c'.repeat(40)]);
        await sql(source, 'UPDATE preview_arenas SET commit_id=? WHERE origin=?', [
          'c'.repeat(40),
          arena.origin,
        ]);
      }

      await post(arena.worker, '/fixture/queue-alarm', {});
      expect(await pending(arena, staged.requestId)).toMatchObject({ closed: 1, init_dispatched: 0 });

      const stored = await decoded(
        await post(arena.worker, '/fixture/match', {
          matchId: intent.match_id,
          sql: 'SELECT count(*) AS n FROM game',
          values: [],
        }),
        Schema.Array(Schema.Struct({ n: Schema.Number })),
      );

      expect(stored[0].n, boundary).toBe(0);
      await waitFor(
        async () =>
          (
            await query(
              source,
              "SELECT count(*) AS n FROM allocations WHERE state!='settled'",
              [],
              Schema.Array(Schema.Struct({ n: Schema.Number })),
              true,
            )
          )[0].n === 0,
      );

      if (boundary === 'commit-change') {
        await sql(arena.worker, 'UPDATE preview_runtime SET commit_id=? WHERE id=1', [commit]);
        await sql(source, 'UPDATE preview_arenas SET commit_id=? WHERE origin=?', [commit, arena.origin]);
      }

      if (boundary === 'local-retire')
        await sql(arena.worker, 'UPDATE agents SET retired_at=NULL WHERE id=?', [agentId]);
    }

    observations.push(
      'Creating recovery rejects revoked source authority, revoked local grant, changed/expired exact ticket and wrong deployed commit before the first Match initialize.',
    );
  });

  it('recognizes an already committed Match initialization after lost ack and source revocation instead of creating or cancelling another match', async () => {
    const arena = arenas[0];
    const staged = await stage(arena);
    await sql(arena.worker, "INSERT OR REPLACE INTO broker_test_controls VALUES ('initialize-ack','1')");
    await post(arena.worker, '/fixture/queue-alarm', {});
    const intent = await pending(arena, staged.requestId);
    expect(intent.init_dispatched).toBe(1);

    const game = async () =>
      decoded(
        await post(arena.worker, '/fixture/match', {
          matchId: intent.match_id,
          sql: 'SELECT data FROM game',
          values: [],
        }),
        Schema.Array(Schema.Struct({ data: Schema.String })),
      );

    const before = await game();
    await sql(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [Date.now(), staged.sourceGrant]);
    await arena.worker.stop();
    arena.worker = await start(arena.origin, arena.store, source.origin);
    await post(arena.worker, '/fixture/queue-alarm', {});
    expect(await game()).toEqual(before);

    const joined = await query(
      arena.worker,
      'SELECT match_id,cancelled FROM joins WHERE id=?',
      [`${agentId}:${staged.requestId}`],
      Schema.Array(Schema.Struct({ match_id: Schema.String, cancelled: Schema.Number })),
      true,
    );

    expect(joined).toEqual([{ match_id: intent.match_id, cancelled: 0 }]);
    expect(await pending(arena, staged.requestId)).toMatchObject({ closed: 0 });
    await releaseTarget(arena, intent.match_id);
    observations.push(
      'Read-only immutable Match receipt recognizes an actual committed initialization after target restart and source revocation; same game and participation recover without a redeal.',
    );
  });

  it('retires an old incarnation allocation through the trusted controller and invalidates its uninitialized target intent', async () => {
    const arena = arenas[1];
    const staged = await stage(arena);
    await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('fault','allocation')", [], true);
    await post(arena.worker, '/fixture/queue-alarm', {});
    const intent = await pending(arena, staged.requestId);
    expect(intent.closed).toBe(0);
    arena.incarnation += '-replacement';
    expect(
      (
        await post(source, '/fixture/register', {
          origin: arena.origin,
          incarnation: arena.incarnation,
          commit,
          publicKey: arena.keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(arena.worker, '/fixture/configure', {
          incarnation: arena.incarnation,
          commit,
          privateKey: arena.keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
        })
      ).status,
    ).toBe(200);
    await post(arena.worker, '/fixture/queue-alarm', {});
    expect(await pending(arena, staged.requestId)).toMatchObject({ closed: 1, init_dispatched: 0 });
    // The lifecycle lane writes D1 only. Source alarm reconciliation, not target credentials, releases the old allocation.
    await post(source, '/fixture/queue-alarm', {});
    await waitFor(
      async () =>
        (
          await query(
            source,
            'SELECT count(*) AS n FROM preview_broker_allocations WHERE closed=0',
            [],
            Schema.Array(Schema.Struct({ n: Schema.Number })),
            true,
          )
        )[0].n === 0,
    );
    expect(
      (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
        .livePreviewAllocations,
    ).toBe(0);

    const stored = await decoded(
      await post(arena.worker, '/fixture/match', {
        matchId: intent.match_id,
        sql: 'SELECT count(*) AS n FROM game',
        values: [],
      }),
      Schema.Array(Schema.Struct({ n: Schema.Number })),
    );

    expect(stored[0].n).toBe(0);
    observations.push(
      'Trusted replacement tombstones old authority and closes only its source allocations; the target never initializes the retired intent.',
    );
  });

  it('keeps identity-enabled scripted smoke zero-cost and separates its scaled snapshot from live permits', async () => {
    const arena = arenas[0];
    const before = captures.length;
    const allocations = await count(source, 'preview_broker_allocations');

    const response = await decoded(
      await post(arena.worker, '/api/dev/exhibition', {}),
      Schema.Struct({ matchId: Schema.String }),
    );

    await post(arena.worker, '/fixture/match-alarm', response);
    await waitFor(async () => {
      const view = await decoded(
        await arena.worker.fetch(`/api/matches/${response.matchId}`),
        ObservationSchema,
      );

      expect(view.mode).toBe('preview');

      return view.events.some((event) => event.type === 'chat');
    });

    const stored = await decoded(
      await post(arena.worker, '/fixture/match', {
        matchId: response.matchId,
        sql: 'SELECT data FROM game',
        values: [],
      }),
      Schema.Array(Schema.Struct({ data: Schema.String })),
    );

    const state = Schema.decodeUnknownSync(
      Schema.Struct({
        snapshot: Schema.Struct({
          houseModel: Schema.Struct({ provider: Schema.String }),
          timing: Schema.Struct({ action: Schema.Number }),
        }),
      }),
    )(JSON.parse(stored[0].data));

    expect(state.snapshot.houseModel.provider).toBe('preview');
    expect(state.snapshot.timing.action).toBe(gameDescriptor('secret-overlord').timing.action * 0.1);
    expect(captures.length).toBe(before);
    expect(await count(source, 'preview_broker_allocations')).toBe(allocations);
    observations.push(
      'Identity-enabled /api/dev/exhibition runs actual scripted house speech at scale .1 without source allocation or inference.',
    );
  });

  it('starts a live protocol-2 Succession target with source funding, immutable rules and real HouseSeat inference', async () => {
    const arena = arenas[1];
    const staged = await stage(arena, 'succession');
    await post(arena.worker, '/fixture/queue-alarm', {});
    const intent = await pending(arena, staged.requestId);
    const receipt = Schema.decodeUnknownSync(PreviewBrokerReceiptSchema)(JSON.parse(intent.receipt!));
    expect(receipt).toMatchObject({
      reservationUsd: 1.5,
      intent: { gameId: 'succession', policyVersion: 'succession-1' },
      snapshot: {
        gameId: 'succession',
        protocolVersion: '2',
        rulesVersion: 'succession-1',
        mode: 'preview',
        houseModel: { provider: 'openai', model: 'gpt-4.1-mini' },
      },
    });
    expect(receipt.snapshot.timing).toEqual(gameDescriptor('succession').timing);
    const before = captures.length;
    await post(arena.worker, '/fixture/match-alarm', { matchId: intent.match_id });
    await waitFor(
      async () =>
        (
          await query(
            source,
            'SELECT count(*) AS n FROM usage WHERE match_id=? AND done=1',
            [receipt.allocationId],
            Schema.Array(Schema.Struct({ n: Schema.Number })),
            true,
          )
        )[0].n > 0,
      12000,
    );

    const view = await decoded(
      await arena.worker.fetch(`/api/matches/${intent.match_id}`, {
        headers: { authorization: `Bearer ${staged.token}`, 'X-Agent-Game-Protocols': '1,2' },
      }),
      Observation2Schema,
    );

    expect(view.gameId).toBe('succession');
    expect(view.mode).toBe('preview');
    expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(24000);
    expect(captures.length).toBeGreaterThan(before);
    expect(await count(arena.worker, 'usage')).toBe(0);
    await releaseTarget(arena, intent.match_id);
    await arena.worker.stop();
    observations.push(
      'Live protocol-2 Succession target initializes with source snapshot/funding and uses real HouseSeat-to-source inference; private HTTP state stays below 24 KiB and target usage stays empty.',
    );
  });
});

// Honest over-estimate usage remains charged. Retire the entire preceding runtime before this
// negative control, then start a new source/target/provider lifetime for the corrections below.
describe.sequential('isolated source budget exhaustion', () => {
  useFixture('overrun');

  it('executes live target HouseSeat work at normal clocks and interrupts with partial history when source allocation funds are exhausted', async () => {
    await post(source, '/fixture/broker-config', { enabled: true, revision: sourceRevision });
    const arena = arenas[0];
    const staged = await stage(arena);
    await post(arena.worker, '/fixture/queue-alarm', {});
    const intent = await pending(arena, staged.requestId);
    const receipt = Schema.decodeUnknownSync(PreviewBrokerReceiptSchema)(JSON.parse(intent.receipt!));
    expect(receipt.snapshot.timing).toEqual(gameDescriptor('secret-overlord').timing);
    const callsBefore = captures.length;
    providerTokens = 3800000; // Explicit local negative control: honest actual usage above the source's estimate.
    providerDelay = 1000; // Preserve the CI regression: several calls are admitted before expensive replies arrive.
    await post(arena.worker, '/fixture/match-alarm', { matchId: intent.match_id });
    const until = Date.now() + 140000;
    let last;

    do {
      last = await decoded(
        await arena.worker.fetch(`/api/matches/${intent.match_id}`, {
          headers: { authorization: `Bearer ${staged.token}` },
        }),
        ObservationSchema,
      );
      expect(Buffer.byteLength(JSON.stringify(last))).toBeLessThan(24000);

      if (last.status !== 'active') break;

      if (last.decision) {
        const action = await post(
          arena.worker,
          `/api/matches/${intent.match_id}/actions`,
          {
            actionId: randomUUID(),
            phaseId: last.phase.id,
            decisionId: last.decision.id,
            action: last.decision.actions[0].action,
          },
          staged.token,
        );

        expect(action.status, await action.clone().text()).toBe(200);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < until);

    providerTokens = 100;
    providerDelay = 0;
    expect(last?.status).toBe('interrupted');
    expect(last?.mode).toBe('preview');
    expect(last?.events.some((event) => event.type === 'interrupted')).toBe(true);
    expect(captures.length).toBeGreaterThan(callsBefore);
    expect(await count(arena.worker, 'usage')).toBe(0);

    const usage = await query(
      source,
      'SELECT actual,reserved FROM usage WHERE match_id=?',
      [receipt.allocationId],
      Schema.Array(Schema.Struct({ actual: Schema.NullOr(Schema.Number), reserved: Schema.Number })),
      true,
    );

    expect(usage.some((row) => row.actual !== null && row.actual > row.reserved)).toBe(true);
    expect(usage.reduce((sum, row) => sum + (row.actual ?? row.reserved), 0)).toBeGreaterThan(1.5);
    await writeFile(`${evidence}/overrun-usage.json`, JSON.stringify(usage, null, 2));
    await post(arena.worker, '/fixture/queue-alarm', {});
    await waitFor(
      async () =>
        (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
          .livePreviewAllocations === 0,
    );

    const profile = await query(
      arena.worker,
      'SELECT games,rating FROM agents WHERE id=?',
      [agentId],
      Schema.Array(Schema.Struct({ games: Schema.Number, rating: Schema.Number })),
    );

    expect(profile).toEqual([{ games: 0, rating: 1000 }]);
    observations.push(
      'Actual live target HouseSeat → source generateHouse → game submission at normal clocks; over-estimate actual costs stay charged, exhausted work interrupts with partial history and no ratings or local usage ledger.',
    );
  }, 150000);

  it('retains honest overrun charges and denies another allocation on the exhausted source', async () => {
    const arena = arenas[0];
    const status = await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema);
    expect(status.secretOverlord.livePreviewAllocations).toBe(0);
    expect(status.secretOverlord.capacity).toBe('budget');
    expect(status.secretOverlord.accountedUsd + status.secretOverlord.reservationUsd).toBeGreaterThan(
      status.secretOverlord.dailyTargetUsd,
    );
    const connected = await connection(arena);
    const response = await broker(arena, 'allocate', connected.intent);
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: { code: 'preview-capacity', message: 'Shared source allocation is budget.' },
    });
    expect(
      (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord
        .accountedUsd,
    ).toBe(status.secretOverlord.accountedUsd);
    await writeFile(`${evidence}/retained-budget-denial.json`, JSON.stringify({ status, body }, null, 2));
  });
});

describe.sequential('corrections on an independent source', () => {
  useFixture('corrections');

  it('[correction] signed preview completion preserves production required waiters, usage and priority', async () => {
    await post(source, '/fixture/broker-config', { enabled: true, revision: sourceRevision });
    const arena = arenas[0];
    expect(
      (await decoded(await broker(arena, 'status', { commit }), PreviewBrokerStatusSchema)).secretOverlord,
    ).toMatchObject({ accountedUsd: 0, activeReservedUsd: 0, capacity: 'available' });
    const connected = await connection(arena);

    const receipt = await decoded(
      await broker(arena, 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const production = await decoded(
      await post(source, '/fixture/production', {}),
      Schema.Struct({ ok: Schema.Literal(true), value: Schema.Struct({ matchId: Schema.String }) }),
    );

    const reservedId = randomUUID();
    const waiterId = randomUUID();

    try {
      expect(
        await (
          await post(source, '/fixture/reserve', {
            id: reservedId,
            matchId: production.value.matchId,
            estimate: 1.49,
            deadline: Date.now() + 60000,
            mandatory: true,
          })
        ).json(),
      ).toMatchObject({ allowed: true });
      expect(
        await (
          await post(source, '/fixture/reserve', {
            id: waiterId,
            matchId: production.value.matchId,
            estimate: 0.02,
            deadline: Date.now() + 60000,
            mandatory: true,
          })
        ).json(),
      ).toMatchObject({ allowed: false, reason: 'match-budget', retryable: true });

      const rows = () =>
        query(
          source,
          'SELECT id,match_id,kind,expires_at FROM inference_waiters WHERE match_id=? ORDER BY id',
          [production.value.matchId],
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              match_id: Schema.String,
              kind: Schema.String,
              expires_at: Schema.Number,
            }),
          ),
          true,
        );

      const usage = () =>
        query(
          source,
          'SELECT id,reserved,actual,done FROM usage WHERE match_id=? ORDER BY id',
          [production.value.matchId],
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              reserved: Schema.Number,
              actual: Schema.NullOr(Schema.Number),
              done: Schema.Number,
            }),
          ),
          true,
        );

      const before = await rows();
      const charges = await usage();

      const optional = inference(receipt, {
        kind: 'initial',
        choices: [],
        prompt: JSON.stringify({ task: 'chat' }),
      });

      expect(await settle(arena, optional)).toMatchObject({ state: 'denied', reason: 'required-priority' });
      const response = await broker(arena, 'complete', { allocationId: production.value.matchId, commit });
      const after = await rows();
      await writeFile(
        `${evidence}/correction-close.json`,
        JSON.stringify(
          { status: response.status, before, after, chargesBefore: charges, chargesAfter: await usage() },
          null,
          2,
        ),
      );
      expect(response.status).toBe(401);
      expect(after).toEqual(before);
      expect(await usage()).toEqual(charges);
      expect(await settle(arena, optional)).toMatchObject({ state: 'denied', reason: 'required-priority' });
      expect(
        (await broker(arenas[1], 'complete', { allocationId: receipt.allocationId, commit })).status,
      ).toBe(401);
      await close(arena, receipt.allocationId);
      await close(arena, receipt.allocationId);
      expect(await rows()).toEqual(before);
      expect(await usage()).toEqual(charges);
      const future = { ...connected.intent, requestId: randomUUID() };
      await close(arena, `preview_${future.requestId}`);
      await close(arena, `preview_${future.requestId}`);
      expect((await broker(arena, 'allocate', future)).status).toBe(409);
      expect(await rows()).toEqual(before);
    } finally {
      // Fixture-only admission had no provider dispatch; cleanup records the proven unused reservation.
      await post(source, '/fixture/record', { id: reservedId, actual: 0 });
      await post(source, '/fixture/complete', { matchId: production.value.matchId });
      await close(arena, receipt.allocationId);
    }
  });

  it('[correction] live fill timestamps and readiness both use 30 seconds with the smoke scale configured', async () => {
    await post(source, '/fixture/broker-config', { enabled: true, revision: sourceRevision });
    const arena = arenas[0];
    const connected = await connection(arena);
    const requestId = randomUUID();
    let matchId: string | null = null;

    try {
      const queued = await decoded(
        await post(arena.worker, '/api/queue', { requestId, gameId: 'secret-overlord' }, connected.token),
        Schema.Struct({ status: Schema.String, joinedAt: Schema.Number, fillAt: Schema.Number }),
      );

      await writeFile(
        `${evidence}/correction-fill.json`,
        JSON.stringify({ ...queued, delayMs: queued.fillAt - queued.joinedAt }, null, 2),
      );
      expect(queued.fillAt - queued.joinedAt).toBe(30000);
      await sql(
        arena.worker,
        'UPDATE tickets SET joined_at=? WHERE agent_id=?',
        [Date.now() - 28000, agentId],
        true,
      );
      await post(arena.worker, '/fixture/queue-alarm', {});
      expect(await pending(arena, requestId)).toBeUndefined();
      await sql(
        arena.worker,
        'UPDATE tickets SET joined_at=? WHERE agent_id=?',
        [Date.now() - 31000, agentId],
        true,
      );
      await post(arena.worker, '/fixture/queue-alarm', {});
      const allocation = await pending(arena, requestId);
      matchId = allocation.match_id;
      expect(allocation.init_dispatched).toBe(1);
      const receipt = Schema.decodeUnknownSync(PreviewBrokerReceiptSchema)(JSON.parse(allocation.receipt!));
      expect(receipt.snapshot.timing).toEqual(gameDescriptor('secret-overlord').timing);
    } finally {
      if (matchId) await releaseTarget(arena, matchId);
      else
        await arena.worker.fetch('/api/queue', {
          method: 'DELETE',
          headers: { authorization: `Bearer ${connected.token}`, origin: arena.origin },
          body: JSON.stringify({ requestId, gameId: 'secret-overlord' }),
        });
    }
  });

  it('[correction] allocation retries preserve the real source scheduler for fill, recovery, expiry and retirement', async () => {
    await post(source, '/fixture/broker-config', { enabled: true, revision: sourceRevision });
    await sql(source, "INSERT OR REPLACE INTO broker_fixture VALUES ('automatic-alarms','1')", [], true);
    const arena = arenas[0];
    const connected = await connection(arena);

    const alarmTime = async () =>
      (
        await decoded(
          await post(source, '/fixture/alarm-time', {}),
          Schema.Struct({ at: Schema.NullOr(Schema.Number) }),
        )
      ).at;

    // Consume any harmless wake retained from an earlier completed fixture allocation.
    await post(source, '/fixture/wake', {});
    await waitFor(async () => (await alarmTime()) === null);
    const requestedAt = Date.now();

    const receipt = await decoded(
      await broker(arena, 'allocate', connected.intent),
      PreviewBrokerReceiptSchema,
    );

    const initial = await alarmTime();
    expect(initial).not.toBeNull();
    expect(initial!).toBeGreaterThanOrEqual(requestedAt + 30000);
    expect(initial!).toBeLessThanOrEqual(Date.now() + 30000);

    const retry = () =>
      broker(arena, 'allocate', connected.intent).then((response) =>
        decoded(response, PreviewBrokerReceiptSchema),
      );

    let matchedId: string | null = null;
    let creatingId: string | null = null;
    let registryClosed = false;

    try {
      expect(await retry()).toEqual(receipt);
      const initialAfterRetry = await alarmTime();
      const requestId = randomUUID();
      expect(
        (await post(source, '/api/queue', { requestId, gameId: 'secret-overlord' }, connected.sourceToken))
          .status,
      ).toBe(200);
      const joinedAt = Date.now() - 25000;
      const fillAt = joinedAt + 30000;
      await sql(source, 'UPDATE tickets SET joined_at=? WHERE agent_id=?', [joinedAt, agentId], true);
      await post(source, '/fixture/wake', {});
      await waitFor(async () => (await alarmTime()) === fillAt);
      await Promise.all(Array.from({ length: 8 }, retry));
      const afterRetry = await alarmTime();
      await writeFile(
        `${evidence}/correction-alarm.json`,
        JSON.stringify(
          {
            initial,
            initialAfterRetry,
            fillAt,
            afterRetry,
            postponedByMs: afterRetry === null ? null : afterRetry - fillAt,
          },
          null,
          2,
        ),
      );
      expect(afterRetry).toBe(fillAt);
      expect(initialAfterRetry).toBe(initial);
      await waitFor(async () => {
        const rows = await query(
          source,
          'SELECT match_id FROM joins WHERE id=?',
          [`${agentId}:${requestId}`],
          Schema.Array(Schema.Struct({ match_id: Schema.NullOr(Schema.String) })),
          true,
        );

        matchedId = rows[0].match_id;

        return matchedId !== null;
      }, 8000);
      await post(source, '/fixture/complete', { matchId: matchedId });
      matchedId = null;

      // The actual alarm retries a real creating allocation whose initializer is temporarily unavailable.
      await sql(source, "INSERT OR REPLACE INTO broker_test_controls VALUES ('initialize-before','1')");
      expect((await post(source, '/fixture/production', {})).status).toBe(500);
      creatingId = (
        await query(
          source,
          "SELECT id FROM allocations WHERE state='creating'",
          [],
          Schema.Array(Schema.Struct({ id: Schema.String })),
          true,
        )
      )[0].id;
      await post(source, '/fixture/wake', {});
      await waitFor(async () => {
        const at = await alarmTime();

        return at !== null && at > Date.now() + 300 && at < Date.now() + 1100;
      });
      const recoveryAt = await alarmTime();
      await Promise.all(Array.from({ length: 4 }, retry));
      expect(await alarmTime()).toBe(recoveryAt);
      await sql(source, "DELETE FROM broker_test_controls WHERE key='initialize-before'");
      await waitFor(
        async () =>
          (
            await query(
              source,
              'SELECT state FROM allocations WHERE id=?',
              [creatingId!],
              Schema.Array(Schema.Struct({ state: Schema.String })),
              true,
            )
          )[0].state === 'active',
      );
      await post(source, '/fixture/complete', { matchId: creatingId });
      creatingId = null;

      const expiryRequest = randomUUID();
      expect(
        (
          await post(
            source,
            '/api/queue',
            { requestId: expiryRequest, gameId: 'secret-overlord' },
            connected.sourceToken,
          )
        ).status,
      ).toBe(200);
      const expiresAt = Date.now() + 4000;
      await sql(source, 'UPDATE tickets SET expires_at=? WHERE agent_id=?', [expiresAt, agentId], true);
      await post(source, '/fixture/wake', {});
      await waitFor(async () => (await alarmTime()) === expiresAt);
      await Promise.all(Array.from({ length: 8 }, retry));
      expect(await alarmTime()).toBe(expiresAt);
      await waitFor(async () => (await count(source, 'tickets')) === 0, 6000);
      await waitFor(async () => {
        const at = await alarmTime();

        return at !== null && at > Date.now() + 20000;
      });

      const retirementAt = await alarmTime();
      expect(retirementAt).not.toBeNull();
      expect(retirementAt!).toBeLessThanOrEqual(Date.now() + 30000);
      await Promise.all(Array.from({ length: 8 }, retry));
      expect(await alarmTime()).toBe(retirementAt);
      expect(
        (await post(source, '/fixture/close', { origin: arena.origin, incarnation: arena.incarnation }))
          .status,
      ).toBe(200);
      registryClosed = true;

      // Read SQL only: neither signed status nor a manual alarm may trigger this reconciliation.
      const allocationState = () =>
        query(
          source,
          'SELECT p.closed,a.state FROM preview_broker_allocations p JOIN allocations a ON a.id=p.id WHERE p.id=?',
          [receipt.allocationId],
          Schema.Array(Schema.Struct({ closed: Schema.Number, state: Schema.String })),
          true,
        );

      expect(await allocationState()).toEqual([{ closed: 0, state: 'active' }]);
      await waitFor(async () => (await allocationState())[0].closed === 1, 35000);
      const retiredAt = Date.now();
      expect(await allocationState()).toEqual([{ closed: 1, state: 'settled' }]);
      expect(retiredAt).toBeGreaterThanOrEqual(retirementAt!);
      expect(retiredAt - retirementAt!).toBeLessThan(5000);
      await writeFile(
        `${evidence}/correction-scheduler.json`,
        JSON.stringify(
          { initial, fillAt, afterRetry, recoveryAt, expiresAt, retirementAt, retiredAt },
          null,
          2,
        ),
      );
    } finally {
      await sql(source, "DELETE FROM broker_test_controls WHERE key='initialize-before'");

      if (matchedId) await post(source, '/fixture/complete', { matchId: matchedId });

      if (creatingId) await post(source, '/fixture/complete', { matchId: creatingId });
      await source.fetch('/api/queue', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${connected.sourceToken}` },
      });

      if (registryClosed) await post(source, '/fixture/queue-alarm', {});
      else await close(arena, receipt.allocationId);
      await post(source, '/fixture/wake', {});
      await waitFor(async () => (await alarmTime()) === null);
      await sql(source, "DELETE FROM broker_fixture WHERE key='automatic-alarms'", [], true);
    }
  }, 60000);
});
