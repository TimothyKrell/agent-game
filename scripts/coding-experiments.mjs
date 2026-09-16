import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// Dedicated $5 allocation: deliberately separate from the historical $10 evaluation ledger.
const directory = 'docs/evaluation';

mkdirSync(directory, { recursive: true });

const ledgerPath = `${directory}/coding-finale-budget.json`;

const lockPath = '.agent-game/coding-experiments.lock';

closeSync(openSync(lockPath, 'wx'));

process.once('exit', () => unlinkSync(lockPath));

const ledger = (() => {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

    return { limitUsd: 5, races: [], calls: [] };
  }
})();

const saveLedger = () => {
  writeFileSync(`${ledgerPath}.pending`, JSON.stringify(ledger, null, 2), { flush: true });
  renameSync(`${ledgerPath}.pending`, ledgerPath);
};

if (ledger.races.length >= 2) throw new Error('Two-race maximum reached');

const operator = JSON.parse(readFileSync('.agent-game/finale-lab/operator.json', 'utf8'));

const worker = 'http://127.0.0.1:8798';

async function http(url, token, body) {
  const headers = { 'content-type': 'application/json' };

  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(70_000),
  });

  const value = await response.json();

  if (!response.ok) throw new Error(JSON.stringify(value));

  return value;
}

await http(`${worker}/health`);

const race = {
  index: ledger.races.length + 1,
  createdAt: Date.now(),
  label: 'SCRIPTED ACT1 + REAL CODING FINALE',
};

ledger.races.push(race);

saveLedger();

const artifact = `${directory}/coding-finale-race-${race.index}.jsonl`;

const log = (type, data) =>
  appendFileSync(artifact, JSON.stringify({ at: Date.now(), type, ...data }) + '\n');

log('provenance', {
  label: race.label,
  concurrency: 'all surviving finalists, alternating GLM and Llama',
  files: Object.fromEntries(
    [
      'src/server/coding-house.ts',
      'src/server/house-model.ts',
      'scripts/coding-evaluation-worker.ts',
      'scripts/coding-experiments.mjs',
    ].map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]),
  ),
});

const created = await http(`${operator.origin}/lab/finales`, operator.token, {});

race.matchId = created.current.id;

saveLedger();

log('created', { current: created.current, actOne: created.actOne });

const privatePath = `.agent-game/finale-lab/coding-experiment-${race.index}.json`;

writeFileSync(privatePath, JSON.stringify(created), { mode: 0o600 });

const base = `${operator.origin}/finales/${race.matchId}`;

let current = created.current;

while (current.status === 'preparing') {
  await sleep(500);
  current = await http(`${base}/current`);
}

log('ready', { current });

const models = ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

async function contestant(credential, index) {
  const { seat, token } = credential;
  const model = models[index % models.length];
  log('contestant', { seat, model });
  let priorProgram = null;
  let failures = 0;

  async function generate(context, candidate = null, practice = null) {
    const body = { model, deadline: current.deadline, context, candidate, practice };
    const quote = await http(`${worker}/quote`, null, body);
    const accounted = ledger.calls.reduce((sum, call) => sum + (call.costUsd ?? call.reservedUsd), 0);

    if (accounted + quote.reservedUsd > ledger.limitUsd) throw new Error('Budget exhausted');

    const call = {
      id: randomUUID(),
      race: race.index,
      seat,
      model,
      startedAt: Date.now(),
      reservedUsd: quote.reservedUsd,
    };

    ledger.calls.push(call);
    saveLedger(); // synchronous reservation before inference, safe across concurrent contestant loops
    log('request', { callId: call.id, seat, ...quote });

    try {
      const result = await http(`${worker}/generate`, null, body);
      Object.assign(call, {
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        status: 'completed',
      });
      saveLedger();
      log('generation', { seat, callId: call.id, result });

      return result.value;
    } catch (error) {
      Object.assign(call, {
        status: 'provider-or-generation-error',
        error: String(error),
        latencyMs: Date.now() - call.startedAt,
      });
      saveLedger();
      log('generation-error', { seat, call });
      throw error;
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const me = await http(`${base}/me`, token);

    if (me.status !== 'racing' || Date.now() >= me.deadline - 1500) break;
    const tier = me.you.unlockedTier;
    const challenge = await http(`${base}/challenge?tier=${tier}`, token);
    const context = { challenge, priorProgram, feedback: me.submissions.filter((s) => s.seat === seat) };

    try {
      const candidate = await generate(context);
      const practiceStarted = Date.now();

      const practice = await http(`${base}/practice`, token, {
        program: candidate.program,
        inputs: [challenge.example.input, ...candidate.inputs].slice(0, 8),
      });

      log('practice', { seat, tier, latencyMs: Date.now() - practiceStarted, practice });
      const revision = await generate(context, candidate, { ok: true, value: practice });
      priorProgram = revision.program;

      const actionId = createHash('sha256')
        .update(JSON.stringify([tier, priorProgram]))
        .digest('hex');

      const receipt = await http(`${base}/submit`, token, {
        actionId,
        challengeId: challenge.challengeId,
        tier,
        program: priorProgram,
      });

      log('submission', { seat, tier, receipt });
      let view;

      do {
        await sleep(300);
        view = await http(`${base}/me`, token);
      } while (
        view.status === 'racing' &&
        view.submissions.some((s) => s.seat === seat && s.status === 'pending')
      );

      log('verdict', { seat, tier, current: view });
    } catch (error) {
      log('contestant-error', { seat, tier, error: String(error) });

      if (++failures >= 2) break;
    }
  }
}

await Promise.all(
  created.credentials.map((credential, index) =>
    contestant(credential, index).catch((error) =>
      log('contestant-stopped', { seat: credential.seat, error: String(error) }),
    ),
  ),
);

while (!['finished', 'interrupted'].includes(current.status)) {
  await sleep(1000);
  current = await http(`${base}/current`);
}

log('terminal', { current });

race.terminal = current;

saveLedger();

console.log(
  JSON.stringify(
    {
      artifact,
      current,
      accountedUsd: ledger.calls.reduce((sum, c) => sum + (c.costUsd ?? c.reservedUsd), 0),
    },
    null,
    2,
  ),
);
