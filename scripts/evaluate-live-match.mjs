import { writeFile, mkdir } from 'node:fs/promises';
import { evaluationLedger, lockEvaluation } from './evaluation-budget.mjs';

const server = process.env.LIVE_EVALUATION_URL ?? 'http://127.0.0.1:8797';

const reservation = Number(process.env.LIVE_EVALUATION_RESERVATION_USD ?? 2);

if (!Number.isFinite(reservation) || reservation <= 0 || reservation > 2)
  throw new Error('Choose an evaluation reservation above zero and no greater than $2.');

await mkdir('docs/evaluation', { recursive: true });

await lockEvaluation();

if ((await evaluationLedger()).remainingUsd < reservation)
  throw new Error('Insufficient evaluation headroom for the live match reservation.');

const path = `docs/evaluation/live-llama-${Date.now()}.json`;

await writeFile(path, JSON.stringify({ status: 'reserved', accountedUsd: reservation }) + '\n');

const started = Date.now();

const response = await fetch(`${server}/api/dev/exhibition`, {
  method: 'POST',
  headers: { origin: server, 'content-type': 'application/json' },
  body: '{}',
});

if (!response.ok) throw new Error(await response.text());

const { matchId } = await response.json();

await writeFile(
  path,
  JSON.stringify({
    status: 'running',
    accountedUsd: reservation,
    matchId,
    server,
    policyVersion: 'house-4',
  }) + '\n',
);

let replay;

do {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  replay = await fetch(`${server}/api/matches/${matchId}`).then((response) => response.json());

  if (replay.error) throw new Error(replay.error.message);
} while (replay.status === 'active' && Date.now() - started < 30 * 60_000);

const usage = await fetch(`${server}/api/dev/evaluation/${matchId}`).then((response) => response.json());

const summary = {
  at: new Date().toISOString(),
  policyVersion: 'house-4',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  server,
  matchId,
  durationMs: Date.now() - started,
  status: replay.status,
  winner: replay.winner,
  rounds: replay.round,
  ...usage,
  // Keep the full allowance if the driver stops before the table does.
  accountedUsd: replay.status === 'active' ? reservation : usage.accountedUsd,
  discussionMessages: replay.events.filter((event) => event.type === 'chat').length,
  graceEvents: replay.events.filter((event) => event.type === 'grace').length,
  recoveryEvents: replay.events.filter((event) => event.type === 'recovered').length,
};

await writeFile(path, JSON.stringify({ ...summary, replay }, null, 2) + '\n');

console.log(JSON.stringify({ file: path, ...summary }, null, 2));

if (replay.status !== 'finished') process.exitCode = 1;
