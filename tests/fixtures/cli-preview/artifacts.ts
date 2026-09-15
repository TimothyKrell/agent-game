import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export function archive(entries: { path: string; content: Buffer; kind?: string; mode?: number }[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512);

    const field = (value: string, offset: number, length: number) =>
      header.write(value, offset, length, 'utf8');

    field(entry.path, 0, 100);
    field((entry.mode ?? 0o644).toString(8).padStart(7, '0'), 100, 8);
    field('0000000', 108, 8);
    field('0000000', 116, 8);
    field(entry.content.length.toString(8).padStart(11, '0'), 124, 12);
    field('00000000000', 136, 12);
    field('        ', 148, 8);
    field(entry.kind ?? '0', 156, 1);
    field('ustar\0', 257, 6);
    const sum = header.reduce((total, byte) => total + byte, 0);
    field(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    blocks.push(header, entry.content, Buffer.alloc((512 - (entry.content.length % 512)) % 512));
  }

  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

export async function artifacts(
  sourceOrigin: string,
  targetOrigin: string,
  incarnation: string,
  commit: string,
  executable: Buffer,
  marker = 'TIM27_BRANCH_A',
  extra: Parameters<typeof archive>[0] = [],
) {
  const files = await Promise.all(
    [
      'public/rules.md',
      'public/protocol.md',
      'public/games/succession/rules.md',
      'public/games/succession/protocol.md',
      'skills/agent-game/SKILL.md',
    ].map(async (path) => ({
      path: `package/${path}`,
      content: Buffer.from(`${await readFile(path, 'utf8')}\n${marker}\n`),
    })),
  );

  const tar = archive([...files, ...extra]);

  const description = (path: string) => {
    const file = files.find((item) => item.path === `package/${path}`)!;

    return { path: file.path, sha256: hash(file.content), bytes: file.content.length };
  };

  const descriptor = {
    url: `${targetOrigin}/downloads/previews/${commit}/${hash(tar)}.tgz`,
    sha256: hash(tar),
    bytes: tar.length,
  };

  return {
    tar,
    manifest: {
      version: 1,
      sourceOrigin,
      targetOrigin,
      incarnation,
      commit,
      executable: {
        url: `${sourceOrigin}/downloads/agent-game-cli-0.3.0.tgz`,
        sha256: hash(executable),
        bytes: executable.length,
        version: '0.3.0',
        protocols: [1, 2],
      },
      games: ['secret-overlord', 'succession'].map((gameId) => {
        const prefix = gameId === 'succession' ? 'public/games/succession' : 'public';

        return {
          gameId,
          protocol: gameId === 'succession' ? 2 : 1,
          rulesVersion: gameId === 'succession' ? 'succession-1' : 'secret-overlord-1',
          archive: descriptor,
          rules: description(`${prefix}/rules.md`),
          protocolFile: description(`${prefix}/protocol.md`),
          skill: description('skills/agent-game/SKILL.md'),
        };
      }),
    },
  };
}
