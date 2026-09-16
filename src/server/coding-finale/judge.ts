import { Schema } from 'effect';
import type { ISandbox } from '@cloudflare/sandbox';
import type { Program, Verdict } from '../../game/coding-finale/types';
import { FINALE_RULES } from '../../game/coding-finale/types';
import type { RoutingCase, RoutingInput } from '../../game/coding-finale/routing';

type ExecutionSandbox = Pick<ISandbox, 'mkdir' | 'writeFile' | 'exec'>;

export async function runProgram(
  sandbox: ExecutionSandbox,
  executionId: string,
  program: Program,
  inputs: RoutingInput[],
) {
  // IDs are host-owned; they never contain contestant paths or shell fragments.
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(executionId)) throw new Error('Invalid execution identity.');
  const directory = `/workspace/${executionId}`;
  const filename = `${directory}/solution.${program.language === 'typescript' ? 'mts' : 'mjs'}`;
  await sandbox.mkdir(directory, { recursive: true });
  await Promise.all([
    sandbox.writeFile(filename, program.source),
    sandbox.writeFile(`${directory}/inputs.json`, JSON.stringify(inputs)),
  ]);

  const process = await sandbox.exec(
    [
      '/usr/local/bin/finale-node',
      '--permission',
      `--allow-fs-read=${directory}`,
      '--allow-fs-read=/opt/finale/runner.mjs',
      '--max-old-space-size=128',
      '--disable-proto=throw',
      '/opt/finale/runner.mjs',
      filename,
      `${directory}/inputs.json`,
    ],
    { cwd: directory, timeout: FINALE_RULES.executionMs },
  );

  // Remote timeout terminates the process; the output timeout only bounds this RPC wait.
  try {
    return await process.output({
      encoding: 'utf8',
      maxBytes: FINALE_RULES.maxOutputBytes,
      timeout: 10_000,
    });
  } catch (error) {
    await process.kill(9);
    throw error;
  }
}

export async function judgeProgram(
  sandbox: ExecutionSandbox,
  executionId: string,
  program: Program,
  cases: RoutingCase[],
): Promise<Verdict> {
  const result = await runProgram(
    sandbox,
    executionId,
    program,
    cases.map((test) => test.input),
  );

  if (result.timedOut) return 'time-limit';

  if (result.truncated) return 'output-limit';

  if (result.exitCode !== 0) return 'runtime-error';

  try {
    const answers = Schema.decodeUnknownSync(Schema.Array(Schema.Int))(JSON.parse(result.stdout));

    return answers.length === cases.length &&
      answers.every((answer, index) => answer === cases[index].expected)
      ? 'passed'
      : 'wrong-answer';
  } catch {
    return 'wrong-answer';
  }
}
