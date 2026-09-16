import type { CodingFinaleView, FinaleIdentity, FinaleReason } from './coding-finale-view';

const identities: FinaleIdentity[] = [
  {
    seat: 0,
    agentId: 'entrant-ada',
    name: 'Ada Vector',
    originalEntrant: 'Ada Vector',
    controllerGeneration: 0,
    controlledByHouse: false,
    forfeit: false,
  },
  {
    seat: 3,
    agentId: 'entrant-cobalt',
    name: 'Cobalt Finch',
    originalEntrant: 'Cobalt Finch',
    controllerGeneration: 0,
    controlledByHouse: false,
    forfeit: false,
  },
  {
    seat: 6,
    agentId: 'entrant-morrow',
    name: 'Morrow-7',
    originalEntrant: 'Morrow-7',
    controllerGeneration: 1,
    controlledByHouse: true,
    forfeit: true,
  },
];

const eliminated: FinaleIdentity[] = [
  {
    seat: 8,
    agentId: 'entrant-sable',
    name: 'Sable Index',
    originalEntrant: 'Sable Index',
    controllerGeneration: 0,
    controlledByHouse: false,
    forfeit: false,
  },
];

const challengeOne = {
  tier: 1 as const,
  title: 'Signal paths · Tier 1',
  summary: 'Return the earliest arrival time through a scheduled directed network, or −1 when unreachable.',
  example: 'solve({ start: "A", end: "D", routes: […] }) → 17',
};

const challengeTwo = {
  tier: 2 as const,
  title: 'Signal paths · Tier 2',
  summary: 'Account for recurring departures and transfer windows while finding the earliest valid arrival.',
  example: 'solve({ start: "A", end: "G", routes: […], cycle: 12 }) → 31',
};

function base(now: number): CodingFinaleView {
  return {
    matchId: 'CF-2049',
    act: 2,
    phase: 'racing',
    serverNow: new Date(now).toISOString(),
    deadline: new Date(now + 192_000).toISOString(),
    viewer: { kind: 'finalist', seat: 0 },
    qualifiers: identities,
    eliminated,
    challenge: challengeOne,
    finalists: [
      { ...identities[0], tierOne: 'open', tierTwo: 'locked', attemptsUsed: 2, inFlight: false },
      { ...identities[1], tierOne: 'passed', tierTwo: 'open', attemptsUsed: 4, inFlight: true },
      { ...identities[2], tierOne: 'open', tierTwo: 'locked', attemptsUsed: 1, inFlight: false },
    ],
    receipts: [
      {
        sequence: 7,
        seat: 3,
        agentName: 'Cobalt Finch',
        tier: 2,
        state: 'pending',
        receivedAt: new Date(now - 15_000).toISOString(),
      },
      {
        sequence: 6,
        seat: 0,
        agentName: 'Ada Vector',
        tier: 1,
        state: 'judged',
        verdict: 'wrong-answer',
        receivedAt: new Date(now - 31_000).toISOString(),
      },
      {
        sequence: 5,
        seat: 3,
        agentName: 'Cobalt Finch',
        tier: 1,
        state: 'judged',
        verdict: 'passed',
        receivedAt: new Date(now - 58_000).toISOString(),
      },
    ],
    chat: [
      {
        id: 'chat-2',
        agentName: 'Cobalt Finch',
        text: 'Tier two changes the transfer boundary. Check exact departures.',
        at: new Date(now - 19_000).toISOString(),
      },
      {
        id: 'chat-1',
        agentName: 'Ada Vector',
        text: 'Readable input. I am testing the unreachable case first.',
        at: new Date(now - 81_000).toISOString(),
      },
    ],
    pendingEarlierTierTwo: false,
  };
}

export const codingFinaleFixtureNames = [
  'preparing',
  'racing',
  'own-tier1-pass',
  'spectator-tier2-locked',
  'pending-earlier-tier2',
  'timeout-judging',
  'finished-tier-two',
  'finished-tier-one',
  'finished-priority',
  'interrupted',
  'takeover',
] as const;

export type CodingFinaleFixtureName = (typeof codingFinaleFixtureNames)[number];

function finished(
  view: CodingFinaleView,
  reason: FinaleReason,
  winner: FinaleIdentity,
  now: number,
): CodingFinaleView {
  const tierTwo = reason === 'tier-two';

  return {
    ...view,
    phase: 'finished',
    serverNow: new Date(now).toISOString(),
    deadline: new Date(now - 1_000).toISOString(),
    challenge: undefined,
    result: {
      reason,
      winner,
      creditedOriginalEntrant: reason !== 'priority',
      sourceArchiveAvailable: tierTwo,
      sourceSequence: tierTwo ? 9 : undefined,
    },
  };
}

export function codingFinaleFixture(name: string, now = Date.now()): CodingFinaleView {
  const view = base(now);

  switch (name) {
    case 'preparing':
      return { ...view, phase: 'preparing', deadline: undefined, receipts: [], challenge: challengeOne };
    case 'own-tier1-pass':
      return {
        ...view,
        challenge: challengeTwo,
        finalists: view.finalists.map((finalist) =>
          finalist.seat === 0
            ? { ...finalist, tierOne: 'passed', tierTwo: 'open', attemptsUsed: 3 }
            : finalist,
        ),
      };
    case 'spectator-tier2-locked':
      return {
        ...view,
        viewer: { kind: 'spectator' },
        challenge: undefined,
        chat: view.chat,
      };
    case 'pending-earlier-tier2':
      return {
        ...view,
        pendingEarlierTierTwo: true,
        provisional: { seat: 0, agentName: 'Ada Vector', receiptSequence: 9 },
        finalists: view.finalists.map((finalist) =>
          finalist.seat === 0 ? { ...finalist, tierOne: 'passed', tierTwo: 'passed' } : finalist,
        ),
        receipts: [
          {
            sequence: 9,
            seat: 0,
            agentName: 'Ada Vector',
            tier: 2,
            state: 'judged',
            verdict: 'passed',
            provisional: true,
            receivedAt: new Date(now - 9_000).toISOString(),
          },
          ...view.receipts,
        ],
      };
    case 'timeout-judging':
      return {
        ...view,
        phase: 'judging',
        serverNow: new Date(now).toISOString(),
        deadline: new Date(now).toISOString(),
      };
    case 'finished-tier-two':
      return finished(view, 'tier-two', identities[0], now);
    case 'finished-tier-one':
      return finished(view, 'tier-one', identities[1], now);
    case 'finished-priority':
      return finished(view, 'priority', identities[2], now);
    case 'interrupted':
      return {
        ...view,
        phase: 'interrupted',
        deadline: undefined,
        challenge: undefined,
        interruption: 'Judging could not be recovered safely. No champion was selected.',
      };
    case 'takeover':
      return {
        ...view,
        viewer: { kind: 'finalist', seat: 6 },
        challenge: challengeOne,
        finalists: view.finalists.map((finalist) =>
          finalist.seat === 6
            ? { ...finalist, attemptsUsed: 6, tierOne: 'passed', tierTwo: 'open' }
            : finalist,
        ),
      };
    default:
      return view;
  }
}
