import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  registerPreviewArtifacts,
  readPreviewArtifacts,
  parsePreviewArtifactManifest,
} from '../src/server/preview-artifacts';
import { sourcePreviewRoute } from '../src/server/preview-source';
import { closePreviewTarget, registerPreviewTarget } from '../src/server/preview-config';
import type { PreviewArtifactManifest } from '../src/shared/preview-artifacts';
import { applyPlatformMigrations } from './platform-migrations';

let env: Env;

let dispose: () => Promise<void>;

const source = 'https://source.example.test';

const commit = 'a'.repeat(40);

const archiveHash = 'b'.repeat(64);

const publicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .publicKey.export({ format: 'der', type: 'spki' })
  .toString('base64');

beforeAll(async () => {
  const platform = await getPlatformProxy<Env>({
    configPath: 'tests/storage.wrangler.jsonc',
    persist: false,
  });

  env = Object.assign(platform.env, { APP_URL: source, ENVIRONMENT: 'production', PREVIEW_SOURCE_URL: '' });
  dispose = platform.dispose;
  await applyPlatformMigrations(env.DB, [
    '0001_initial.sql',
    '0002_games.sql',
    '0003_agent_pictures.sql',
    '0004_preview_identity.sql',
    '0006_preview_artifacts.sql',
  ]);
});

afterAll(async () => {
  await dispose?.();
});

function manifest(target = `https://${randomUUID()}.example.test`): PreviewArtifactManifest {
  const archive = {
    url: `${target}/downloads/previews/${commit}/${archiveHash}.tgz`,
    sha256: archiveHash,
    bytes: 1000,
  };

  const text = (path: string) => ({ path, sha256: 'c'.repeat(64), bytes: 100 });

  return {
    version: 1,
    sourceOrigin: source,
    targetOrigin: target,
    incarnation: 'incarnation_123',
    commit,
    executable: {
      url: `${source}/downloads/agent-game-cli-0.3.0.tgz`,
      sha256: 'd'.repeat(64),
      bytes: 50000,
      version: '0.3.0',
      protocols: [1, 2],
    },
    games: [
      {
        gameId: 'secret-overlord',
        protocol: 1,
        rulesVersion: 'secret-overlord-1',
        archive,
        rules: text('package/public/rules.md'),
        skill: text('package/skills/agent-game/SKILL.md'),
        protocolFile: text('package/public/protocol.md'),
      },
      {
        gameId: 'succession',
        protocol: 2,
        rulesVersion: 'succession-1',
        archive,
        rules: text('package/public/games/succession/rules.md'),
        skill: text('package/skills/agent-game/SKILL.md'),
        protocolFile: text('package/public/games/succession/protocol.md'),
      },
    ],
  };
}

async function registerArena(input: PreviewArtifactManifest) {
  await registerPreviewTarget(env, {
    origin: input.targetOrigin,
    incarnation: input.incarnation,
    commit: input.commit,
    publicKey,
  });
}

it('publishes source-only byte identities and exposes a no-store, read-only discovery route', async () => {
  const input = manifest();
  await registerArena(input);
  await expect(readPreviewArtifacts(env, input.targetOrigin, commit)).rejects.toMatchObject({
    code: 'preview-artifacts-pending',
  });
  await registerPreviewArtifacts(env, input);
  const url = `${source}/api/preview/artifacts?${new URLSearchParams({ origin: input.targetOrigin, commit })}`;
  const response = await sourcePreviewRoute(new Request(url), env);
  expect(response?.headers.get('cache-control')).toBe('no-store');
  expect(await response?.json()).toEqual(input);
  expect(
    await sourcePreviewRoute(new Request(url, { method: 'POST', body: JSON.stringify(input) }), env),
  ).toBeNull();
});

it('retries equal manifests regardless of JSON key order and rejects concurrent identity replacement', async () => {
  const input = manifest();
  await registerArena(input);
  await registerPreviewArtifacts(env, input);

  const reordered = {
    games: input.games,
    executable: input.executable,
    commit,
    incarnation: input.incarnation,
    targetOrigin: input.targetOrigin,
    sourceOrigin: source,
    version: 1,
  };

  await expect(
    registerPreviewArtifacts(env, parsePreviewArtifactManifest(env, JSON.stringify(reordered))),
  ).resolves.toEqual(input);
  const altered = { ...input, executable: { ...input.executable, sha256: 'e'.repeat(64) } };

  const raced = await Promise.allSettled([
    registerPreviewArtifacts(env, input),
    registerPreviewArtifacts(env, altered),
  ]);

  expect(raced[0].status).toBe('fulfilled');
  expect(raced[1].status).toBe('rejected');
  expect(await readPreviewArtifacts(env, input.targetOrigin, commit)).toEqual(input);
  await expect(
    env.DB.prepare('UPDATE preview_artifacts SET manifest_json=? WHERE origin=?')
      .bind(JSON.stringify(altered), input.targetOrigin)
      .run(),
  ).rejects.toThrow('immutable');
});

it('atomically chooses one first publication and retains its identity through competing retries', async () => {
  const input = manifest();
  const competitor = { ...input, executable: { ...input.executable, sha256: 'e'.repeat(64) } };
  await registerArena(input);

  const results = await Promise.allSettled([
    registerPreviewArtifacts(env, input),
    registerPreviewArtifacts(env, competitor),
  ]);

  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const stored = await readPreviewArtifacts(env, input.targetOrigin, commit);
  expect([input.executable.sha256, competitor.executable.sha256]).toContain(stored.executable.sha256);
  await expect(registerPreviewArtifacts(env, stored)).resolves.toEqual(stored);
  expect(
    await env.DB.prepare('SELECT count(*) AS count FROM preview_artifacts WHERE origin=?')
      .bind(input.targetOrigin)
      .first('count'),
  ).toBe(1);
});

it('fences unpublished, stale-commit and retired-incarnation writes and reads', async () => {
  const input = manifest();
  await expect(registerPreviewArtifacts(env, input)).rejects.toMatchObject({ code: 'preview-target' });
  await registerArena(input);
  await registerPreviewArtifacts(env, input);
  await registerPreviewTarget(env, {
    origin: input.targetOrigin,
    incarnation: input.incarnation,
    commit: 'f'.repeat(40),
    publicKey,
  });
  await expect(readPreviewArtifacts(env, input.targetOrigin, commit)).rejects.toMatchObject({
    code: 'preview-artifacts-pending',
  });
  await expect(registerPreviewArtifacts(env, input)).rejects.toMatchObject({ code: 'preview-target' });
  await closePreviewTarget(env, input.targetOrigin, input.incarnation);
  await expect(readPreviewArtifacts(env, input.targetOrigin, commit)).rejects.toMatchObject({
    code: 'preview-artifacts-pending',
  });
  await expect(registerPreviewArtifacts(env, input)).rejects.toMatchObject({ code: 'preview-target' });
});

it('rejects target executables, redirected origins, traversal, wrong game paths and unbounded metadata', async () => {
  const input = manifest();
  const game = input.games[0];

  const invalid = [
    { ...input, sourceOrigin: input.targetOrigin },
    {
      ...input,
      executable: { ...input.executable, url: `${input.targetOrigin}/downloads/agent-game-cli-0.3.0.tgz` },
    },
    { ...input, executable: { ...input.executable, url: `${input.executable.url}?redirect=1` } },
    { ...input, executable: { ...input.executable, bytes: 2 * 1024 * 1024 + 1 } },
    { ...input, games: [game, game] },
    {
      ...input,
      games: [
        { ...game, rules: { ...game.rules, path: 'package/public/../../cli/agent-game.mjs' } },
        input.games[1],
      ],
    },
    {
      ...input,
      games: [
        { ...game, archive: { ...game.archive, url: `${source}/downloads/branch.tgz` } },
        input.games[1],
      ],
    },
    { ...input, games: [{ ...game, skill: { ...game.skill, bytes: 128 * 1024 + 1 } }, input.games[1]] },
    { ...input, games: [{ ...game, skill: { ...game.skill, sha256: 'e'.repeat(64) } }, input.games[1]] },
  ];

  for (const value of invalid)
    expect(() => parsePreviewArtifactManifest(env, JSON.stringify(value))).toThrowError(
      expect.objectContaining({ code: 'preview-artifacts', status: 400 }),
    );

  for (const json of ['{', ' '.repeat(16385)])
    expect(() => parsePreviewArtifactManifest(env, json)).toThrowError(
      expect.objectContaining({ code: 'preview-artifacts', status: 400 }),
    );
  await expect(readPreviewArtifacts(env, '', commit)).rejects.toMatchObject({ status: 400 });
  const targetEnv = { ...env, PREVIEW_SOURCE_URL: source };
  await expect(registerPreviewArtifacts(targetEnv, input)).rejects.toMatchObject({ status: 400 });
  expect(await sourcePreviewRoute(new Request(`${source}/api/preview/artifacts`), targetEnv)).toBeNull();
});
