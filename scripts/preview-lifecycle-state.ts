import { Effect, Redacted, Schema } from 'effect';
import { Resource } from 'alchemy/Resource';
import * as Provider from 'alchemy/Provider';
import { State } from 'alchemy/State';
import { Stage } from 'alchemy/Stage';
import type { StateService } from 'alchemy/State';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { sealPreview, openPreview } from '../src/server/preview-config.ts';
import { requireCondition } from './preview-artifact.ts';
import { previewD1, databaseIdPattern } from './preview-d1.ts';
import { verifySourceExecutable } from './preview-publication.ts';
import type { SourceExecutable } from './preview-publication.ts';
import { boundedResponse } from './preview-github.ts';

export const lifecycleResourceId = 'PreviewIdentity';

const SourceOutput = Schema.Struct({
  databaseId: Schema.String.check(Schema.isPattern(databaseIdPattern)),
  sourceOrigin: Schema.String,
  previewBridgeVersion: Schema.Literal(1),
});

const TargetOutput = Schema.Struct({
  databaseId: Schema.String.check(Schema.isPattern(databaseIdPattern)),
  workerName: Schema.String,
  url: Schema.String,
});

const Released = Schema.Struct({
  sourceOrigin: Schema.String,
  executable: Schema.Struct({
    url: Schema.String,
    sha256: Schema.String,
    bytes: Schema.Number,
    version: Schema.String,
    protocols: Schema.Tuple([Schema.Literal(1), Schema.Literal(2)]),
  }),
});

export function bridgeSettings(env: NodeJS.ProcessEnv) {
  if (env.PREVIEW_IDENTITY_ENABLED !== 'true') return undefined;
  const text = env.PREVIEW_SOURCE_RELEASE ?? '';
  requireCondition(
    Buffer.byteLength(text) <= 4096 && text.length > 0,
    'Configure the independently released source CLI pin before enabling preview identity',
  );
  const settings = Schema.decodeUnknownSync(Released)(JSON.parse(text), { onExcessProperty: 'error' });
  const origin = new URL(settings.sourceOrigin);
  requireCondition(
    origin.protocol === 'https:' && origin.origin === settings.sourceOrigin,
    'Invalid trusted source origin',
  );

  return settings;
}

export interface PreviewIdentityState {
  version: 1;
  accountId: string;
  sourceOrigin: string;
  sourceDatabaseId: string;
  targetOrigin: string;
  incarnation: string;
  publicKey: string;
  encryptedKey: Redacted.Redacted<string>;
  retired: boolean;
  runId: number;
  runAttempt: number;
  builtCommit: string;
  prHeadSha: string;
}

const IdentityState = Schema.Struct({
  version: Schema.Literal(1),
  accountId: Schema.String,
  sourceOrigin: Schema.String,
  sourceDatabaseId: Schema.String.check(Schema.isPattern(databaseIdPattern)),
  targetOrigin: Schema.String,
  incarnation: Schema.String,
  publicKey: Schema.String,
  encryptedKey: Schema.Redacted(Schema.String),
  retired: Schema.Boolean,
  runId: Schema.Number,
  runAttempt: Schema.Number,
  builtCommit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  prHeadSha: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
});

export interface IdentityProps {
  targetOrigin: string;
  authSecret: Redacted.Redacted<string>;
  runId: number;
  runAttempt: number;
  controllerRun: string;
  builtCommit: string;
  prHeadSha: string;
}

export type PreviewIdentity = Resource<'AgentGame.PreviewIdentity', IdentityProps, PreviewIdentityState>;

export const PreviewIdentity = Resource<PreviewIdentity>('AgentGame.PreviewIdentity');

export async function sourceResources(state: StateService, sourceOrigin: string) {
  const source = Schema.decodeUnknownSync(SourceOutput)(
    await Effect.runPromise(state.getOutput({ stack: 'agent-game', stage: 'prod' })),
  );

  requireCondition(
    source.sourceOrigin === sourceOrigin,
    'Source origin differs from trusted production state',
  );

  return source;
}

export async function targetResources(state: StateService, prNumber: number, identity: PreviewIdentityState) {
  requireCondition(Number.isSafeInteger(prNumber) && prNumber > 0, 'Invalid target stage');

  const target = Schema.decodeUnknownSync(TargetOutput)(
    await Effect.runPromise(state.getOutput({ stack: 'agent-game', stage: `pr-${prNumber}` })),
  );

  requireCondition(
    target.workerName === `agent-game-pr-${prNumber}` &&
      target.url === identity.targetOrigin &&
      target.databaseId !== identity.sourceDatabaseId,
    'Target output differs from verified isolated stage',
  );

  return target;
}

export async function sourceCapabilities(
  sourceOrigin: string,
  targetOrigin: string,
  executable: SourceExecutable,
  fetcher: typeof fetch,
) {
  await verifySourceExecutable(sourceOrigin, executable, fetcher);
  const url = new URL('/api/preview/artifacts', sourceOrigin);
  url.search = new URLSearchParams({ origin: targetOrigin, commit: '0'.repeat(40) }).toString();
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  requireCondition(
    response.status === 503 && response.headers.get('cache-control') === 'no-store',
    'Source preview dispatcher is not ready',
  );

  const pending = Schema.decodeUnknownSync(
    Schema.Struct({ error: Schema.Struct({ code: Schema.Literal('preview-artifacts-pending') }) }),
  )(JSON.parse((await boundedResponse(response, 16 * 1024)).toString('utf8')));

  return pending.error.code;
}

export const previewIdentityProvider = (env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) =>
  Provider.effect(
    PreviewIdentity,
    Effect.gen(function* () {
      const state = yield* yield* State;
      const stage = yield* Stage;

      return {
        read: ({ output }) => Effect.succeed(output),
        reconcile: ({ news, output }) =>
          Effect.promise(async () => {
            requireCondition(
              /^pr-[1-9]\d*$/.test(stage) &&
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.WORKERS_SUBDOMAIN ?? '') &&
                news.targetOrigin === `https://agent-game-${stage}.${env.WORKERS_SUBDOMAIN}.workers.dev`,
              'Identity origin differs from trusted stage',
            );
            const settings = bridgeSettings(env);
            requireCondition(settings !== undefined, 'Preview identity activation is disabled');
            const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? '';
            const source = await sourceResources(state, settings.sourceOrigin);
            const db = previewD1(accountId, source.databaseId, env.CLOUDFLARE_API_TOKEN ?? '', fetcher);
            await sourceCapabilities(source.sourceOrigin, news.targetOrigin, settings.executable, fetcher);

            const capabilities = await db.batch([
              db.prepare('SELECT origin FROM preview_retired_arenas LIMIT 1'),
              db.prepare('SELECT origin FROM preview_artifacts LIMIT 1'),
              db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='trigger' AND name IN ('preview_arena_retire','preview_arena_delete') ORDER BY name",
              ),
            ]);

            const triggers = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ sql: Schema.String })))(
              capabilities[2].results,
            );

            requireCondition(
              triggers.length === 2 && triggers.every((trigger) => /WHERE NOT EXISTS/i.test(trigger.sql)),
              'Source retirement migration is not ready',
            );

            if (output) {
              requireCondition(
                output.accountId === accountId &&
                  output.sourceOrigin === source.sourceOrigin &&
                  output.sourceDatabaseId === source.databaseId &&
                  output.targetOrigin === news.targetOrigin,
                'Retire the existing identity before changing source or target resources',
              );
              requireCondition(
                news.runId > output.runId ||
                  (news.runId === output.runId && news.runAttempt >= output.runAttempt),
                'Older delivery cannot replace retained lifecycle state',
              );

              const retired = await db
                .prepare('SELECT incarnation FROM preview_retired_arenas WHERE origin=? AND incarnation=?')
                .bind(output.targetOrigin, output.incarnation)
                .first();

              if (!output.retired && !retired) {
                await openPreview(
                  { BETTER_AUTH_SECRET: Redacted.value(news.authSecret) },
                  Redacted.value(output.encryptedKey),
                );

                return {
                  ...output,
                  runId: news.runId,
                  runAttempt: news.runAttempt,
                  builtCommit: news.builtCommit,
                  prHeadSha: news.prHeadSha,
                };
              }
            }

            const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
            const privateKey = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

            return {
              version: 1 as const,
              accountId,
              sourceOrigin: source.sourceOrigin,
              sourceDatabaseId: source.databaseId,
              targetOrigin: news.targetOrigin,
              incarnation: randomUUID(),
              publicKey: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
              encryptedKey: Redacted.make(
                await sealPreview({ BETTER_AUTH_SECRET: Redacted.value(news.authSecret) }, privateKey),
              ),
              retired: false,
              runId: news.runId,
              runAttempt: news.runAttempt,
              builtCommit: news.builtCommit,
              prHeadSha: news.prHeadSha,
            };
          }),
        // The controller retires the exact source incarnation BEFORE entering the
        // destroy plan. Refuse deletion if that durable acknowledgement is absent.
        delete: ({ output }) =>
          Effect.sync(() =>
            requireCondition(
              !output || output.retired,
              'Source incarnation must be retired before deleting identity state',
            ),
          ),
      };
    }),
  );

export async function retainedIdentity(state: StateService, stage: string) {
  requireCondition(/^pr-[1-9]\d*$/.test(stage), 'Invalid retained preview stage');
  const record = await Effect.runPromise(state.get({ stack: 'agent-game', stage, fqn: lifecycleResourceId }));

  if (!record) return undefined;
  requireCondition(
    'resourceType' in record &&
      record.resourceType === PreviewIdentity.Type &&
      record.fqn === lifecycleResourceId &&
      (record.attr !== undefined || record.status === 'creating'),
    'Unresolved retained preview identity; recover deployment before cleanup',
  );

  // Source registration starts only after apply persists this resource's key.
  if (record.attr === undefined) return undefined;

  return { record, identity: Schema.decodeUnknownSync(IdentityState)(record.attr) };
}

export async function markIdentityRetired(state: StateService, stage: string, incarnation: string) {
  const current = await retainedIdentity(state, stage);
  requireCondition(
    current !== undefined && current.identity.incarnation === incarnation,
    'Lifecycle generation changed before retirement acknowledgement',
  );
  await Effect.runPromise(
    state.set({
      stack: 'agent-game',
      stage,
      fqn: lifecycleResourceId,
      value: { ...current.record, attr: { ...current.identity, retired: true } },
    }),
  );
}
