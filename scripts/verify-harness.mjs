import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { GameClient } from '../cli/agent-game.mjs';
import { supervise } from '../cli/supervisor.mjs';

const harness = process.argv[2];

if (!['claude', 'opencode'].includes(harness))
  throw new Error('Usage: node scripts/verify-harness.mjs claude|opencode');

const server = process.env.HARNESS_ARENA_URL ?? 'http://127.0.0.1:8790';

const dir = await mkdtemp(`/tmp/opencode/agent-game-${harness}-`);

const name = `${harness} liveness ${randomUUID().slice(0, 6)}`;

const login = await fetch(`${server}/api/dev/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: server },
  body: JSON.stringify({ name }),
});

if (!login.ok) throw new Error(`Local login failed: ${login.status}`);

const cookie = login.headers
  .getSetCookie()
  .map((line) => line.split(';')[0])
  .join('; ');

const ownerPost = async (path, body) => {
  const response = await fetch(server + path, {
    method: 'POST',
    headers: { cookie, origin: server, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await response.text());

  return response.json();
};

const agent = await ownerPost('/api/owner/agents', { name });

const token = `agk_${randomBytes(32).toString('base64url')}`;

const client = new GameClient(server, token);

const pairing = await client.request(
  '/api/pairing',
  {
    installation: `${harness} foreground-loop verification`,
    tokenHash: createHash('sha256').update(token).digest('hex'),
  },
  undefined,
  false,
);

await ownerPost('/api/owner/pairing/approve', { code: pairing.code, agentId: agent.id });

await client.request('/api/pairing/status');

await writeFile(`${dir}/connection.json`, JSON.stringify({ server, token, agentId: agent.id }), {
  mode: 0o600,
});

await writeFile(`${dir}/agent-game.mjs`, await readFile('cli/agent-game.mjs'));

await writeFile(
  `${dir}/opencode.json`,
  JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    agents: {
      build: {
        permissions: [
          { action: '*', resource: '*', effect: 'deny' },
          { action: 'shell', resource: 'node agent-game.mjs *', effect: 'allow' },
          { action: 'read', resource: '*', effect: 'allow' },
        ],
      },
    },
  }),
);

const skill = (await readFile('skills/agent-game/SKILL.md', 'utf8')).replaceAll(
  'node cli/agent-game.mjs',
  'node agent-game.mjs',
);

const rules = await readFile('public/rules.md', 'utf8');

const prompt = `You are a competitor in an end-to-end liveness verification of Secret Overlord. Play exactly one whole match autonomously. Your local installation is already paired. All CLI commands MUST be node agent-game.mjs <command> --config connection.json, run in the foreground with a tool timeout >=45000ms. Start with join, wait for the assignment, observe, then follow the live loop below. Make game decisions yourself from legal choices. Do not write scripts or modify source files. Keep your reasoning concise so you can meet 30-second action deadlines. Call wait repeatedly, including through quiet periods. A final answer is allowed only when the match ends or your credential cannot continue. Report match ID, winner, your participation result, and whether foreground wait resumed the loop. This is an unranked local exhibition with scripted opponents.\n\n${skill}\n\n${rules}`;

await mkdir('docs/evaluation', { recursive: true });

const transcript = await open(`${dir}/transcript.jsonl`, 'w');

if (process.argv.includes('--supervised')) {
  let writing = Promise.resolve();
  let result;

  try {
    result = await supervise({
      configPath: `${dir}/connection.json`,
      harness,
      model: harness === 'claude' ? 'haiku' : 'opencode/big-pickle',
      maxBudget: 2,
      onEvent: (event) => {
        writing = writing.then(() => transcript.write(JSON.stringify(event) + '\n'));
      },
    });
  } catch (error) {
    result = { error: error.message };
    process.exitCode = 1;
  }

  await writing;
  await transcript.close();

  const output = {
    harness,
    supervised: true,
    server,
    at: new Date().toISOString(),
    transcript: `${dir}/transcript.jsonl`,
    ...result,
  };

  await writeFile(
    `docs/evaluation/${harness}-supervised-${Date.now()}.json`,
    JSON.stringify(output, null, 2) + '\n',
  );
  console.log(JSON.stringify(output, null, 2));

  if (result.status !== 'finished' || result.you?.forfeited) process.exitCode = 1;
} else {
  let opencodeSession;

  if (harness === 'opencode') {
    const created = await promisify(execFile)(
      'opencode2',
      [
        'api',
        'post',
        '/api/session',
        '--data',
        JSON.stringify({ title: name, agent: 'build', location: { directory: dir } }),
      ],
      { cwd: dir },
    );

    opencodeSession = JSON.parse(created.stdout).data.id;
  }

  const args =
    harness === 'claude'
      ? [
          '-p',
          prompt,
          '--model',
          'haiku',
          '--effort',
          'low',
          '--max-budget-usd',
          '2',
          '--tools',
          'Bash',
          '--allowedTools',
          'Bash(node agent-game.mjs *)',
          '--permission-mode',
          'dontAsk',
          '--strict-mcp-config',
          '--setting-sources',
          '',
          '--output-format',
          'stream-json',
          '--verbose',
        ]
      : ['run', prompt, '--model', 'opencode/big-pickle', '--format', 'json', '--session', opencodeSession];

  const child = spawn(harness === 'claude' ? 'claude' : 'opencode2', args, {
    cwd: dir,
    stdio: ['ignore', transcript.fd, transcript.fd],
    env: process.env,
  });

  const started = Date.now();
  const timeout = setTimeout(() => child.kill('SIGTERM'), 25 * 60_000);
  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(timeout);
  await transcript.close();
  const state = JSON.parse(await readFile(`${dir}/connection.json`, 'utf8'));
  const view = state.matchId ? await client.observation(state.matchId).catch(() => null) : null;

  const result = {
    harness,
    at: new Date().toISOString(),
    exitCode: code,
    durationMs: Date.now() - started,
    matchId: state.matchId ?? null,
    status: view?.status ?? null,
    forfeited: view?.you?.forfeited ?? null,
    winner: view?.winner ?? null,
    transcript: `${dir}/transcript.jsonl`,
    model: harness === 'claude' ? 'haiku' : 'opencode/big-pickle',
  };

  await writeFile(`docs/evaluation/${harness}-liveness.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));

  if (view?.status !== 'finished' || view?.you?.forfeited) process.exitCode = 1;
}
