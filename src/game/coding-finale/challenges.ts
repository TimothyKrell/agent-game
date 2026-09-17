import { routingCases, routingChallenge } from './routing';
import { PUZZLES, puzzleCases } from './puzzles';
import type { Tier } from './types';
import type { CodingCase } from './puzzle-input';

export const CHALLENGE_FAMILIES = ['scheduled-network-1', ...PUZZLES.map((puzzle) => puzzle.id)];

export function codingChallenge(family: string, tier: Tier) {
  if (family === 'scheduled-network-1') return routingChallenge(tier);
  const puzzle = PUZZLES.find((entry) => entry.id === family);

  if (!puzzle) throw new Error(`Unknown coding family: ${family}`);

  return {
    family,
    tier,
    title: `${puzzle.title}${tier === 2 ? ' at scale' : ''}`,
    statement: [
      puzzle.statement,
      'Export solve(input) from a JavaScript ES module or erasable TypeScript module; return one integer. No packages, network access, or printed answers.',
      `Tier ${tier} limits: arrays and strings have at most ${tier === 1 ? 8 : 48} entries/ASCII characters; graphs have at most ${tier === 1 ? 5 : 15} nodes and twice that many edges; grids at most ${tier === 1 ? '5 by 6' : '15 by 16'}.`,
      'Numeric array values are -20..30 when negatives are allowed by the contract, otherwise 0..30 (strictly positive where specified); graph weights are 0..20; k is 0..30 unless it denotes a valid window size or one-based pair rank. Inputs satisfy the family contract. Ignore fields not mentioned in the problem.',
      'Each tier is judged on a distinct deterministic suite of unseen inputs; all finalists receive the same suite. Integer answers fit the JavaScript safe integer range. Tier 2 requires handling the larger bounds efficiently.',
    ].join('\n'),
    example: structuredClone(puzzle.example),
    starter:
      'export function solve(input) {\n  // Return the integer specified by the problem.\n  return 0;\n}\n',
  };
}

export function codingCases(family: string, seed: number, tier: Tier): CodingCase[] {
  return family === 'scheduled-network-1' ? routingCases(seed, tier) : puzzleCases(family, seed, tier);
}
