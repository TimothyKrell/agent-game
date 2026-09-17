import { describe, expect, it, vi } from 'vitest';
import { Schema } from 'effect';
import { routingCases } from '../src/game/coding-finale/routing';
import { judgeProgram, judgeProgramWithEvidence } from '../src/server/coding-finale/judge';
import { CodingJudgeEvidenceSchema } from '../src/shared/coding-finale-artifacts';

const cases = routingCases(123, 2);

const program = { language: 'javascript', source: 'export default () => 0;' } as const;

type Sandbox = Parameters<typeof judgeProgramWithEvidence>[0];

type Output = Awaited<ReturnType<Awaited<ReturnType<Sandbox['exec']>>['output']>>;

function boundary(stdout: string, overrides: Partial<Omit<Output, 'stdout' | 'stderr'>> = {}) {
  const output = vi.fn<Awaited<ReturnType<Sandbox['exec']>>['output']>();
  output.mockResolvedValue({
    stdout,
    stderr: 'private diagnostic secret',
    exitCode: 0,
    timedOut: false,
    truncated: false,
    ...overrides,
  });
  const kill = vi.fn<Awaited<ReturnType<Sandbox['exec']>>['kill']>();

  const sandbox = {
    mkdir: vi.fn<Sandbox['mkdir']>(),
    writeFile: vi.fn<Sandbox['writeFile']>(),
    exec: vi.fn<Sandbox['exec']>().mockResolvedValue({ output, kill }),
  };

  return { sandbox, output, kill };
}

describe('single-execution judge evidence', () => {
  it.each(['passed', 'failed'] as const)(
    'retains a late %s case and the true full-suite count',
    async (minority) => {
      const answers = cases.map(
        (test, index) => test.expected + ((index === 23) === (minority === 'failed') ? 1 : 0),
      );

      const { sandbox, output } = boundary(JSON.stringify(answers));
      const result = await judgeProgramWithEvidence(sandbox, 'evidence', program, cases);
      expect(result.verdict).toBe('wrong-answer');
      expect(result.evidence.totalCases).toBe(24);
      expect(result.evidence.passedCases).toBe(minority === 'failed' ? 23 : 1);
      expect(result.evidence.cases).toHaveLength(6);
      expect(result.evidence.cases.map((test) => test.index)).toEqual([0, 1, 2, 3, 4, 23]);
      expect(new Set(result.evidence.cases.map((test) => test.status))).toEqual(
        new Set(['passed', 'failed']),
      );

      for (const test of result.evidence.cases) {
        expect(test.input).toEqual(cases[test.index].input);
        expect(test.expected).toBe(cases[test.index].expected);
        expect(test.actual).toBe(answers[test.index]);
      }

      expect(Schema.decodeUnknownSync(CodingJudgeEvidenceSchema)(result.evidence)).toEqual(result.evidence);
      expect(sandbox.exec).toHaveBeenCalledTimes(1);
      expect(output).toHaveBeenCalledTimes(1);
      expect(sandbox.writeFile).toHaveBeenCalledWith(
        '/workspace/evidence/inputs.json',
        JSON.stringify(cases.map((test) => test.input)),
      );
      expect(JSON.stringify(result.evidence)).not.toContain('private diagnostic secret');
    },
  );

  it.each([
    {
      name: 'pass',
      stdout: JSON.stringify(cases.map((test) => test.expected)),
      overrides: {},
      verdict: 'passed',
      format: 'integer-array',
      passed: 24,
    },
    {
      name: 'all wrong',
      stdout: JSON.stringify(cases.map((test) => test.expected + 1)),
      overrides: {},
      verdict: 'wrong-answer',
      format: 'integer-array',
      passed: 0,
    },
    {
      name: 'malformed JSON',
      stdout: 'private malformed secret',
      overrides: {},
      verdict: 'wrong-answer',
      format: 'invalid',
      passed: null,
    },
    {
      name: 'nonintegers',
      stdout: JSON.stringify(cases.map(() => 1.5)),
      overrides: {},
      verdict: 'wrong-answer',
      format: 'invalid',
      passed: null,
    },
    {
      name: 'wrong count',
      stdout: '[1]',
      overrides: {},
      verdict: 'wrong-answer',
      format: 'invalid',
      passed: null,
    },
    { name: 'object', stdout: '{}', overrides: {}, verdict: 'wrong-answer', format: 'invalid', passed: null },
    {
      name: 'timeout precedence',
      stdout: JSON.stringify(cases.map((test) => test.expected)),
      overrides: { timedOut: true, truncated: true, exitCode: 1 },
      verdict: 'time-limit',
      format: 'unavailable',
      passed: null,
    },
    {
      name: 'truncated precedence',
      stdout: '[]',
      overrides: { truncated: true, exitCode: 1 },
      verdict: 'output-limit',
      format: 'unavailable',
      passed: null,
    },
    {
      name: 'runtime error',
      stdout: JSON.stringify(cases.map((test) => test.expected)),
      overrides: { exitCode: 1 },
      verdict: 'runtime-error',
      format: 'unavailable',
      passed: null,
    },
  ])(
    '$name preserves the legacy verdict without inventing answers',
    async ({ stdout, overrides, verdict, format, passed }) => {
      const { sandbox, output } = boundary(stdout, overrides);
      const result = await judgeProgramWithEvidence(sandbox, 'evidence', program, cases);
      expect(result.verdict).toBe(verdict);
      expect(result.evidence.execution.outputFormat).toBe(format);
      expect(result.evidence.passedCases).toBe(passed);
      expect(result.evidence.cases).toHaveLength(6);

      if (passed === null) {
        expect(
          result.evidence.cases.every((test) => test.actual === null && test.status === 'unavailable'),
        ).toBe(true);
      }

      expect(Schema.decodeUnknownSync(CodingJudgeEvidenceSchema)(result.evidence)).toEqual(result.evidence);
      expect(JSON.stringify(result.evidence)).not.toContain('secret');
      expect(sandbox.exec).toHaveBeenCalledTimes(1);
      expect(output).toHaveBeenCalledTimes(1);
      const legacy = boundary(stdout, overrides);
      expect(await judgeProgram(legacy.sandbox, 'legacy', program, cases)).toBe(verdict);
      expect(legacy.sandbox.exec).toHaveBeenCalledTimes(1);
    },
  );

  it('kills a process on output transport failure and propagates the error without rerunning', async () => {
    const { sandbox, output, kill } = boundary('');
    const failure = new Error('transport failed');
    output.mockRejectedValue(failure);
    await expect(judgeProgramWithEvidence(sandbox, 'evidence', program, cases)).rejects.toBe(failure);
    expect(kill).toHaveBeenCalledWith(9);
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });
});
