export type Capability = 'treasurer' | 'thief' | 'assassin' | 'envoy' | 'guard';

export interface CapabilityCard {
  id: string;
  physicalId: string;
  capability: Capability;
}

export type Act2Action =
  | { type: 'income' | 'tax' | 'exchange' | 'challenge' | 'pass' }
  | { type: 'steal' | 'assassinate' | 'coup'; target: number }
  | { type: 'block'; capability: Capability }
  | { type: 'lose-influence'; cardId: string }
  | { type: 'return-influence'; cardIds: [string, string] };

type Declaration = Extract<Act2Action, { target: number }> | { type: 'income' | 'tax' | 'exchange' };

type Continuation = 'cancel' | 'after-claim' | 'effect' | 'end';

export interface Act2Pending {
  actor: number;
  action: Declaration;
  claim: Capability | null;
  payment: number;
  block: Capability | null;
  challenge: {
    claimant: number;
    capability: Capability;
    block: boolean;
    eligible: number[];
    responses: Record<number, 'challenge' | 'pass'>;
  } | null;
  loss: { seat: number; continuation: Continuation } | null;
  exchange: CapabilityCard[] | null;
}

export interface Act2CapEvidence {
  scores: { seat: number; influence: number; coins: number; priority: number }[];
  decisive: 'influence' | 'coins' | 'priority';
}

export type Act2Phase = 'discussion' | 'action' | 'challenge' | 'block' | 'loss' | 'exchange' | 'finished';

export interface Act2Board {
  resources: { hand: CapabilityCard[]; revealed: CapabilityCard[]; coins: number }[];
  court: CapabilityCard[];
  firstSeat: number;
  slot: number;
  round: number;
  activeSeat: number;
  phase: Act2Phase;
  phaseId: string;
  pending: Act2Pending | null;
  winner: number | null;
  capEvidence: Act2CapEvidence | null;
}

export type Act2Fact =
  | { type: 'declaration'; actor: number; action: Declaration; claim: Capability | null; payment: number }
  | {
      type: 'challenge-resolved';
      claimant: number;
      capability: Capability;
      block: boolean;
      responses: Record<number, 'challenge' | 'pass'>;
      challenger: number | null;
      outcome: 'unchallenged' | 'proved' | 'disproved';
    }
  | { type: 'proof'; seat: number; capability: Capability }
  | { type: 'block'; seat: number; capability: Capability }
  | { type: 'influence-lost'; seat: number; capability: Capability; eliminated: boolean }
  | { type: 'coins'; seat: number; coins: number }
  | { type: 'exchange-completed'; seat: number }
  | { type: 'turn-ended'; seat: number; round: number; slot: number }
  | { type: 'phase'; phase: Act2Phase; phaseId: string; activeSeat: number; round: number; slot: number }
  | { type: 'finished'; winner: number; capEvidence: Act2CapEvidence | null };

export interface Act2Context {
  random(size: number): number;
  id(): string;
  priority: readonly number[];
  emit(fact: Act2Fact): void;
  onFinish(winner: number, capEvidence: Act2CapEvidence | null): void;
}

const capabilities: Capability[] = ['treasurer', 'thief', 'assassin', 'envoy', 'guard'];

const actionRules: Record<Declaration['type'], { claim: Capability | null; payment: number }> = {
  income: { claim: null, payment: 0 },
  tax: { claim: 'treasurer', payment: 0 },
  steal: { claim: 'thief', payment: 0 },
  assassinate: { claim: 'assassin', payment: 3 },
  exchange: { claim: 'envoy', payment: 0 },
  coup: { claim: null, payment: 7 },
};

function shuffle<T>(values: T[], random: (size: number) => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = random(i + 1);

    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random outcome');
    [values[i], values[j]] = [values[j], values[i]];
  }
}

export function createAct2(
  random: (size: number) => number,
  id: () => string,
  winnerBonuses: readonly boolean[],
): Act2Board {
  if (winnerBonuses.length !== 10) throw new Error('Act 2 requires ten seats');

  const court = capabilities.flatMap((capability) =>
    Array.from({ length: 5 }, () => ({ capability, physicalId: id(), id: id() })),
  );

  shuffle(court, random);

  const resources = winnerBonuses.map((bonus) => ({
    hand: court.splice(0, 2),
    revealed: [],
    coins: bonus ? 3 : 2,
  }));

  const firstSeat = random(10);

  if (!Number.isInteger(firstSeat) || firstSeat < 0 || firstSeat >= 10) throw new Error('Invalid first seat');

  return {
    resources,
    court,
    firstSeat,
    activeSeat: firstSeat,
    slot: 0,
    round: 1,
    phase: 'discussion',
    phaseId: id(),
    pending: null,
    winner: null,
    capEvidence: null,
  };
}

/** Internal persistence integrity check; never repair a corrupt deck by inventing cards. */
export function assertAct2Integrity(board: Act2Board): void {
  const buffer = board.pending?.exchange ?? [];

  const cards = [
    ...board.court,
    ...buffer,
    ...board.resources.flatMap((resource) => [...resource.hand, ...resource.revealed]),
  ];

  if (
    board.resources.length !== 10 ||
    cards.length !== 25 ||
    new Set(cards.map((card) => card.physicalId)).size !== 25 ||
    new Set(cards.map((card) => card.id)).size !== 25 ||
    capabilities.some((capability) => cards.filter((card) => card.capability === capability).length !== 5) ||
    board.resources.some(
      (resource) =>
        resource.hand.length + resource.revealed.length !== 2 ||
        !Number.isInteger(resource.coins) ||
        resource.coins < 0,
    ) ||
    board.court.length !== (board.phase === 'exchange' ? 3 : 5) ||
    buffer.length !== (board.phase === 'exchange' ? 2 : 0)
  ) {
    throw new Error('Act 2 platform integrity failure');
  }
}

function living(board: Act2Board): number[] {
  return board.resources.flatMap((resource, seat) => (resource.hand.length ? [seat] : []));
}

function phase(board: Act2Board, kind: Act2Phase, context: Act2Context): void {
  board.phase = kind;
  board.phaseId = context.id();
  context.emit({
    type: 'phase',
    phase: kind,
    phaseId: board.phaseId,
    activeSeat: board.activeSeat,
    round: board.round,
    slot: board.slot,
  });
}

function pending(board: Act2Board): Act2Pending {
  if (!board.pending) throw new Error('Missing pending action');

  return board.pending;
}

export function pendingAct2(board: Act2Board): number[] {
  switch (board.phase) {
    case 'discussion':
    case 'finished':
      return [];
    case 'action':
    case 'exchange':
      return [board.activeSeat];
    case 'loss':
      return board.pending?.loss ? [board.pending.loss.seat] : [];
    case 'block': {
      const action = pending(board).action;

      return 'target' in action ? [action.target] : [];
    }

    case 'challenge': {
      const window = pending(board).challenge;

      return window ? window.eligible.filter((seat) => window.responses[seat] === undefined) : [];
    }
  }
}

export function legalAct2(board: Act2Board, seat: number): Act2Action[] {
  if (!pendingAct2(board).includes(seat)) return [];
  const resource = board.resources[seat];

  switch (board.phase) {
    case 'action': {
      const targets = living(board).filter((target) => target !== seat);

      const coups: Act2Action[] =
        resource.coins >= 7 ? targets.map((target) => ({ type: 'coup', target })) : [];

      if (resource.coins >= 10) return coups;

      return [
        { type: 'income' },
        { type: 'tax' },
        { type: 'exchange' },
        ...targets.map((target): Act2Action => ({ type: 'steal', target })),
        ...(resource.coins >= 3
          ? targets.map((target): Act2Action => ({ type: 'assassinate', target }))
          : []),
        ...coups,
      ];
    }

    case 'challenge':
      return [{ type: 'challenge' }, { type: 'pass' }];
    case 'block':
      return pending(board).action.type === 'steal'
        ? [{ type: 'pass' }, { type: 'block', capability: 'thief' }, { type: 'block', capability: 'envoy' }]
        : [{ type: 'pass' }, { type: 'block', capability: 'guard' }];
    case 'loss':
      return resource.hand.map((card) => ({ type: 'lose-influence', cardId: card.id }));
    case 'exchange': {
      const pool = [...resource.hand, ...(pending(board).exchange ?? [])].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );

      return pool.flatMap((card, index) =>
        pool
          .slice(index + 1)
          .map((other): Act2Action => ({ type: 'return-influence', cardIds: [card.id, other.id] })),
      );
    }

    default:
      return [];
  }
}

function finish(
  board: Act2Board,
  winner: number,
  evidence: Act2CapEvidence | null,
  context: Act2Context,
): void {
  board.winner = winner;
  board.capEvidence = evidence;
  board.pending = null;
  phase(board, 'finished', context);
  context.emit({ type: 'finished', winner, capEvidence: evidence });
  context.onFinish(winner, evidence);
}

function soleSurvivor(board: Act2Board, context: Act2Context): boolean {
  const survivors = living(board);

  if (survivors.length !== 1) return false;
  finish(board, survivors[0], null, context);

  return true;
}

function endTurn(board: Act2Board, context: Act2Context): void {
  context.emit({ type: 'turn-ended', seat: board.activeSeat, round: board.round, slot: board.slot });
  board.pending = null;

  if (soleSurvivor(board, context)) return;

  do {
    board.slot++;

    if (board.slot === 10) {
      board.slot = 0;

      if (board.round === 12) {
        const scores = living(board).map((seat) => ({
          seat,
          influence: board.resources[seat].hand.length,
          coins: board.resources[seat].coins,
          priority: context.priority.indexOf(seat),
        }));

        scores.sort((a, b) => b.influence - a.influence || b.coins - a.coins || a.priority - b.priority);

        const decisive =
          scores[0].influence !== scores[1].influence
            ? 'influence'
            : scores[0].coins !== scores[1].coins
              ? 'coins'
              : 'priority';

        finish(board, scores[0].seat, { scores, decisive }, context);

        return;
      }

      board.round++;
    }

    board.activeSeat = (board.firstSeat + board.slot) % 10;
  } while (!board.resources[board.activeSeat].hand.length);

  phase(board, 'discussion', context);
}

function loss(board: Act2Board, seat: number, continuation: Continuation, context: Act2Context): void {
  pending(board).loss = { seat, continuation };
  phase(board, 'loss', context);
}

function openChallenge(
  board: Act2Board,
  claimant: number,
  capability: Capability,
  block: boolean,
  context: Act2Context,
): void {
  pending(board).challenge = {
    claimant,
    capability,
    block,
    eligible: living(board).filter((seat) => seat !== claimant),
    responses: {},
  };
  phase(board, 'challenge', context);
}

function continueAction(board: Act2Board, continuation: Continuation, context: Act2Context): void {
  const current = pending(board);
  const { actor, action } = current;

  if (
    continuation === 'cancel' ||
    continuation === 'end' ||
    !board.resources[actor].hand.length ||
    ('target' in action && !board.resources[action.target].hand.length)
  ) {
    endTurn(board, context);

    return;
  }

  if (continuation === 'after-claim' && (action.type === 'steal' || action.type === 'assassinate')) {
    phase(board, 'block', context);

    return;
  }

  const resource = board.resources[actor];

  switch (action.type) {
    case 'income':
    case 'tax':
      resource.coins += action.type === 'income' ? 1 : 3;
      context.emit({ type: 'coins', seat: actor, coins: resource.coins });
      break;
    case 'steal': {
      const target = board.resources[action.target];
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      resource.coins += amount;
      context.emit({ type: 'coins', seat: actor, coins: resource.coins });
      context.emit({ type: 'coins', seat: action.target, coins: target.coins });
      break;
    }

    case 'assassinate':
    case 'coup':
      loss(board, action.target, 'end', context);

      return;
    case 'exchange':
      if (board.court.length !== 5) throw new Error('Invalid court before exchange');
      current.exchange = board.court.splice(0, 2);

      for (const card of [...resource.hand, ...current.exchange]) card.id = context.id();
      phase(board, 'exchange', context);

      return;
  }

  endTurn(board, context);
}

function resolveChallenge(board: Act2Board, context: Act2Context): void {
  const current = pending(board);
  const window = current.challenge;

  if (!window) throw new Error('Missing challenge window');
  const order = Array.from({ length: 10 }, (_, offset) => (current.actor + offset + 1) % 10);
  const challenger = order.find((seat) => window.responses[seat] === 'challenge') ?? null;
  const hand = board.resources[window.claimant].hand;

  const proofIndex =
    challenger === null ? -1 : hand.findIndex((card) => card.capability === window.capability);

  context.emit({
    type: 'challenge-resolved',
    claimant: window.claimant,
    capability: window.capability,
    block: window.block,
    responses: { ...window.responses },
    challenger,
    outcome: challenger === null ? 'unchallenged' : proofIndex >= 0 ? 'proved' : 'disproved',
  });
  current.challenge = null;

  if (challenger === null) {
    continueAction(board, window.block ? 'cancel' : 'after-claim', context);

    return;
  }

  if (proofIndex >= 0) {
    if (board.court.length !== 5) throw new Error('Invalid court before proof');
    const [card] = hand.splice(proofIndex, 1);
    board.court.push(card);
    shuffle(board.court, context.random);
    const replacement = board.court.shift();

    if (!replacement) throw new Error('Missing proof replacement');
    hand.splice(proofIndex, 0, replacement);

    for (const held of hand) held.id = context.id();
    context.emit({ type: 'proof', seat: window.claimant, capability: window.capability });
    loss(board, challenger, window.block ? 'cancel' : 'after-claim', context);
  } else {
    loss(board, window.claimant, window.block ? 'effect' : 'cancel', context);
  }
}

export function advanceAct2Discussion(board: Act2Board, context: Act2Context): void {
  assertAct2Integrity(board);

  if (board.phase !== 'discussion') throw new Error('Not in discussion');
  phase(board, 'action', context);
}

function sameAction(left: Act2Action, right: Act2Action): boolean {
  if (left.type !== right.type) return false;

  if ('target' in left) return 'target' in right && left.target === right.target;

  if ('capability' in left) return 'capability' in right && left.capability === right.capability;

  if ('cardId' in left) return 'cardId' in right && left.cardId === right.cardId;

  if ('cardIds' in left)
    return (
      'cardIds' in right &&
      left.cardIds.length === right.cardIds.length &&
      left.cardIds.every((id, i) => id === right.cardIds[i])
    );

  return true;
}

export function applyAct2(board: Act2Board, seat: number, action: Act2Action, context: Act2Context): void {
  assertAct2Integrity(board);

  if (
    context.priority.length !== 10 ||
    new Set(context.priority).size !== 10 ||
    context.priority.some((value) => !Number.isInteger(value) || value < 0 || value >= 10)
  )
    throw new Error('Invalid committed priority');

  if (!legalAct2(board, seat).some((legal) => sameAction(legal, action)))
    throw new Error('Illegal Act 2 action');

  if (board.phase === 'action') {
    if (
      action.type !== 'income' &&
      action.type !== 'tax' &&
      action.type !== 'exchange' &&
      action.type !== 'steal' &&
      action.type !== 'assassinate' &&
      action.type !== 'coup'
    )
      throw new Error('Expected declaration');
    const { claim, payment } = actionRules[action.type];
    board.resources[seat].coins -= payment;

    const declaration: Declaration =
      'target' in action ? { type: action.type, target: action.target } : { type: action.type };

    board.pending = {
      actor: seat,
      action: declaration,
      claim,
      payment,
      block: null,
      challenge: null,
      loss: null,
      exchange: null,
    };
    context.emit({ type: 'declaration', actor: seat, action: { ...declaration }, claim, payment });

    if (claim) openChallenge(board, seat, claim, false, context);
    else continueAction(board, 'effect', context);

    return;
  }

  const current = pending(board);

  if (board.phase === 'challenge' && (action.type === 'challenge' || action.type === 'pass')) {
    if (!current.challenge) throw new Error('Missing challenge');
    current.challenge.responses[seat] = action.type;

    if (!pendingAct2(board).length) resolveChallenge(board, context);
  } else if (board.phase === 'block') {
    if (action.type === 'pass') continueAction(board, 'effect', context);
    else if (action.type === 'block') {
      current.block = action.capability;
      context.emit({ type: 'block', seat, capability: action.capability });
      openChallenge(board, seat, action.capability, true, context);
    }
  } else if (board.phase === 'loss' && action.type === 'lose-influence') {
    const resource = board.resources[seat];

    const [card] = resource.hand.splice(
      resource.hand.findIndex((held) => held.id === action.cardId),
      1,
    );

    resource.revealed.push(card);
    const continuation = current.loss?.continuation;

    if (!continuation) throw new Error('Missing loss continuation');
    current.loss = null;
    context.emit({
      type: 'influence-lost',
      seat,
      capability: card.capability,
      eliminated: !resource.hand.length,
    });

    if (!soleSurvivor(board, context)) continueAction(board, continuation, context);
  } else if (board.phase === 'exchange' && action.type === 'return-influence') {
    const pool = [...board.resources[seat].hand, ...(current.exchange ?? [])];
    board.resources[seat].hand = pool.filter((card) => !action.cardIds.includes(card.id));
    board.court.push(...pool.filter((card) => action.cardIds.includes(card.id)));
    current.exchange = null;
    shuffle(board.court, context.random);

    for (const card of board.resources[seat].hand) card.id = context.id();
    context.emit({ type: 'exchange-completed', seat });
    endTurn(board, context);
  }
}
