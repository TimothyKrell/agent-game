import type { PuzzleInput } from './puzzle-input';
import type { Tier } from './types';

interface Puzzle {
  id: string;
  title: string;
  statement: string;
  example: { input: PuzzleInput; expected: number };
  solve: (input: PuzzleInput) => number;
}

const definition = (
  id: string,
  title: string,
  statement: string,
  input: PuzzleInput,
  expected: number,
  solve: Puzzle['solve'],
): Puzzle => ({ id: `${id}-1`, title, statement, example: { input, expected }, solve });

/** Trusted oracles are never sent to contestant containers. Each family has its own frozen contract. */
export const PUZZLES: readonly Puzzle[] = [
  definition(
    'signal-run',
    'Signal recovery',
    'Given integer values, return the maximum sum of a contiguous segment. The empty segment is allowed and has sum 0.',
    { values: [-2, 4, -1, 3, -8] },
    6,
    ({ values = [] }) => {
      let best = 0,
        end = 0;

      for (const value of values) {
        end = Math.max(0, end + value);
        best = Math.max(best, end);
      }

      return best;
    },
  ),
  definition(
    'rising-relays',
    'Rising relays',
    'Return the length of a strictly increasing subsequence of values with maximum length. Elements need not be adjacent; empty input returns 0.',
    { values: [3, 1, 2, 2, 4] },
    3,
    ({ values = [] }) => {
      const dp = values.map(() => 1);

      for (let i = 0; i < values.length; i++)
        for (let j = 0; j < i; j++) if (values[j] < values[i]) dp[i] = Math.max(dp[i], dp[j] + 1);

      return Math.max(0, ...dp);
    },
  ),
  definition(
    'crossed-signals',
    'Crossed signals',
    'Count pairs of indices i < j for which values[i] > values[j]. Equal values do not count.',
    { values: [3, 1, 2] },
    2,
    ({ values = [] }) => {
      let result = 0;

      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++) if (values[i] > values[j]) result++;

      return result;
    },
  ),
  definition(
    'cargo-manifest',
    'Cargo manifest',
    'values are positive item weights and other are corresponding nonnegative rewards. Choose each item at most once, total weight at most k. Return maximum reward.',
    { values: [2, 3, 4], other: [4, 5, 7], k: 5 },
    9,
    ({ values = [], other = [], k = 0 }) => {
      const dp = Array<number>(k + 1).fill(0);

      for (let i = 0; i < values.length; i++)
        for (let w = k; w >= values[i]; w--) dp[w] = Math.max(dp[w], dp[w - values[i]] + other[i]);

      return dp[k];
    },
  ),
  definition(
    'token-exchange',
    'Token exchange',
    'values are positive denominations, available in unlimited quantity. Return the fewest tokens summing exactly to k, or -1 if impossible. k=0 needs zero tokens.',
    { values: [3, 5], k: 7 },
    -1,
    ({ values = [], k = 0 }) => {
      const dp = Array<number>(k + 1).fill(Infinity);
      dp[0] = 0;

      for (let amount = 1; amount <= k; amount++)
        for (const coin of values)
          if (coin <= amount) dp[amount] = Math.min(dp[amount], dp[amount - coin] + 1);

      return Number.isFinite(dp[k]) ? dp[k] : -1;
    },
  ),
  definition(
    'subset-beacons',
    'Subset beacons',
    'Count index subsets of nonnegative values whose sum is exactly k. Distinct indices count separately, including equal values. Include the empty subset. Return the count modulo 1000000007.',
    { values: [1, 1, 2], k: 2 },
    2,
    ({ values = [], k = 0 }) => {
      const dp = Array<number>(k + 1).fill(0);
      dp[0] = 1;

      for (const value of values)
        for (let s = k; s >= value; s--) dp[s] = (dp[s] + dp[s - value]) % 1000000007;

      return dp[k];
    },
  ),
  definition(
    'balanced-cargo',
    'Balanced cargo',
    'Partition all nonnegative values into two groups. Return the minimum absolute difference between group sums; groups may be empty.',
    { values: [1, 6, 11, 5] },
    1,
    ({ values = [] }) => {
      const total = values.reduce((a, b) => a + b, 0),
        reachable = new Set([0]);

      for (const value of values) {
        const priorSums = Array.from(reachable);

        for (const sum of priorSums) reachable.add(sum + value);
      }

      return Math.min(...[...reachable].map((sum) => Math.abs(total - 2 * sum)));
    },
  ),
  definition(
    'transmission-repair',
    'Transmission repair',
    'text and pattern contain ASCII lowercase letters. Return Levenshtein distance: minimum unit-cost insertions, deletions and substitutions to transform text into pattern.',
    { text: 'kitten', pattern: 'sitting' },
    3,
    ({ text = '', pattern = '' }) => {
      let row = Array.from({ length: pattern.length + 1 }, (_, i) => i);

      for (let i = 1; i <= text.length; i++) {
        const next = [i];

        for (let j = 1; j <= pattern.length; j++)
          next[j] = Math.min(
            next[j - 1] + 1,
            row[j] + 1,
            row[j - 1] + Number(text[i - 1] !== pattern[j - 1]),
          );
        row = next;
      }

      return row[pattern.length];
    },
  ),
  definition(
    'shared-protocol',
    'Shared protocol',
    'Return the longest common subsequence length of ASCII lowercase text and pattern. A subsequence preserves order but may skip characters.',
    { text: 'abcde', pattern: 'ace' },
    3,
    ({ text = '', pattern = '' }) => {
      let row = Array<number>(pattern.length + 1).fill(0);

      for (const c of text) {
        const next = [0];

        for (let j = 1; j <= pattern.length; j++)
          next[j] = c === pattern[j - 1] ? row[j - 1] + 1 : Math.max(row[j], next[j - 1]);
        row = next;
      }

      return row[pattern.length];
    },
  ),
  definition(
    'mirror-packets',
    'Mirror packets',
    'Return the length of the longest contiguous palindrome in ASCII lowercase text. Empty text returns 0.',
    { text: 'cabbad' },
    4,
    ({ text = '' }) => {
      let best = 0;

      for (let center = 0; center < 2 * text.length; center++) {
        let left = Math.floor(center / 2),
          right = left + (center % 2);

        while (left >= 0 && right < text.length && text[left] === text[right]) {
          best = Math.max(best, right - left + 1);
          left--;
          right++;
        }
      }

      return best;
    },
  ),
  definition(
    'unique-channel',
    'Unique channel',
    'Return the longest contiguous substring length of ASCII lowercase text containing no repeated character.',
    { text: 'abcaabc' },
    3,
    ({ text = '' }) => {
      const seen = new Map<string, number>();

      let left = 0,
        best = 0;

      for (let i = 0; i < text.length; i++) {
        left = Math.max(left, (seen.get(text[i]) ?? -1) + 1);
        seen.set(text[i], i);
        best = Math.max(best, i - left + 1);
      }

      return best;
    },
  ),
  definition(
    'channel-budget',
    'Channel budget',
    'Return the longest contiguous substring length of ASCII lowercase text containing at most k distinct characters. k may be zero.',
    { text: 'eceba', k: 2 },
    3,
    ({ text = '', k = 0 }) => {
      const counts = new Map<string, number>();

      let left = 0,
        best = 0;

      for (let i = 0; i < text.length; i++) {
        counts.set(text[i], (counts.get(text[i]) ?? 0) + 1);

        while (counts.size > k) {
          const c = text[left++],
            remaining = counts.get(c)! - 1;

          if (remaining) counts.set(c, remaining);
          else counts.delete(c);
        }

        best = Math.max(best, i - left + 1);
      }

      return best;
    },
  ),
  definition(
    'bracket-repair',
    'Bracket repair',
    'text contains only ( and ). Return the minimum number of parentheses to insert anywhere to make it balanced. Existing characters cannot be removed or reordered.',
    { text: '))((' },
    4,
    ({ text = '' }) => {
      let open = 0,
        needed = 0;

      for (const c of text)
        if (c === '(') open++;
        else if (open) open--;
        else needed++;

      return open + needed;
    },
  ),
  definition(
    'skyline-storage',
    'Skyline storage',
    'values are nonnegative heights of adjacent width-one bars. Return the area of the largest axis-aligned rectangle lying below the skyline.',
    { values: [2, 1, 5, 6, 2, 3] },
    10,
    ({ values = [] }) => {
      let best = 0;

      for (let i = 0; i < values.length; i++) {
        let low = Infinity;

        for (let j = i; j < values.length; j++) {
          low = Math.min(low, values[j]);
          best = Math.max(best, low * (j - i + 1));
        }
      }

      return best;
    },
  ),
  definition(
    'rain-reserves',
    'Rain reserves',
    'values are nonnegative heights of width-one bars. Return total units of water trapped after rain, with water escaping at both ends.',
    { values: [3, 0, 2, 0, 4] },
    7,
    ({ values = [] }) => {
      let total = 0;

      for (let i = 0; i < values.length; i++)
        total += Math.max(
          0,
          Math.min(Math.max(...values.slice(0, i + 1)), Math.max(...values.slice(i))) - values[i],
        );

      return total;
    },
  ),
  definition(
    'island-network',
    'Island network',
    'grid is a rectangular binary matrix. Return the number of connected groups of 1 cells using four orthogonal neighbors, not diagonals. Empty grid returns 0.',
    {
      grid: [
        [1, 0],
        [0, 1],
      ],
    },
    2,
    ({ grid = [] }) => {
      const seen = new Set<string>();
      let result = 0;

      for (let r = 0; r < grid.length; r++)
        for (let c = 0; c < grid[r].length; c++) {
          if (!grid[r][c] || seen.has(`${r},${c}`)) continue;
          result++;
          const queue = [[r, c]];
          seen.add(`${r},${c}`);

          while (queue.length) {
            const [y, x] = queue.pop()!;

            for (const [dy, dx] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const a = y + dy,
                b = x + dx,
                key = `${a},${b}`;

              if (grid[a]?.[b] === 1 && !seen.has(key)) {
                seen.add(key);
                queue.push([a, b]);
              }
            }
          }
        }

      return result;
    },
  ),
  definition(
    'blocked-corridors',
    'Blocked corridors',
    'grid is a rectangular binary matrix where 1 means blocked. Count paths from top-left to bottom-right moving only right or down, modulo 1000000007. A blocked endpoint or empty grid gives 0.',
    {
      grid: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
    },
    2,
    ({ grid = [] }) => {
      const row = Array<number>(grid[0]?.length ?? 0).fill(0);
      row[0] = 1;

      for (const line of grid)
        for (let c = 0; c < line.length; c++)
          row[c] = line[c] ? 0 : (row[c] + (c ? row[c - 1] : 0)) % 1000000007;

      return grid.length ? (row.at(-1) ?? 0) : 0;
    },
  ),
  definition(
    'square-shields',
    'Square shields',
    'grid is a rectangular binary matrix. Return the area of the largest square consisting only of 1 cells. Empty grid returns 0.',
    {
      grid: [
        [1, 1, 0],
        [1, 1, 1],
      ],
    },
    4,
    ({ grid = [] }) => {
      let row = Array<number>((grid[0]?.length ?? 0) + 1).fill(0),
        best = 0;

      for (const line of grid) {
        const next = [0];

        for (let c = 0; c < line.length; c++) {
          next[c + 1] = line[c] ? 1 + Math.min(row[c], row[c + 1], next[c]) : 0;
          best = Math.max(best, next[c + 1]);
        }

        row = next;
      }

      return best * best;
    },
  ),
  definition(
    'relay-distance',
    'Relay distance',
    'n nodes are numbered 0..n-1; edges are directed [from,to,nonnegativeWeight] triples. Return shortest distance from node 0 to node n-1, or -1 if unreachable. Parallel edges allowed; n>=1.',
    {
      n: 3,
      edges: [
        [0, 1, 3],
        [1, 2, 2],
        [0, 2, 8],
      ],
    },
    5,
    ({ n = 1, edges = [] }) => {
      const d = Array<number>(n).fill(Infinity);
      d[0] = 0;

      for (let i = 1; i < n; i++) for (const [a, b, w] of edges) d[b] = Math.min(d[b], d[a] + w);

      return Number.isFinite(d[n - 1]) ? d[n - 1] : -1;
    },
  ),
  definition(
    'cable-budget',
    'Cable budget',
    'n nodes numbered 0..n-1; edges are undirected [a,b,nonnegativeCost] triples. Return minimum spanning tree cost, or -1 if disconnected. Parallel edges allowed; n>=1.',
    {
      n: 3,
      edges: [
        [0, 1, 3],
        [1, 2, 2],
        [0, 2, 8],
      ],
    },
    5,
    ({ n = 1, edges = [] }) => {
      const parent = Array.from({ length: n }, (_, i) => i);
      const root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x])));

      let cost = 0,
        count = 0;

      for (const [a, b, w] of [...edges].sort((a, b) => a[2] - b[2]))
        if (root(a) !== root(b)) {
          parent[root(a)] = root(b);
          cost += w;
          count++;
        }

      return count === n - 1 ? cost : -1;
    },
  ),
  definition(
    'mutual-reach',
    'Mutual reach',
    'n nodes numbered 0..n-1; edges are directed [from,to,weight] triples; ignore weight. Return the number of strongly connected components (maximal groups with mutual reachability). n>=1.',
    {
      n: 3,
      edges: [
        [0, 1, 1],
        [1, 0, 1],
        [1, 2, 1],
      ],
    },
    2,
    ({ n = 1, edges = [] }) => {
      const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));

      for (const [a, b] of edges) reach[a][b] = true;

      for (let k = 0; k < n; k++)
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) reach[i][j] ||= reach[i][k] && reach[k][j];

      return reach.filter((row, i) => !row.some((yes, j) => j < i && yes && reach[j][i])).length;
    },
  ),
  definition(
    'dependency-depth',
    'Dependency depth',
    'n tasks numbered 0..n-1, each takes one tick. edges are [prerequisite,dependent,weight] triples; ignore weight. Unlimited parallelism. Return earliest completion time of all tasks, or -1 for a cycle. n>=1.',
    {
      n: 3,
      edges: [
        [0, 1, 1],
        [1, 2, 1],
      ],
    },
    3,
    ({ n = 1, edges = [] }) => {
      const degree = Array<number>(n).fill(0),
        time = Array<number>(n).fill(1);

      for (const [, b] of edges) degree[b]++;
      const queue = degree.flatMap((d, i) => (d === 0 ? [i] : []));
      let count = 0;

      while (queue.length) {
        const a = queue.pop()!;
        count++;

        for (const [from, b] of edges)
          if (from === a) {
            time[b] = Math.max(time[b], time[a] + 1);

            if (--degree[b] === 0) queue.push(b);
          }
      }

      return count === n ? Math.max(...time) : -1;
    },
  ),
  definition(
    'crew-assignment',
    'Crew assignment',
    'grid is a rectangular binary eligibility matrix: rows are workers and columns jobs. Each worker and job may be used at most once. Return the maximum number of eligible assignments.',
    {
      grid: [
        [1, 1],
        [1, 0],
      ],
    },
    2,
    ({ grid = [] }) => {
      const matched = Array<number>(grid[0]?.length ?? 0).fill(-1);

      const assign = (worker: number, seen: Set<number>): boolean => {
        for (let job = 0; job < matched.length; job++)
          if (grid[worker][job] && !seen.has(job)) {
            seen.add(job);

            if (matched[job] === -1 || assign(matched[job], seen)) {
              matched[job] = worker;

              return true;
            }
          }

        return false;
      };

      return grid.reduce((count, _, worker) => count + Number(assign(worker, new Set())), 0);
    },
  ),
  definition(
    'dock-booking',
    'Dock booking',
    'edges are [start,end,reward] intervals with start<end and nonnegative reward. Select non-overlapping half-open intervals [start,end); touching is allowed. Return maximum total reward.',
    {
      edges: [
        [0, 2, 4],
        [2, 4, 5],
        [0, 4, 8],
      ],
    },
    9,
    ({ edges = [] }) => {
      const jobs = [...edges].sort((a, b) => a[1] - b[1]),
        dp = [0];

      for (let i = 0; i < jobs.length; i++) {
        let before = i;

        while (before > 0 && jobs[before - 1][1] > jobs[i][0]) before--;
        dp[i + 1] = Math.max(dp[i], dp[before] + jobs[i][2]);
      }

      return dp.at(-1)!;
    },
  ),
  definition(
    'deadline-rewards',
    'Deadline rewards',
    'values are positive integer deadlines, other are corresponding nonnegative job rewards. Each job takes one tick starting at time 0 on one machine. Return maximum reward for jobs completed by their deadline; jobs may be skipped.',
    { values: [1, 1, 2], other: [5, 9, 4] },
    13,
    ({ values = [], other = [] }) => {
      const jobs = values
        .map((deadline, i) => ({ deadline, reward: other[i] }))
        .sort((a, b) => a.deadline - b.deadline);

      const kept: number[] = [];

      for (const job of jobs) {
        kept.push(job.reward);
        kept.sort((a, b) => a - b);

        if (kept.length > job.deadline) kept.shift();
      }

      return kept.reduce((a, b) => a + b, 0);
    },
  ),
  definition(
    'window-median',
    'Window median',
    'For every contiguous window of k values, take its lower median (sorted index floor((k-1)/2)). Return the sum of these medians. 1<=k<=values.length.',
    { values: [1, 5, 2, 4], k: 2 },
    5,
    ({ values = [], k = 1 }) => {
      let result = 0;

      for (let i = 0; i + k <= values.length; i++)
        result += values.slice(i, i + k).sort((a, b) => a - b)[Math.floor((k - 1) / 2)];

      return result;
    },
  ),
  definition(
    'pair-distance',
    'Pair distance',
    'For all index pairs i<j, form abs(values[i]-values[j]), counting duplicates. Return the k-th smallest distance, with k one-based. At least two values and 1<=k<=number of pairs.',
    { values: [1, 3, 1], k: 1 },
    0,
    ({ values = [], k = 1 }) => {
      const distances: number[] = [];

      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++) distances.push(Math.abs(values[i] - values[j]));

      return distances.sort((a, b) => a - b)[k - 1];
    },
  ),
  definition(
    'matrix-pipeline',
    'Matrix pipeline',
    'values are positive matrix dimensions: matrix i has values[i] rows and values[i+1] columns. Return the minimum scalar multiplications to multiply the chain, choosing parenthesization. At least two dimensions.',
    { values: [10, 30, 5, 60] },
    4500,
    ({ values = [] }) => {
      const n = values.length - 1,
        dp = Array.from({ length: n }, () => Array<number>(n).fill(0));

      for (let length = 2; length <= n; length++)
        for (let i = 0; i + length <= n; i++) {
          const j = i + length - 1;
          dp[i][j] = Infinity;

          for (let k = i; k < j; k++)
            dp[i][j] = Math.min(
              dp[i][j],
              dp[i][k] + dp[k + 1][j] + values[i] * values[k + 1] * values[j + 1],
            );
        }

      return dp[0][n - 1];
    },
  ),
  definition(
    'merge-files',
    'Merge files',
    'values are nonnegative file sizes. Repeatedly merge any two files at cost equal to their combined size, replacing them with that size. Return minimum total cost to leave one file. Zero or one file costs 0.',
    { values: [1, 2, 3, 4] },
    19,
    ({ values = [] }) => {
      const queue = [...values];
      let cost = 0;

      while (queue.length > 1) {
        queue.sort((a, b) => a - b);
        const sum = queue.shift()! + queue.shift()!;
        cost += sum;
        queue.push(sum);
      }

      return cost;
    },
  ),
  definition(
    'bounded-sums',
    'Bounded sums',
    'Count contiguous segments of values whose sum is exactly k. Empty segments do not count; values may be negative.',
    { values: [1, -1, 1], k: 1 },
    3,
    ({ values = [], k = 0 }) => {
      const counts = new Map([[0, 1]]);

      let sum = 0,
        result = 0;

      for (const value of values) {
        sum += value;
        result += counts.get(sum - k) ?? 0;
        counts.set(sum, (counts.get(sum) ?? 0) + 1);
      }

      return result;
    },
  ),
];

export function puzzleCases(family: string, seed: number, tier: Tier) {
  const puzzle = PUZZLES.find((entry) => entry.id === family);

  if (!puzzle) throw new Error(`Unknown coding family: ${family}`);
  let state = (seed ^ (tier * 0x9e3779b9)) >>> 0;

  const random = (limit: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return Math.floor((state / 4294967296) * limit);
  };

  return Array.from({ length: 24 }, (_, index) => {
    const size = index === 0 ? 2 : 2 + random(tier === 1 ? 7 : 47);
    const n = 1 + random(tier === 1 ? 5 : 15);
    const values = Array.from({ length: size }, () => 1 + random(20));

    const input: PuzzleInput = {
      values,
      other: values.map(() => random(30)),
      k: random(30),
      n,
      text: Array.from({ length: size }, () => 'abcde'[random(5)]).join(''),
      pattern: Array.from({ length: size }, () => 'abcde'[random(5)]).join(''),
      grid: Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => random(2))),
      edges: Array.from({ length: n * 2 }, () => [random(n), random(n), random(20)]),
    };

    if (family === 'signal-run-1' || family === 'bounded-sums-1') input.values = values.map((v) => v - 10);

    if (family === 'bracket-repair-1')
      input.text = Array.from({ length: size }, () => (random(2) ? '(' : ')')).join('');

    if (family === 'window-median-1') input.k = 1 + random(size);

    if (family === 'pair-distance-1') input.k = 1 + random((size * (size - 1)) / 2);

    if (family === 'dock-booking-1')
      input.edges = input.edges!.map(([a, b, w]) => [Math.min(a, b), Math.max(a, b) + 1, w]);

    if (family === 'dependency-depth-1' && index % 2 === 0)
      input.edges = input.edges!.filter(([a, b]) => a < b);

    if ((family === 'relay-distance-1' || family === 'cable-budget-1') && index % 2 === 0)
      input.edges = Array.from({ length: n - 1 }, (_, node) => [node, node + 1, random(20)]);

    if (
      index === 1 &&
      [
        'signal-run-1',
        'rising-relays-1',
        'crossed-signals-1',
        'balanced-cargo-1',
        'skyline-storage-1',
        'rain-reserves-1',
        'merge-files-1',
        'bounded-sums-1',
      ].includes(family)
    )
      input.values = [];

    if (
      index === 2 &&
      ['subset-beacons-1', 'balanced-cargo-1', 'skyline-storage-1', 'rain-reserves-1'].includes(family)
    )
      input.values = values.map(() => 0);

    for (const key of ['values', 'other', 'text', 'pattern', 'k', 'n', 'grid', 'edges'] as const)
      if (!(key in puzzle.example.input)) delete input[key];

    return { input, expected: puzzle.solve(input) };
  });
}
