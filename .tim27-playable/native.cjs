// Executable protocol fixture only: no model or harness service is contacted.
const fs = require('node:fs');

const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);

const log = (event) =>
  fs.appendFileSync(process.env.PLAYABLE_NATIVE_LOG, JSON.stringify({ at: Date.now(), ...event }) + '\n');

const done = () =>
  console.log(
    JSON.stringify({ type: 'result', subtype: 'success', session_id: 'ses_playable', total_cost_usd: 0.01 }),
  );

log({ type: 'native-api', args: args[0] === 'api' ? args : [args[0]] });

if (args[0] === 'api') {
  console.log(
    JSON.stringify({
      data:
        args[1] === 'post' && args[2] === '/api/session'
          ? { id: 'ses_playable', location: { directory: process.cwd() } }
          : { id: 'ses_playable', cost: 0.01, time: { idle: Date.now() } },
    }),
  );
} else {
  process.on('SIGTERM', () => {
    done();
    process.exit(0);
  });
  const prompt = args[1];
  const rulesPath = prompt.match(/; rules ([^;]+); protocol/)[1];
  log({
    type: 'loaded',
    rulesPath,
    rules: fs.readFileSync(rulesPath, 'utf8'),
    wrapper: fs.readFileSync('agent-game.mjs', 'utf8'),
    deadline: process.env.AGENT_GAME_CHILD_DEADLINE,
  });

  const cli = (...command) => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ['agent-game.mjs', ...command, '--config', process.env.PLAYABLE_TARGET_CONFIG],
        { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
      ),
    );

    log({
      type: 'cli',
      command,
      status: result.status,
      phase: result.phase?.id,
      decision: result.decision?.id,
      required: !!result.decision && !result.decision.submitted,
      accepted: result.accepted,
      cursor: result.cursor,
    });

    return result;
  };

  (async () => {
    let spoken = false;

    for (let step = 0; step < 1600; step++) {
      let view = cli('observe');

      if (view.status !== 'active') {
        log({ type: 'terminal', view });
        done();

        return;
      }

      if (view.decision && process.env.PLAYABLE_NATIVE_MODE === 'late-required') {
        log({ type: 'simulated-latency', phaseId: view.phase.id, decisionId: view.decision.id });
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      if (view.decision && !view.decision.submitted) {
        cli('act', '--choice', '0');
        continue;
      }

      if (!spoken && view.chat?.open && !view.you?.forfeited) {
        if (view.protocolVersion === '2') {
          const through = view.history.streamHead;
          let after = Math.max(0, through - 10);

          for (;;) {
            const page = cli(
              'history',
              '--epoch',
              view.history.visibilityEpoch,
              '--through',
              String(through),
              '--after',
              String(after),
              '--limit',
              '10',
              '--max-bytes',
              '12288',
            );

            after = page.cursor;
            view = cli('observe');

            if (view.decision || !page.hasMore) break;
          }
        }

        view = cli('observe');

        if (view.decision) continue;
        cli('say', '--text', 'Local native fixture: delivered context read; required choices first.');
        spoken = true;
      }

      log({ type: 'phase-ready', phase: view.phase.id, matchId: view.matchId });
      cli('wait', '--timeout', '1');
    }

    throw new Error('Native fixture step ceiling reached');
  })().catch((error) => {
    let problem;

    try {
      problem = JSON.parse(String(error.stdout)).error;
    } catch {
      /* Retain process message below. */
    }

    log({ type: 'failure', message: error.message, problem });
    console.error(error.message);
    process.exitCode = 1;
  });
}
