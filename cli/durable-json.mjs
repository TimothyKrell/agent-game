import { open, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

/** Atomically publish and sync a private JSON file. The caller prepares its directory and owns locking. */
export async function writeJsonDurably(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);

  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }

  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
