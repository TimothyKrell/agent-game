import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args[0] === 'api') {
  appendFileSync(process.env.PROTOCOL_NATIVE_LOG, JSON.stringify({ nativeApi: args.slice(0, 3) }) + '\n');
  console.log(
    JSON.stringify({
      data:
        args[1] === 'post'
          ? { id: 'ses_protocol', location: { directory: process.cwd() } }
          : { id: 'ses_protocol', cost: 0.01, time: { idle: Date.now() } },
    }),
  );
} else {
  for (const command of [['observe'], ['act', '--choice', '0'], ['observe']]) {
    const value = JSON.parse(
      execFileSync(
        process.execPath,
        ['agent-game.mjs', ...command, '--config', process.env.PROTOCOL_NATIVE_CONFIG],
        { encoding: 'utf8' },
      ),
    );

    appendFileSync(
      process.env.PROTOCOL_NATIVE_LOG,
      JSON.stringify({ command, status: value.status, accepted: value.accepted }) + '\n',
    );
  }

  console.log(
    JSON.stringify({ type: 'result', subtype: 'success', session_id: 'ses_protocol', total_cost_usd: 0.01 }),
  );
}
