import { expect, it } from 'vitest';
import { sha256 } from '../scripts/preview-artifact.ts';
import { verifySourceExecutable } from '../scripts/preview-publication.ts';

it('verifies source executable bytes at the exact independent release URL without credentials or redirects', async () => {
  const source = 'https://source.example.test';
  const bytes = Buffer.from('synthetic-source-archive-bytes');

  const executable = {
    url: `${source}/downloads/agent-game-cli-0.3.0.tgz`,
    sha256: sha256(bytes),
    bytes: bytes.length,
    version: '0.3.0',
    protocols: [1, 2] as const,
  };

  const requests: string[] = [];

  const fetcher: typeof fetch = async (url, init) => {
    requests.push(String(url));
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);

    return new Response(bytes);
  };

  expect(await verifySourceExecutable(source, executable, fetcher)).toEqual(executable);
  expect(requests).toEqual([executable.url]);

  for (const url of [
    'https://target.example.test/downloads/agent-game-cli-0.3.0.tgz',
    `${executable.url}?redirect=1`,
    `${source}/other.tgz`,
  ]) {
    await expect(verifySourceExecutable(source, { ...executable, url }, fetcher)).rejects.toThrow(
      'exact source release URL',
    );
  }

  expect(requests).toHaveLength(1);
  await expect(
    verifySourceExecutable(source, executable, async () => new Response('tampered')),
  ).rejects.toThrow('differ');
  await expect(
    verifySourceExecutable(source, executable, async () => new Response(Buffer.alloc(bytes.length + 1))),
  ).rejects.toThrow('too large');
  await expect(
    verifySourceExecutable(
      source,
      executable,
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://target.example.test/cli.tgz' } }),
    ),
  ).rejects.toThrow('unavailable');
});
