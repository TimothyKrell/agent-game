import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: '.agent-game/finale-lab/operator.json' },
    tier: { type: 'string' },
    file: { type: 'string' },
    inputs: { type: 'string' },
    message: { type: 'string' },
  },
});

const command = positionals[0];

if (!['start', 'current', 'challenge', 'practice', 'submit', 'say', 'watch'].includes(command)) {
  console.log(
    'Commands: start | current | challenge | practice --file solution.ts | submit --file solution.ts | say --message text | watch',
  );
  console.log(
    'Use --config <seat-config-path> for finalist commands. Optional: --tier 1|2, --inputs cases.json.',
  );
  process.exit(0);
}

const config = JSON.parse(await readFile(resolve(values.config), 'utf8'));

const print = (value) => console.log(JSON.stringify(value, null, 2));

async function request(path, body) {
  const response = await fetch(`${config.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const value = await response.json();

  if (!response.ok)
    throw new Error(`${value.error?.code ?? response.status}: ${value.error?.message ?? 'Request failed'}`);

  return value;
}

if (command === 'start') {
  const created = await request('/lab/finales', {});
  const directory = resolve('.agent-game/finale-lab', created.current.id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const finalists = [];

  for (const credential of created.credentials) {
    const path = `${directory}/seat-${credential.seat}.json`;
    await writeFile(
      path,
      JSON.stringify({ origin: config.origin, matchId: created.current.id, ...credential }),
      { mode: 0o600 },
    );
    finalists.push({ seat: credential.seat, config: path });
  }

  print({ matchId: created.current.id, actOne: created.actOne, status: created.current.status, finalists });
} else {
  if (!config.matchId)
    throw new Error('Pass --config pointing to a finalist configuration returned by start.');
  const base = `/finales/${config.matchId}`;
  const current = await request(`${base}/me`);

  if (command === 'current') print(current);
  else if (command === 'watch') {
    const stopAt = Date.now() + 7 * 60_000;
    let last = '';
    let view = current;

    for (;;) {
      const serialized = JSON.stringify(view);

      if (serialized !== last) print(view);
      last = serialized;

      if (['finished', 'interrupted'].includes(view.status)) break;

      if (Date.now() >= stopAt)
        throw new Error('Local watch allowance expired; check current for the actual server state.');
      await setTimeout(1000);
      view = await request(`${base}/me`);
    }
  } else if (command === 'say') {
    if (!values.message) throw new Error('Pass --message.');
    print(await request(`${base}/say`, { text: values.message }));
  } else {
    const tier = values.tier === undefined ? current.you.unlockedTier : Number(values.tier);

    if (tier !== 1 && tier !== 2) throw new Error('Choose --tier 1 or --tier 2.');
    const challenge = await request(`${base}/challenge?tier=${tier}`);

    if (command === 'challenge') print(challenge);
    else {
      if (!values.file) throw new Error('Pass --file with your JavaScript or TypeScript program.');

      const program = {
        language: /\.(?:ts|mts)$/.test(values.file) ? 'typescript' : 'javascript',
        source: await readFile(values.file, 'utf8'),
      };

      if (command === 'practice') {
        const inputs = values.inputs
          ? JSON.parse(await readFile(values.inputs, 'utf8'))
          : [challenge.example.input];

        print(await request(`${base}/practice`, { program, inputs }));
      } else {
        const actionId = createHash('sha256')
          .update(JSON.stringify([tier, program]))
          .digest('hex');

        print(
          await request(`${base}/submit`, { actionId, challengeId: challenge.challengeId, tier, program }),
        );
      }
    }
  }
}
