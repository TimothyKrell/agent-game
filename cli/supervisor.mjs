import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameClient } from './agent-game.mjs';

async function invokeHarness({ harness, model, prompt, sessionId, runDir, remainingBudget, onEvent }) {
  const args =
    harness === 'claude'
      ? [
          '-p',
          prompt,
          '--model',
          model ?? 'haiku',
          '--effort',
          'low',
          '--max-budget-usd',
          String(remainingBudget),
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
          ...(sessionId ? ['--resume', sessionId] : []),
        ]
      : ['run', prompt, ...(model ? ['--model', model] : []), '--format', 'json', '--session', sessionId];

  const child = spawn(harness === 'claude' ? 'claude' : 'opencode2', args, {
    cwd: runDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let costUsd = 0;
  let stopped = false;
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();

    for (;;) {
      const newline = buffer.indexOf('\n');

      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let event;

      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      sessionId = event.session_id ?? event.sessionID ?? sessionId;

      if (event.type === 'result' && Number.isFinite(event.total_cost_usd) && event.total_cost_usd >= 0)
        costUsd = event.total_cost_usd;
      onEvent({ type: 'harness-event', harness, event });
    }
  });
  child.stderr.on('data', (chunk) =>
    onEvent({ type: 'harness-diagnostic', harness, text: chunk.toString() }),
  );

  const stop = () => {
    stopped = true;
    child.kill('SIGTERM');
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const timer = setTimeout(stop, 30 * 60_000);
  let exitCode;

  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }

  if (stopped) throw new Error('Supervised run stopped before the server result.');

  return { exitCode, sessionId, costUsd };
}

/** Harness exit is advisory. Only the arena's terminal state completes a supervised run. */
export async function supervise(
  { configPath, harness, model, maxBudget = 2, onEvent = () => {} },
  invoke = invokeHarness,
) {
  if (!['claude', 'opencode'].includes(harness)) throw new Error('Choose --harness claude or opencode.');

  if (!Number.isFinite(maxBudget) || maxBudget <= 0)
    throw new Error('Use a positive --budget for Claude API accounting.');
  const installed = dirname(fileURLToPath(import.meta.url));
  const config = resolve(configPath);
  const parent = dirname(config);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const runDir = await mkdtemp(`${parent}/run-`);
  await writeFile(`${runDir}/agent-game.mjs`, await readFile(`${installed}/agent-game.mjs`));
  await writeFile(
    `${runDir}/opencode.json`,
    JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      agents: {
        build: {
          permissions: [
            { action: '*', resource: '*', effect: 'deny' },
            { action: 'shell', resource: 'node agent-game.mjs *', effect: 'allow' },
            { action: 'external_directory', resource: `${parent}/*`, effect: 'allow' },
          ],
        },
      },
    }),
  );

  const skill = (await readFile(`${installed}/../skills/agent-game/SKILL.md`, 'utf8')).replaceAll(
    'node cli/agent-game.mjs',
    'node agent-game.mjs',
  );

  const rules = await readFile(`${installed}/../public/rules.md`, 'utf8');
  let sessionId;
  let spent = 0;
  let launches = 0;
  let failures = 0;
  const started = Date.now();

  if (harness === 'opencode') {
    const created = await promisify(execFile)(
      'opencode2',
      [
        'api',
        'post',
        '/api/session',
        '--data',
        JSON.stringify({
          title: 'Agent Game supervised competitor',
          agent: 'build',
          location: { directory: runDir },
        }),
      ],
      { cwd: runDir },
    );

    const data = JSON.parse(created.stdout).data;

    if (!data?.id || data.location?.directory !== runDir)
      throw new Error('OpenCode did not create the requested run location.');
    sessionId = data.id;
  }

  for (;;) {
    const connection = JSON.parse(await readFile(config, 'utf8'));
    const client = new GameClient(connection.server, connection.token);
    const queue = await client.request('/api/queue');

    const matchId =
      queue.status === 'queued' || queue.status === 'starting'
        ? queue.matchId
        : (queue.matchId ?? connection.matchId);

    const view = matchId ? await client.observation(matchId) : null;

    if (view && view.status !== 'active')
      return {
        status: view.status,
        matchId,
        winner: view.winner,
        you: view.you,
        restarts: Math.max(0, launches - 1),
        invocations: launches,
        costUsd: harness === 'claude' ? spent : null,
        durationMs: Date.now() - started,
      };

    if (Date.now() - started > 35 * 60_000)
      throw new Error('Supervisor runtime allowance reached while play remains active.');

    if (harness === 'claude' && spent >= maxBudget)
      throw new Error('Harness budget allowance reached while play remains active.');

    if (launches >= 6 || failures >= 3)
      throw new Error('Harness repeatedly ended before the server result. Inspect the harness diagnostics.');

    const current = view
      ? `The SERVER says match ${view.matchId} is ACTIVE, phase ${view.phase.kind}, round ${view.round}. Continue this same participation now; any earlier final answer was premature.`
      : 'Start exactly one match: run join, then status until assigned.';

    const shellPath = `'${config.replaceAll("'", "'\\''")}'`;
    const prompt = `${current}\nYou are a Secret Overlord competitor. Use only foreground CLI tool calls, never mechanical decision scripts. Working directory: ${runDir}. All commands are node agent-game.mjs <command> --config ${shellPath}. Tools need >=90000ms timeouts. Make deliberate legal choices and useful public discussion. Keep responses concise. Call wait repeatedly through quiet periods. Only server status finished/interrupted permits a final result.\n${launches === 0 ? `${skill}\n${rules}` : ''}`;

    const result = await invoke({
      harness,
      model,
      prompt,
      sessionId,
      runDir,
      remainingBudget: maxBudget - spent,
      onEvent,
    });

    sessionId = result.sessionId;
    spent += result.costUsd;
    launches++;
    failures = result.exitCode === 0 ? 0 : failures + 1;
    onEvent({ type: 'harness-exited', exitCode: result.exitCode, invocations: launches, costUsd: spent });
  }
}
