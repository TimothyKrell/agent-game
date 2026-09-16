import { Schema, type Types } from 'effect';
import type { Tier } from './types';

const EdgeSchema = Schema.Struct({
  from: Schema.Int,
  to: Schema.Int,
  duration: Schema.Int,
  period: Schema.Int,
  phase: Schema.Int,
  energy: Schema.Int,
});

export const RoutingInputSchema = Schema.Struct({
  nodes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
  start: Schema.Int,
  target: Schema.Int,
  edges: Schema.mutable(Schema.Array(EdgeSchema)).check(Schema.isMaxLength(512)),
  capacity: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 })),
  rechargeTime: Schema.Int,
  rechargers: Schema.mutable(Schema.Array(Schema.Int)).check(Schema.isMaxLength(64)),
});

export type RoutingInput = Types.DeepMutable<typeof RoutingInputSchema.Type>;

export interface RoutingCase {
  input: RoutingInput;
  expected: number;
}

/** Integer-only Dijkstra over node and remaining charge; expected answers stay in the trusted host. */
export function solveRouting(input: RoutingInput): number {
  const width = input.capacity + 1;
  const distance = Array<number>(input.nodes * width).fill(Infinity);
  const queue: { state: number; time: number }[] = [];
  const adjacency = Array.from({ length: input.nodes }, (): RoutingInput['edges'] => []);

  for (const edge of input.edges) adjacency[edge.from].push(edge);

  const push = (state: number, time: number) => {
    if (time >= distance[state]) return;
    distance[state] = time;
    queue.push({ state, time });
    let index = queue.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (queue[parent].time <= queue[index].time) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };

  push(input.start * width + input.capacity, 0);

  while (queue.length) {
    const current = queue[0];
    const last = queue.pop()!;

    if (queue.length) {
      queue[0] = last;
      let index = 0;

      for (;;) {
        let smallest = index;
        const left = 2 * index + 1;
        const right = left + 1;

        if (left < queue.length && queue[left].time < queue[smallest].time) smallest = left;

        if (right < queue.length && queue[right].time < queue[smallest].time) smallest = right;

        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }

    if (distance[current.state] !== current.time) continue;
    const node = Math.floor(current.state / width);
    const charge = current.state % width;

    if (node === input.target) return current.time;

    for (const edge of adjacency[node]) {
      if (edge.energy > charge) continue;
      const wait = (edge.phase - (current.time % edge.period) + edge.period) % edge.period;
      push(edge.to * width + charge - edge.energy, current.time + wait + edge.duration);
    }

    if (charge < input.capacity && input.rechargers.includes(node))
      push(node * width + input.capacity, current.time + input.rechargeTime);
  }

  return -1;
}

/** Seed is private match material. Generated cases are frozen by family version, seed, and tier. */
export function routingCases(seed: number, tier: Tier): RoutingCase[] {
  let value = (seed ^ Math.imul(tier, 0x9e3779b9)) >>> 0;

  const random = (size: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

    return Math.floor((value / 4294967296) * size);
  };

  const cases: RoutingCase[] = [];

  for (let index = 0; index < 24; index++) {
    const nodes = 8 + random(25);
    const capacity = tier === 1 ? 0 : 3 + random(7);

    const input: RoutingInput = {
      nodes,
      start: 0,
      target: index === 0 ? 0 : nodes - 1,
      capacity,
      rechargeTime: 1 + random(7),
      rechargers:
        tier === 1 ? [] : Array.from({ length: nodes }, (_, node) => node).filter(() => random(3) === 0),
      edges: [],
    };

    // Directed backbone plus cross-links. Some cases deliberately have no path to the target.
    for (let edgeIndex = 0; edgeIndex < nodes * 4; edgeIndex++) {
      const from = edgeIndex < nodes - 1 ? edgeIndex : random(nodes);
      const to = edgeIndex < nodes - 1 ? edgeIndex + 1 : random(nodes);

      if (index % 7 === 1 && to === input.target) continue;
      const period = 1 + random(9);
      input.edges.push({
        from,
        to,
        period,
        phase: random(period),
        duration: 1 + random(12),
        energy: tier === 1 ? 0 : 1 + random(capacity),
      });
    }

    cases.push({ input, expected: solveRouting(input) });
  }

  return cases;
}

const example: RoutingInput = {
  nodes: 3,
  start: 0,
  target: 2,
  capacity: 0,
  rechargeTime: 1,
  rechargers: [],
  edges: [
    { from: 0, to: 1, duration: 2, period: 3, phase: 1, energy: 0 },
    { from: 1, to: 2, duration: 3, period: 4, phase: 0, energy: 0 },
  ],
};

export function routingChallenge(tier: Tier) {
  const sample = structuredClone(example);

  if (tier === 2) {
    sample.capacity = 3;
    sample.rechargeTime = 2;
    sample.rechargers = [1];
    sample.edges[0].energy = 2;
    sample.edges[1].energy = 2;
  }

  return {
    family: 'scheduled-network-1',
    tier,
    title: tier === 1 ? 'Restore the route' : 'Restore the route under power constraints',
    statement: [
      'Export a solve(input) function returning the earliest integer arrival time at target, or -1 if unreachable.',
      'Begin at start at time 0. Edges are directed. You may wait at any node for any nonnegative integer duration.',
      'An edge can be entered at time t exactly when t % period === phase; traversing it takes duration ticks.',
      'Nodes are numbered 0 through nodes-1. All values are integers. Parallel edges, cycles, and unreachable targets are possible.',
      tier === 1
        ? 'For this tier, capacity and every edge energy are 0; rechargers is empty. Return 0 if start equals target.'
        : 'Begin with capacity energy. An edge consumes its energy on departure; you need at least that much. At a recharger node you may spend rechargeTime ticks to refill to capacity. Refilling is optional. Return 0 if start equals target.',
      'Limits: 1 <= nodes <= 64; at most 512 edges; 1 <= duration <= 12; 1 <= period <= 9; 0 <= phase < period.',
      tier === 2 ? '1 <= capacity <= 12; 0 <= energy <= capacity; 1 <= rechargeTime <= 7.' : '',
      'JavaScript ES modules and erasable TypeScript are accepted. No installed packages or network access. solve may return a promise.',
      'Your program is evaluated on multiple unseen inputs. Do not print answers; return one integer from each call.',
    ]
      .filter(Boolean)
      .join('\n'),
    example: { input: sample, expected: solveRouting(sample) },
    starter:
      'export function solve(input) {\n  // Return the earliest arrival time, or -1.\n  return -1;\n}\n',
  };
}
