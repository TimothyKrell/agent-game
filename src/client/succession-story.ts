import type { Observation2, ReplayFrame2 } from '../shared/succession';
import { readStoryFact } from './succession-story-events';
import { storyActionRules, storyText } from './succession-story-rules';
import type { StoryRule } from './succession-story-rules';
import type {
  StoryAction,
  StoryChapters,
  StoryFact,
  StoryModel,
  StoryOutcome,
  StoryResolution,
  StoryReturn,
  StoryRow,
  StoryScope,
  StorySeat,
  StorySource,
  StoryValue,
  StoryWindow,
} from './succession-story-types';

export type * from './succession-story-types';

type Missing = Extract<StoryValue<never>, { status: 'unavailable' }>['reason'];

type Snapshot = Observation2 | ReplayFrame2;

function unavailable<T>(reason: Missing): StoryValue<T> {
  return { status: 'unavailable', reason };
}

function known<T>(value: T, source: StorySource): StoryValue<T> {
  return { status: 'known', value, sources: [source] };
}

function derived<T>(value: T, sources: readonly StorySource[], rule: string): StoryValue<T> {
  return { status: 'derived', value, sources, rule };
}

function sources<T>(value: StoryValue<T>): readonly StorySource[] {
  return value.status === 'unavailable' ? [] : value.sources;
}

function value<T>(fact: StoryValue<T>): T | undefined {
  return fact.status === 'unavailable' ? undefined : fact.value;
}

function emptySeat(seat: number, reason: Missing): StorySeat {
  return {
    seat,
    entrant: unavailable(reason),
    controller: unavailable(reason),
    alive: unavailable(reason),
    coins: unavailable(reason),
    influence: unavailable(reason),
    revealed: unavailable(reason),
    role: unavailable('not-disclosed'),
    hand: unavailable('not-disclosed'),
    exchangeDraw: unavailable('not-disclosed'),
  };
}

function snapshotSource(snapshot: Snapshot, kind: 'checkpoint' | 'current'): StorySource {
  return {
    kind,
    matchId: snapshot.matchId,
    visibilityEpoch: 'history' in snapshot ? snapshot.history.visibilityEpoch : snapshot.visibilityEpoch,
    cursor: 'history' in snapshot ? snapshot.history.streamHead : snapshot.through,
  };
}

function snapshotSeats(snapshot: Snapshot, source: StorySource): StorySeat[] {
  return snapshot.seats.map((seat) => {
    const result = emptySeat(seat.number, 'not-applicable');
    result.entrant = known(
      { agentId: seat.agentId, ownerId: seat.ownerId, name: seat.name, originalHouse: seat.originalHouse },
      source,
    );
    result.controller = known(
      {
        house: seat.house,
        generation: known(seat.generation, source),
        forfeited: seat.forfeited,
        identity: seat.forfeited ? unavailable('not-recorded') : known(seat.agentId, source),
      },
      source,
    );
    result.alive = known(seat.alive, source);
    result.coins =
      seat.coins === undefined
        ? unavailable(snapshot.act === 1 ? 'not-applicable' : 'not-recorded')
        : known(seat.coins, source);
    result.influence =
      seat.influence === undefined
        ? unavailable(snapshot.act === 1 ? 'not-applicable' : 'not-recorded')
        : known(seat.influence, source);
    result.revealed =
      seat.revealed === undefined
        ? unavailable(snapshot.act === 1 ? 'not-applicable' : 'not-recorded')
        : known(seat.revealed, source);
    result.role =
      seat.role === undefined
        ? unavailable('not-disclosed')
        : known({ role: seat.role, visibility: 'public' }, source);

    if ('archive' in snapshot && snapshot.archive?.act === 2) {
      const hand = snapshot.archive.hands.find((entry) => entry.seat === seat.number);

      if (hand) result.hand = known({ visibility: 'archive', cards: hand.hand }, source);
      const pool = snapshot.archive.exchangePool;

      if (pool?.seat === seat.number)
        result.exchangeDraw = known({ visibility: 'archive', cards: pool.cards }, source);
    }

    if (snapshot.you?.seat === seat.number && snapshot.private?.act === 2) {
      result.hand = known({ visibility: 'private', cards: snapshot.private.hand }, source);
      // Observation.exchangePool combines held + drawn cards. It is not a two-card draw record.
      const held = new Set(snapshot.private.hand.map((card) => card.id));
      result.exchangeDraw = known(
        { visibility: 'private', cards: snapshot.private.exchangePool.filter((card) => !held.has(card.id)) },
        source,
      );
    }

    if (snapshot.you?.seat === seat.number && snapshot.private?.act === 1)
      result.role = known({ role: snapshot.private.role, visibility: 'private' }, source);

    return result;
  });
}

function blankChapters(): StoryChapters {
  return {
    act1: unavailable('not-yet-resolved'),
    finalTracks: unavailable('not-recorded'),
    returns: unavailable('not-recorded'),
    outcome: unavailable('not-yet-resolved'),
    interruption: unavailable('not-applicable'),
  };
}

function returns(
  result: {
    roles: readonly StoryReturn['role'][];
    bonuses: readonly (0 | 1)[];
    returnedSeats: readonly number[];
  },
  seats: readonly StorySeat[],
): StoryReturn[] {
  return result.roles.map((role, seat) => ({
    seat,
    entrant: seats.find((entry) => entry.seat === seat)?.entrant ?? unavailable('missing-baseline'),
    role,
    returnedAfterExecution: result.returnedSeats.includes(seat),
    bonus: result.bonuses[seat],
    coins: result.bonuses[seat] === 1 ? 3 : 2,
    influence: 2,
  }));
}

function outcome(
  result: StoryOutcome['result'],
  seats: readonly StorySeat[],
  source: StorySource,
): StoryOutcome {
  const winner = structuredClone(
    seats.find((entry) => entry.seat === result.winnerSeat) ??
      emptySeat(result.winnerSeat, 'missing-baseline'),
  );

  const controller = winner.controller;

  return {
    result,
    winner,
    credit:
      controller.status === 'unavailable'
        ? unavailable('missing-baseline')
        : derived(
            controller.value.forfeited ? 'forfeit-loss' : 'win',
            [...sources(controller), source],
            'The winning seat credits its original entrant only when that entrant has not forfeited.',
          ),
  };
}

function snapshotChapters(
  snapshot: Snapshot,
  seats: readonly StorySeat[],
  source: StorySource,
): StoryChapters {
  const chapters = blankChapters();

  if (snapshot.act1Result) {
    chapters.act1 = known({ team: snapshot.act1Result.team, reason: snapshot.act1Result.reason }, source);
    chapters.finalTracks = known(snapshot.act1Result.finalTracks, source);
    chapters.returns = derived(
      returns(snapshot.act1Result, seats),
      [source],
      'All ten receive two fresh cards and 2 + the recorded faction bonus coins.',
    );
  }

  if (snapshot.result) chapters.outcome = known(outcome(snapshot.result, seats, source), source);

  if (snapshot.status === 'interrupted' && snapshot.interruptionReason !== null)
    chapters.interruption = known(snapshot.interruptionReason, source);

  return chapters;
}

interface Working {
  seats: StorySeat[];
  coordinator: StoryValue<number | null>;
  executor: StoryValue<number | null>;
  turnOwner: StoryValue<number | null>;
  executivePower: StoryRow['executivePower'];
  action: StoryValue<StoryAction>;
  completed: Pick<StoryRow, 'action' | 'resolution' | 'turnOwner'> | null;
  resolution: StoryValue<StoryResolution>;
  loss: StoryValue<{ seat: number; reason: 'failed-claim' | 'failed-challenge' | 'action-effect' }>;
  targetLoss: StoryValue<number>;
  targetLossAfterChallenge: StoryValue<number>;
  chapters: StoryChapters;
}

function working(baseline?: Snapshot): Working {
  const state: Working = {
    seats: Array.from({ length: 10 }, (_, seat) => emptySeat(seat, 'missing-baseline')),
    coordinator: unavailable('missing-baseline'),
    executor: unavailable('missing-baseline'),
    turnOwner: unavailable('missing-baseline'),
    action: unavailable('not-recorded'),
    completed: null,
    executivePower: unavailable('missing-baseline'),
    resolution: unavailable('not-yet-resolved'),
    loss: unavailable('not-recorded'),
    targetLoss: unavailable('not-recorded'),
    targetLossAfterChallenge: unavailable('not-recorded'),
    chapters: blankChapters(),
  };

  if (!baseline) return state;
  const source = snapshotSource(baseline, 'checkpoint');
  state.seats = snapshotSeats(baseline, source);
  state.chapters = snapshotChapters(baseline, state.seats, source);
  const board = baseline.board;

  if (board.act === 1) {
    state.coordinator = known(board.coordinator, source);
    state.executor = known(board.executor, source);
    state.turnOwner = known(board.coordinator, source);
    state.executivePower = known(board.power, source);
  } else {
    state.turnOwner = known(board.activeSeat, source);
    state.executivePower = known(null, source);

    if (board.pending)
      state.action = known({ ...board.pending, declaration: unavailable('not-recorded') }, source);

    if (
      board.pending?.target != null &&
      (board.pending.action === 'coup' ||
        (board.pending.action === 'assassinate' && baseline.phase.kind === 'act-2:block'))
    )
      state.targetLoss = derived(
        board.pending.target,
        [source],
        'A Coup or an Assassination leaving an unblocked target-choice window reaches the target loss.',
      );
    // The public board does not expose the selected loss seat or challenge continuation.
  }

  return state;
}

function invalidate(state: Working, reason: Missing): void {
  state.seats = state.seats.map((seat) => ({ ...emptySeat(seat.seat, reason), entrant: seat.entrant }));
  state.coordinator = unavailable(reason);
  state.executor = unavailable(reason);
  state.turnOwner = unavailable(reason);
  state.executivePower = unavailable(reason);
  state.action = unavailable(reason);
  state.completed = null;
  state.resolution = unavailable(reason);
  state.loss = unavailable(reason);
  state.targetLoss = unavailable(reason);
  state.targetLossAfterChallenge = unavailable(reason);
}

function roster(seats: readonly StorySeat[], source: StorySource): StoryValue<readonly StorySeat[]> {
  if (seats.some((seat) => seat.alive.status === 'unavailable')) return unavailable('missing-baseline');

  return derived(
    structuredClone(seats.filter((seat) => value(seat.alive))),
    [source, ...seats.flatMap((seat) => sources(seat.alive))],
    'Living seats immediately after this recorded loss.',
  );
}

function phaseActor(
  fact: Extract<StoryFact, { kind: 'phase' }>,
  state: Working,
  source: StorySource,
): StoryValue<number | null> {
  if (['nomination', 'coordinator-discard', 'veto-response', 'executive-action'].includes(fact.phase))
    return assigned(state.coordinator, source, 'This phase requires the Coordinator to act.');

  if (fact.phase === 'executor-policy')
    return assigned(state.executor, source, 'The Executor selects the policy.');

  if (['action', 'act-2:action', 'exchange', 'act-2:exchange'].includes(fact.phase))
    return assigned(
      state.turnOwner,
      source,
      'The turn owner declares an action or completes their private exchange.',
    );

  if (['block', 'act-2:block'].includes(fact.phase)) {
    const action = value(state.action);

    return action
      ? derived(
          action.target,
          [...sources(state.action), source],
          'The action target makes the block choice.',
        )
      : unavailable('not-recorded');
  }

  if (['loss', 'act-2:loss'].includes(fact.phase)) {
    const loss = value(state.loss);

    return loss
      ? derived(
          loss.seat,
          [...sources(state.loss), source],
          'The selected losing seat chooses a card, independently of the turn owner.',
        )
      : unavailable('not-recorded');
  }

  return known(null, source);
}

function ruleTerms(fact: StoryFact): StoryRule[] {
  switch (fact.kind) {
    case 'declaration':
      return [storyActionRules[fact.action.type], ...(fact.claim ? [fact.claim] : []), 'coins'];
    case 'challenge-resolved':
      return ['challenge', fact.capability, ...(fact.block ? ['block' as const] : [])];
    case 'proof':
      return ['challenge', fact.capability, 'influence'];
    case 'block':
      return ['block', fact.capability];
    case 'influence-lost':
      return ['influence', fact.capability, ...(fact.eliminated ? ['elimination' as const] : [])];
    case 'coins':
      return ['coins'];
    case 'exchange-completed':
      return ['exchange'];
    case 'nomination':
      return ['nomination', 'coordinator', 'executor', 'term-limits'];
    case 'election':
      return ['election', 'government'];
    case 'ballot':
      return ['election'];
    case 'policy':
      return ['policy', fact.policy, ...(fact.chaos ? ['chaos' as const] : ['executive-power' as const])];
    case 'tracker':
      return ['election-tracker'];
    case 'execution':
      return ['execution'];
    case 'investigation':
    case 'investigation-result':
      return ['investigation'];
    case 'special-election':
      return ['special-election'];
    case 'veto-request':
    case 'veto-response':
      return ['veto'];
    case 'act-started':
      return ['coins', 'influence', fact.team];
    case 'act-ended':
      return [fact.team];
    case 'finished':
      return fact.capEvidence ? ['round-cap', 'influence', 'coins'] : ['elimination'];
    case 'cleared-executor':
      return ['executor', 'overlord'];
    default:
      return [];
  }
}

function apply(state: Working, row: StoryRow, archive: boolean): void {
  const fact = row.fact;
  const source = row.source;
  const actor = value(row.actor);
  const participant = actor == null ? undefined : state.seats.find((seat) => seat.seat === actor);
  const action = value(state.action);
  const context = [...sources(state.action), source];

  switch (fact.kind) {
    case 'nomination':
      state.coordinator = row.actor;
      state.executor = known(fact.target, source);
      break;
    case 'election':
      state.coordinator = known(fact.coordinator, source);
      state.executor = known(fact.executor, source);
      break;
    case 'policy': {
      let power: 'investigate' | 'special-election' | 'execute' | null = null;

      if (!fact.chaos && fact.policy === 'override' && fact.overrides < 6) {
        if (fact.overrides <= 2) power = 'investigate';
        else if (fact.overrides === 3) power = 'special-election';
        else power = 'execute';
      }

      state.executivePower = derived(
        power,
        [source],
        'The ten-seat executive board grants powers only for nonterminal government-enacted Overrides.',
      );
      break;
    }

    case 'phase':
      if (fact.phase === 'nomination-discussion') state.executivePower = known(null, source);

      if (fact.coordinator !== undefined) state.coordinator = known(fact.coordinator, source);

      if (fact.executor !== undefined) state.executor = known(fact.executor, source);

      if (fact.activeSeat !== undefined) state.turnOwner = known(fact.activeSeat, source);
      else if (fact.coordinator !== undefined) state.turnOwner = known(fact.coordinator, source);

      if (['exchange', 'act-2:exchange'].includes(fact.phase) && action) {
        const exchanging = state.seats.find((seat) => seat.seat === action.actor);

        if (exchanging) exchanging.hand = unavailable('cards-changed');
      }

      if (
        ['block', 'act-2:block'].includes(fact.phase) &&
        action?.action === 'assassinate' &&
        action.target !== null
      )
        state.targetLoss = derived(
          action.target,
          context,
          'The next loss after an unblocked Assassination target-choice window is the target effect.',
        );

      if (
        ['loss', 'act-2:loss'].includes(fact.phase) &&
        value(state.loss) === undefined &&
        value(state.targetLoss) !== undefined
      )
        state.loss = derived(
          { seat: value(state.targetLoss)!, reason: 'action-effect' },
          [...sources(state.targetLoss), source],
          'A targeted Coup or Assassination effect requires the target to lose influence.',
        );
      row.actor = phaseActor(fact, state, source);
      break;
    case 'act-ended':
      state.chapters.act1 = known({ team: fact.team, reason: fact.reason }, source);
      break;
    case 'act-started':
      state.chapters.act1 = known({ team: fact.team, reason: fact.reason }, source);
      state.chapters.returns = derived(
        returns(fact, state.seats),
        [source],
        'All ten receive two fresh cards and 2 + the recorded faction bonus coins.',
      );
      state.turnOwner = known(fact.firstSeat, source);
      state.executivePower = known(null, source);
      state.action = unavailable('not-applicable');
      state.seats = state.seats.map((seat) => ({
        ...seat,
        alive: derived(true, [source], 'All ten seats return for Act II.'),
        coins: derived(
          2 + fact.bonuses[seat.seat],
          [source],
          'Starting coins are 2 + the recorded faction bonus.',
        ),
        influence: derived(2, [source], 'All ten seats receive two fresh influence cards.'),
        revealed: derived([], [source], 'Fresh Act II cards replace Act I roles.'),
        role: known({ role: fact.roles[seat.seat], visibility: 'public' }, source),
        hand: unavailable('not-disclosed'),
        exchangeDraw: unavailable('not-applicable'),
      }));
      break;
    case 'declaration': {
      const declared: StoryAction = {
        actor: fact.actor,
        action: fact.action.type,
        target: fact.action.target ?? null,
        claim: fact.claim,
        paid: fact.payment,
        declaration: known(source, source),
      };

      state.action = known(declared, source);
      state.turnOwner = known(fact.actor, source);
      state.resolution = unavailable('not-yet-resolved');
      state.loss = unavailable('not-recorded');
      state.targetLoss =
        fact.action.type === 'coup' && fact.action.target !== undefined
          ? derived(
              fact.action.target,
              [source],
              'Coup has no claim, challenge or block; its target loses influence.',
            )
          : unavailable('not-recorded');
      state.targetLossAfterChallenge = unavailable('not-recorded');

      if (participant && fact.payment > 0) {
        const coins = value(participant.coins);
        participant.coins =
          coins === undefined || coins < fact.payment
            ? unavailable('not-recorded')
            : derived(
                coins - fact.payment,
                [...sources(participant.coins), source],
                'The recorded payment is spent at declaration, without refund.',
              );
      }

      break;
    }

    case 'challenge-resolved':
      if (fact.outcome === 'disproved') {
        state.loss = derived(
          { seat: fact.claimant, reason: 'failed-claim' },
          [source],
          'The claimant loses influence for a disproved claim.',
        );

        if (!fact.block)
          state.resolution = derived('cancelled', context, 'A disproved action claim cancels the action.');

        if (fact.block && action?.action === 'assassinate' && action.target !== null)
          state.targetLossAfterChallenge = derived(
            action.target,
            context,
            'A disproved Guard block permits the target effect after the claim loss, if the target survives.',
          );
      } else {
        if (fact.block)
          state.resolution = derived('blocked', context, 'An unchallenged or proved block stops the action.');

        if (fact.challenger !== null)
          state.loss = derived(
            { seat: fact.challenger, reason: 'failed-challenge' },
            [source],
            'The selected challenger loses influence when the claim is proved.',
          );
      }

      break;
    case 'block':
      state.targetLoss = unavailable('not-recorded');
      break;
    case 'proof':
      if (participant) participant.hand = unavailable('cards-changed');
      break;
    case 'coins':
      if (participant) participant.coins = known(fact.coins, source);

      if (action) state.resolution = derived('applied', context, 'The action published its coin effect.');
      break;
    case 'execution': {
      const target = state.seats.find((seat) => seat.seat === fact.target);

      if (target) target.alive = known(false, source);
      break;
    }

    case 'influence-lost':
      if (participant) {
        const prior = value(participant.influence);
        participant.influence = derived(
          fact.eliminated ? 0 : 1,
          [source],
          'With at most two influence, a recorded loss leaves zero if eliminated and one otherwise.',
        );
        participant.alive = known(!fact.eliminated, source);
        const revealed = value(participant.revealed);
        participant.revealed = revealed
          ? derived(
              [...revealed, fact.capability],
              [...sources(participant.revealed), source],
              'The chosen lost capability remains publicly revealed.',
            )
          : unavailable('missing-baseline');
        // Loss does not identify an opaque card ID; invalidate rather than choosing a matching copy.
        participant.hand = fact.eliminated
          ? derived(
              { visibility: archive ? 'archive' : 'private', cards: [] },
              [source],
              'An eliminated seat has no unrevealed cards.',
            )
          : unavailable('cards-changed');

        if (prior !== undefined && prior !== (fact.eliminated ? 1 : 2))
          participant.revealed = unavailable('history-gap');
      }

      if (value(state.loss)?.seat === actor) {
        const loss = value(state.loss)!;
        row.lossReason = derived(
          loss.reason,
          [...sources(state.loss), source],
          'Loss follows the recorded challenge outcome or targeted effect.',
        );

        if (loss.reason === 'action-effect')
          state.resolution = derived(
            'applied',
            context,
            'The action target lost influence for the action effect.',
          );
        else if (
          fact.eliminated &&
          action &&
          (actor === action.actor || actor === action.target) &&
          value(state.resolution) !== 'blocked'
        )
          state.resolution = derived(
            'cancelled',
            [...sources(state.loss), source, ...context],
            'A challenge loss eliminated the actor or target before the action effect.',
          );
        state.loss = unavailable('not-recorded');
        state.targetLoss = state.targetLossAfterChallenge;
        state.targetLossAfterChallenge = unavailable('not-recorded');
      }

      break;
    case 'exchange-completed':
      if (participant) {
        participant.hand = unavailable('cards-changed');
        participant.exchangeDraw = unavailable('not-applicable');
      }

      state.resolution = derived('applied', context, 'The exchange completion was published.');
      break;
    case 'private-cards':
      if (participant) {
        const hand = known(
          { visibility: archive ? ('archive' as const) : ('private' as const), cards: fact.cards },
          source,
        );

        if (fact.operation === 'exchange-draw') participant.exchangeDraw = hand;
        else participant.hand = hand;
      }

      break;
    case 'role':
      if (participant)
        participant.role = known({ role: fact.role, visibility: archive ? 'archive' : 'private' }, source);
      break;
    case 'takeover':
      if (participant) {
        const prior = value(participant.controller);
        const generation = prior ? value(prior.generation) : undefined;
        participant.controller = known(
          {
            house: true,
            forfeited: true,
            identity: unavailable('not-recorded'),
            generation:
              fact.generation !== undefined
                ? known(fact.generation, source)
                : generation === undefined
                  ? unavailable('not-recorded')
                  : derived(
                      generation + 1,
                      [source, ...sources(participant.controller)],
                      'A takeover advances controller generation once.',
                    ),
          },
          source,
        );
      }

      break;
    case 'finished': {
      const act1 = value(state.chapters.act1);

      if (act1)
        state.chapters.outcome = known(
          outcome(
            {
              kind: 'individual',
              winnerSeat: fact.winner,
              reason: fact.capEvidence ? 'round-cap' : 'last-survivor',
              act1,
              tieBreak: fact.capEvidence,
            },
            state.seats,
            source,
          ),
          source,
        );
      break;
    }

    case 'interrupted':
      state.chapters.interruption = known(row.text, source);
      break;
    case 'system':
      if (fact.type === 'started')
        for (const seat of state.seats)
          seat.alive = derived(true, [source], 'All ten seats begin Act I alive.');
      break;
  }
}

function assigned(
  seat: StoryValue<number | null>,
  source: StorySource,
  rule: string,
): StoryValue<number | null> {
  return seat.status === 'unavailable' ? seat : derived(seat.value, [...seat.sources, source], rule);
}

function actorFor(
  fact: StoryFact,
  seat: number | undefined,
  source: StorySource,
  state: Working,
): StoryValue<number | null> {
  if (fact.kind === 'declaration') return known(fact.actor, source);

  if (fact.kind === 'challenge-resolved') return known(fact.challenger, source);

  if (fact.kind === 'election') return known(fact.coordinator, source);

  if (fact.kind === 'policy')
    return fact.chaos
      ? known(null, source)
      : assigned(state.executor, source, 'The elected Executor selects the government-enacted policy.');

  if (seat !== undefined) return known(seat, source);

  if (
    ['phase', 'act-started', 'act-ended', 'finished', 'interrupted', 'tracker', 'system', 'audit'].includes(
      fact.kind,
    )
  )
    return known(null, source);

  return unavailable('not-recorded');
}

function targetFor(fact: StoryFact, state: Working, source: StorySource): StoryValue<number | null> {
  if ('target' in fact) return known(fact.target, source);

  if (fact.kind === 'declaration') return known(fact.action.target ?? null, source);

  if (fact.kind === 'challenge-resolved') return known(fact.claimant, source);

  if (fact.kind === 'election') return known(fact.executor, source);

  if (fact.kind === 'block') {
    const action = value(state.action);

    return action
      ? derived(
          action.actor,
          [...sources(state.action), source],
          'The block opposes the original action actor.',
        )
      : unavailable('not-recorded');
  }

  return known(null, source);
}

function visibility(fact: StoryFact, archive: boolean): StoryRow['visibility'] {
  if (fact.kind === 'audit') return 'archive';

  if (fact.kind === 'unavailable') return 'unavailable';

  if (
    [
      'private-cards',
      'private-policies',
      'ballot',
      'role',
      'rogue-knowledge',
      'investigation-result',
      'reaction',
    ].includes(fact.kind)
  )
    return archive ? 'archive' : 'private';

  return 'public';
}

function requireScope(source: StorySource, scope: StoryScope): void {
  if (source.matchId !== scope.matchId || source.visibilityEpoch !== scope.visibilityEpoch)
    throw new Error('Story source does not match the authorized window scope.');
}

/** Pure bounded projection. Fetching, entitlement, live acceptance and DOM windowing belong to the caller. */
export function buildSuccessionStory(input: StoryWindow): StoryModel {
  if (input.events.length > 256) throw new Error('Story windows retain at most 256 authorized events.');

  if (
    !Number.isSafeInteger(input.after) ||
    !Number.isSafeInteger(input.through) ||
    input.after < 0 ||
    input.through < input.after
  )
    throw new Error('Invalid story window range.');

  if (input.baseline) {
    const baseline = snapshotSource(input.baseline, 'checkpoint');
    requireScope(baseline, input.scope);

    if (baseline.cursor !== input.after)
      throw new Error('Story baseline must be at the exclusive window start.');
  }

  if (input.current) requireScope(snapshotSource(input.current, 'current'), input.scope);
  // Own every value in the result: later caller mutation must not rewrite historical rows.
  const window = structuredClone(input);
  const state = working(window.baseline);
  const issues: StoryModel['issues'][number][] = [];

  if (!window.baseline) issues.push({ kind: 'missing-baseline', after: window.after, through: window.after });
  const rows: StoryRow[] = [];
  const keys = new Set<string>();
  let delivered = window.after;

  const archive =
    (window.baseline !== undefined && 'archive' in window.baseline) ||
    (window.current !== undefined && window.current.status !== 'active');

  for (const event of window.events) {
    if (
      !Number.isSafeInteger(event.id) ||
      event.id <= delivered ||
      event.id > window.through ||
      keys.has(event.eventKey)
    )
      throw new Error('Story events must be unique and ordered inside the supplied window.');

    if (event.id !== delivered + 1) {
      issues.push({ kind: 'history-gap', after: delivered, through: event.id - 1 });
      invalidate(state, 'history-gap');
    }

    keys.add(event.eventKey);
    delivered = event.id;

    const source: StoryRow['source'] = {
      ...window.scope,
      kind: 'event',
      cursor: event.id,
      eventKey: event.eventKey,
    };

    const fact = readStoryFact(event);

    // One command can publish next-turn or terminal phase state before its private response/hand updates.
    // Keep that causal tail separate from the active board, and expire it at the next activity.
    const trailing =
      fact.kind === 'reaction' || (fact.kind === 'private-cards' && fact.operation === 'hand-updated');

    if (
      !trailing &&
      fact.kind !== 'audit' &&
      fact.kind !== 'finished' &&
      !(fact.kind === 'phase' && ['discussion', 'act-2:discussion', 'finished'].includes(fact.phase))
    )
      state.completed = null;

    if (fact.kind === 'unavailable') {
      issues.push({ kind: 'incomplete-payload', after: event.id - 1, through: event.id });
      // Unknown rule facts may mutate resources. Do not carry stale known values across them.
      invalidate(state, 'not-recorded');
    }

    const before = structuredClone(state.seats);

    const row: StoryRow = {
      key: JSON.stringify([window.scope.matchId, event.eventKey]),
      source,
      position: { act: event.act, round: event.round, order: event.id, at: event.at },
      text: event.text,
      fact,
      visibility: visibility(fact, archive),
      actor: actorFor(fact, event.seat, source, state),
      target: targetFor(fact, state, source),
      turnOwner: state.turnOwner,
      action: state.action,
      resolution: unavailable('not-yet-resolved'),
      executivePower: state.executivePower,
      lossReason: unavailable('not-applicable'),
      affected: [],
      remaining: unavailable('not-applicable'),
      rules: [
        ...new Set([
          ...ruleTerms(fact),
          ...storyText(event.text).flatMap((part) => (part.rule ? [part.rule] : [])),
        ]),
      ],
    };

    apply(state, row, archive);
    row.turnOwner = state.turnOwner;
    row.executivePower = state.executivePower;
    row.action = state.action;
    row.resolution = state.resolution;

    if (trailing && state.completed) {
      row.action = state.completed.action;
      row.resolution = state.completed.resolution;
      row.turnOwner = state.completed.turnOwner;
    }

    const involved = [
      'declaration',
      'challenge-resolved',
      'block',
      'proof',
      'influence-lost',
      'coins',
      'exchange-completed',
      'execution',
      'takeover',
    ].includes(fact.kind)
      ? [value(row.actor), value(row.target)]
      : [];

    row.affected = state.seats.flatMap((seat, index) =>
      !involved.includes(seat.seat) && JSON.stringify(before[index]) === JSON.stringify(seat)
        ? []
        : [{ seat: seat.seat, before: before[index], after: structuredClone(seat) }],
    );

    if (fact.kind === 'execution' || fact.kind === 'influence-lost')
      row.remaining = roster(state.seats, source);
    rows.push(structuredClone(row));

    if (fact.kind === 'turn-ended' || fact.kind === 'finished') {
      if (state.action.status !== 'unavailable')
        state.completed = { action: row.action, resolution: row.resolution, turnOwner: row.turnOwner };
      state.action = unavailable('not-applicable');
      state.resolution = unavailable('not-yet-resolved');
      state.loss = unavailable('not-recorded');
      state.targetLoss = unavailable('not-recorded');
      state.targetLossAfterChallenge = unavailable('not-recorded');
    }
  }

  if (delivered < window.through)
    issues.push({ kind: 'history-gap', after: delivered, through: window.through });

  if (window.current) {
    const source = snapshotSource(window.current, 'current');
    // Current supplies chapter facts only; it cannot fill a window's missing baseline or earlier hands.
    const current = snapshotChapters(window.current, snapshotSeats(window.current, source), source);

    for (const key of ['act1', 'finalTracks', 'returns', 'outcome', 'interruption'] as const) {
      // Assign individually below to preserve each correlated value type.
      if (current[key].status === 'unavailable') continue;

      switch (key) {
        case 'act1':
          state.chapters.act1 = current.act1;
          break;
        case 'finalTracks':
          state.chapters.finalTracks = current.finalTracks;
          break;
        case 'returns':
          state.chapters.returns = current.returns;
          break;
        case 'outcome':
          state.chapters.outcome = current.outcome;
          break;
        case 'interruption':
          state.chapters.interruption = current.interruption;
          break;
      }
    }
  }

  return {
    scope: window.scope,
    after: window.after,
    through: window.through,
    delivered,
    rows,
    chapters: state.chapters,
    end: structuredClone(state.seats),
    issues,
  };
}
