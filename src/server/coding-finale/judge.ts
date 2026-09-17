import { Schema } from 'effect';
import type { ISandbox, ProcessOutput, ProcessTextOutputOptions } from '@cloudflare/sandbox';
import type { Program, Verdict } from '../../game/coding-finale/types';
import { FINALE_RULES } from '../../game/coding-finale/types';
import type { CodingCase, CodingInput } from '../../game/coding-finale/puzzle-input';
import type { CodingJudgeEvidence } from '../../shared/coding-finale-artifacts';

type ExecutionSandbox = Pick<ISandbox, 'mkdir' | 'writeFile'> & {
  exec(...args: Parameters<ISandbox['exec']>): Promise<{
    output(options: ProcessTextOutputOptions): Promise<ProcessOutput<string>>;
    kill(signal?: number): Promise<void>;
  }>;
};

export async function runProgram(
  sandbox: ExecutionSandbox,
  executionId: string,
  program: Program,
  inputs: CodingInput[],
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
  cases: CodingCase[],
): Promise<Verdict> {
  return (await judgeProgramWithEvidence(sandbox, executionId, program, cases)).verdict;
}

export async function judgeProgramWithEvidence(
  sandbox: ExecutionSandbox,
  executionId: string,
  program: Program,
  cases: CodingCase[],
): Promise<{ verdict: Verdict; evidence: CodingJudgeEvidence }> {
  const result = await runProgram(
    sandbox,
    executionId,
    program,
    cases.map((test) => test.input),
  );

  let answers: readonly number[] | null = null;
  let outputFormat: CodingJudgeEvidence['execution']['outputFormat'] = 'unavailable';
  let verdict: Verdict;

  if (result.timedOut) verdict = 'time-limit';
  else if (result.truncated) verdict = 'output-limit';
  else if (result.exitCode !== 0) verdict = 'runtime-error';
  else {
    outputFormat = 'invalid';

    try {
      const parsed = Schema.decodeUnknownSync(Schema.Array(Schema.Int))(JSON.parse(result.stdout));

      if (parsed.length === cases.length) {
        answers = parsed;
        outputFormat = 'integer-array';
      }
    } catch {
      // Malformed output is a wrong answer; never retain contestant diagnostics.
    }

    verdict = answers?.every((answer, index) => answer === cases[index].expected) ? 'passed' : 'wrong-answer';
  }

  const allCases: CodingJudgeEvidence['cases'] = cases.map((test, index) => ({
    index,
    input: test.input,
    expected: test.expected,
    actual: answers === null ? null : answers[index],
    status: answers === null ? 'unavailable' : answers[index] === test.expected ? 'passed' : 'failed',
  }));

  const selected = allCases.slice(0, 6);

  // Keep original suite indices and include both outcomes even when the first six agree.
  for (const status of ['passed', 'failed'] as const) {
    const representative = allCases.find((test) => test.status === status);

    if (representative && !selected.some((test) => test.status === status))
      selected[selected.length - 1] = representative;
  }

  return {
    verdict,
    evidence: {
      status: 'recorded',
      totalCases: cases.length,
      passedCases: answers === null ? null : allCases.filter((test) => test.status === 'passed').length,
      cases: selected,
      execution: {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        outputFormat,
      },
    },
  };
}
