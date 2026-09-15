import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Schema } from 'effect';

export const contentPaths = [
  'package/public/games/succession/protocol.md',
  'package/public/games/succession/rating-method.md',
  'package/public/games/succession/rules.md',
  'package/public/protocol.md',
  'package/public/rating-method.md',
  'package/public/rules.md',
  'package/skills/agent-game/SKILL.md',
] as const;

export type ContentPath = (typeof contentPaths)[number];

export const contentLimits = { fileBytes: 128 * 1024, archiveBytes: 2 * 1024 * 1024 };

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const ContentFile = Schema.Struct({
  path: Schema.Literals(contentPaths),
  bytes: Schema.Number,
  sha256: Schema.String,
});

const ContentGame = Schema.Struct({
  gameId: Schema.Literals(['secret-overlord', 'succession']),
  protocol: Schema.Literals(['1', '2']),
  rulesVersion: Schema.String,
  rules: ContentFile,
  skill: ContentFile,
  protocolFile: ContentFile,
});

export const BranchContent = Schema.Struct({ archivePath: Schema.String, games: Schema.Array(ContentGame) });

export type BranchContent = typeof BranchContent.Type;

export interface ContentFile {
  path: ContentPath;
  bytes: number;
  sha256: string;
}

export interface ValidatedBranchContent {
  archive: { path: string; bytes: number; sha256: string };
  games: readonly (typeof ContentGame.Type)[];
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function header(path: ContentPath, bytes: number) {
  const result = Buffer.alloc(512);
  result.write(path, 0, 100, 'ascii');
  result.write('0000644\0', 100, 8, 'ascii');
  result.write('0000000\0', 108, 8, 'ascii');
  result.write('0000000\0', 116, 8, 'ascii');
  result.write(`${bytes.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  result.write('00000000000\0', 136, 12, 'ascii');
  result.fill(32, 148, 156);
  result.write('0', 156, 1, 'ascii');
  result.write('ustar\0', 257, 6, 'ascii');
  result.write('00', 263, 2, 'ascii');
  const checksum = result.reduce((total, byte) => total + byte, 0);
  result.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');

  return result;
}

// Canonical regular-file-only USTAR. No package manager, scripts, PAX headers,
// symlinks, executable bits, filesystem metadata or executable files enter it.
export function encodeContentArchive(files: ReadonlyMap<ContentPath, Buffer>) {
  check(files.size === contentPaths.length, 'Incomplete content file inventory');
  const chunks: Buffer[] = [];

  for (const path of contentPaths) {
    const bytes = files.get(path);
    check(
      bytes !== undefined && bytes.length > 0 && bytes.length <= contentLimits.fileBytes,
      'Invalid content file size',
    );
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    chunks.push(header(path, bytes.length), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }

  chunks.push(Buffer.alloc(1024));
  const tar = Buffer.concat(chunks);
  check(tar.length <= contentLimits.archiveBytes, 'Expanded content archive too large');

  return gzipSync(tar, { level: 9 });
}

// Read bounded bytes without extracting or interpreting archive contents. Exact
// header comparison rejects alternate paths/types, links, duplicate entries,
// metadata extensions, executable modes and noncanonical numeric fields.
export function readContentArchive(archive: Buffer) {
  check(archive.length > 0 && archive.length <= contentLimits.archiveBytes, 'Content archive too large');
  const tar = gunzipSync(archive, { maxOutputLength: contentLimits.archiveBytes });
  const files = new Map<ContentPath, Buffer>();
  let offset = 0;

  for (const path of contentPaths) {
    check(offset + 512 <= tar.length, 'Truncated content header');
    const actualHeader = tar.subarray(offset, offset + 512);
    const size = actualHeader.toString('ascii', 124, 136);
    check(/^[0-7]{11}\0$/.test(size), 'Invalid content size');
    const bytes = Number.parseInt(size, 8);
    check(bytes > 0 && bytes <= contentLimits.fileBytes, 'Invalid content file size');
    check(actualHeader.equals(header(path, bytes)), 'Unexpected content header/path/type');
    offset += 512;
    const padded = Math.ceil(bytes / 512) * 512;
    check(offset + padded <= tar.length, 'Truncated content payload');
    check(
      tar.subarray(offset + bytes, offset + padded).every((byte) => byte === 0),
      'Invalid content padding',
    );
    const content = tar.subarray(offset, offset + bytes);
    new TextDecoder('utf-8', { fatal: true }).decode(content);
    files.set(path, content);
    offset += padded;
  }

  check(
    tar.length === offset + 1024 && tar.subarray(offset).every((byte) => byte === 0),
    'Unexpected content archive entries/trailer',
  );

  return files;
}

export function contentFile(path: ContentPath, files: ReadonlyMap<ContentPath, Buffer>): ContentFile {
  const bytes = files.get(path);
  check(bytes !== undefined, 'Missing content file');

  return { path, bytes: bytes.length, sha256: digest(bytes) };
}

export function validateBranchContent(
  manifest: BranchContent,
  commit: string,
  files: ReadonlyMap<string, Buffer>,
) {
  const archive = files.get(manifest.archivePath);
  check(archive !== undefined, 'Missing branch content archive');
  const sha256 = digest(archive);
  check(
    manifest.archivePath === `assets/downloads/previews/${commit}/${sha256}.tgz`,
    'Content archive commit/digest path mismatch',
  );
  check(
    [...files.keys()].filter((path) => path.startsWith('assets/downloads/previews/')).length === 1,
    'Unexpected preview content archives',
  );
  const content = readContentArchive(archive);

  for (const [path, bytes] of content) {
    if (!path.startsWith('package/public/')) continue;
    check(
      files.get(`assets/${path.slice('package/public/'.length)}`)?.equals(bytes) === true,
      'Content differs from built public asset',
    );
  }

  const definitions = [
    {
      gameId: 'secret-overlord',
      protocol: '1',
      rules: 'package/public/rules.md',
      protocolFile: 'package/public/protocol.md',
    },
    {
      gameId: 'succession',
      protocol: '2',
      rules: 'package/public/games/succession/rules.md',
      protocolFile: 'package/public/games/succession/protocol.md',
    },
  ];

  check(manifest.games.length === definitions.length, 'Incomplete content game inventory');

  for (let index = 0; index < definitions.length; index++) {
    const expected = definitions[index];
    const game = manifest.games[index];
    check(
      game.gameId === expected.gameId &&
        game.protocol === expected.protocol &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(game.rulesVersion),
      'Invalid content game identity',
    );
    check(
      game.rules.path === expected.rules &&
        game.protocolFile.path === expected.protocolFile &&
        game.skill.path === 'package/skills/agent-game/SKILL.md',
      'Wrong content role path',
    );

    for (const file of [game.rules, game.skill, game.protocolFile]) {
      const actual = contentFile(file.path, content);
      check(
        file.sha256 === actual.sha256 && file.bytes === actual.bytes,
        'Content descriptor digest/size mismatch',
      );
    }
  }

  return {
    content,
    descriptor: {
      archive: { path: manifest.archivePath.slice('assets'.length), bytes: archive.length, sha256 },
      games: manifest.games,
    } satisfies ValidatedBranchContent,
  };
}

export function branchContentForTarget(content: ValidatedBranchContent, origin: string) {
  const url = new URL(origin);
  check(url.protocol === 'https:' && url.origin === origin, 'Invalid trusted content origin');

  const archive = {
    url: `${origin}${content.archive.path}`,
    sha256: content.archive.sha256,
    bytes: content.archive.bytes,
  };

  // Game descriptors use strings internally; the accepted source registry wire
  // contract uses numeric protocols. Normalize only at this publication seam.
  return {
    games: content.games.map((game) => ({ ...game, protocol: game.protocol === '1' ? 1 : 2, archive })),
  };
}
