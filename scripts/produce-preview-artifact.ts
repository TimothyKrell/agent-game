import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Schema } from 'effect';
import { contentPaths, contentFile, encodeContentArchive } from './preview-content.ts';
import type { ContentPath } from './preview-content.ts';
import {
  canonical,
  inventory,
  readStable,
  requireCondition,
  sha256,
  validateArtifact,
} from './preview-artifact.ts';

// UNPRIVILEGED ONLY: this is the sole PR-controlled compilation process.
requireCondition(
  !process.env.CLOUDFLARE_API_TOKEN && !process.env.PREVIEW_DEPLOY_TOKEN,
  'Artifact builds must not receive deployer credentials',
);

const destination = resolve(process.argv[2] ?? '.agent-game/preview-artifact');

const builtCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

requireCondition(builtCommit === process.env.GITHUB_SHA, 'Build checkout differs from tested merge commit');

await mkdir('.agent-game', { recursive: true });

const output = await mkdtemp(resolve('.agent-game/preview-build-'));

try {
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      'deploy',
      '--dry-run',
      '--outdir',
      output,
      '--no-autoconfig',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  await mkdir(destination, { recursive: false });
  await mkdir(resolve(destination, 'worker'));

  for (const name of (await inventory(output)).names) {
    // Wrangler emits diagnostics beside the upload. Neither is a Worker module.
    if (name === 'README.md' || name.endsWith('.map')) continue;
    await mkdir(dirname(resolve(destination, 'worker', name)), { recursive: true });
    await cp(resolve(output, name), resolve(destination, 'worker', name), { recursive: false });
  }

  await cp('dist/client', resolve(destination, 'assets'), { recursive: true, dereference: false });
  await cp('migrations', resolve(destination, 'migrations'), { recursive: true, dereference: false });
  const contentFiles = new Map<ContentPath, Buffer>();

  for (const path of contentPaths) {
    const source = path.startsWith('package/public/')
      ? resolve(destination, 'assets', path.slice('package/public/'.length))
      : path.slice('package/'.length);

    contentFiles.set(path, await readStable(source));
  }

  const archive = encodeContentArchive(contentFiles);
  const archivePath = `assets/downloads/previews/${builtCommit}/${sha256(archive)}.tgz`;
  await mkdir(dirname(resolve(destination, archivePath)), { recursive: true });
  await writeFile(resolve(destination, archivePath), archive, { flag: 'wx' });

  // This source import runs ONLY in the unprivileged producer. The credentialed
  // controller reads the resulting bounded data and never imports PR modules.
  const descriptors = Schema.decodeUnknownSync(
    Schema.Struct({
      'secret-overlord': Schema.Struct({ rulesVersion: Schema.String, protocolVersion: Schema.Literal('1') }),
      succession: Schema.Struct({ rulesVersion: Schema.String, protocolVersion: Schema.Literal('2') }),
    }),
  )(
    JSON.parse(
      execFileSync(
        'bun',
        [
          '--eval',
          "import { GAME_DESCRIPTORS } from './src/game/descriptors.ts'; console.log(JSON.stringify(GAME_DESCRIPTORS));",
        ],
        { encoding: 'utf8', maxBuffer: 32 * 1024 },
      ),
    ),
  );

  const branchContent = {
    archivePath,
    games: [
      {
        gameId: 'secret-overlord',
        protocol: descriptors['secret-overlord'].protocolVersion,
        rulesVersion: descriptors['secret-overlord'].rulesVersion,
        rules: contentFile('package/public/rules.md', contentFiles),
        skill: contentFile('package/skills/agent-game/SKILL.md', contentFiles),
        protocolFile: contentFile('package/public/protocol.md', contentFiles),
      },
      {
        gameId: 'succession',
        protocol: descriptors.succession.protocolVersion,
        rulesVersion: descriptors.succession.rulesVersion,
        rules: contentFile('package/public/games/succession/rules.md', contentFiles),
        skill: contentFile('package/skills/agent-game/SKILL.md', contentFiles),
        protocolFile: contentFile('package/public/games/succession/protocol.md', contentFiles),
      },
    ],
  };

  const files = [];

  for (const path of (await inventory(destination)).names) {
    const bytes = await readStable(resolve(destination, path));
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }

  await writeFile(
    resolve(destination, 'manifest.json'),
    canonical({
      version: 1,
      repository: process.env.GITHUB_REPOSITORY,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      prHeadSha: process.env.PR_HEAD_SHA,
      builtCommit,
      entry: 'worker/worker.js',
      branchContent,
      files,
    }),
  );
  requireCondition(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === builtCommit,
    'Checkout changed during build',
  );
  const result = await validateArtifact(destination);
  console.log(canonical({ builtCommit, manifestSha256: result.manifestSha256, files: files.length }));
} finally {
  await rm(output, { recursive: true, force: true });
}
