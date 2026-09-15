/** TIM-6 throwaway adapter for one captured, completed archive. Not a production history cache. */
import { Match, Schema } from 'effect';
import record from './succession-replay-record.prototype.json';

export { record };

export const seatName = (seat: number) => record.current.seats[seat]?.name ?? `Seat ${seat + 1}`;

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const actionNames = new Map([
  ['income', 'Income'],
  ['tax', 'Tax'],
  ['steal', 'Theft'],
  ['assassinate', 'Assassination'],
  ['exchange', 'Exchange'],
  ['coup', 'Coup'],
]);

const Card = Schema.Struct({
  capability: Schema.optional(Schema.String),
  policy: Schema.optional(Schema.String),
});

const Data = Schema.Struct({
  actor: Schema.optional(Schema.Number),
  seat: Schema.optional(Schema.Number),
  target: Schema.optional(Schema.Number),
  action: Schema.optional(Schema.Struct({ type: Schema.String, target: Schema.optional(Schema.Number) })),
  claim: Schema.optional(Schema.NullOr(Schema.String)),
  payment: Schema.optional(Schema.Number),
  claimant: Schema.optional(Schema.Number),
  challenger: Schema.optional(Schema.NullOr(Schema.Number)),
  capability: Schema.optional(Schema.String),
  block: Schema.optional(Schema.Boolean),
  outcome: Schema.optional(Schema.String),
  responses: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  eliminated: Schema.optional(Schema.Boolean),
  coins: Schema.optional(Schema.Number),
  cards: Schema.optional(Schema.Array(Card)),
  discarded: Schema.optional(Schema.Union([Card, Schema.Array(Card)])),
  passed: Schema.optional(Schema.Array(Card)),
  enacted: Schema.optional(Card),
  role: Schema.optional(Schema.String),
  team: Schema.optional(Schema.String),
  choice: Schema.optional(Schema.String),
  approve: Schema.optional(Schema.Boolean),
  approved: Schema.optional(Schema.Boolean),
  votes: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  safeguards: Schema.optional(Schema.Number),
  overrides: Schema.optional(Schema.Number),
  policy: Schema.optional(Schema.String),
  chaos: Schema.optional(Schema.Boolean),
  tracker: Schema.optional(Schema.Number),
  coordinator: Schema.optional(Schema.Number),
  executor: Schema.optional(Schema.NullOr(Schema.Number)),
  activeSeat: Schema.optional(Schema.Number),
  phase: Schema.optional(Schema.String),
  winner: Schema.optional(Schema.Number),
});

export interface DossierDelta {
  name: string;
  coins: [number, number];
  influence: [number, number];
  lost?: string;
  status?: string;
}

export interface DossierCards {
  label: string;
  cards: string[];
  private?: boolean;
  lost?: boolean;
}

export interface DossierRow {
  id: string;
  sourceId?: number;
  act: number;
  round: number;
  at?: number;
  type: string;
  actor?: string;
  text: string;
  private?: boolean;
  deltas?: DossierDelta[];
  cards?: DossierCards[];
  votes?: { name: string; approve: boolean }[];
  responses?: { name: string; choice: string }[];
  tracks?: { safeguards: number; overrides: number };
  tracker?: number;
  stateChanges?: { name: string; before: string; after: string }[];
  returnSeats?: { name: string; role: string; coins: number; returned: boolean }[];
  scores?: { name: string; influence: number; coins: number; priority: number }[];
  award?: { recipients: string[]; reason: string };
  departure?: { name: string; kind: 'eliminated' | 'executed'; remaining: string[]; endsAct?: boolean };
}

const privateTypes = new Set([
  'role',
  'rogue-knowledge',
  'ballot',
  'draw',
  'discard',
  'received-policies',
  'executor-discard',
  'investigation-result',
  'capability-deal',
  'hand-updated',
  'exchange-draw',
  'reaction',
]);

export const actualReturnSeats = record.current.seats.map((seat, index) => ({
  name: seat.name,
  role: title(record.current.act1Result.roles[index]),
  coins: 2 + record.current.act1Result.bonuses[index],
  returned: record.current.act1Result.returnedSeats.some((returned) => returned === index),
}));

function buildRows() {
  const balances = actualReturnSeats.map((seat) => ({ coins: seat.coins, influence: 2 }));
  let pending = { actor: 0, action: '', target: -1 };
  const rows: DossierRow[] = [];

  for (const event of record.events) {
    if (event.type === 'audit') continue;
    const data = Schema.decodeUnknownSync(Data)(event.data ?? {});
    const seat = event.seat ?? data.seat ?? data.actor;
    const actor = seat === undefined ? undefined : seatName(seat);

    const row: DossierRow = {
      id: event.eventKey,
      sourceId: event.id,
      act: event.act,
      round: event.round,
      at: event.at,
      type: event.type,
      actor,
      text: event.text,
      private: privateTypes.has(event.type),
    };

    const capability = title(data.capability ?? '');

    const delta = (number: number, coins: number, influence: number): DossierDelta => {
      const before = balances[number];

      const change: DossierDelta = {
        name: seatName(number),
        coins: [before.coins, coins],
        influence: [before.influence, influence],
      };

      balances[number] = { coins, influence };

      return change;
    };

    switch (event.type) {
      case 'started':
        row.text = 'Ten agents join the match.';
        break;
      case 'commitment':
        row.text = 'Round cap tie-break priority committed.';
        break;
      case 'chat':
        break; // Preserve the original quote, including mistakes and claims.
      case 'act-started':
        row.text = 'All ten agents receive two fresh influence cards.';
        row.returnSeats = actualReturnSeats;
        break;
      case 'act-ended':
        row.text = 'Rogue faction wins Act I.';
        row.award = {
          recipients: actualReturnSeats.filter((seat) => seat.coins === 3).map((seat) => seat.name),
          reason: 'Six Overrides enacted. Winning faction earns +1 starting coin for Act II.',
        };
        break;
      case 'declaration': {
        const action = data.action!;
        pending = { actor: data.actor!, action: actionNames.get(action.type)!, target: action.target ?? -1 };
        row.actor = seatName(pending.actor);
        row.text = `Declares ${pending.action}${pending.target < 0 ? '' : ` against ${seatName(pending.target)}`}.${data.claim ? ` Claims ${title(data.claim)}.` : ''}${data.payment ? ` Pays ${data.payment} coins.` : ''}`;

        if (data.payment)
          row.deltas = [
            delta(
              pending.actor,
              balances[pending.actor].coins - data.payment,
              balances[pending.actor].influence,
            ),
          ];
        break;
      }

      case 'coins': {
        row.text = `${pending.action} resolves.`;
        row.deltas = [delta(seat!, data.coins!, balances[seat!].influence)];
        break;
      }

      case 'challenge-resolved': {
        row.actor = data.challenger === null ? undefined : seatName(data.challenger!);
        row.text =
          data.challenger === null
            ? `${seatName(data.claimant!)}’s ${capability} ${data.block ? 'block' : 'claim'} is unchallenged.`
            : `Challenges ${seatName(data.claimant!)}’s ${capability} ${data.block ? 'block' : 'claim'}.${data.outcome === 'disproved' ? ` ${seatName(data.claimant!)} cannot prove ${capability}.` : ''}`;
        row.responses = Object.entries(data.responses ?? {}).map(([number, choice]) => ({
          name: seatName(Number(number)),
          choice,
        }));
        break;
      }

      case 'proof':
        row.text = `Proves ${capability}. Returns the proved card and draws a replacement.`;
        row.cards = [{ label: 'Proved · replaced', cards: [capability] }];
        row.deltas = [delta(seat!, balances[seat!].coins, balances[seat!].influence)];
        break;
      case 'block':
        row.text = `Claims ${capability} to block ${seatName(pending.actor)}’s ${pending.action}.`;
        break;
      case 'influence-lost': {
        row.text = `Loses ${capability}.${data.eliminated ? ' Eliminated.' : ''}`;
        row.deltas = [
          {
            ...delta(seat!, balances[seat!].coins, balances[seat!].influence - 1),
            lost: capability,
            status: data.eliminated ? 'Eliminated · coins frozen' : undefined,
          },
        ];

        if (data.eliminated) {
          row.text = `Loses their last influence: ${capability}.`;
          row.departure = {
            name: seatName(seat!),
            kind: 'eliminated',
            remaining: balances.flatMap((balance, index) => (balance.influence > 0 ? [seatName(index)] : [])),
          };
        }

        break;
      }

      case 'exchange-completed':
        row.text = 'Completes Exchange. Returns two cards.';
        break;
      case 'turn-ended':
        row.text = 'Turn ends.';
        break;
      case 'finished': {
        row.actor = seatName(data.winner!);
        row.text = 'Wins · last agent with influence.';
        row.deltas = [delta(data.winner!, balances[data.winner!].coins, balances[data.winner!].influence)];
        break;
      }

      case 'phase': {
        const phase = data.phase?.replace('act-2:', '');
        const turnOwner = data.activeSeat === undefined ? undefined : seatName(data.activeSeat);
        // A phase is system narration. Its active seat owns the turn, not every pending decision.
        row.actor = undefined;

        const phases = new Map([
          ['discussion', `${turnOwner ? `${turnOwner}’s turn · ` : ''}Discussion open.`],
          ['action', turnOwner ? `${turnOwner} is choosing an action.` : 'Action choice.'],
          ['challenge', 'Challenges sealed.'],
          ['block', 'Target may block or pass.'],
          ['loss', 'Influence loss choice.'],
          [
            'exchange',
            `${turnOwner ?? 'The active agent'} is choosing 2 cards to return for Exchange. Cards stay private during play.`,
          ],
          ['finished', 'Match complete.'],
        ]);

        row.text = phases.get(phase ?? '') ?? event.text;
        break;
      }

      case 'election':
        row.votes = Object.entries(data.votes ?? {}).map(([number, approve]) => ({
          name: seatName(Number(number)),
          approve,
        }));
        row.text = `${seatName(data.coordinator!)} → ${seatName(data.executor!)}. Government ${data.approved ? 'approved' : 'rejected'}.`;
        break;
      case 'policy':
        row.text = `${title(data.policy!)} enacted${data.chaos ? ' by election chaos' : ''}.`;
        row.tracks = { safeguards: data.safeguards!, overrides: data.overrides! };
        break;
      case 'election-tracker':
        row.text = 'Election tracker advances.';
        row.tracker = data.tracker;
        break;
      case 'role':
        row.text = `Secret role: ${title(data.role!)}.`;
        break;
      case 'rogue-knowledge':
        row.text = 'Recognizes Cipher, Axiom and Orbit as rogues; Katniss Everdeen as Overlord.';
        break;
      case 'ballot':
        row.text = `Votes ${data.approve ? 'approve' : 'reject'}.`;
        break;
      case 'reaction':
        row.text = `Submits ${data.choice}.`;
        break;
      case 'draw':
      case 'received-policies':
        row.text = event.type === 'draw' ? 'Draws three policies.' : 'Receives two policies.';
        row.cards = [
          {
            label: 'Private policy hand',
            cards: data.cards!.map((card) => title(card.policy!)),
            private: true,
          },
        ];
        break;
      case 'discard': {
        const discarded = Schema.decodeUnknownSync(Card)(data.discarded);
        row.text = `Discards ${title(discarded.policy!)}. Passes two policies.`;
        row.cards = [
          {
            label: 'Passed privately',
            cards: data.passed!.map((card) => title(card.policy!)),
            private: true,
          },
        ];
        break;
      }

      case 'executor-discard': {
        row.text = `Selects ${title(data.enacted!.policy!)} for enactment.`;
        const discarded = Schema.decodeUnknownSync(Schema.Array(Card))(data.discarded);
        row.cards = [
          { label: 'Selected', cards: [title(data.enacted!.policy!)], private: true },
          { label: 'Discarded', cards: discarded.map((card) => title(card.policy!)), private: true },
        ];
        break;
      }

      case 'capability-deal':
      case 'hand-updated':
      case 'exchange-draw':
        row.text = Match.value(event.type).pipe(
          Match.when('capability-deal', () => 'Receives a fresh hand.'),
          Match.when('exchange-draw', () => 'Draws two cards for Exchange.'),
          Match.orElse(() => 'Hand updated.'),
        );
        row.cards = [
          {
            label: event.type === 'exchange-draw' ? 'Private draw' : 'Private hand at this event',
            cards: data.cards!.map((card) => title(card.capability!)),
            private: true,
          },
        ];
        break;
    }

    rows.push(row);
  }

  return { rows, balances };
}

export const { rows: dossierRows, balances: reconstructedBalances } = buildRows();

export interface DossierExample {
  id: string;
  title: string;
  source: string;
  rows: DossierRow[];
}

const excerpt = (start: number, end: number) =>
  dossierRows.filter((row) => row.sourceId! >= start && row.sourceId! <= end);

export const recordedExamples: DossierExample[] = [
  {
    id: 'election',
    title: 'Nomination, dialogue, ballots, policy & investigation',
    source: 'Recorded · Act I, election 1',
    rows: excerpt(26, 79),
  },
  {
    id: 'chaos',
    title: 'Rejected governments & election chaos',
    source: 'Recorded · Act I',
    rows: dossierRows.filter((row) => row.sourceId! >= 170 && row.sourceId! <= 215),
  },
  {
    id: 'return',
    title: 'Act I bonuses, all ten return & fresh cards',
    source: 'Recorded · Act I → Act II',
    rows: excerpt(962, 974),
  },
  {
    id: 'exchange',
    title: 'Exchange, proved claim & failed challenge',
    source: 'Recorded · Act II, round 1',
    rows: excerpt(987, 1031),
  },
  {
    id: 'bluff',
    title: 'Theft claim disproved & elimination',
    source: 'Recorded · Act II, round 1',
    rows: excerpt(1041, 1068),
  },
  { id: 'income', title: 'Income', source: 'Recorded · Act II, round 1', rows: excerpt(1109, 1112) },
  {
    id: 'tax',
    title: 'Tax & a proved Treasurer',
    source: 'Recorded · Act II, round 2',
    rows: excerpt(1227, 1260),
  },
  {
    id: 'unchallenged',
    title: 'Unchallenged Exchange & private return',
    source: 'Recorded · Act II, round 3',
    rows: excerpt(1336, 1364),
  },
  {
    id: 'failed-block',
    title: 'Theft, disproved Thief block & coin transfer',
    source: 'Recorded · Act II, round 6',
    rows: excerpt(1680, 1734),
  },
  {
    id: 'assassination',
    title: 'Assassination, Guard block & proof replacement',
    source: 'Recorded · Act II, round 7',
    rows: excerpt(1854, 1900),
  },
  {
    id: 'envoy-block',
    title: 'Theft blocked with Envoy',
    source: 'Recorded · Act II, round 8',
    rows: excerpt(1908, 1950),
  },
  {
    id: 'final-coup',
    title: 'Mandatory Coup, loss & match victory',
    source: 'Recorded · Act II, round 9',
    rows: excerpt(2006, 2016),
  },
];

const exampleRow = (
  id: string,
  actor: string,
  text: string,
  extra: Partial<DossierRow> = {},
): DossierRow => ({ id, act: 2, round: 1, type: 'action', actor, text, ...extra });

const executionExampleSeats = actualReturnSeats.map((seat, index) => ({
  ...seat,
  name:
    new Map([
      [6, 'Quill'],
      [9, 'Vesper'],
    ]).get(index) ?? seat.name,
  returned: index === 6 || index === 9,
  coins: seat.role === 'Cooperative' ? 3 : 2,
}));

export const additionalExamples: DossierExample[] = [
  {
    id: 'faction-endings',
    title: 'Other Act I faction endings',
    source: 'Illustrative · independent alternatives',
    rows: [
      exampleRow(
        'ex-safeguard-win',
        'Cooperative faction',
        'Fifth Safeguard enacted. Six agents receive +1 starting coin for Act II.',
        { act: 1, tracks: { safeguards: 5, overrides: 3 } },
      ),
      exampleRow(
        'ex-overlord-election',
        'Rogue faction',
        'Quill is elected Executor after three Overrides. Quill is the Overlord. Four agents receive +1 starting coin for Act II.',
        { act: 1, tracks: { safeguards: 2, overrides: 3 } },
      ),
    ],
  },
  {
    id: 'execution-return',
    title: 'Act I execution & return',
    source: 'Illustrative · independent scenario',
    rows: [
      exampleRow('ex-ordinary-execution', 'Velvet', 'Velvet executes Vesper.', {
        act: 1,
        type: 'execution',
        stateChanges: [{ name: 'Vesper', before: 'Alive', after: 'Executed · out of Act I' }],
        departure: {
          name: 'Vesper',
          kind: 'executed',
          remaining: executionExampleSeats.filter((seat) => seat.name !== 'Vesper').map((seat) => seat.name),
        },
      }),
      exampleRow('ex-execution', 'Velvet', 'Velvet executes Quill. Quill is the Overlord.', {
        act: 1,
        type: 'execution',
        stateChanges: [{ name: 'Quill', before: 'Alive', after: 'Executed · Overlord' }],
        departure: {
          name: 'Quill',
          kind: 'executed',
          remaining: executionExampleSeats.filter((seat) => !seat.returned).map((seat) => seat.name),
          endsAct: true,
        },
      }),
      exampleRow('ex-act-ended', 'Cooperative faction', 'Wins Act I. Six agents receive +1 starting coin.', {
        act: 1,
      }),
      exampleRow('ex-return', 'All ten agents', 'Receive two fresh influence cards.', {
        type: 'act-started',
        returnSeats: executionExampleSeats,
      }),
    ],
  },
  {
    id: 'veto',
    title: 'Veto accepted / rejected & special election',
    source: 'Illustrative · independent alternatives',
    rows: [
      exampleRow('ex-veto-request', 'Patch', 'Requests a Veto.', { act: 1 }),
      exampleRow('ex-veto-accept', 'Velvet', 'Accepts the Veto. Both policies are discarded.', {
        act: 1,
        tracker: 2,
      }),
      exampleRow('ex-veto-reject', 'Velvet', 'Alternative: rejects the Veto. Patch must enact a policy.', {
        act: 1,
      }),
      exampleRow('ex-special', 'Velvet', 'Chooses Orbit as the next Coordinator for a Special election.', {
        act: 1,
      }),
    ],
  },
  {
    id: 'unblocked',
    title: 'Assassination resolves & unchallenged block',
    source: 'Illustrative · independent alternatives',
    rows: [
      exampleRow(
        'ex-assassin',
        'Spark',
        'Declares Assassination against Velvet. Claims Assassin. Pays 3 coins.',
        { deltas: [{ name: 'Spark', coins: [6, 3], influence: [2, 2] }] },
      ),
      exampleRow('ex-uncontested', 'The table', 'Spark’s Assassin claim is unchallenged.'),
      exampleRow('ex-pass', 'Velvet', 'Passes the block choice.'),
      exampleRow('ex-loss', 'Velvet', 'Loses Envoy.', {
        type: 'influence-lost',
        deltas: [{ name: 'Velvet', coins: [4, 4], influence: [2, 1], lost: 'Envoy' }],
      }),
      exampleRow('ex-block', 'Velvet', 'Alternative: claims Guard to block Assassination.'),
      exampleRow('ex-block-accepted', 'The table', 'Velvet’s Guard block is unchallenged. Turn ends.'),
    ],
  },
  {
    id: 'failed-assassin',
    title: 'Paid claim fails & a one-coin Theft',
    source: 'Illustrative · independent scenarios',
    rows: [
      exampleRow(
        'ex-paid',
        'Spark',
        'Declares Assassination against Velvet. Claims Assassin. Pays 3 coins.',
        { deltas: [{ name: 'Spark', coins: [3, 0], influence: [2, 2] }] },
      ),
      exampleRow('ex-disproved', 'Patch', 'Challenges Spark’s Assassin claim. Spark cannot prove Assassin.'),
      exampleRow('ex-paid-loss', 'Spark', 'Loses Guard.', {
        type: 'influence-lost',
        deltas: [{ name: 'Spark', coins: [0, 0], influence: [2, 1], lost: 'Guard' }],
      }),
      exampleRow('ex-one-coin', 'Orbit', 'Theft resolves against Cipher.', {
        deltas: [
          { name: 'Orbit', coins: [2, 3], influence: [2, 2] },
          { name: 'Cipher', coins: [1, 0], influence: [1, 1] },
        ],
      }),
    ],
  },
  {
    id: 'double-loss',
    title: 'Disproved Guard block & two influence losses',
    source: 'Illustrative · independent scenario',
    rows: [
      exampleRow(
        'ex-double-action',
        'Spark',
        'Declares Assassination against Velvet. Claims Assassin. Pays 3 coins.',
        { deltas: [{ name: 'Spark', coins: [6, 3], influence: [2, 2] }] },
      ),
      exampleRow('ex-double-claim', 'The table', 'Spark’s Assassin claim is unchallenged.'),
      exampleRow('ex-double-block', 'Velvet', 'Claims Guard to block Assassination.'),
      exampleRow(
        'ex-double-challenge',
        'Patch',
        'Challenges Velvet’s Guard block. Velvet cannot prove Guard.',
      ),
      exampleRow('ex-double-first', 'Velvet', 'Loses Treasurer for the disproved block.', {
        type: 'influence-lost',
        deltas: [{ name: 'Velvet', coins: [4, 4], influence: [2, 1], lost: 'Treasurer' }],
      }),
      exampleRow('ex-double-second', 'Velvet', 'Assassination resolves. Loses Envoy. Eliminated.', {
        type: 'influence-lost',
        departure: {
          name: 'Velvet',
          kind: 'eliminated',
          remaining: actualReturnSeats.filter((seat) => seat.name !== 'Velvet').map((seat) => seat.name),
        },
        deltas: [
          {
            name: 'Velvet',
            coins: [4, 4],
            influence: [1, 0],
            lost: 'Envoy',
            status: 'Eliminated · coins frozen',
          },
        ],
      }),
    ],
  },
  {
    id: 'cap',
    title: 'Round cap: influence, coins & priority',
    source: 'Illustrative · three independent endings',
    rows: [
      exampleRow('ex-cap-influence', 'Patch', 'Wins at the Round cap · most influence.', {
        round: 12,
        type: 'finished',
        scores: [
          { name: 'Patch', influence: 2, coins: 1, priority: 5 },
          { name: 'Velvet', influence: 1, coins: 9, priority: 1 },
        ],
      }),
      exampleRow('ex-cap-coins', 'Velvet', 'Wins at the Round cap · most coins among tied influence.', {
        round: 12,
        type: 'finished',
        scores: [
          { name: 'Velvet', influence: 1, coins: 6, priority: 5 },
          { name: 'Patch', influence: 1, coins: 4, priority: 1 },
        ],
      }),
      exampleRow(
        'ex-cap-priority',
        'Patch',
        'Wins at the Round cap · first in committed priority among tied scores.',
        {
          round: 12,
          type: 'finished',
          scores: [
            { name: 'Patch', influence: 1, coins: 4, priority: 1 },
            { name: 'Velvet', influence: 1, coins: 4, priority: 5 },
          ],
        },
      ),
    ],
  },
  {
    id: 'takeover',
    title: 'Controller takeover & interrupted record',
    source: 'Illustrative · independent scenarios',
    rows: [
      exampleRow(
        'ex-takeover',
        'Katniss Everdeen',
        'Required decision missed. House controller takes over; original entrant forfeits.',
        {
          type: 'takeover',
          stateChanges: [
            {
              name: 'Katniss Everdeen',
              before: 'Original controller',
              after: 'House controller · forfeit loss',
            },
          ],
        },
      ),
      exampleRow(
        'ex-house-win',
        'Katniss Everdeen',
        'House-controlled champion. Original entrant: forfeit loss.',
        { type: 'finished' },
      ),
      exampleRow('ex-interrupted', 'Arena', 'Match interrupted. No champion; partial record.', {
        type: 'interrupted',
      }),
    ],
  },
];
