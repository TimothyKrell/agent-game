import { Effect, Layer, Redacted, Schema } from 'effect';
import * as Alchemy from 'alchemy';
import { deploy } from 'alchemy/Deploy';
import { destroy } from 'alchemy/Destroy';
import { State, InMemoryService } from 'alchemy/State';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { PlatformServices } from 'alchemy/Util/PlatformServices';
import { LoggingCli } from '../node_modules/alchemy/lib/Cli/LoggingCli.js';
import { provideFreshArtifactStore } from 'alchemy/Artifacts';
import { RandomProvider } from 'alchemy/Random';
import { encodeState, reviveState } from 'alchemy/State/StateEncoding';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import {
  PreviewIdentity,
  previewIdentityProvider,
  retainedIdentity,
  markIdentityRetired,
  sourceResources,
  targetResources,
} from '../scripts/preview-lifecycle-state';
import type { StateService } from 'alchemy/State';
import {
  lifecycleFixture,
  lifecycleSourceId,
  lifecycleSourceOrigin,
  lifecycleTargetOrigin,
  lifecycleTargetId,
} from './fixtures/preview-lifecycle';
import {
  closePreviewTarget,
  registerPreviewTarget,
  configurePreviewTarget,
  openPreview,
} from '../src/server/preview-config';
import { previewD1 } from '../scripts/preview-d1';
import { registerLifecycle, retireLifecycle } from '../scripts/preview-lifecycle';
import {
  previewTransaction,
  sourceGuard,
  sourceRevision,
  targetGuard,
  targetRevision,
} from '../scripts/preview-transaction';
import { verifySourcePublicationReadback, verifySourceArenaReadback } from '../scripts/preview-publication';
import {
  configureSourcePreviewBroker,
  configureTargetPreviewBroker,
} from '../scripts/preview-broker-lifecycle';
import { verifyRecords } from '../scripts/preview-github';
import { records, expected } from './fixtures/preview-github';
import { canonical, sha256 } from '../scripts/preview-artifact';

let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

beforeEach(async () => {
  fixture = await lifecycleFixture();
}, 120_000);

afterEach(async () => {
  await fixture?.dispose();
});

function verifiedRun() {
  return { ...verifyRecords(records(), expected), builtCommit: fixture.artifact.manifest.builtCommit };
}

async function stateStore() {
  return Effect.runPromise(
    InMemoryService(
      {},
      {
        'agent-game': {
          prod: {
            databaseId: lifecycleSourceId,
            sourceOrigin: lifecycleSourceOrigin,
            previewBridgeVersion: 1,
            sourceCommit: 'e'.repeat(40),
          },
        },
      },
    ),
  );
}

function stack(state: StateService, attempt = 1, empty = false) {
  const storage = Layer.succeed(State, Effect.succeed(state));

  return Alchemy.Stack(
    'agent-game',
    {
      state: storage,
      providers: Layer.merge(RandomProvider(), previewIdentityProvider(fixture.env, fixture.fetcher)).pipe(
        Layer.provide(storage),
      ),
    },
    Effect.gen(function* () {
      if (empty) return {};
      const auth = yield* Alchemy.Random('PreviewAuth');

      const identity = yield* PreviewIdentity('PreviewIdentity', {
        targetOrigin: lifecycleTargetOrigin,
        authSecret: auth.text,
        runId: 100,
        runAttempt: attempt,
        builtCommit: fixture.artifact.manifest.builtCommit,
        prHeadSha: fixture.artifact.manifest.prHeadSha,
        controllerRun: `local-${attempt}`,
      });

      return {
        incarnation: identity.incarnation,
        publicKey: identity.publicKey,
        databaseId: lifecycleTargetId,
        workerName: 'agent-game-pr-27',
        url: lifecycleTargetOrigin,
      };
    }),
  );
}

async function apply(state: StateService, attempt = 1, remove = false) {
  const operation = remove
    ? destroy({ stack: stack(state, attempt, true), stage: 'pr-27' })
    : deploy({ stack: stack(state, attempt), stage: 'pr-27' });

  const result = await Effect.runPromise(
    operation.pipe(
      provideFreshArtifactStore,
      Effect.provideService(State, Effect.succeed(state)),
      Effect.provideService(AlchemyContext, {
        dotAlchemy: '.tim27-lifecycle/runs/alchemy',
        dev: false,
        adopt: false,
      }),
      Effect.provide(LoggingCli),
      Effect.provide(PlatformServices),
      Effect.scoped,
    ),
  );

  if (!remove) await fixture.setTargetAuth(await authSecret(state));

  return result;
}

async function authSecret(state: StateService) {
  const auth = await Effect.runPromise(
    state.get({ stack: 'agent-game', stage: 'pr-27', fqn: 'PreviewAuth' }),
  );

  expect(auth && 'attr' in auth).toBeTruthy();

  return Redacted.value(
    Schema.decodeUnknownSync(Schema.Struct({ text: Schema.Redacted(Schema.String) }))(
      auth && 'attr' in auth ? auth.attr : undefined,
    ).text,
  );
}

it('persists encrypted identity with the actual Alchemy engine across a serialized cold restart and stable update', async () => {
  const first = await stateStore();
  const created = await apply(first);
  const stored = await retainedIdentity(first, 'pr-27');
  expect(stored).toBeDefined();

  const privateKey = await openPreview(
    { BETTER_AUTH_SECRET: await authSecret(first) },
    Redacted.value(stored!.identity.encryptedKey),
  );

  const wire = JSON.stringify(encodeState(stored!.record));
  expect(wire).not.toContain(privateKey);
  expect(JSON.stringify(created)).not.toContain('encryptedKey');
  const second = await stateStore();

  const authState = await Effect.runPromise(
    first.get({ stack: 'agent-game', stage: 'pr-27', fqn: 'PreviewAuth' }),
  );

  await Effect.runPromise(
    second.set({
      stack: 'agent-game',
      stage: 'pr-27',
      fqn: 'PreviewAuth',
      value: JSON.parse(JSON.stringify(encodeState(authState)), reviveState),
    }),
  );
  await Effect.runPromise(
    second.set({
      stack: 'agent-game',
      stage: 'pr-27',
      fqn: 'PreviewIdentity',
      value: JSON.parse(wire, reviveState),
    }),
  );
  await apply(second, 2);
  const updated = await retainedIdentity(second, 'pr-27');
  expect(updated!.identity.incarnation).toBe(stored!.identity.incarnation);
  expect(updated!.identity.publicKey).toBe(stored!.identity.publicKey);
  expect(Redacted.value(updated!.identity.encryptedKey)).toBe(Redacted.value(stored!.identity.encryptedKey));
  expect(updated!.identity.runAttempt).toBe(2);
  await expect(apply(second, 2, true)).rejects.toThrow();
  expect(await retainedIdentity(second, 'pr-27')).toBeDefined();
});

it('retains a failed-revocation identity and mints a new incarnation only after source retirement/recreation', async () => {
  const state = await stateStore();
  await apply(state);
  const before = (await retainedIdentity(state, 'pr-27'))!.identity;

  const source = {
    DB: previewD1(before.accountId, before.sourceDatabaseId, 'synthetic-cloudflare-token', fixture.fetcher),
    ENVIRONMENT: 'production',
  };

  await registerPreviewTarget(source, {
    origin: before.targetOrigin,
    incarnation: before.incarnation,
    commit: 'a'.repeat(40),
    publicKey: before.publicKey,
  });
  await closePreviewTarget(source, before.targetOrigin, before.incarnation);
  await markIdentityRetired(state, 'pr-27', before.incarnation);
  await apply(state, 2, true);
  expect(await retainedIdentity(state, 'pr-27')).toBeUndefined();
  await apply(state, 3);
  const after = (await retainedIdentity(state, 'pr-27'))!.identity;
  expect(after.incarnation).not.toBe(before.incarnation);
  expect(after.publicKey).not.toBe(before.publicKey);
  await closePreviewTarget(source, before.targetOrigin, before.incarnation);
  expect((await retainedIdentity(state, 'pr-27'))!.identity.incarnation).toBe(after.incarnation);
});

it('fails closed for missing production capability outputs and forged target database aliases', async () => {
  const state = await stateStore();
  await expect(sourceResources(state, 'https://attacker.invalid')).rejects.toThrow();
  await Effect.runPromise(
    state.setOutput({ stack: 'agent-game', stage: 'prod', value: { databaseId: lifecycleSourceId } }),
  );
  await expect(sourceResources(state, lifecycleSourceOrigin)).rejects.toThrow();
  await expect(apply(state)).rejects.toThrow();
  const valid = await stateStore();
  await apply(valid, 3);
  const identity = (await retainedIdentity(valid, 'pr-27'))!.identity;
  await Effect.runPromise(
    valid.setOutput({
      stack: 'agent-game',
      stage: 'pr-27',
      value: { databaseId: lifecycleSourceId, workerName: 'agent-game-pr-27', url: lifecycleTargetOrigin },
    }),
  );
  await expect(targetResources(valid, 27, identity)).rejects.toThrow('isolated stage');
});

async function post(origin: string, path: string, input: string, cookie = '', token = '') {
  const headers = new Headers({ 'content-type': 'application/json', origin, cookie });

  if (token) headers.set('authorization', `Bearer ${token}`);

  return fixture.fetcher(origin + path, {
    method: 'POST',
    headers,
    body: input,
  });
}

const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

const Code = Schema.Struct({ requestId: Schema.String, code: Schema.String });

it('publishes real source GET artifacts and completes same-owner browser/agent handoffs through both actual Workers', async () => {
  const state = await stateStore();
  await apply(state, 2);
  let checks = 0;

  const publication = await registerLifecycle(
    state,
    verifiedRun(),
    fixture.artifact,
    fixture.env,
    async () => {
      checks++;
    },
    fixture.fetcher,
  );

  expect(checks).toBeGreaterThanOrEqual(4);
  await verifySourcePublicationReadback(publication, fixture.fetcher);
  expect(await verifySourceArenaReadback(publication, fixture.fetcher)).toBe(false);

  const login = await post(
    lifecycleSourceOrigin,
    '/api/dev/login',
    JSON.stringify({ name: 'Lifecycle owner' }),
  );

  expect(login.status, await login.clone().text()).toBe(200);
  const sourceCookie = cookies(login);

  const created = await post(
    lifecycleSourceOrigin,
    '/api/owner/agents',
    JSON.stringify({ name: 'Lifecycle competitor' }),
    sourceCookie,
  );

  expect(created.status, await created.clone().text()).toBe(201);
  const agent = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await created.json());
  const sourceToken = `agk_${randomBytes(32).toString('base64url')}`;

  const pairing = await post(
    lifecycleSourceOrigin,
    '/api/pairing',
    JSON.stringify({ installation: 'local-lifecycle', tokenHash: sha256(Buffer.from(sourceToken)) }),
  );

  const paired = Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(await pairing.json());
  expect(
    (
      await post(
        lifecycleSourceOrigin,
        '/api/owner/pairing/approve',
        JSON.stringify({ code: paired.code, agentId: agent.id }),
        sourceCookie,
      )
    ).status,
  ).toBe(200);
  const requestId = randomUUID();

  const started = await post(
    lifecycleTargetOrigin,
    '/api/preview/owner-start',
    JSON.stringify({ requestId, browserProof: randomBytes(32).toString('base64url') }),
  );

  expect(started.status, await started.clone().text()).toBe(200);

  const ownerCode = await post(
    lifecycleSourceOrigin,
    '/api/preview/owner-handoffs',
    JSON.stringify({ requestId }),
    sourceCookie,
  );

  expect(ownerCode.status, await ownerCode.clone().text()).toBe(200);
  const code = Schema.decodeUnknownSync(Code)(await ownerCode.json());

  const completed = await post(
    lifecycleTargetOrigin,
    '/api/auth/preview/complete',
    JSON.stringify(code),
    cookies(started),
  );

  expect(completed.status, await completed.clone().text()).toBe(200);

  const owner = await fixture.fetcher(lifecycleTargetOrigin + '/api/owner', {
    headers: { cookie: cookies(completed) },
  });

  expect(owner.status, await owner.clone().text()).toBe(200);
  expect(await owner.text()).toContain('Lifecycle competitor');
  const verifier = randomBytes(32).toString('base64url');
  const targetToken = `agk_${randomBytes(32).toString('base64url')}`;

  const intent = {
    requestId: randomUUID(),
    targetOrigin: publication.targetOrigin,
    incarnation: publication.incarnation,
    commit: publication.commit,
    challenge: Buffer.from(sha256(Buffer.from(verifier)), 'hex').toString('base64url'),
    tokenHash: sha256(Buffer.from(targetToken)),
  };

  const agentCode = await post(
    lifecycleSourceOrigin,
    '/api/preview/agent-handoffs',
    JSON.stringify(intent),
    '',
    sourceToken,
  );

  expect(agentCode.status, await agentCode.clone().text()).toBe(200);
  const grant = Schema.decodeUnknownSync(Code)(await agentCode.json());

  const exchange = await post(
    lifecycleTargetOrigin,
    '/api/preview/agent-exchange',
    JSON.stringify({ ...grant, verifier }),
    '',
    targetToken,
  );

  expect(exchange.status, await exchange.clone().text()).toBe(200);
  expect(
    (
      await fixture.fetcher(lifecycleTargetOrigin + '/api/queue', {
        headers: { authorization: `Bearer ${targetToken}`, 'x-agent-game-protocol': '1' },
      })
    ).status,
  ).toBe(200);
  expect((await fixture.fetcher(lifecycleTargetOrigin + '/preview')).headers.get('content-type')).toContain(
    'text/html',
  );
  expect((await post(lifecycleSourceOrigin, '/api/preview/arenas', '{}')).status).toBe(404);
  const identity = (await retainedIdentity(state, 'pr-27'))!.identity;
  await rm(fixture.artifactDirectory, { recursive: true });
  await retireLifecycle(
    state,
    'pr-27',
    identity,
    { ...fixture.env, PREVIEW_IDENTITY_ENABLED: '', PREVIEW_SOURCE_RELEASE: '' },
    async () => {},
    fixture.fetcher,
  );
  await expect(verifySourcePublicationReadback(publication, fixture.fetcher)).rejects.toThrow('unavailable');
  await apply(state, 2, true);
  expect(await retainedIdentity(state, 'pr-27')).toBeUndefined();
  await writeFile(
    '.tim27-lifecycle/integration.json',
    canonical({
      localOnly: true,
      syntheticGitHubIdentity: true,
      publication,
      checks,
      ownerImport: true,
      agentHandoff: true,
      artifactIndependentRetirement: true,
      noPublicRegistrationRoute: true,
      inferenceCalls: 0,
    }),
  );
}, 60_000);

it.each(['target configure', 'source register'] as const)(
  'fences a delayed %s after a newer commit wins the actual atomic D1 transaction',
  async (phase) => {
    const state = await stateStore();
    await apply(state, 2);

    const publication = await registerLifecycle(
      state,
      verifiedRun(),
      fixture.artifact,
      fixture.env,
      async () => {},
      fixture.fetcher,
    );

    const identity = (await retainedIdentity(state, 'pr-27'))!.identity;
    const databaseId = phase === 'target configure' ? lifecycleTargetId : lifecycleSourceId;
    let resume!: () => void;
    let captured!: () => void;

    const waiting = new Promise<void>((resolve) => {
      captured = resolve;
    });

    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });

    const delayed: typeof fetch = async (url, init) => {
      captured();
      await gate;

      return fixture.fetcher(url, init);
    };

    const db = previewD1(identity.accountId, databaseId, 'synthetic', fixture.fetcher);
    const oldDB = previewD1(identity.accountId, databaseId, 'synthetic', delayed);

    const key = await openPreview(
      { BETTER_AUTH_SECRET: await authSecret(state) },
      Redacted.value(identity.encryptedKey),
    );

    const beforeSource = await sourceRevision(db, publication.targetOrigin).catch(() => null);
    const beforeTarget = await targetRevision(db).catch(() => null);

    const update = (database: ReturnType<typeof previewD1>, commit: string) => {
      const desired = {
        incarnation: identity.incarnation,
        commit_id: commit,
        public_key: identity.publicKey,
        closed_at: null,
      };

      return phase === 'target configure'
        ? previewTransaction(
            database,
            [targetGuard(database, beforeTarget, desired)],
            [
              (DB) =>
                configurePreviewTarget(
                  {
                    DB,
                    APP_URL: lifecycleTargetOrigin,
                    PREVIEW_SOURCE_URL: lifecycleSourceOrigin,
                    ENVIRONMENT: 'preview',
                    BETTER_AUTH_SECRET: secret,
                  },
                  identity.incarnation,
                  commit,
                  key,
                ),
            ],
          )
        : previewTransaction(
            database,
            [sourceGuard(database, publication.targetOrigin, beforeSource, desired)],
            [
              (DB) =>
                registerPreviewTarget(
                  { DB, ENVIRONMENT: 'production' },
                  {
                    origin: publication.targetOrigin,
                    incarnation: identity.incarnation,
                    commit,
                    publicKey: identity.publicKey,
                  },
                ),
            ],
          );
    };

    const secret = await authSecret(state);
    const old = update(oldDB, 'a'.repeat(40));
    const rejected = expect(old).rejects.toThrow('D1');
    await waiting;
    await update(db, 'b'.repeat(40));
    resume();
    await rejected;

    const current =
      phase === 'target configure'
        ? await targetRevision(db)
        : await sourceRevision(db, publication.targetOrigin);

    expect(current?.commit_id).toBe('b'.repeat(40));
  },
);

it('recovers a lost source-register acknowledgement with the retained key and rejects stale publication after closure', async () => {
  const state = await stateStore();
  await apply(state, 2);
  const identity = (await retainedIdentity(state, 'pr-27'))!.identity;
  let lost = false;

  const transport: typeof fetch = async (url, init) => {
    const result = await fixture.fetcher(url, init);
    const body = String(init?.body ?? '');

    if (!lost && body.includes('INSERT INTO preview_arenas')) {
      lost = true;
      throw new Error('Synthetic lost acknowledgement');
    }

    return result;
  };

  await expect(
    registerLifecycle(state, verifiedRun(), fixture.artifact, fixture.env, async () => {}, transport),
  ).rejects.toThrow('acknowledgement');
  expect((await retainedIdentity(state, 'pr-27'))!.identity.incarnation).toBe(identity.incarnation);

  const publication = await registerLifecycle(
    state,
    verifiedRun(),
    fixture.artifact,
    fixture.env,
    async () => {},
    fixture.fetcher,
  );

  expect(publication.incarnation).toBe(identity.incarnation);
  await verifySourcePublicationReadback(publication, fixture.fetcher);
  await retireLifecycle(state, 'pr-27', identity, fixture.env, async () => {}, fixture.fetcher);
  await expect(
    registerLifecycle(state, verifiedRun(), fixture.artifact, fixture.env, async () => {}, fixture.fetcher),
  ).rejects.toThrow('generation changed');
  await expect(verifySourcePublicationReadback(publication, fixture.fetcher)).rejects.toThrow('unavailable');
});

it('requires independent source revision/configuration and current target runtime before broker enablement, without any inference', async () => {
  const state = await stateStore();
  await apply(state, 2);

  const publication = await registerLifecycle(
    state,
    verifiedRun(),
    fixture.artifact,
    fixture.env,
    async () => {},
    fixture.fetcher,
  );

  const identity = (await retainedIdentity(state, 'pr-27'))!.identity;
  const source = previewD1(identity.accountId, lifecycleSourceId, 'synthetic', fixture.fetcher);
  const target = previewD1(identity.accountId, lifecycleTargetId, 'synthetic', fixture.fetcher);
  expect(
    await fixture.targetDB.prepare('SELECT enabled FROM preview_broker_settings WHERE id=1').first('enabled'),
  ).toBe(0);
  await expect(
    configureSourcePreviewBroker(state, fixture.env, 'e'.repeat(40), true, fixture.fetcher),
  ).rejects.toThrow('protected');
  const enabled = { ...fixture.env, PREVIEW_BROKER_ENABLED: 'true' };
  await expect(
    configureSourcePreviewBroker(state, enabled, publication.commit, true, fixture.fetcher),
  ).rejects.toThrow('source revision');
  await expect(
    configureTargetPreviewBroker(
      source,
      target,
      'e'.repeat(40),
      identity.incarnation,
      publication.commit,
      true,
    ),
  ).rejects.toThrow('explicitly configured');
  await configureSourcePreviewBroker(state, enabled, 'e'.repeat(40), true, fixture.fetcher);
  await expect(
    configureTargetPreviewBroker(source, target, 'e'.repeat(40), identity.incarnation, 'f'.repeat(40), true),
  ).rejects.toThrow('D1');
  await configureTargetPreviewBroker(
    source,
    target,
    'e'.repeat(40),
    identity.incarnation,
    publication.commit,
    true,
  );
  expect(
    await fixture.sourceDB
      .prepare('SELECT revision FROM preview_broker_settings WHERE id=1')
      .first('revision'),
  ).toBe('e'.repeat(40));
  expect(
    await fixture.targetDB
      .prepare('SELECT revision FROM preview_broker_settings WHERE id=1')
      .first('revision'),
  ).toBe(publication.commit);
  // A source configured with the scripted provider still cannot advertise live
  // play or pass the lifecycle's live publication check.
  expect(await verifySourceArenaReadback(publication, fixture.fetcher)).toBe(false);
  await expect(
    registerLifecycle(state, verifiedRun(), fixture.artifact, enabled, async () => {}, fixture.fetcher),
  ).rejects.toThrow('broker/provider');
  await configureSourcePreviewBroker(state, enabled, 'e'.repeat(40), false, fixture.fetcher);
  expect(
    await fixture.sourceDB.prepare('SELECT enabled FROM preview_broker_settings WHERE id=1').first('enabled'),
  ).toBe(0);
});

it('recovers a lost retirement acknowledgement without forgetting the incarnation or requiring an artifact', async () => {
  const state = await stateStore();
  await apply(state, 2);
  const identity = (await retainedIdentity(state, 'pr-27'))!.identity;

  const lost: typeof fetch = async (url, init) => {
    const response = await fixture.fetcher(url, init);

    if (String(init?.body ?? '').includes('UPDATE preview_arenas SET closed_at'))
      throw new Error('Synthetic close lost acknowledgement');

    return response;
  };

  await expect(retireLifecycle(state, 'pr-27', identity, fixture.env, async () => {}, lost)).rejects.toThrow(
    'acknowledgement',
  );
  expect((await retainedIdentity(state, 'pr-27'))!.identity.retired).toBe(false);
  await rm(fixture.artifactDirectory, { recursive: true });
  await retireLifecycle(state, 'pr-27', identity, fixture.env, async () => {}, fixture.fetcher);
  await apply(state, 2, true);
  expect(await retainedIdentity(state, 'pr-27')).toBeUndefined();
});

it('fences a delayed old close after a concurrent retirement and same-proof cold refresh creates a new incarnation', async () => {
  const state = await stateStore();
  await apply(state, 2);
  const old = (await retainedIdentity(state, 'pr-27'))!.identity;
  let resume!: () => void;
  let captured!: () => void;

  const waiting = new Promise<void>((resolve) => {
    captured = resolve;
  });

  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });

  const delayed: typeof fetch = async (url, init) => {
    if (String(init?.body ?? '').includes('UPDATE preview_arenas SET closed_at')) {
      captured();
      await gate;
    }

    return fixture.fetcher(url, init);
  };

  const closing = retireLifecycle(state, 'pr-27', old, fixture.env, async () => {}, delayed);
  const rejected = expect(closing).rejects.toThrow('D1');

  try {
    await waiting;
    await retireLifecycle(state, 'pr-27', old, fixture.env, async () => {}, fixture.fetcher);
    // Retry the same verified proof/props without destroying the target stage.
    await apply(state, 2);
    expect((await retainedIdentity(state, 'pr-27'))!.identity.incarnation).not.toBe(old.incarnation);

    const publication = await registerLifecycle(
      state,
      verifiedRun(),
      fixture.artifact,
      fixture.env,
      async () => {},
      fixture.fetcher,
    );

    resume();
    await rejected;
    await verifySourcePublicationReadback(publication, fixture.fetcher);
  } finally {
    resume();
    await rejected.catch(() => {});
  }
});

it('refuses source capability/migration drift before publishing a key and safely destroys an incomplete create', async () => {
  const state = await stateStore();
  await fixture.sourceDB.exec('DROP TRIGGER preview_arena_retire');
  await expect(apply(state, 2)).rejects.toThrow();
  expect(await retainedIdentity(state, 'pr-27')).toBeUndefined();
  expect(await fixture.sourceDB.prepare('SELECT count(*) AS n FROM preview_arenas').first('n')).toBe(0);
  await apply(state, 2, true);
});

it('tombstones never-published state before destruction and rejects late old-incarnation cleanup after recreation', async () => {
  const state = await stateStore();
  await apply(state, 2);
  const old = (await retainedIdentity(state, 'pr-27'))!.identity;
  const before = fixture.requests.length;
  await retireLifecycle(state, 'pr-27', old, fixture.env, async () => {}, fixture.fetcher);

  const writes = fixture.requests
    .slice(before)
    .filter((call) => call.body.batch.some((query) => query.sql.includes('INSERT INTO preview_arenas')));

  expect(writes).toHaveLength(1);
  expect(writes[0].body.batch).toHaveLength(3);
  await apply(state, 2, true);
  await apply(state, 2);

  const publication = await registerLifecycle(
    state,
    verifiedRun(),
    fixture.artifact,
    fixture.env,
    async () => {},
    fixture.fetcher,
  );

  expect(publication.incarnation).not.toBe(old.incarnation);
  await expect(
    retireLifecycle(state, 'pr-27', old, fixture.env, async () => {}, fixture.fetcher),
  ).rejects.toThrow('generation changed');
  await verifySourcePublicationReadback(publication, fixture.fetcher);
});

it('keeps retry identity on source outage and closes immediately when eligibility changes after registration', async () => {
  const state = await stateStore();
  await apply(state, 2);
  const identity = (await retainedIdentity(state, 'pr-27'))!.identity;
  await expect(
    retireLifecycle(
      state,
      'pr-27',
      identity,
      fixture.env,
      async () => {},
      async () => new Response('unavailable', { status: 503 }),
    ),
  ).rejects.toThrow('failed');
  expect((await retainedIdentity(state, 'pr-27'))!.identity.retired).toBe(false);
  let count = 0;
  await expect(
    registerLifecycle(
      state,
      verifiedRun(),
      fixture.artifact,
      fixture.env,
      async () => {
        if (++count === 4) throw new Error('Synthetic synchronized head');
      },
      fixture.fetcher,
    ),
  ).rejects.toThrow('synchronized head');
  expect((await retainedIdentity(state, 'pr-27'))!.identity.retired).toBe(true);
  expect(
    await fixture.sourceDB
      .prepare('SELECT incarnation FROM preview_retired_arenas WHERE origin=? AND incarnation=?')
      .bind(lifecycleTargetOrigin, identity.incarnation)
      .first('incarnation'),
  ).toBe(identity.incarnation);
});
