import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { PUZZLES, puzzleCases } from '../src/game/coding-finale/puzzles';
import { CHALLENGE_FAMILIES, codingChallenge } from '../src/game/coding-finale/challenges';
import { CodingInputSchema, type PuzzleInput } from '../src/game/coding-finale/puzzle-input';

describe('versioned coding challenge catalog', () => {
  it('contains thirty additional distinct contracts with correct published examples', () => {
    expect(PUZZLES).toHaveLength(30);
    expect(new Set(CHALLENGE_FAMILIES).size).toBe(31);

    for (const puzzle of PUZZLES) {
      expect(puzzle.solve(structuredClone(puzzle.example.input)), puzzle.id).toBe(puzzle.example.expected);
      expect(codingChallenge(puzzle.id, 2).statement).not.toBe(codingChallenge(puzzle.id, 1).statement);
    }
  });

  it('freezes seeded suites, varies private seeds and tiers, and produces bounded integer evidence', () => {
    for (const puzzle of PUZZLES)
      for (const tier of [1, 2] as const) {
        const cases = puzzleCases(puzzle.id, 8123, tier);
        expect(cases).toEqual(puzzleCases(puzzle.id, 8123, tier));
        expect(cases).not.toEqual(puzzleCases(puzzle.id, 8124, tier));
        expect(cases).toHaveLength(24);

        for (const entry of cases) {
          expect(Schema.is(CodingInputSchema)(entry.input), puzzle.id).toBe(true);
          expect(Number.isSafeInteger(entry.expected), puzzle.id).toBe(true);
        }

        expect(new Set(cases.map((entry) => entry.expected)).size, puzzle.id).toBeGreaterThan(1);
      }
  });

  const fixtures: [string, PuzzleInput, number][] = [
    ['signal-run', { values: [-5, -2] }, 0],
    ['rising-relays', { values: [2, 2, 2] }, 1],
    ['crossed-signals', { values: [4, 3, 2, 1] }, 6],
    ['cargo-manifest', { values: [2], other: [7], k: 4 }, 7],
    ['token-exchange', { values: [2, 4], k: 0 }, 0],
    ['subset-beacons', { values: [0, 0, 1], k: 1 }, 4],
    ['balanced-cargo', { values: [8] }, 8],
    ['transmission-repair', { text: '', pattern: 'abc' }, 3],
    ['shared-protocol', { text: 'abba', pattern: 'baba' }, 3],
    ['mirror-packets', { text: '' }, 0],
    ['unique-channel', { text: 'aaaa' }, 1],
    ['channel-budget', { text: 'aaa', k: 0 }, 0],
    ['bracket-repair', { text: '(()())' }, 0],
    ['skyline-storage', { values: [0, 2, 2, 0] }, 4],
    ['rain-reserves', { values: [1, 2, 3] }, 0],
    [
      'island-network',
      {
        grid: [
          [1, 1],
          [1, 1],
        ],
      },
      1,
    ],
    ['blocked-corridors', { grid: [[1]] }, 0],
    [
      'square-shields',
      {
        grid: [
          [1, 0],
          [1, 1],
        ],
      },
      1,
    ],
    ['relay-distance', { n: 2, edges: [] }, -1],
    ['cable-budget', { n: 1, edges: [] }, 0],
    ['mutual-reach', { n: 3, edges: [] }, 3],
    [
      'dependency-depth',
      {
        n: 2,
        edges: [
          [0, 1, 0],
          [1, 0, 0],
        ],
      },
      -1,
    ],
    [
      'crew-assignment',
      {
        grid: [
          [1, 0],
          [1, 0],
          [1, 0],
        ],
      },
      1,
    ],
    [
      'dock-booking',
      {
        edges: [
          [0, 5, 4],
          [1, 3, 9],
          [3, 5, 2],
        ],
      },
      11,
    ],
    ['deadline-rewards', { values: [1, 1, 1], other: [5, 10, 3] }, 10],
    ['window-median', { values: [2, 4, 1], k: 1 }, 7],
    ['pair-distance', { values: [1, 1, 1], k: 3 }, 0],
    ['matrix-pipeline', { values: [5, 9] }, 0],
    ['merge-files', { values: [5] }, 0],
    ['bounded-sums', { values: [0, 0, 0], k: 0 }, 6],
  ];

  it.each(fixtures)('%s handles its boundary contract', (id, input, expected) => {
    expect(PUZZLES.find((puzzle) => puzzle.id === `${id}-1`)!.solve(input)).toBe(expected);
  });

  it('agrees with exhaustive subset enumeration for optimization and counting families', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const values = Array.from({ length: 8 }, (_, i) => (seed * (i + 3) + i * i) % 7);
      const subsets = Array.from({ length: 256 }, (_, mask) => values.filter((_, i) => mask & (1 << i)));

      const solve = (id: string, input: PuzzleInput) =>
        PUZZLES.find((puzzle) => puzzle.id === `${id}-1`)!.solve(input);

      expect(solve('subset-beacons', { values, k: seed })).toBe(
        subsets.filter((items) => items.reduce((a, b) => a + b, 0) === seed).length,
      );
      const total = values.reduce((a, b) => a + b, 0);
      expect(solve('balanced-cargo', { values })).toBe(
        Math.min(...subsets.map((items) => Math.abs(total - 2 * items.reduce((a, b) => a + b, 0)))),
      );
      expect(solve('rising-relays', { values })).toBe(
        Math.max(
          ...subsets
            .filter((items) => items.every((v, i) => i === 0 || v > items[i - 1]))
            .map((items) => items.length),
        ),
      );
    }
  });
});
