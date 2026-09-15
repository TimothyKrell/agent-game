/** Independent, explicitly seeded scenarios; all displayed rows/checkpoints are canonical engine emissions. */
import { buildSuccessionStory } from '../../src/client/succession-story';
import type { StoryModel } from '../../src/client/succession-story';
import { evolveSuccession } from '../../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../../src/game/succession/observation';
import type { Evolution, RandomContext, SuccessionState } from '../../src/game/succession/types';
import { board2, choose, collect, executive, storyAct2, storyGame, storyWindow } from './succession-story';

export interface DossierEngineExample {
  id: string;
  title: string;
  models: StoryModel[];
}

function model(before: SuccessionState, evolutions: Evolution[]) {
  return buildSuccessionStory(storyWindow(before, evolutions, 'archive'));
}

function loss(state: SuccessionState, random: RandomContext, seat: number) {
  return choose(state, random, seat, {
    type: 'lose-influence',
    cardId: board2(state).resources[seat].hand[0].id,
  });
}

async function faction(ending: 'safeguard' | 'overlord-election') {
  const { created, random } = await storyGame(3);
  const before = created.state;

  if (before.stage.act !== 1) throw new Error('Act I required');
  const board = before.stage.board;
  const overlord = before.seats.find((seat) => seat.role === 'overlord')!.number;
  board.executor = overlord;

  if (ending === 'overlord-election') {
    board.phase.kind = 'voting';
    board.overrides = 3;
    before.seats.forEach((seat) => {
      if (seat.number !== board.coordinator) board.votes[seat.number] = true;
    });

    return model(before, [choose(before, random, board.coordinator, { type: 'vote', approve: true })]);
  }

  board.phase.kind = 'executor-policy';
  board.safeguards = 4;
  const index = board.deck.findIndex((card) => card.policy === 'safeguard');
  board.hand = [board.deck.splice(index, 1)[0], board.deck.shift()!];

  return model(before, [choose(before, random, overlord, { type: 'enact', cardId: board.hand[0].id })]);
}

async function executions() {
  const { created, random } = await storyGame(2);
  const before = created.state;
  executive(before);

  if (before.stage.act !== 1) throw new Error('Act I required');
  const actor = before.stage.board.coordinator;
  const ordinary = before.seats.find((seat) => seat.number !== actor && seat.role !== 'overlord')!.number;
  const overlord = before.seats.find((seat) => seat.role === 'overlord')!.number;
  const first = choose(before, random, actor, { type: 'execute', target: ordinary });
  const secondBefore = structuredClone(first.state);
  executive(secondBefore);

  if (secondBefore.stage.act !== 1) throw new Error('Act I required');

  const second = choose(secondBefore, random, secondBefore.stage.board.coordinator, {
    type: 'execute',
    target: overlord,
  });

  return [model(before, [first]), model(secondBefore, [second])];
}

async function veto(approve: boolean) {
  const { created, random } = await storyGame(21);
  const before = created.state;

  if (before.stage.act !== 1) throw new Error('Act I required');
  const board = before.stage.board;
  const actor = board.coordinator;
  const executor = (actor + 1) % 10;
  board.executor = executor;
  board.phase.kind = 'executor-policy';
  board.overrides = 5;
  board.hand = board.deck.splice(0, 2);
  const request = choose(before, random, executor, { type: 'request-veto' });
  const response = choose(request.state, random, actor, { type: 'veto', approve });

  return model(before, [request, response]);
}

async function specialElection() {
  const { created, random } = await storyGame(21);
  const before = created.state;

  if (before.stage.act !== 1) throw new Error('Act I required');
  const board = before.stage.board;
  board.phase.kind = 'executive-action';
  board.power = 'special-election';

  return model(before, [
    choose(before, random, board.coordinator, {
      type: 'special-election',
      target: (board.coordinator + 1) % 10,
    }),
  ]);
}

async function assassination(blocked: boolean) {
  const { state, random } = await storyAct2(9);
  const actor = board2(state).activeSeat;
  const target = (actor + 1) % 10;
  board2(state).resources[actor].coins = 6;
  const declared = choose(state, random, actor, { type: 'assassinate', target });
  const responses = collect(declared.state, random);

  const block = choose(
    responses.state,
    random,
    target,
    blocked ? { type: 'block', capability: 'guard' } : { type: 'pass' },
  );

  return model(state, [
    declared,
    ...responses.evolutions,
    block,
    ...(blocked ? collect(block.state, random).evolutions : [loss(block.state, random, target)]),
  ]);
}

async function paidFailure() {
  let { state, random } = await storyAct2(5);

  while (
    board2(state).resources[board2(state).activeSeat].hand.some((card) => card.capability === 'assassin')
  ) {
    state = choose(state, random, board2(state).activeSeat, { type: 'income' }).state;
    state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, random).state;
  }

  const actor = board2(state).activeSeat;
  board2(state).resources[actor].coins = 3;
  const declared = choose(state, random, actor, { type: 'assassinate', target: (actor + 1) % 10 });

  const speech = choose(declared.state, random, (actor + 1) % 10, {
    type: 'chat',
    text: 'I claim Treasurer.\n  “Challenge me?” — 🗝️',
  });

  const challenged = collect(speech.state, random, (actor + 1) % 10);

  return model(state, [declared, speech, ...challenged.evolutions, loss(challenged.state, random, actor)]);
}

async function partialTheft() {
  const { state, random } = await storyAct2(9);
  const actor = board2(state).activeSeat;
  const target = (actor + 1) % 10;
  board2(state).resources[target].coins = 1;
  const declared = choose(state, random, actor, { type: 'steal', target });
  const responses = collect(declared.state, random);

  return model(state, [
    declared,
    ...responses.evolutions,
    choose(responses.state, random, target, { type: 'pass' }),
  ]);
}

async function doubleLoss() {
  const { state, random } = await storyAct2(4);
  const actor = board2(state).activeSeat;

  const target = board2(state).resources.findIndex(
    (resource, seat) => seat !== actor && resource.hand.every((card) => card.capability !== 'guard'),
  );

  board2(state).resources[actor].coins = 3;
  const declared = choose(state, random, actor, { type: 'assassinate', target });
  const responses = collect(declared.state, random);
  const block = choose(responses.state, random, target, { type: 'block', capability: 'guard' });
  const challenged = collect(block.state, random, (target + 1) % 10);
  const first = loss(challenged.state, random, target);
  const second = loss(first.state, random, target);

  return model(state, [declared, ...responses.evolutions, block, ...challenged.evolutions, first, second]);
}

async function cap(criterion: 'influence' | 'coins' | 'priority', takeover = false) {
  const { state, random } = await storyAct2(12);
  const board = board2(state);
  const actor = board.activeSeat;
  board.round = 12;
  board.slot = 9;
  board.firstSeat = (actor + 1) % 10;

  for (const [seat, resource] of board.resources.entries()) {
    resource.coins = seat === actor ? (criterion === 'coins' ? 8 : 2) : 3;

    if (criterion === 'influence' && seat !== actor) resource.revealed.push(resource.hand.pop()!);
  }

  const replacement = takeover
    ? evolveSuccession(
        state,
        { type: 'advance', now: state.phase.deadline! + state.snapshot.timing.grace },
        random,
      )
    : undefined;

  const finished = choose(replacement?.state ?? state, random, actor, { type: 'income' });

  return model(state, replacement ? [replacement, finished] : [finished]);
}

async function interruption() {
  const { state, random } = await storyAct2(6);

  return model(state, [
    evolveSuccession(
      state,
      { type: 'interrupt', now: 7000, reason: 'Recorded platform interruption' },
      random,
    ),
  ]);
}

export async function dossierEngineExamples(): Promise<DossierEngineExample[]> {
  return [
    {
      id: 'faction-endings',
      title: 'Other Act I faction endings',
      models: await Promise.all([faction('safeguard'), faction('overlord-election')]),
    },
    { id: 'execution-return', title: 'Act I execution & return', models: await executions() },
    {
      id: 'veto',
      title: 'Veto accepted / rejected & special election',
      models: await Promise.all([veto(true), veto(false), specialElection()]),
    },
    {
      id: 'unblocked',
      title: 'Assassination resolves & unchallenged block',
      models: await Promise.all([assassination(false), assassination(true)]),
    },
    {
      id: 'failed-assassin',
      title: 'Paid claim fails & a one-coin Theft',
      models: await Promise.all([paidFailure(), partialTheft()]),
    },
    {
      id: 'double-loss',
      title: 'Disproved Guard block & two influence losses',
      models: [await doubleLoss()],
    },
    {
      id: 'cap',
      title: 'Round cap: influence, coins & priority',
      models: await Promise.all([cap('influence'), cap('coins'), cap('priority')]),
    },
    {
      id: 'takeover',
      title: 'Controller takeover & interrupted record',
      models: await Promise.all([cap('coins', true), interruption()]),
    },
  ];
}

export async function dossierProof() {
  const { state, random } = await storyAct2(7);
  const actor = board2(state).activeSeat;

  const capability = board2(state).resources[actor].hand.find(
    (card) => card.capability !== 'guard',
  )!.capability;

  if (capability === 'guard') throw new Error('An action capability is required');
  const target = (actor + 1) % 10;
  const challenger = (actor + 2) % 10;
  board2(state).resources[actor].coins = 3;

  const action = {
    treasurer: { type: 'tax' as const },
    thief: { type: 'steal' as const, target },
    assassin: { type: 'assassinate' as const, target },
    envoy: { type: 'exchange' as const },
  }[capability];

  const declared = choose(state, random, actor, action);
  const responses = collect(declared.state, random, challenger);
  const lost = loss(responses.state, random, challenger);
  const evolutions = [declared, ...responses.evolutions, lost];
  let next = lost.state;

  if (board2(next).phase === 'block') {
    const passed = choose(next, random, target, { type: 'pass' });
    evolutions.push(passed);
    next = passed.state;
  }

  if (board2(next).phase === 'loss' || board2(next).phase === 'exchange') {
    const seat = inspectSuccession(next).pendingSeats[0];
    evolutions.push(choose(next, random, seat, observeSuccession(next, seat).decision!.actions[0].action));
  }

  return model(state, evolutions);
}

export async function dossierLifecycle() {
  const { initial, transition } = await storyAct2(12);

  return { act1: model(initial, []), act2: model(transition.state, []), finished: await cap('coins', true) };
}

export async function dossierUnknown() {
  const { state, random } = await storyAct2(7);
  const actor = board2(state).activeSeat;
  const target = (actor + 1) % 10;
  board2(state).resources[actor].coins = 7;
  board2(state).resources[target].revealed.push(board2(state).resources[target].hand.pop()!);
  const declared = choose(state, random, actor, { type: 'coup', target });
  const lost = loss(declared.state, random, target);

  return buildSuccessionStory({ ...storyWindow(state, [declared, lost]), baseline: undefined });
}
