import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
  truncate,
  chmod,
  open,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { Effect, Schema } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import { readPrebuiltWorkerBundle } from '../node_modules/alchemy/lib/Cloudflare/Workers/Sources/Prebuilt.js';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  allowedPath,
  canonical,
  limits,
  sha256,
  snapshotArtifact,
  validateArtifact,
} from '../scripts/preview-artifact.ts';
import type { Manifest } from '../scripts/preview-artifact.ts';
import { version } from '../package.json';

let scratch: string;

let source: string;

let manifest: Manifest;

beforeAll(async () => {
  await mkdir('.tim27-deploy/runs', { recursive: true });
  scratch = await mkdtemp(resolve('.tim27-deploy/runs/artifact-'));
  source = resolve(scratch, 'build');
  execFileSync(process.execPath, ['scripts/produce-preview-artifact.ts', source], {
    env: {
      ...process.env,
      GITHUB_SHA: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      GITHUB_REPOSITORY: 'TimothyKrell/agent-game',
      GITHUB_RUN_ID: '100',
      GITHUB_RUN_ATTEMPT: '2',
      PR_HEAD_SHA: '1'.repeat(40),
    },
    stdio: 'pipe',
    timeout: 60_000,
  });
  manifest = (await validateArtifact(source)).manifest;
}, 90_000);

async function copy() {
  const directory = await mkdtemp(resolve(scratch, 'case-'));
  await cp(source, directory, { recursive: true });

  return directory;
}

async function replaceFile(directory: string, name: string, content: string) {
  await mkdir(resolve(directory, name, '..'), { recursive: true });
  await writeFile(resolve(directory, name), content);

  const files = [
    ...manifest.files.filter((file) => file.path !== name),
    { path: name, bytes: Buffer.byteLength(content), sha256: sha256(content) },
  ].sort((a, b) => (a.path < b.path ? -1 : 1));

  await writeFile(resolve(directory, 'manifest.json'), canonical({ ...manifest, files }));
}

describe('real application preview artifact', () => {
  it('preserves exact bundle/module, static asset, versioned CLI/rules and migration bytes through Alchemy prebuilt input', async () => {
    const destination = resolve(scratch, 'snapshot');
    const validated = await snapshotArtifact(source, destination);

    const bundled = await Effect.runPromise(
      readPrebuiltWorkerBundle({
        main: resolve(destination, validated.manifest.entry),
        rules: [
          {
            globs: validated.manifest.files.flatMap((file) =>
              file.path.startsWith('worker/') ? [file.path.slice(7)] : [],
            ),
          },
        ],
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );

    expect(bundled.files.length).toBe(
      validated.manifest.files.filter((file) => file.path.startsWith('worker/')).length,
    );

    for (const file of bundled.files) {
      expect(sha256(file.content)).toBe(
        validated.manifest.files.find((item) => item.path === `worker/${file.path}`)?.sha256,
      );
    }

    expect((await validateArtifact(destination)).manifestSha256).toBe(validated.manifestSha256);
    expect(manifest.files.some((file) => file.path === 'migrations/0003_agent_pictures.sql')).toBe(true);
    expect(manifest.files.some((file) => file.path === 'assets/downloads/agent-game-cli-0.1.1.tgz')).toBe(
      true,
    );
    expect(
      manifest.files.some((file) => file.path === `assets/downloads/agent-game-cli-${version}.tgz`),
    ).toBe(true);
    expect(allowedPath('assets/assets/succession-dossier-a123.js')).toBe(true);
  });

  it('runs actual prebuilt Worker health, DO exports, D1 migrations and local owner/R2 upload without bundling', async () => {
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        scriptPath: resolve(source, 'worker/worker.js'),
        modulesRoot: resolve(source, 'worker'),
        compatibilityDate: '2026-09-10',
        compatibilityFlags: ['nodejs_compat'],
        port: 0,
        inspectorPort: 0,
        d1Databases: ['DB'],
        r2Buckets: ['AGENT_PICTURES'],
        durableObjects: {
          MATCHES: { className: 'MatchObject', useSQLite: true },
          MATCHMAKING: { className: 'MatchmakingObject', useSQLite: true },
          HOUSE_SEATS: { className: 'HouseSeatObject', useSQLite: true },
        },
        // Development login is exercised only in this loopback-only local runtime.
        // Hosted preview continues to omit it and source registration is a future seam.
        bindings: {
          ENVIRONMENT: 'development',
          APP_URL: 'http://127.0.0.1:6321',
          HOUSE_PROVIDER: 'preview',
          HOUSE_MODEL: 'scripted',
          TIME_SCALE: '0.1',
          HOUSE_DAILY_BUDGET_USD: '0',
          HOUSE_MATCH_RESERVATION_USD: '0',
          MAX_CONCURRENT_MATCHES: '2',
          QUEUE_WAIT_SECONDS: '30',
          BETTER_AUTH_SECRET: 'local-prebuilt-worker-test-secret-at-least-32-characters',
        },
        assets: {
          directory: resolve(source, 'assets'),
          binding: 'ASSETS',
          run_worker_first: ['/api/*', '/agents.md', '/rules.md'],
          routerConfig: { has_user_worker: true },
          assetConfig: { not_found_handling: 'single-page-application' },
        },
      }),
    );

    try {
      const db = await runtime.getD1Database('DB');

      for (const file of manifest.files.filter((file) => file.path.startsWith('migrations/'))) {
        const sql = await readFile(resolve(source, file.path), 'utf8');
        await db.exec(sql.replace(/--[^\n]*/g, '').replaceAll('\n', ' '));
      }

      const request = (path: string, options?: Parameters<Miniflare['dispatchFetch']>[1]) =>
        runtime.dispatchFetch(`http://127.0.0.1:6321${path}`, options);

      const health = await request('/api/health');
      expect(health.status, await health.clone().text()).toBe(200);
      expect((await request('/rules.md')).status).toBe(200);
      expect((await request(`/downloads/agent-game-cli-${version}.tgz`)).status).toBe(200);

      const login = await request('/api/dev/login', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:6321', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Prebuilt Owner' }),
      });

      expect(login.status, await login.clone().text()).toBe(200);

      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');

      const created = await request('/api/owner/agents', {
        method: 'POST',
        headers: { cookie, origin: 'http://127.0.0.1:6321', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Prebuilt Portrait' }),
      });

      expect(created.status, await created.clone().text()).toBe(201);
      const profile = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await created.json());

      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64',
      );

      const upload = await request(`/api/owner/agents/${profile.id}/picture`, {
        method: 'PUT',
        headers: {
          cookie,
          origin: 'http://127.0.0.1:6321',
          'content-type': 'image/png',
          'if-match': '"0"',
          'idempotency-key': crypto.randomUUID(),
        },
        body: png,
      });

      expect(upload.status, await upload.clone().text()).toBe(200);
      const picture = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(await upload.json());
      expect(Buffer.from(await (await request(picture.url)).arrayBuffer())).toEqual(png);
      expect((await (await runtime.getR2Bucket('AGENT_PICTURES')).list()).objects).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  }, 60_000);

  it('does not execute a malicious PR entry or companion module in the credentialed prebuilt reader (with positive execution control)', async () => {
    const directory = await copy();
    const marker = resolve(directory, 'executed');
    const attack = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, process.env.DEPLOY_TEST_CANARY); export default {}; export class MatchObject {} export class MatchmakingObject {} export class HouseSeatObject {}`;
    await replaceFile(directory, 'worker/worker.js', attack);
    await validateArtifact(directory);
    const previous = process.env.DEPLOY_TEST_CANARY;
    process.env.DEPLOY_TEST_CANARY = 'synthetic-token-never-a-real-secret';

    try {
      const bundle = await Effect.runPromise(
        readPrebuiltWorkerBundle({ main: resolve(directory, 'worker/worker.js') }).pipe(
          Effect.provide(NodeFileSystem.layer),
        ),
      );

      expect(sha256(bundle.files[0].content)).toBe(sha256(attack));
      await expect(readFile(marker)).rejects.toThrow();
      // This control demonstrates the same PR payload would capture the canary if
      // the deployer imported/executed it. It runs in a sacrificial local process.
      execFileSync(process.execPath, [resolve(directory, 'worker/worker.js')], {
        env: { ...process.env, DEPLOY_TEST_CANARY: 'positive-control' },
      });
      expect(await readFile(marker, 'utf8')).toBe('positive-control');
    } finally {
      if (previous === undefined) delete process.env.DEPLOY_TEST_CANARY;
      else process.env.DEPLOY_TEST_CANARY = previous;
    }
  });

  it('keeps additional raw modules named relative to the built entry directory', async () => {
    const directory = await copy();
    await replaceFile(directory, 'worker/modules/extra.mjs', 'export const value = "raw module bytes";\n');
    const validated = await validateArtifact(directory);

    const bundled = await Effect.runPromise(
      readPrebuiltWorkerBundle({
        main: resolve(directory, 'worker/worker.js'),
        rules: [
          {
            globs: validated.manifest.files.flatMap((file) =>
              file.path.startsWith('worker/') ? [file.path.slice(7)] : [],
            ),
          },
        ],
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );

    expect(bundled.files.map((file) => file.path)).toContain('modules/extra.mjs');
    expect(bundled.files.find((file) => file.path === 'modules/extra.mjs')?.hash).toBe(
      sha256('export const value = "raw module bytes";\n'),
    );
  });

  it.each([
    'worker/../../alchemy.run.ts',
    '/etc/passwd',
    'assets/_headers',
    'assets/.npmrc',
    'assets/assets/succession-replay-fixture.js',
    'assets/assets/capture-tools.js',
    'worker/plugin.ts',
    'assets/assets/Agentation.js',
    'worker/evil\\path.js',
  ])('rejects unexpected path %s', async (path) => {
    const directory = await copy();
    await writeFile(
      resolve(directory, 'manifest.json'),
      canonical({ ...manifest, files: [{ path, bytes: 0, sha256: sha256('') }] }),
    );
    await expect(validateArtifact(directory)).rejects.toThrow();
  });

  it('rejects tampering, extra files, missing modules/exports, and actual retained fixture payloads', async () => {
    const tampered = await copy();
    await writeFile(resolve(tampered, 'assets/index.html'), 'changed');
    await expect(validateArtifact(tampered)).rejects.toThrow('hash/size');
    const extra = await copy();
    await writeFile(resolve(extra, 'alchemy.run.ts'), 'throw new Error("must not execute")');
    await expect(validateArtifact(extra)).rejects.toThrow('Unexpected artifact files');
    const graph = await copy();
    await replaceFile(
      graph,
      'worker/worker.js',
      'export { default, MatchObject, MatchmakingObject, HouseSeatObject } from "./missing.js";',
    );
    await expect(validateArtifact(graph)).rejects.toThrow('Missing Worker module');
    const exports = await copy();
    await replaceFile(exports, 'worker/worker.js', 'export default {};');
    await expect(validateArtifact(exports)).rejects.toThrow('Missing built Worker export');
    const fixture = await copy();
    await replaceFile(
      fixture,
      'assets/assets/succession-dossier-legitimate.js',
      'const example = "Nomination, dialogue, ballots, policy & investigation";',
    );
    await expect(validateArtifact(fixture)).rejects.toThrow('fixture payload');
  });

  it('rejects duplicate/ambiguous manifests, oversized metadata and actual bytes, directories and symlinks', async () => {
    const ambiguous = await copy();
    await writeFile(
      resolve(ambiguous, 'manifest.json'),
      canonical(manifest).replace('"version": 1,', '"version": 1, "version": 1,'),
    );
    await expect(validateArtifact(ambiguous)).rejects.toThrow('ambiguous');
    const large = await copy();
    await truncate(resolve(large, 'worker/worker.js'), limits.fileBytes + 1);
    await expect(validateArtifact(large)).rejects.toThrow('size');
    await writeFile(
      resolve(large, 'manifest.json'),
      canonical({ ...manifest, files: Array.from({ length: limits.files + 1 }, () => manifest.files[0]) }),
    );
    await expect(validateArtifact(large)).rejects.toThrow('inventory');
    const linked = await copy();
    await rm(resolve(linked, 'assets/index.html'));
    await symlink(resolve(source, 'assets/index.html'), resolve(linked, 'assets/index.html'));
    await expect(validateArtifact(linked)).rejects.toThrow();
    const linkedDirectory = await copy();
    await rm(resolve(linkedDirectory, 'assets'), { recursive: true });
    await symlink(resolve(source, 'assets'), resolve(linkedDirectory, 'assets'));
    await expect(validateArtifact(linkedDirectory)).rejects.toThrow('ancestor');
    const empty = await copy();
    await mkdir(resolve(empty, 'empty'));
    await expect(validateArtifact(empty)).rejects.toThrow('directories');
  });

  it('rejects artifact-supplied authority and aggregate payloads beyond the byte budget', async () => {
    const authority = await copy();
    await writeFile(
      resolve(authority, 'manifest.json'),
      canonical({
        ...manifest,
        prNumber: 1,
        workerName: 'agent-game',
        origin: 'https://production.invalid',
        token: 'attacker-controlled',
      }),
    );
    await expect(validateArtifact(authority)).rejects.toThrow();
    const directory = await copy();
    const bytes = Buffer.alloc(limits.fileBytes);
    const files = [...manifest.files];

    for (let index = 0; index < 7; index++) {
      const path = `assets/large-${index}.png`;
      await writeFile(resolve(directory, path), bytes);
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }

    files.sort((a, b) => (a.path < b.path ? -1 : 1));
    await writeFile(resolve(directory, 'manifest.json'), canonical({ ...manifest, files }));
    await expect(validateArtifact(directory)).rejects.toThrow('Artifact byte limit');
  });

  it('rejects an artifact being mutated concurrently instead of copying a moving file tree', async () => {
    const directory = await copy();
    const handle = await open(resolve(directory, 'worker/worker.js'), 'r+');
    const byte = Buffer.from('!');
    await handle.write(byte, 0, 1, 0);
    let writing = true;

    const writer = (async () => {
      while (writing) await handle.write(byte, 0, 1, 0);
    })();

    try {
      await expect(validateArtifact(directory)).rejects.toThrow(/changed|hash/);
    } finally {
      writing = false;
      await writer;
      await handle.close();
    }
  });

  it.each(['../escape', '/absolute', 'dup', 'symlink', 'oversize'])(
    'rejects ZIP %s before privileged deployment',
    async (attack) => {
      const directory = await mkdtemp(resolve(scratch, 'zip-'));
      const archive = resolve(directory, 'artifact.zip');
      execFileSync(
        'python3',
        [
          '-c',
          `import sys,zipfile,stat
with zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED) as z:
    name=sys.argv[2]
    info=zipfile.ZipInfo('worker/attack.js' if name in ('symlink','oversize') else name)
    if name=='symlink': info.external_attr=(stat.S_IFLNK | 0o777)<<16
    z.writestr(info, b'x'*(17*1024*1024) if name=='oversize' else b'payload')
    if name=='dup': z.writestr(info, b'duplicate')`,
          archive,
          attack,
        ],
        { stdio: 'pipe' },
      );
      const digest = sha256(await readFile(archive));
      expect(() =>
        execFileSync(
          'python3',
          ['scripts/preview-extract.py', archive, resolve(directory, 'quarantine'), digest],
          { stdio: 'pipe' },
        ),
      ).toThrow();
      await expect(readFile(resolve(directory, 'quarantine/manifest.json'))).rejects.toThrow();
    },
  );

  it('extracts a GitHub-style ZIP to a new quarantine and rejects a wrong archive digest', async () => {
    const directory = await mkdtemp(resolve(scratch, 'zip-good-'));
    const archive = resolve(directory, 'artifact.zip');
    execFileSync('python3', [
      '-c',
      `import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for path in sorted(root.rglob('*')):
        if path.is_file(): z.write(path, path.relative_to(root))`,
      source,
      archive,
    ]);
    expect(() =>
      execFileSync(
        'python3',
        ['scripts/preview-extract.py', archive, resolve(directory, 'bad'), '0'.repeat(64)],
        { stdio: 'pipe' },
      ),
    ).toThrow();
    execFileSync('python3', [
      'scripts/preview-extract.py',
      archive,
      resolve(directory, 'good'),
      sha256(await readFile(archive)),
    ]);
    expect((await validateArtifact(resolve(directory, 'good'))).manifest).toEqual(manifest);
    await chmod(resolve(directory, 'good'), 0o700);
  });
});
