import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const evidenceDirectory = resolve(
  process.env.API_EVIDENCE_DIR ?? '/tmp/opencode/agent-game-api-evidence',
);

export async function evidence<T>(name: string, value: T) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, name), JSON.stringify(value, null, 2) + '\n');
}
