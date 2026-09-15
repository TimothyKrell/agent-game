import { constants } from 'node:fs';
import { lstat, open, readdir, mkdir, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, posix, sep } from 'node:path';
import { Schema } from 'effect';
import { init, parse } from 'es-module-lexer';

export const limits = {
  files: 2048,
  fileBytes: 16 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  manifestBytes: 512 * 1024,
};

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

export const canonical = <T>(value: T) => JSON.stringify(value, null, 2) + '\n';

const FileSchema = Schema.Struct({ path: Schema.String, bytes: Schema.Number, sha256: Schema.String });

const ManifestSchema = Schema.Struct({
  version: Schema.Literal(1),
  repository: Schema.String,
  runId: Schema.Number,
  runAttempt: Schema.Number,
  prHeadSha: Schema.String,
  builtCommit: Schema.String,
  entry: Schema.Literal('worker/worker.js'),
  files: Schema.Array(FileSchema),
});

export type Manifest = typeof ManifestSchema.Type;

export const commitPattern = /^[a-f0-9]{40}$/;

export const digestPattern = /^[a-f0-9]{64}$/;

export const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function allowedPath(name: string) {
  if (name.length > 240 || !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name)) return false;

  if (name.split('/').some((part) => !part || part.startsWith('.') || part.startsWith('_'))) return false;

  if (/(?:prototype|fixture|capture|agentation)/i.test(name)) return false;

  return (
    /^worker\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|mjs|wasm|txt|html|sql|bin)$/.test(name) ||
    /^migrations\/[0-9]{4}_[a-z0-9_]+\.sql$/.test(name) ||
    /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:html|js|css|json|md|txt|svg|png|jpg|jpeg|webp|avif|ico|woff2?|tgz)$/.test(
      name,
    )
  );
}

// A file is read through a no-follow descriptor with a finite read bound. Identity,
// link count and timestamps must agree before/after reading and at the pathname.
export async function readStable(file: string, maximum = limits.fileBytes) {
  const absolute = resolve(file);

  for (let path = dirname(absolute); ; path = dirname(path)) {
    const parent = await lstat(path);
    requireCondition(parent.isDirectory() && !parent.isSymbolicLink(), 'Symlink/non-directory ancestor');

    if (dirname(path) === path) break;
  }

  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const before = await handle.stat({ bigint: true });
    requireCondition(
      before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum),
      'Invalid file type/link count/size',
    );
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;

    while (length < bytes.length) {
      const part = await handle.read(bytes, length, bytes.length - length, null);

      if (!part.bytesRead) break;
      length += part.bytesRead;
    }

    const after = await handle.stat({ bigint: true });
    const named = await lstat(absolute, { bigint: true });

    for (const stat of [after, named]) {
      requireCondition(
        stat.isFile() &&
          stat.nlink === 1n &&
          stat.dev === before.dev &&
          stat.ino === before.ino &&
          stat.size === before.size &&
          stat.mtimeNs === before.mtimeNs &&
          stat.ctimeNs === before.ctimeNs,
        'File changed during validation',
      );
    }

    requireCondition(length === Number(before.size), 'File changed during read');

    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

export async function inventory(root: string) {
  const names: string[] = [];
  const directories: string[] = [];

  async function visit(relative: string) {
    const directory = resolve(root, relative);
    const stat = await lstat(directory);
    requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), 'Invalid artifact directory');

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      requireCondition(
        name.length <= 240 && names.length + directories.length < limits.files * 2,
        'Artifact inventory limit',
      );

      if (entry.isDirectory()) {
        directories.push(name);
        await visit(name);
      } else {
        requireCondition(entry.isFile() && !entry.isSymbolicLink(), 'Artifact symlink or special file');
        names.push(name);
      }
    }
  }

  await visit('');
  requireCondition(names.length <= limits.files + 1, 'Too many artifact files');

  return { names: names.sort(), directories: directories.sort() };
}

async function validateGraph(files: Map<string, Buffer>) {
  await init;
  const exports = new Set<string>();

  for (const [name, bytes] of files) {
    if (!name.startsWith('worker/') || !/\.(m?js)$/.test(name)) continue;
    const text = bytes.toString('utf8');
    const [imports, exported] = parse(text, name);

    for (const specifier of imports) {
      if (specifier.d === -2) continue; // import.meta is not a module import.

      if (specifier.n === undefined) {
        // Better Auth's optional Node SQLite adapter survives Wrangler's bundle.
        // It uses a computed import of this built-in; our D1 path never calls it.
        // Keep that one locked-source pattern explicit rather than allowing
        // arbitrary computed imports or rewriting PR code in the deployer.
        requireCondition(
          text.slice(specifier.s, specifier.e) === 'nodeSqlite' &&
            /const nodeSqlite = "node:sqlite";\s*\(\{ DatabaseSync \} = await $/.test(
              text.slice(Math.max(0, specifier.ss - 120), specifier.ss),
            ),
          'Dynamic module path',
        );
        continue;
      }

      if (/^(?:node:[a-z0-9_/-]+|cloudflare:workers)$/.test(specifier.n)) continue;
      requireCondition(
        specifier.n.startsWith('./') || specifier.n.startsWith('../'),
        'Unbundled module import',
      );
      const target = posix.normalize(posix.join(posix.dirname(name), specifier.n));
      requireCondition(target.startsWith('worker/') && files.has(target), 'Missing Worker module');
    }

    if (name === 'worker/worker.js') for (const item of exported) exports.add(item.n);
  }

  for (const name of ['default', 'MatchObject', 'MatchmakingObject', 'HouseSeatObject']) {
    requireCondition(exports.has(name), `Missing built Worker export: ${name}`);
  }
}

export async function validateArtifact(root: string) {
  const raw = await readStable(resolve(root, 'manifest.json'), limits.manifestBytes);

  const manifest = Schema.decodeUnknownSync(ManifestSchema)(JSON.parse(raw.toString('utf8')), {
    onExcessProperty: 'error',
  });

  requireCondition(raw.toString('utf8') === canonical(manifest), 'Noncanonical or ambiguous manifest');
  requireCondition(
    repositoryPattern.test(manifest.repository) &&
      commitPattern.test(manifest.prHeadSha) &&
      commitPattern.test(manifest.builtCommit),
    'Invalid provenance',
  );
  requireCondition(
    [manifest.runId, manifest.runAttempt].every((n) => Number.isSafeInteger(n) && n > 0),
    'Invalid run identity',
  );
  requireCondition(
    manifest.files.length > 0 && manifest.files.length <= limits.files,
    'Invalid file inventory',
  );
  const files = new Map<string, Buffer>();
  let total = 0;
  let previous = '';

  for (const file of manifest.files) {
    requireCondition(
      allowedPath(file.path) && file.path > previous,
      'Unexpected, duplicate, or unsorted artifact path',
    );
    previous = file.path;
    requireCondition(
      Number.isSafeInteger(file.bytes) &&
        file.bytes >= 0 &&
        file.bytes <= limits.fileBytes &&
        digestPattern.test(file.sha256),
      'Invalid file metadata',
    );
    total += file.bytes;
    requireCondition(total <= limits.totalBytes, 'Artifact byte limit');
    const bytes = await readStable(resolve(root, file.path));
    requireCondition(
      bytes.length === file.bytes && sha256(bytes) === file.sha256,
      'Artifact hash/size mismatch',
    );

    if (/\.(?:js|css|html|json|md|txt)$/.test(file.path)) {
      requireCondition(
        !/succession-replay-fixture|dp-prototype|data-agentation|agentation-overlay|Nomination, dialogue, ballots, policy & investigation/.test(
          bytes.toString('utf8'),
        ),
        'Development fixture payload in artifact',
      );
    }

    files.set(file.path, bytes);
  }

  for (const required of [
    'worker/worker.js',
    'assets/index.html',
    'assets/agents.md',
    'assets/rules.md',
    'assets/games/succession/rules.md',
    'migrations/0003_agent_pictures.sql',
  ]) {
    requireCondition(files.has(required), `Missing artifact file: ${required}`);
  }

  requireCondition(
    manifest.files.some((file) => /^assets\/downloads\/agent-game-cli-\d+\.\d+\.\d+\.tgz$/.test(file.path)),
    'Missing versioned CLI artifact',
  );
  const actual = await inventory(root);
  requireCondition(
    JSON.stringify(actual.names) === JSON.stringify(['manifest.json', ...files.keys()].sort()),
    'Unexpected artifact files',
  );
  const expectedDirectories = new Set<string>();

  for (const name of files.keys()) {
    for (let dir = posix.dirname(name); dir !== '.'; dir = posix.dirname(dir)) expectedDirectories.add(dir);
  }

  requireCondition(
    JSON.stringify(actual.directories) === JSON.stringify([...expectedDirectories].sort()),
    'Unexpected artifact directories',
  );
  requireCondition(
    (await readStable(resolve(root, 'manifest.json'), limits.manifestBytes)).equals(raw),
    'Manifest changed during validation',
  );
  await validateGraph(files);

  return { manifest, manifestSha256: sha256(raw), files, raw };
}

// Snapshot from the already-validated buffers, not by copying attacker-owned paths.
// The credentialed process sees only this private read-only tree on a fresh runner.
export async function snapshotArtifact(root: string, destination: string) {
  requireCondition(
    !resolve(destination).startsWith(resolve(root) + sep),
    'Snapshot must be outside quarantine',
  );
  const result = await validateArtifact(root);
  await mkdir(destination, { mode: 0o700 });

  for (const [name, bytes] of [...result.files, ['manifest.json', result.raw] as const]) {
    await mkdir(dirname(resolve(destination, name)), { recursive: true, mode: 0o700 });
    await writeFile(resolve(destination, name), bytes, { flag: 'wx', mode: 0o400 });
  }

  const { directories } = await inventory(destination);

  for (const dir of directories.reverse()) await chmod(resolve(destination, dir), 0o500);
  await chmod(destination, 0o500);

  return result;
}
