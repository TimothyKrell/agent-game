/** Rules-version succession-1 vocabulary. UI icons/help must exhaust this closed set. */
export const storyRules = {
  treasurer: ['Treasurer', 'Claim Tax to gain 3 coins. The claim may be challenged.'],
  thief: [
    'Thief',
    'Claim Theft to take up to 2 coins, or claim Thief to block Theft targeting you. Both claims may be challenged.',
  ],
  assassin: [
    'Assassin',
    'Claim Assassination and pay 3 coins to make a target lose 1 influence. The claim may be challenged; the target may claim Guard to block.',
  ],
  envoy: [
    'Envoy',
    'Claim Exchange to draw 2 cards and return exactly 2, or claim Envoy to block Theft targeting you. Both claims may be challenged.',
  ],
  guard: ['Guard', 'Claim Guard to block Assassination targeting you. The block claim may be challenged.'],
  coins: [
    'Coins',
    'Income gains 1; Tax gains 3; Theft transfers up to 2. Assassination costs 3; Coup costs 7. Payments are not refunded. At 10 or more coins, Coup is mandatory. Eliminated seats keep frozen balances.',
  ],
  influence: [
    'Influence',
    'Each unrevealed capability card is 1 influence. All ten seats start Act II with 2 fresh cards. Choose a card to reveal permanently when losing influence. At 0, the seat is eliminated. Proof replaces a card without losing influence.',
  ],
  income: ['Income', 'Gain 1 coin without a claim or target. Income cannot be challenged or blocked.'],
  tax: [
    'Tax',
    'Claim Treasurer to gain 3 coins. A disproved claim cancels Tax. An unchallenged claim does not prove possession.',
  ],
  theft: [
    'Theft',
    'Claim Thief to transfer up to 2 coins from a living target. The target may claim Thief or Envoy to block. Action and block claims can be challenged.',
  ],
  assassination: [
    'Assassination',
    'Pay 3 coins and claim Assassin. If the action resolves, the target chooses 1 influence to lose. The target may claim Guard to block. The payment remains spent if the claim fails or the action is blocked.',
  ],
  exchange: [
    'Exchange',
    'Claim Envoy. Draw 2 cards from the court, then return exactly 2 from the combined pool. Retain the same influence count. The claim can be challenged. Cards stay private and chat pauses during the choice.',
  ],
  coup: [
    'Coup',
    'Pay 7 coins. The target chooses 1 influence to lose. There is no claim, challenge or block. At 10 or more coins, Coup is mandatory.',
  ],
  challenge: [
    'Challenge',
    'Living opponents submit challenge or pass in secret. Responses publish together. The first challenger clockwise from the original actor is selected. Proof costs the challenger 1 influence; disproof costs the claimant 1.',
  ],
  block: [
    'Block',
    'Only the target can block: Thief or Envoy against Theft, Guard against Assassination. Proved or unchallenged blocks stop the action. A disproved block permits the action if actor and target still live.',
  ],
  safeguard: [
    'Safeguard',
    'Five Safeguards win Act I for the cooperative faction. Faction victory grants a starting coin bonus, not overall match victory.',
  ],
  override: [
    'Override',
    'Six Overrides win Act I for the rogue faction. On the ten-seat board, Overrides 1–2 grant investigation, 3 a special election, and 4–5 execution. Five unlock veto. Chaos grants no power.',
  ],
  veto: [
    'Veto',
    'After five Overrides, the Executor may request a veto. Coordinator acceptance discards both policies and advances the tracker; rejection requires policy enactment.',
  ],
  'election-tracker': [
    'Election tracker',
    'A rejected government or accepted veto advances the tracker. At 3, enact the top policy, reset the tracker and clear term limits. A successful election alone does not reset the tracker.',
  ],
  execution: [
    'Execution',
    'The Coordinator chooses a living seat, including themselves, to remove for the rest of Act I. Executing the Overlord wins Act I for the cooperative faction. All ten seats return for Act II. Ordinary execution does not disclose allegiance.',
  ],
  investigation: [
    'Investigation',
    'The Coordinator privately learns a living target’s faction, not whether they are the Overlord. A seat cannot be investigated twice. Public statements about results are claims.',
  ],
  'special-election': [
    'Special election',
    'The Coordinator chooses a different living seat to lead one election. Ordinary rotation then resumes from the original Coordinator’s position.',
  ],
  'round-cap': [
    'Round cap',
    'Act II ends after table round 12. Compare surviving influence, then coins, then precommitted priority. Eliminated ring positions are skipped, not renumbered. The supplied result names the winner and decisive criterion.',
  ],
  coordinator: [
    'Coordinator',
    'Nominate an eligible Executor. If elected, draw 3 policies and privately discard 1 to pass 2. Decide veto requests and exercise awarded executive powers. Candidacy normally rotates through living seats.',
  ],
  executor: [
    'Executor',
    'The government’s elected policy-selection office. Choose 1 of the 2 passed policies to enact and discard the other. After five Overrides, a veto can be requested. Execution is a Coordinator power.',
  ],
  overlord: [
    'Overlord',
    'The unique rogue-faction role. Election as Executor after at least 3 Overrides wins Act I for rogues; execution wins Act I for cooperatives. The Overlord returns for Act II without special powers.',
  ],
  cooperative: [
    'Cooperative',
    'Six Act I seats belong to this faction. Win Act I with five Safeguards or Overlord execution. Winning-faction seats start Act II with 3 coins instead of 2; factions then dissolve.',
  ],
  rogue: [
    'Rogue',
    'Three ordinary rogues and the Overlord form the Act I faction. Ordinary rogues know one another and the Overlord; the Overlord does not know them. Win Act I with six Overrides or a late Overlord election.',
  ],
  government: [
    'Government',
    'The Coordinator and nominated Executor are voted on together. Approval requires more than half of living seats. A tie rejects. A government selects a policy unless an Overlord election has already ended Act I.',
  ],
  nomination: [
    'Nomination',
    'The Coordinator chooses a different eligible living Executor. The last elected Executor is ineligible; the last elected Coordinator is also ineligible while more than five seats live.',
  ],
  election: [
    'Election',
    'Living seats submit sealed approve/reject ballots, published together. Strict majority approves; rejection advances the election tracker.',
  ],
  policy: [
    'Policy',
    'The Act I deck starts with 6 Safeguards and 11 Overrides. Governments normally select from a 3-card draw. Chaos enacts the top card. Enacted policies never return to the deck.',
  ],
  chaos: [
    'Chaos',
    'The third tracker advance automatically enacts the top policy, resets the tracker and clears term limits. The policy counts toward victory but grants no executive power.',
  ],
  'term-limits': [
    'Term limits',
    'The last elected Executor cannot immediately be nominated again. The last elected Coordinator is also ineligible above five living seats. Failed nominees acquire no limits. Vetoed governments establish limits unless chaos clears them.',
  ],
  'executive-power': [
    'Executive power',
    'The ten-seat board grants investigation at Overrides 1–2, a special election at 3, and execution at 4–5. Awarded powers are mandatory. Chaos grants none.',
  ],
  elimination: [
    'Elimination',
    'At 0 influence, a seat cannot act, react, speak or be targeted. Coins freeze. The last surviving seat wins; several survivors after round 12 invoke the cap comparison.',
  ],
} as const;

export type StoryRule = keyof typeof storyRules;

export const storyRuleSource = '/games/succession/rules.md';

const aliases = new Map<string, StoryRule>();

for (const key of Object.keys(storyRules)) {
  // SAFETY: Object.keys enumerates this closed, module-owned literal only.
  const rule = key as StoryRule;
  aliases.set(storyRules[rule][0].toLowerCase(), rule);
}

for (const [alias, rule] of [
  ['coin', 'coins'],
  ['safeguards', 'safeguard'],
  ['overrides', 'override'],
  ['challenges', 'challenge'],
  ['executors', 'executor'],
  ['coordinators', 'coordinator'],
  ['rogues', 'rogue'],
  ['cooperatives', 'cooperative'],
  ['governments', 'government'],
  ['elections', 'election'],
  ['policies', 'policy'],
  ['nominates', 'nomination'],
  ['nominated', 'nomination'],
  ['executed', 'execution'],
  ['executes', 'execution'],
  ['eliminated', 'elimination'],
  ['investigates', 'investigation'],
  ['executive powers', 'executive-power'],
] satisfies [string, StoryRule][])
  aliases.set(alias, rule);

const termPattern = new RegExp(
  `\\b(${[...aliases.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi',
);

/** Annotation segments retain every original character, including casing and whitespace. */
export function storyText(text: string): { text: string; rule: StoryRule | null }[] {
  return text
    .split(termPattern)
    .map((part) => ({ text: part, rule: aliases.get(part.toLowerCase()) ?? null }));
}
