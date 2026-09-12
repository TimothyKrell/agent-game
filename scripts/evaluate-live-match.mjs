import { writeFile, mkdir } from 'node:fs/promises';
import { Schema } from 'effect';
import { evaluationLedger, lockEvaluation } from './evaluation-budget.mjs';

const HouseModel = Schema.Struct({
  provider: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  policyVersion: Schema.NonEmptyString,
});

const server = process.env.LIVE_EVALUATION_URL ?? 'http://127.0.0.1:8797';

const reservation = Number(process.env.LIVE_EVALUATION_RESERVATION_USD ?? 2);

const requestedModel = process.env.HOUSE_MODEL || null;

if (!Number.isFinite(reservation) || reservation <= 0 || reservation > 2)
  throw new Error('Choose an evaluation reservation above zero and no greater than $2.');

await mkdir('docs/evaluation', { recursive: true });

await lockEvaluation();

if ((await evaluationLedger()).remainingUsd < reservation)
  throw new Error('Insufficient evaluation headroom for the live match reservation.');

const path = `docs/evaluation/live-${Date.now()}.json`;

await writeFile(
  path,
  JSON.stringify({ status: 'reserved', requestedModel, accountedUsd: reservation }) + '\n',
);

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
    requestedModel,
    accountedUsd: reservation,
    matchId,
    server,
  }) + '\n',
);

let houseModel;

try {
  // Match indexing is asynchronous; allow its persisted configuration to arrive.
  for (let attempt = 0; attempt < 10; attempt++) {
    const evidence = await fetch(`${server}/api/dev/evaluation/${matchId}`);

    if (!evidence.ok) throw new Error(`Model evidence request failed: HTTP ${evidence.status}.`);
    const usage = await evidence.json();

    if (usage.houseModel != null) {
      houseModel = usage.houseModel;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!Schema.is(HouseModel)(houseModel))
    throw new Error(
      'The server did not provide a persisted house-model configuration; the evaluation cannot be labeled.',
    );

  if (requestedModel !== null && requestedModel !== houseModel.model)
    throw new Error(
      `Requested HOUSE_MODEL ${requestedModel}, but match ${matchId} uses ${houseModel.model}. Configure the evaluation Worker to use the requested model.`,
    );
} catch (error) {
  await writeFile(
    path,
    JSON.stringify(
      {
        status: 'model-verification-failed',
        requestedModel,
        houseModel,
        matchId,
        server,
        accountedUsd: reservation,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
}

const { model, provider, policyVersion } = houseModel;

await writeFile(
  path,
  JSON.stringify({
    status: 'running',
    requestedModel,
    model,
    provider,
    policyVersion,
    matchId,
    server,
    accountedUsd: reservation,
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
  ...usage,
  policyVersion,
  model,
  provider,
  requestedModel,
  reservationUsd: reservation,
  server,
  matchId,
  durationMs: Date.now() - started,
  status: replay.status,
  winner: replay.winner,
  rounds: replay.round,
  // Keep the full allowance if the driver stops before the table does.
  accountedUsd: replay.status === 'active' ? reservation : usage.accountedUsd,
  discussionMessages: replay.events.filter((event) => event.type === 'chat').length,
  graceEvents: replay.events.filter((event) => event.type === 'grace').length,
  recoveryEvents: replay.events.filter((event) => event.type === 'recovered').length,
};

await writeFile(path, JSON.stringify({ ...summary, replay }, null, 2) + '\n');

console.log(JSON.stringify({ file: path, ...summary }, null, 2));

if (replay.status !== 'finished') process.exitCode = 1;
