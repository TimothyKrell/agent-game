// Explicit local integration against the parent's accepted source commit. This
// harness imports real source lifecycle/route code and uses real local D1; it
// never writes the parent checkout or configures a hosted source/target.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { validateArtifact, sha256, canonical } from '../scripts/preview-artifact.ts';
import {
  previewArtifactPublication,
  verifySourceExecutable,
  verifySourcePublicationReadback,
} from '../scripts/preview-publication.ts';

assert(
  !process.env.CLOUDFLARE_API_TOKEN && !process.env.PREVIEW_DEPLOY_TOKEN,
  'Local check must not receive deployer credentials',
);

const [rootArg, artifactArg, releaseArg] = process.argv.slice(2);

assert(
  rootArg && artifactArg && releaseArg,
  'Provide parent checkout, produced artifact directory and its source 0.3.0 archive',
);

const parent = resolve(rootArg);

const artifact = await validateArtifact(resolve(artifactArg));

const releaseBytes = await readFile(resolve(releaseArg));

const sourceCommit = execFileSync('git', ['rev-parse', 'dc60060^{commit}'], {
  cwd: parent,
  encoding: 'utf8',
}).trim();

await mkdir('.tim27-deploy/runs', { recursive: true });

const scratch = await mkdtemp(resolve('.tim27-deploy/runs/source-registry-'));

const sourceTree = resolve(scratch, 'source');

await mkdir(sourceTree);

execFileSync(
  'git',
  [
    'archive',
    '--format=tar',
    `--output=${resolve(scratch, 'source.tar')}`,
    sourceCommit,
    'src',
    'migrations',
    'package.json',
    'tests/platform-migrations.ts',
  ],
  { cwd: parent },
);

execFileSync('tar', ['-xf', resolve(scratch, 'source.tar'), '-C', sourceTree]);

const modulePath = resolve(scratch, 'source.mjs');

await build({
  stdin: {
    contents:
      "export {parsePreviewArtifactManifest, registerPreviewArtifacts} from './src/server/preview-artifacts'; export {sourcePreviewRoute} from './src/server/preview-source'; export {registerPreviewTarget, closePreviewTarget} from './src/server/preview-config'; export {applyPlatformMigrations} from './tests/platform-migrations';",
    resolveDir: sourceTree,
  },
  outfile: modulePath,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
});

const sourceCode = await import(pathToFileURL(modulePath).href);

const sourceOrigin = 'https://source.example.test';

const workerConfig = resolve(scratch, 'wrangler.json');

const workerOutput = resolve(scratch, 'worker');

await writeFile(
  workerConfig,
  canonical({
    name: 'local-preview-registry',
    main: resolve(sourceTree, 'src/server/worker.ts'),
    compatibility_date: '2026-09-10',
    compatibility_flags: ['nodejs_compat'],
  }),
);

execFileSync(
  process.execPath,
  [
    resolve('node_modules/wrangler/bin/wrangler.js'),
    'deploy',
    '--dry-run',
    '--config',
    workerConfig,
    '--outdir',
    workerOutput,
    '--no-autoconfig',
  ],
  { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'pipe' },
);

const sourceAssets = resolve(scratch, 'source-assets');

await mkdir(resolve(sourceAssets, 'downloads'), { recursive: true });

await writeFile(resolve(sourceAssets, 'downloads/agent-game-cli-0.3.0.tgz'), releaseBytes);

const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: resolve(workerOutput, 'worker.js'),
    compatibilityDate: '2026-09-10',
    compatibilityFlags: ['nodejs_compat'],
    port: 0,
    inspectorPort: 0,
    d1Databases: ['DB'],
    durableObjects: {
      MATCHES: { className: 'MatchObject', useSQLite: true },
      MATCHMAKING: { className: 'MatchmakingObject', useSQLite: true },
      HOUSE_SEATS: { className: 'HouseSeatObject', useSQLite: true },
    },
    bindings: { APP_URL: sourceOrigin, ENVIRONMENT: 'production', PREVIEW_SOURCE_URL: '' },
    assets: {
      directory: sourceAssets,
      binding: 'ASSETS',
      run_worker_first: ['/api/*'],
      routerConfig: { has_user_worker: true },
    },
  }),
);

const publicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .publicKey.export({ format: 'der', type: 'spki' })
  .toString('base64');

const results = [];

try {
  const env = {
    DB: await runtime.getD1Database('DB'),
    APP_URL: sourceOrigin,
    ENVIRONMENT: 'production',
    PREVIEW_SOURCE_URL: '',
  };

  const previous = process.cwd();

  try {
    process.chdir(sourceTree);
    await sourceCode.applyPlatformMigrations(env.DB, [
      '0001_initial.sql',
      '0002_games.sql',
      '0003_agent_pictures.sql',
      '0004_preview_identity.sql',
      '0006_preview_artifacts.sql',
    ]);
  } finally {
    process.chdir(previous);
  }

  // These are local byte pins from the parent-owned packaged source release,
  // not a claim that this 0.3.0 archive has been released on the hosted source.
  const executable = await verifySourceExecutable(
    sourceOrigin,
    {
      url: `${sourceOrigin}/downloads/agent-game-cli-0.3.0.tgz`,
      bytes: releaseBytes.length,
      sha256: sha256(releaseBytes),
      version: '0.3.0',
      protocols: [1, 2],
    },
    (url, init) => runtime.dispatchFetch(String(url), init),
  );

  results.push('real source asset download matches independently supplied source executable pin');

  // No GitHub call is forged by this harness: run eligibility is separately
  // covered by the verifier tests. Here the local producer's synthetic identity
  // fields are explicitly carried into the registry mapping integration check.
  const verified = {
    repository: artifact.manifest.repository,
    runId: artifact.manifest.runId,
    runAttempt: artifact.manifest.runAttempt,
    prHeadSha: artifact.manifest.prHeadSha,
    builtCommit: artifact.manifest.builtCommit,
    prNumber: 27,
  };

  const publication = previewArtifactPublication(verified, artifact, {
    subdomain: 'tk-d86',
    sourceOrigin,
    incarnation: 'local_content_incarnation',
    executable,
  });

  const typed = sourceCode.parsePreviewArtifactManifest(env, JSON.stringify(publication));
  assert.deepEqual(typed, publication);
  const requestUrl = new URL('/api/preview/artifacts', sourceOrigin);
  requestUrl.search = new URLSearchParams({
    origin: publication.targetOrigin,
    commit: publication.commit,
  }).toString();

  const sourceGet = (url, init) => {
    assert.equal(String(url), requestUrl.href);
    assert.equal(init.redirect, 'error');

    return runtime.dispatchFetch(String(url), init);
  };

  async function pending() {
    const response = await sourceGet(requestUrl, { redirect: 'error' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).error.code, 'preview-artifacts-pending');
  }

  await pending();
  await sourceCode.registerPreviewTarget(env, {
    origin: publication.targetOrigin,
    incarnation: publication.incarnation,
    commit: publication.commit,
    publicKey,
  });
  await pending();
  await sourceCode.registerPreviewArtifacts(env, typed);
  await verifySourcePublicationReadback(publication, sourceGet);
  await assert.rejects(
    verifySourcePublicationReadback(
      { ...publication, executable: { ...publication.executable, sha256: 'f'.repeat(64) } },
      sourceGet,
    ),
    /differs from verified publication/,
  );
  assert.equal((await sourceGet(requestUrl, { redirect: 'error' })).headers.get('cache-control'), 'no-store');
  results.push(
    'actual full source Worker GET transitions 503/no-store pending -> exact numeric-protocol manifest after D1 publication',
  );
  assert.equal(publication.games[0].archive.sha256, artifact.branchContent.archive.sha256);
  assert.equal(publication.games[0].archive.url, publication.games[1].archive.url);
  assert.equal(publication.games[0].skill.sha256, publication.games[1].skill.sha256);
  assert.deepEqual(publication.executable, executable);
  await sourceCode.registerPreviewArtifacts(
    env,
    sourceCode.parsePreviewArtifactManifest(
      env,
      JSON.stringify({ games: publication.games, ...publication }),
    ),
  );
  await assert.rejects(
    sourceCode.registerPreviewArtifacts(env, {
      ...typed,
      executable: { ...typed.executable, sha256: 'f'.repeat(64) },
    }),
    { code: 'preview-artifact-conflict' },
  );
  assert.equal(
    await sourceCode.sourcePreviewRoute(
      new Request(requestUrl, { method: 'POST', body: JSON.stringify(publication) }),
      env,
    ),
    null,
  );
  results.push('equal retry succeeds, changed executable pin conflicts, no public HTTP write');
  await sourceCode.registerPreviewTarget(env, {
    origin: publication.targetOrigin,
    incarnation: publication.incarnation,
    commit: 'e'.repeat(40),
    publicKey,
  });
  await pending();
  await assert.rejects(verifySourcePublicationReadback(publication, sourceGet), /unavailable/);
  await sourceCode.closePreviewTarget(env, publication.targetOrigin, publication.incarnation);
  await pending();
  await assert.rejects(verifySourcePublicationReadback(publication, sourceGet), /unavailable/);
  results.push('actual source GET stops returning stale and closed tuples');

  const evidence = {
    sourceCommit,
    localOnly: true,
    manifestSha256: artifact.manifestSha256,
    publication,
    results,
  };

  await writeFile(resolve(scratch, 'result.json'), canonical(evidence));
  console.log(canonical({ ...evidence, evidencePath: resolve(scratch, 'result.json') }));
} finally {
  await runtime.dispose();
}
