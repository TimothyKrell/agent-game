import { gzipSync, gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import {
  contentPaths,
  contentLimits,
  contentFile,
  encodeContentArchive,
  readContentArchive,
} from '../scripts/preview-content.ts';
import type { ContentPath } from '../scripts/preview-content.ts';
import { sha256 } from '../scripts/preview-artifact.ts';

function files() {
  return new Map<ContentPath, Buffer>(
    contentPaths.map((path) => [path, Buffer.from(`# ${path}\nExample branch rules.\n`)]),
  );
}

it('changes content/archive digests for a rules-only revision without consulting a CLI version', () => {
  const first = files();
  const before = encodeContentArchive(first);
  const second = new Map(first);
  second.set('package/public/rules.md', Buffer.from('# Revised branch rule\nA rules-only change.\n'));
  const after = encodeContentArchive(second);
  expect(sha256(after)).not.toBe(sha256(before));
  expect(contentFile('package/public/rules.md', second).sha256).not.toBe(
    contentFile('package/public/rules.md', first).sha256,
  );
  expect(contentFile('package/skills/agent-game/SKILL.md', second)).toEqual(
    contentFile('package/skills/agent-game/SKILL.md', first),
  );
  expect(readContentArchive(before).get('package/public/rules.md')).toEqual(
    first.get('package/public/rules.md'),
  );
  expect(readContentArchive(after).get('package/public/rules.md')).toEqual(
    second.get('package/public/rules.md'),
  );
});

it.each([
  ['traversal', 0, '../outside'],
  ['target executable', 0, 'package/cli/agent-game.mjs'],
  ['package scripts', 0, 'package/package.json'],
  ['symbolic link', 156, '2'],
  ['hard link', 156, '1'],
  ['PAX metadata', 156, 'x'],
  ['executable permissions', 100, '0000755\0'],
] as const)('rejects %s in a data archive', (_name, offset, replacement) => {
  const tar = gunzipSync(encodeContentArchive(files()));
  tar.write(replacement, offset, 'ascii');
  // Keep the checksum valid: rejection must come from the unsafe entry's
  // path/type/mode, rather than merely noticing corrupt tar metadata.
  tar.fill(32, 148, 156);
  const checksum = tar.subarray(0, 512).reduce((total, byte) => total + byte, 0);
  tar.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  expect(() => readContentArchive(gzipSync(tar))).toThrow('header/path/type');
});

it('rejects duplicate entries, trailing payloads, truncated data and decompression bombs', () => {
  const archive = encodeContentArchive(files());
  const tar = gunzipSync(archive);
  const firstEntryBytes = 1024;
  const duplicate = Buffer.concat([tar.subarray(0, firstEntryBytes), tar]);
  expect(() => readContentArchive(gzipSync(duplicate))).toThrow();
  expect(() => readContentArchive(gzipSync(Buffer.concat([tar, Buffer.from('hidden')])))).toThrow('trailer');
  expect(() => readContentArchive(gzipSync(tar.subarray(0, 700)))).toThrow('Truncated');
  expect(() => readContentArchive(gzipSync(Buffer.alloc(contentLimits.archiveBytes + 1)))).toThrow();
});

it('rejects missing files, oversize content and invalid UTF-8 before packing', () => {
  const missing = files();
  missing.delete('package/public/rules.md');
  expect(() => encodeContentArchive(missing)).toThrow('inventory');
  const oversized = files();
  oversized.set('package/public/rules.md', Buffer.alloc(contentLimits.fileBytes + 1));
  expect(() => encodeContentArchive(oversized)).toThrow('size');
  const invalid = files();
  invalid.set('package/public/rules.md', Buffer.from([0xff, 0xfe]));
  expect(() => encodeContentArchive(invalid)).toThrow();
});
