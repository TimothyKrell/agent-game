import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';

/** Build the local transparent-socket fix; retain Sandbox outbound isolation. */
export async function localEgress(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const image = 'agent-game-finale-local-egress:3cb1195-transparent-v1';

  const docker = process.env.WRANGLER_DOCKER_BIN ?? 'docker';

  const build = spawn(docker, ['build', '--target', 'local-egress', '--tag', image, 'dev/coding-finale'], {
    stdio: 'inherit',
  });

  const [code] = await once(build, 'exit');

  if (code !== 0) throw new Error('Could not build the local egress proxy.');

  // Wrangler always pulls this image. Only its exact pull is replaced by local
  // inspection; all other commands go to the configured Docker executable.
  const wrapper = `${directory}/docker.mjs`;

  await writeFile(
    wrapper,
    `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
// Wrangler otherwise deletes another running Worker's tag when images share
// a digest. Keep local development tags until the operator prunes the cache.
if (args[0] === 'rmi' && args.slice(1).length && args.slice(1).every(tag => tag.startsWith('cloudflare-dev/'))) process.exit(0);
const result = spawnSync(${JSON.stringify(docker)},
  args[0] === 'pull' && args[1] === ${JSON.stringify(image)}
    ? ['image', 'inspect', args[1], '--format', '{{.Id}}'] : args,
  { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
`,
    { mode: 0o700 },
  );

  return { WRANGLER_DOCKER_BIN: wrapper, MINIFLARE_CONTAINER_EGRESS_IMAGE: image };
}
