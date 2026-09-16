import { getSandbox, Sandbox } from '@cloudflare/sandbox';
import type { Program, Tier } from '../game/coding-finale/types';
import type { RoutingInput } from '../game/coding-finale/routing';
import { routingCases } from '../game/coding-finale/routing';
import { judgeProgram, runProgram } from './coding-finale/judge';

/** Separate contestant development and judge containers; expected answers stay in the Worker. */
export class CodingSandbox extends Sandbox<Env> {
  override enableInternet = false;
  override sleepAfter = '2m';
}

export type CodingRuntimeEnv = Pick<Env, 'CODING_SANDBOXES'>;

function environment(env: CodingRuntimeEnv, matchId: string, seat: number, purpose: 'practice' | 'judge') {
  return getSandbox(env.CODING_SANDBOXES, `${matchId}-${seat}-${purpose}`, { keepAlive: true });
}

export async function prepareCodingEnvironment(env: CodingRuntimeEnv, matchId: string, seat: number) {
  await Promise.all(
    (['practice', 'judge'] as const).map(async (purpose) => {
      const sandbox = environment(env, matchId, seat, purpose);
      const process = await sandbox.exec(['/usr/local/bin/finale-node', '--version'], { timeout: 2000 });
      const output = await process.output({ encoding: 'utf8', maxBytes: 128, timeout: 15_000 });

      if (output.exitCode !== 0 || output.stdout.trim() !== 'v24.14.0')
        throw new Error('Pinned coding runtime unavailable.');
    }),
  );
}

export function practiceCodingProgram(
  env: CodingRuntimeEnv,
  matchId: string,
  seat: number,
  run: number,
  program: Program,
  inputs: RoutingInput[],
) {
  return runProgram(environment(env, matchId, seat, 'practice'), `practice-${run}`, program, inputs);
}

export function judgeCodingSubmission(
  env: CodingRuntimeEnv,
  matchId: string,
  seat: number,
  sequence: number,
  program: Program,
  seed: number,
  tier: Tier,
) {
  return judgeProgram(
    environment(env, matchId, seat, 'judge'),
    `submission-${sequence}`,
    program,
    routingCases(seed, tier),
  );
}

export async function closeCodingEnvironment(env: CodingRuntimeEnv, matchId: string, seat: number) {
  await Promise.all(
    (['practice', 'judge'] as const).map((purpose) => environment(env, matchId, seat, purpose).destroy()),
  );
}
