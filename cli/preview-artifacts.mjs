import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function previewError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

// Dependency-free boundary parsers; validate primitive representation before the complete contract.
// eslint-disable-next-line anti-slop/no-runtime-typeof
export const text = (value, pattern) => typeof value === 'string' && pattern.test(value);

export function origin(value) {
  const url = new URL(value);

  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw previewError(
      'preview-origin',
      'Use an exact HTTPS arena origin (loopback HTTP is supported locally).',
    );

  return url.origin;
}

const hash = (value) => text(value, /^[a-f0-9]{64}$/);

const bytes = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;

const dataPath = (path) =>
  text(path, /^package\/(public\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md|skills\/agent-game\/SKILL\.md)$/);

function descriptor(value, expectedOrigin) {
  const url = new URL(value?.url);

  if (
    url.origin !== expectedOrigin ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith('/downloads/') ||
    !hash(value.sha256) ||
    !bytes(value.bytes, 2 * 1024 * 1024)
  )
    throw previewError('preview-artifact', 'Invalid source-attested artifact descriptor.');

  return { url: url.href, sha256: value.sha256, bytes: value.bytes };
}

function fileDescriptor(value) {
  if (!dataPath(value?.path) || !hash(value.sha256) || !bytes(value.bytes, 128 * 1024))
    throw previewError('preview-artifact', 'Invalid branch document descriptor.');

  return { path: value.path, sha256: value.sha256, bytes: value.bytes };
}

export function validateManifest(value, sourceOrigin, target) {
  if (
    value?.version !== 1 ||
    value.sourceOrigin !== sourceOrigin ||
    value.targetOrigin !== target.origin ||
    value.incarnation !== target.incarnation ||
    value.commit !== target.commit ||
    !Array.isArray(value.games) ||
    value.games.length !== 2
  )
    throw previewError(
      'preview-manifest',
      'Artifact provenance does not match the selected source registry entry.',
    );
  const executable = descriptor(value.executable, sourceOrigin);

  if (
    !text(value.executable.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/) ||
    executable.url !== `${sourceOrigin}/downloads/agent-game-cli-${value.executable.version}.tgz` ||
    JSON.stringify(value.executable.protocols) !== '[1,2]'
  )
    throw previewError('preview-manifest', 'Unsupported trusted executable capabilities.');

  const games = value.games.map((game, index) => {
    const directory = game.gameId === 'succession' ? 'package/public/games/succession' : 'package/public';

    if (
      game.gameId !== ['secret-overlord', 'succession'][index] ||
      game.protocol !== index + 1 ||
      !text(game.rulesVersion, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/) ||
      !value.executable.protocols.includes(game.protocol) ||
      game.archive?.url !==
        `${target.origin}/downloads/previews/${target.commit}/${game.archive.sha256}.tgz` ||
      game.rules?.path !== `${directory}/rules.md` ||
      game.protocolFile?.path !== `${directory}/protocol.md` ||
      game.skill?.path !== 'package/skills/agent-game/SKILL.md'
    )
      throw previewError(
        'preview-protocol',
        'The trusted dispatcher does not support this preview protocol.',
      );

    return {
      gameId: game.gameId,
      protocol: game.protocol,
      rulesVersion: game.rulesVersion,
      archive: descriptor(game.archive, target.origin),
      rules: fileDescriptor(game.rules),
      skill: fileDescriptor(game.skill),
      protocolFile: fileDescriptor(game.protocolFile),
    };
  });

  if (new Set(games.map((game) => game.gameId)).size !== 2)
    throw previewError('preview-manifest', 'Both games must have distinct artifact descriptions.');

  if (
    games[0].archive.sha256 === games[1].archive.sha256 &&
    (games[0].archive.bytes !== games[1].archive.bytes ||
      games[0].skill.sha256 !== games[1].skill.sha256 ||
      games[0].skill.bytes !== games[1].skill.bytes)
  )
    throw previewError('preview-manifest', 'A shared archive must describe identical shared files.');

  return {
    version: 1,
    sourceOrigin,
    targetOrigin: target.origin,
    incarnation: target.incarnation,
    commit: target.commit,
    executable: { ...executable, version: value.executable.version, protocols: value.executable.protocols },
    games,
  };
}

export async function boundedResponse(response, limit) {
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;

  if (!reader) throw previewError('preview-response', 'Empty preview response.');

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;
      length += value.byteLength;

      if (length > limit) throw previewError('preview-response', 'Preview response exceeded its byte limit.');
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function previewRequest(server, path, token, body) {
  const headers = { 'content-type': 'application/json', 'X-Agent-Game-Protocols': '1,2' };

  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${origin(server)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });

  const raw = await boundedResponse(response, 64 * 1024);
  let data;

  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw previewError('preview-response', 'Invalid preview JSON response.', response.status);
  }

  if (!response.ok) {
    const code = text(data?.error?.code, /^[\w-]{1,100}$/) ? data.error.code : 'preview-unavailable';
    throw previewError(
      code,
      `Preview request failed (HTTP ${response.status}, ${code}). Retry the saved request; expired authority needs explicit --renew after source reauthorization.`,
      response.status,
    );
  }

  return data;
}

function unpack(archive, executable) {
  const tar = gunzipSync(archive, { maxOutputLength: 16 * 1024 * 1024 });

  if (tar.length % 512 !== 0) throw previewError('preview-archive', 'Incomplete tar block.');
  const files = new Map();
  const seen = new Set();
  let offset = 0;
  let ended = false;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;

    if (header.every((byte) => byte === 0)) {
      if (tar.length - offset < 512 || !tar.subarray(offset).every((byte) => byte === 0))
        throw previewError('preview-archive', 'Invalid archive trailer.');
      ended = true;
      break;
    }

    const field = (start, end) => header.subarray(start, end).toString('utf8').split('\0')[0];
    const prefix = field(345, 500);
    const path = `${prefix ? `${prefix}/` : ''}${field(0, 100)}`;
    const sizeField = field(124, 136).trim();
    const size = /^[0-7]+$/.test(sizeField) ? Number.parseInt(sizeField, 8) : -1;
    const expected = Number.parseInt(field(148, 156).trim(), 8);
    const mode = Number.parseInt(field(100, 108).trim(), 8);
    let checksum = 0;

    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index];
    const packageFile = path === 'package/package.json' || /^package\/cli\/[A-Za-z0-9_-]+\.mjs$/.test(path);
    const allowed = dataPath(path) || packageFile;

    if (
      !allowed ||
      (!executable && !packageFile && mode & 0o111) ||
      ![0, 48].includes(header[156]) ||
      seen.has(path) ||
      checksum !== expected ||
      size < 0 ||
      size > (dataPath(path) ? 128 * 1024 : 2 * 1024 * 1024) ||
      offset + size > tar.length ||
      seen.size >= 128
    )
      throw previewError(
        'preview-archive',
        'Archive contains an unsupported path, entry type, size or checksum.',
      );
    seen.add(path);

    // A deployer may reuse a full CLI archive. Target code is validated structurally, then discarded.
    if (executable || dataPath(path)) files.set(path, tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }

  if (!files.size || !ended || offset > tar.length)
    throw previewError('preview-archive', 'Incomplete artifact archive.');

  if (executable) {
    const manifest = JSON.parse(files.get('package/package.json')?.toString('utf8') ?? '{}');

    if (
      !files.has('package/cli/agent-game.mjs') ||
      manifest.name !== 'agent-game-cli' ||
      manifest.dependencies ||
      manifest.scripts
    )
      throw previewError('preview-executable', 'Expected a dependency-free source CLI package.');
  }

  return files;
}

async function artifactCache(description, server, commit, executable) {
  const root = resolve(
    homedir(),
    '.agent-game/cli',
    sha256(server).slice(0, 16),
    `${commit}-${description.sha256}`,
  );

  let files;

  try {
    const stored = await readFile(`${root}/artifact.tgz`);

    if (stored.length !== description.bytes || sha256(stored) !== description.sha256)
      throw previewError('preview-integrity', 'Cached archive failed integrity validation.');
    files = unpack(stored, executable);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(description.url, { redirect: 'error', signal: AbortSignal.timeout(8000) });

    if (!response.ok)
      throw previewError('preview-artifact-unavailable', 'Registered artifact is unavailable.');
    const archive = await boundedResponse(response, description.bytes);

    if (archive.length !== description.bytes || sha256(archive) !== description.sha256)
      throw previewError(
        'preview-integrity',
        'Downloaded artifact does not match the source-attested digest.',
      );
    files = unpack(archive, executable);
    const temporary = `${root}.${randomUUID()}.tmp`;
    await mkdir(temporary, { recursive: true, mode: 0o700 });

    try {
      for (const [path, content] of files) {
        await mkdir(dirname(`${temporary}/${path}`), { recursive: true, mode: 0o700 });
        await writeFile(`${temporary}/${path}`, content, { mode: 0o600, flag: 'wx' });
      }

      await writeFile(`${temporary}/artifact.tgz`, archive, { mode: 0o600, flag: 'wx' });
      await rename(temporary, root).catch((error) => {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  for (const [path, content] of files) {
    const actual = `${root}/${path}`;
    const info = await lstat(actual);

    if (!info.isFile() || sha256(await readFile(actual)) !== sha256(content))
      throw previewError('preview-integrity', 'An immutable cached artifact was modified.');
  }

  return { root, files };
}

export async function cacheArtifacts(manifest, gameId) {
  const game = manifest.games.find((item) => item.gameId === gameId);

  if (!game) throw previewError('preview-game', 'No registered branch artifacts for this game.');

  const executable = await artifactCache(
    manifest.executable,
    manifest.sourceOrigin,
    `source-${manifest.executable.version}`,
    true,
  );

  if (
    JSON.parse(executable.files.get('package/package.json').toString('utf8')).version !==
    manifest.executable.version
  )
    throw previewError(
      'preview-executable',
      'Source executable package version differs from its registered descriptor.',
    );
  const branch = await artifactCache(game.archive, manifest.targetOrigin, manifest.commit, false);

  const checked = (description) => {
    const content = branch.files.get(description.path);

    if (!content || content.length !== description.bytes || sha256(content) !== description.sha256)
      throw previewError('preview-integrity', 'Branch document does not match its source-attested digest.');

    return `${branch.root}/${description.path}`;
  };

  return {
    executablePath: `${executable.root}/package/cli/agent-game.mjs`,
    executableDigest: sha256(executable.files.get('package/cli/agent-game.mjs')),
    executableArchiveDigest: manifest.executable.sha256,
    executableFiles: [...executable.files].flatMap(([path, content]) =>
      path.startsWith('package/cli/')
        ? [{ path: `${executable.root}/${path}`, sha256: sha256(content) }]
        : [],
    ),
    rulesPath: checked(game.rules),
    rulesDigest: game.rules.sha256,
    skillPath: checked(game.skill),
    skillDigest: game.skill.sha256,
    protocolPath: checked(game.protocolFile),
    protocolDigest: game.protocolFile.sha256,
    archiveDigest: game.archive.sha256,
    commit: manifest.commit,
    gameId,
    rulesVersion: game.rulesVersion,
    protocolVersion: String(game.protocol),
  };
}

export function activeArtifacts(state) {
  return state.previewParticipation?.artifacts ?? state.preview?.artifacts;
}

export async function verifyPins(artifacts) {
  if (!artifacts) return;

  const files = [
    [artifacts.executablePath, artifacts.executableDigest],
    [artifacts.rulesPath, artifacts.rulesDigest],
    [artifacts.skillPath, artifacts.skillDigest],
    [artifacts.protocolPath, artifacts.protocolDigest],
    ...(artifacts.executableFiles ?? []).map((file) => [file.path, file.sha256]),
  ];

  for (const [path, digest] of files) {
    if (
      !text(path, /^\//) ||
      !hash(digest) ||
      !(await lstat(path)).isFile() ||
      sha256(await readFile(path)) !== digest
    )
      throw previewError(
        'preview-integrity',
        'Pinned executable or branch document failed integrity validation.',
      );
  }
}

export async function pinnedDocuments(artifacts) {
  await verifyPins(artifacts);

  return {
    rules: await readFile(artifacts.rulesPath, 'utf8'),
    skill: await readFile(artifacts.skillPath, 'utf8'),
    protocol: await readFile(artifacts.protocolPath, 'utf8'),
  };
}

export function pinParticipation(state, queueRequestId, gameId, configPath) {
  if (!state.preview) return;

  if (!state.previewParticipation || state.previewParticipation.queueRequestId !== queueRequestId) {
    if (state.preview.artifacts.gameId !== gameId)
      throw previewError('preview-game', 'Select this game’s branch artifacts before joining.');
    state.previewParticipation = {
      connectionId: state.connectionId,
      targetOrigin: state.server,
      incarnation: state.preview.incarnation,
      queueRequestId,
      matchId: null,
      artifacts: structuredClone(state.preview.artifacts),
      supervisorLedgerPath: `${configPath}.supervisor.json`,
    };
  }
}
