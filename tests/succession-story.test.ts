import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildSuccessionStory } from '../src/client/succession-story';
import { dossierFactText } from '../src/client/dossier-facts';
import type { StoryModel, StoryRow, StoryValue } from '../src/client/succession-story';
import { storyRules, storyText } from '../src/client/succession-story-rules';
import { evolveSuccession } from '../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../src/game/succession/observation';
import { previewSuccessionAction } from '../src/game/succession/preview';
import { replayFrameSuccession } from '../src/game/succession/replay';
import type { Capability, Observation2 } from '../src/shared/succession';
import { AuthorizedEvent2Schema, Observation2Schema } from '../src/shared/succession';
import capture from '../src/client/succession-replay-record.prototype.json';
import {
  actionCommand,
  board2,
  choose,
  collect,
  executive,
  storyAct2,
  storyGame,
  storyRandom,
  storyWindow,
} from './fixtures/succession-story';

function get<T>(fact: StoryValue<T>): T {
  if (fact.status === 'unavailable') throw new Error(`Unavailable test fact: ${fact.reason}`);

  return fact.value;
}

function row(model: StoryModel, kind: StoryRow['fact']['kind']) {
  const found = model.rows.find((entry) => entry.fact.kind === kind);

  if (!found) throw new Error(`Missing ${kind}`);

  return found;
}

function after(row: StoryRow, seat: number) {
  const change = row.affected.find((entry) => entry.seat === seat);

  if (!change) throw new Error(`Missing affected seat ${seat}`);

  return change.after;
}

describe('canonical Succession story windows', () => {
  it('preserves temporary coverage and reclaim in bounded historical controller records', async () => {
    const { created } = await storyGame(2);
    const baseline = observeSuccession(created.state, null);
    const start = baseline.history.streamHead;
    const agentId = baseline.seats[0].agentId;

    const model = buildSuccessionStory({
      scope: { matchId: baseline.matchId, visibilityEpoch: baseline.history.visibilityEpoch },
      after: start,
      through: start + 2,
      baseline,
      events: [
        {
          id: start + 1,
          eventKey: 'coverage-1',
          act: 1,
          round: 1,
          at: 2000,
          seat: 0,
          type: 'takeover',
          text: 'Temporary coverage',
          data: { agentId, generation: 1, recoverable: true, recoveryCount: 1, recoveryLimit: 3 },
        },
        {
          id: start + 2,
          eventKey: 'reclaimed-1',
          act: 1,
          round: 1,
          at: 3000,
          seat: 0,
          type: 'reclaimed',
          text: 'Original entrant returns',
          data: { agentId, generation: 2, recoveryCount: 1, recoveryLimit: 3 },
        },
      ],
    });

    const covered = row(model, 'takeover');
    const reclaimed = row(model, 'reclaimed');
    expect(get(after(covered, 0).controller)).toMatchObject({
      house: true,
      forfeited: false,
      recoverable: true,
      recoveryCount: 1,
      recoveryLimit: 3,
    });
    expect(get(after(reclaimed, 0).controller)).toMatchObject({
      house: false,
      forfeited: false,
      recoverable: false,
      recoveryCount: 1,
      recoveryLimit: 3,
    });
    expect(get(get(after(reclaimed, 0).controller).identity)).toBe(agentId);
    expect(dossierFactText(covered, new Map())).toContain('temporarily covers');
    expect(dossierFactText(covered, new Map())).not.toContain('forfeits');
    expect(dossierFactText(reclaimed, new Map())).toContain('resumes control');
  });

  it('keeps ordinary execution private, shows Overlord result at its source, and returns all ten with the actual bonus', async () => {
    const { created, random } = await storyGame(2);
    const initial = created.state;
    executive(initial);

    if (initial.stage.act !== 1) throw new Error('Expected Act I');
    const coordinator = initial.stage.board.coordinator;

    const ordinary = initial.seats.find(
      (seat) => seat.number !== coordinator && seat.role !== 'overlord',
    )!.number;

    const overlord = initial.seats.find((seat) => seat.role === 'overlord')!.number;
    const first = choose(initial, random, coordinator, { type: 'execute', target: ordinary });
    const ordinaryModel = buildSuccessionStory(storyWindow(initial, [first]));
    const ordinaryRow = row(ordinaryModel, 'execution');
    expect(get(ordinaryRow.actor)).toBe(coordinator);
    expect(get(ordinaryRow.remaining).map((seat) => seat.seat)).toEqual(
      initial.seats.flatMap((seat) => (seat.number === ordinary ? [] : [seat.number])),
    );
    expect(after(ordinaryRow, ordinary).role.status).toBe('unavailable');
    expect(ordinaryModel.chapters.act1.status).toBe('unavailable');

    const beforeSecond = first.state;
    executive(beforeSecond);

    if (beforeSecond.stage.act !== 1) throw new Error('Expected Act I');

    const second = choose(beforeSecond, random, beforeSecond.stage.board.coordinator, {
      type: 'execute',
      target: overlord,
    });

    const model = buildSuccessionStory(storyWindow(beforeSecond, [second]));
    const execution = row(model, 'execution');
    expect(get(execution.remaining)).toHaveLength(8);
    expect(after(execution, overlord).role.status).toBe('unavailable');
    expect(row(model, 'act-ended').fact).toMatchObject({
      team: 'cooperative',
      reason: 'the Overlord was executed',
    });
    expect(model.chapters.outcome.status).toBe('unavailable');
    const returned = row(model, 'act-started');
    expect(returned.affected).toHaveLength(10);
    expect(
      get(model.chapters.returns)
        .filter((seat) => seat.returnedAfterExecution)
        .map((seat) => seat.seat)
        .sort(),
    ).toEqual([ordinary, overlord].sort());

    for (const seat of returned.affected) {
      expect(get(seat.after.alive)).toBe(true);
      expect(get(seat.after.influence)).toBe(2);
      expect(get(seat.after.coins)).toBe(initial.seats[seat.seat].role === 'cooperative' ? 3 : 2);
      expect(seat.after.hand.status).toBe('unavailable');
    }

    expect(get(execution.remaining)).toHaveLength(8);
    expect(get(ordinaryRow.remaining)).toHaveLength(9);
  });

  it.each(['safeguard', 'override', 'overlord-election'] as const)(
    'uses the actual %s Act I result and winner-faction allocation',
    async (ending) => {
      const { created, random } = await storyGame(3);
      const initial = created.state;

      if (initial.stage.act !== 1) throw new Error('Expected Act I');
      const board = initial.stage.board;
      const overlord = initial.seats.find((seat) => seat.role === 'overlord')!.number;
      board.executor = overlord;
      let evolution;

      if (ending === 'overlord-election') {
        board.phase.kind = 'voting';
        board.overrides = 3;

        for (const seat of initial.seats)
          if (seat.number !== board.coordinator) board.votes[seat.number] = true;
        evolution = choose(initial, random, board.coordinator, { type: 'vote', approve: true });
      } else {
        board.phase.kind = 'executor-policy';
        board.safeguards = ending === 'safeguard' ? 4 : 0;
        board.overrides = ending === 'override' ? 5 : 0;
        const index = board.deck.findIndex((card) => card.policy === ending);
        board.hand = [board.deck.splice(index, 1)[0], board.deck.shift()!];
        evolution = choose(initial, random, overlord, { type: 'enact', cardId: board.hand[0].id });
      }

      const model = buildSuccessionStory(storyWindow(initial, [evolution]));
      const team = ending === 'safeguard' ? 'cooperative' : 'rogue';
      expect(get(model.chapters.act1).team).toBe(team);
      const bonuses = get(model.chapters.returns);
      expect(bonuses).toHaveLength(10);
      expect(bonuses.filter((seat) => seat.coins === 3)).toHaveLength(team === 'cooperative' ? 6 : 4);
      expect(bonuses.every((seat) => seat.influence === 2)).toBe(true);
      expect(model.chapters.outcome.status).toBe('unavailable');
    },
  );

  it('connects declaration, exact dialogue, published challenge, disproof, loss and cancelled resolution', async () => {
    const { state, random } = await storyAct2(5);
    const actor = board2(state).activeSeat;

    // Choose a claim absent from the real dealt hand, without altering the deck.
    const missing = (['treasurer', 'thief', 'assassin', 'envoy'] satisfies Capability[]).find(
      (capability) => !board2(state).resources[actor].hand.some((card) => card.capability === capability),
    )!;

    const target = (actor + 1) % 10;

    const action = {
      treasurer: { type: 'tax' as const },
      thief: { type: 'steal' as const, target },
      assassin: { type: 'assassinate' as const, target },
      envoy: { type: 'exchange' as const },
    }[missing];

    if (action.type === 'assassinate') board2(state).resources[actor].coins = 3;
    const declaration = choose(state, random, actor, action);
    const text = 'I claim Treasurer.\n  “Challenge me?” — 🗝️';
    const speech = choose(declaration.state, random, target, { type: 'chat', text });
    const resolved = collect(speech.state, random, target);

    const loss = choose(resolved.state, random, actor, {
      type: 'lose-influence',
      cardId: board2(resolved.state).resources[actor].hand[0].id,
    });

    const model = buildSuccessionStory(
      storyWindow(state, [declaration, speech, ...resolved.evolutions, loss]),
    );

    expect(model.rows.every((entry) => entry.fact.kind !== 'unavailable')).toBe(true);
    expect(row(model, 'speech').text).toBe(text);
    expect(row(model, 'challenge-resolved').fact).toMatchObject({
      outcome: 'disproved',
      claimant: actor,
      challenger: target,
    });
    expect(get(row(model, 'challenge-resolved').actor)).toBe(target);
    expect(get(row(model, 'influence-lost').lossReason)).toBe('failed-claim');
    expect(get(row(model, 'turn-ended').resolution)).toBe('cancelled');
    const key = get(get(row(model, 'turn-ended').action).declaration);
    expect(key).toEqual(row(model, 'declaration').source);
    expect(get(after(row(model, 'declaration'), actor).influence)).toBe(2);
    expect(get(after(row(model, 'influence-lost'), actor).influence)).toBe(1);
  });

  it('links the canonical final Tax pass to its completed action while the board advances, and expires that tail', async () => {
    const { state, random } = await storyAct2(5);
    const actor = board2(state).activeSeat;
    const declared = choose(state, random, actor, { type: 'tax' });
    const responses = collect(declared.state, random);
    const full = storyWindow(state, [declared, ...responses.evolutions], 'archive');
    const model = buildSuccessionStory(full);
    const ended = row(model, 'turn-ended');
    const finalPass = model.rows.findLast((entry) => entry.fact.kind === 'reaction')!;
    expect(finalPass.source.cursor).toBeGreaterThan(ended.source.cursor);
    expect(get(finalPass.actor)).toBe(9);
    expect(get(finalPass.turnOwner)).toBe(actor);
    expect(finalPass.action).toEqual(ended.action);
    expect(get(finalPass.resolution)).toBe('applied');

    const nextPhase = model.rows.find(
      (entry) => entry.fact.kind === 'phase' && entry.source.cursor > ended.source.cursor,
    )!;

    expect(get(nextPhase.turnOwner)).toBe(board2(responses.state).activeSeat);
    expect(nextPhase.action.status).toBe('unavailable');

    const gap = buildSuccessionStory({
      ...full,
      events: full.events.filter((event) => event.id !== nextPhase.source.cursor),
    });

    expect(gap.rows.findLast((entry) => entry.fact.kind === 'reaction')!.action.status).toBe('unavailable');

    const advanced = evolveSuccession(
      responses.state,
      { type: 'advance', now: responses.state.phase.deadline! },
      random,
    );

    const next = choose(advanced.state, random, board2(advanced.state).activeSeat, { type: 'exchange' });
    const nextResponses = collect(next.state, random);

    const twoTurns = buildSuccessionStory(
      storyWindow(
        state,
        [declared, ...responses.evolutions, advanced, next, ...nextResponses.evolutions],
        'archive',
      ),
    );

    const nextDeclaration = twoTurns.rows.findLast((entry) => entry.fact.kind === 'declaration')!;

    for (const reaction of twoTurns.rows.filter(
      (entry) => entry.fact.kind === 'reaction' && entry.source.cursor > nextDeclaration.source.cursor,
    )) {
      expect(get(get(reaction.action).declaration)).toEqual(nextDeclaration.source);
      expect(get(reaction.turnOwner)).toBe(board2(advanced.state).activeSeat);
    }
  });

  it('preserves the final Tax reaction through the canonical 120-turn cap after 119 legal Exchange turns', async () => {
    const game = await storyAct2(5);
    const { random } = game;
    let state = game.state;

    for (let turn = 0; turn < 119; turn++) {
      const actor = board2(state).activeSeat;
      const declared = choose(state, random, actor, { type: 'exchange' });
      const responses = collect(declared.state, random);
      const board = board2(responses.state);

      const returned = choose(responses.state, random, actor, {
        type: 'return-influence',
        cardIds: [board.resources[actor].hand[0].id, board.pending!.exchange![0].id],
      });

      expect(returned.state.status).toBe('active');
      state = evolveSuccession(
        returned.state,
        { type: 'advance', now: returned.state.phase.deadline! },
        random,
      ).state;
    }

    expect(board2(state)).toMatchObject({ round: 12, slot: 9 });
    expect(board2(state).resources.every((seat) => seat.hand.length === 2)).toBe(true);
    const actor = board2(state).activeSeat;
    const declared = choose(state, random, actor, { type: 'tax' });
    const responses = collect(declared.state, random);
    expect(responses.state.status).toBe('finished');
    const window = storyWindow(state, [declared, ...responses.evolutions], 'archive');
    const model = buildSuccessionStory(window);
    const ended = row(model, 'turn-ended');

    const terminal = model.rows.find(
      (entry) => entry.fact.kind === 'phase' && entry.fact.phase === 'finished',
    )!;

    const reaction = model.rows.findLast((entry) => entry.fact.kind === 'reaction')!;
    expect(model.rows.slice(-5).map((entry) => entry.fact.kind)).toEqual([
      'turn-ended',
      'phase',
      'finished',
      'reaction',
      'audit',
    ]);
    expect(get(ended.action).action).toBe('tax');
    expect(get(ended.resolution)).toBe('applied');
    expect(reaction.action).toEqual(ended.action);
    expect(reaction.resolution).toEqual(ended.resolution);
    expect(get(reaction.turnOwner)).toBe(actor);
    expect(terminal.action.status).toBe('unavailable');
    expect(row(model, 'finished').action.status).toBe('unavailable');

    const gap = buildSuccessionStory({
      ...window,
      events: window.events.filter((event) => event.id !== terminal.source.cursor),
    });

    expect(gap.rows.findLast((entry) => entry.fact.kind === 'reaction')!.action.status).toBe('unavailable');
  });

  it('links canonical post-resolution Exchange hand updates without retaining the completed action on next-turn rows', async () => {
    const { state, random } = await storyAct2(6);
    const actor = board2(state).activeSeat;
    const declared = choose(state, random, actor, { type: 'exchange' });
    const responses = collect(declared.state, random);

    const returned = choose(responses.state, random, actor, {
      type: 'return-influence',
      cardIds: [
        board2(responses.state).resources[actor].hand[0].id,
        board2(responses.state).pending!.exchange![0].id,
      ],
    });

    const full = storyWindow(state, [declared, ...responses.evolutions, returned], actor);
    const model = buildSuccessionStory(full);
    const ended = row(model, 'turn-ended');

    const updated = model.rows.findLast(
      (entry) => entry.fact.kind === 'private-cards' && entry.fact.operation === 'hand-updated',
    )!;

    expect(updated.source.cursor).toBeGreaterThan(ended.source.cursor);
    expect(updated.action).toEqual(ended.action);
    expect(get(updated.turnOwner)).toBe(actor);
    expect(get(updated.resolution)).toBe('applied');
    expect(get(after(updated, actor).hand).cards).toEqual(
      board2(returned.state).resources[actor].hand.map(({ id, capability }) => ({ id, capability })),
    );

    const nextPhase = model.rows.find(
      (entry) => entry.fact.kind === 'phase' && entry.source.cursor > ended.source.cursor,
    )!;

    expect(get(nextPhase.turnOwner)).toBe(board2(returned.state).activeSeat);
    expect(nextPhase.action.status).toBe('unavailable');

    const gap = buildSuccessionStory({
      ...full,
      events: full.events.filter((event) => event.id !== nextPhase.source.cursor),
    });

    expect(gap.rows.findLast((entry) => entry.fact.kind === 'private-cards')!.action.status).toBe(
      'unavailable',
    );
  });

  it.each(['nomination', 'investigation', 'special-election', 'veto-accepted', 'veto-rejected'] as const)(
    'uses canonical %s payloads, with private evidence separate from public claims',
    async (scenario) => {
      const { created, random } = await storyGame(21);
      const initial = created.state;

      if (initial.stage.act !== 1) throw new Error('Expected Act I');
      const board = initial.stage.board;
      const actor = board.coordinator;
      const target = (actor + 1) % 10;
      board.executor = target;
      let evolution;

      if (scenario === 'nomination') {
        board.phase.kind = 'nomination';
        evolution = choose(initial, random, actor, { type: 'nominate', target });
      } else if (scenario === 'investigation' || scenario === 'special-election') {
        board.phase.kind = 'executive-action';
        board.power = scenario === 'investigation' ? 'investigate' : 'special-election';
        evolution = choose(initial, random, actor, { type: board.power, target });
      } else {
        board.phase.kind = 'executor-policy';
        board.overrides = 5;
        board.hand = board.deck.splice(0, 2);
        const request = choose(initial, random, target, { type: 'request-veto' });

        const response = choose(request.state, random, actor, {
          type: 'veto',
          approve: scenario === 'veto-accepted',
        });

        const model = buildSuccessionStory(storyWindow(initial, [request, response]));
        expect(get(row(model, 'veto-request').actor)).toBe(target);
        expect(get(row(model, 'veto-response').actor)).toBe(actor);
        expect(row(model, 'veto-response').fact).toMatchObject({ approved: scenario === 'veto-accepted' });
        expect(model.rows.some((entry) => entry.fact.kind === 'tracker')).toBe(scenario === 'veto-accepted');

        return;
      }

      const publicModel = buildSuccessionStory(storyWindow(initial, [evolution]));
      expect(get(row(publicModel, scenario).actor)).toBe(actor);
      expect(get(row(publicModel, scenario).target)).toBe(target);
      expect(publicModel.rows.some((entry) => entry.fact.kind === 'investigation-result')).toBe(false);

      if (scenario === 'investigation') {
        const privateModel = buildSuccessionStory(storyWindow(initial, [evolution], actor));
        const investigated = row(privateModel, 'investigation-result');
        expect(investigated.visibility).toBe('private');
        expect(investigated.fact).toMatchObject({
          team: initial.seats[target].role === 'cooperative' ? 'cooperative' : 'rogue',
        });
      }
    },
  );

  it('proves a dealt capability, invalidates the replaced hand, and attributes the loss choice to the challenger', async () => {
    const { state, random } = await storyAct2(7);
    const actor = board2(state).activeSeat;
    const claimantCard = board2(state).resources[actor].hand.find((card) => card.capability !== 'guard');
    expect(claimantCard).toBeDefined();
    const target = (actor + 1) % 10;
    const challenger = (actor + 2) % 10;
    const capability = claimantCard!.capability;

    if (capability === 'guard') throw new Error('Guard cannot declare');
    board2(state).resources[actor].coins = 3;

    const action = {
      treasurer: { type: 'tax' as const },
      thief: { type: 'steal' as const, target },
      assassin: { type: 'assassinate' as const, target },
      envoy: { type: 'exchange' as const },
    }[capability];

    const declaration = choose(state, random, actor, action);
    const responses = collect(declaration.state, random, challenger);

    const loss = choose(responses.state, random, challenger, {
      type: 'lose-influence',
      cardId: board2(responses.state).resources[challenger].hand[0].id,
    });

    const model = buildSuccessionStory(
      storyWindow(state, [declaration, ...responses.evolutions, loss], 'archive'),
    );

    const proof = row(model, 'proof');
    expect(after(proof, actor).hand).toEqual({ status: 'unavailable', reason: 'cards-changed' });
    expect(get(after(proof, actor).influence)).toBe(2);
    const phase = model.rows.find((entry) => entry.fact.kind === 'phase' && entry.fact.phase === 'loss')!;
    expect(get(phase.actor)).toBe(challenger);
    expect(get(phase.turnOwner)).toBe(actor);
    expect(get(row(model, 'influence-lost').lossReason)).toBe('failed-challenge');

    const updated = model.rows.find(
      (entry) =>
        entry.fact.kind === 'private-cards' &&
        entry.fact.operation === 'hand-updated' &&
        get(entry.actor) === actor,
    )!;

    expect(get(after(updated, actor).hand).cards).toEqual(
      board2(responses.state).resources[actor].hand.map(({ id, capability }) => ({ id, capability })),
    );
  });

  it('labels private Exchange draw records only when delivered and does not substitute the final hand', async () => {
    const { state, random } = await storyAct2(6);
    const actor = board2(state).activeSeat;
    const declaration = choose(state, random, actor, { type: 'exchange' });
    const responses = collect(declaration.state, random);
    const pool = board2(responses.state).pending!.exchange!;
    const hand = board2(responses.state).resources[actor].hand;

    const returned = choose(responses.state, random, actor, {
      type: 'return-influence',
      cardIds: [hand[0].id, pool[0].id],
    });

    const evolutions = [declaration, ...responses.evolutions, returned];
    const publicModel = buildSuccessionStory(storyWindow(state, evolutions));
    expect(publicModel.rows.some((entry) => entry.fact.kind === 'private-cards')).toBe(false);
    expect(publicModel.end.every((seat) => seat.hand.status === 'unavailable')).toBe(true);

    for (const reader of [actor, 'archive'] as const) {
      const model = buildSuccessionStory(storyWindow(state, evolutions, reader));

      const draw = model.rows.find(
        (entry) => entry.fact.kind === 'private-cards' && entry.fact.operation === 'exchange-draw',
      )!;

      expect(draw.visibility).toBe(reader === 'archive' ? 'archive' : 'private');
      expect(get(after(draw, actor).exchangeDraw).cards).toEqual(
        pool.map(({ id, capability }) => ({ id, capability })),
      );
      expect(get(after(draw, actor).hand).cards).toEqual(
        hand.map(({ id, capability }) => ({ id, capability })),
      );
      expect(get(model.end[actor].hand).cards).toEqual(
        board2(returned.state).resources[actor].hand.map(({ id, capability }) => ({ id, capability })),
      );
      expect(get(model.end[actor].hand).cards).not.toEqual(get(after(draw, actor).hand).cards);
    }

    const baseline = replayFrameSuccession(responses.state, 30, 'epoch-archive');

    const atDraw = buildSuccessionStory({
      scope: { matchId: state.id, visibilityEpoch: 'epoch-archive' },
      baseline,
      after: 30,
      through: 30,
      events: [],
    });

    expect(get(atDraw.end[actor].exchangeDraw).cards).toEqual(
      pool.map(({ id, capability }) => ({ id, capability })),
    );
  });

  it('does not confuse the target with a challenger when a clipped window begins at a proof checkpoint', async () => {
    const { state, random } = await storyAct2(5);
    const actor = board2(state).activeSeat;
    const target = (actor + 1) % 10;
    const challenger = (actor + 2) % 10;
    expect(board2(state).resources[actor].hand.some((card) => card.capability === 'assassin')).toBe(true);
    board2(state).resources[actor].coins = 3;
    const declared = choose(state, random, actor, { type: 'assassinate', target });
    const resolved = collect(declared.state, random, challenger);
    const full = storyWindow(state, [declared, ...resolved.evolutions], 'archive');
    const proof = full.events.find((event) => event.type === 'proof')!;

    const checkpoint = resolved.evolutions
      .flatMap((evolution) => evolution.replayFrames)
      .find((frame) => frame.eventKey === proof.eventKey)!;

    const clipped = buildSuccessionStory({
      ...full,
      after: proof.id,
      baseline: replayFrameSuccession(checkpoint.state, proof.id, full.scope.visibilityEpoch),
      events: full.events.filter((event) => event.id > proof.id),
    });

    const lossChoice = clipped.rows.find(
      (entry) => entry.fact.kind === 'phase' && entry.fact.phase === 'loss',
    )!;

    expect(lossChoice.actor.status).toBe('unavailable');
    expect(get(lossChoice.turnOwner)).toBe(actor);
    // The complete source window does identify the actual challenger, not the action target.
    const complete = buildSuccessionStory(full);

    const knownChoice = complete.rows.find(
      (entry) => entry.fact.kind === 'phase' && entry.fact.phase === 'loss',
    )!;

    expect(get(knownChoice.actor)).toBe(challenger);
    expect(get(knownChoice.actor)).not.toBe(target);
  });

  it('keeps payments spent through a failed block and the separate two-loss Assassination sequence', async () => {
    const { state, random } = await storyAct2(4);
    const actor = board2(state).activeSeat;

    const target = board2(state).resources.findIndex(
      (resource, seat) => seat !== actor && resource.hand.every((card) => card.capability !== 'guard'),
    );

    const challenger = (target + 1) % 10;
    board2(state).resources[actor].coins = 3;
    const declaration = choose(state, random, actor, { type: 'assassinate', target });
    const responses = collect(declaration.state, random);
    const block = choose(responses.state, random, target, { type: 'block', capability: 'guard' });
    const challenged = collect(block.state, random, challenger);

    const firstLoss = choose(challenged.state, random, target, {
      type: 'lose-influence',
      cardId: board2(challenged.state).resources[target].hand[0].id,
    });

    const secondLoss = choose(firstLoss.state, random, target, {
      type: 'lose-influence',
      cardId: board2(firstLoss.state).resources[target].hand[0].id,
    });

    const model = buildSuccessionStory(
      storyWindow(state, [
        declaration,
        ...responses.evolutions,
        block,
        ...challenged.evolutions,
        firstLoss,
        secondLoss,
      ]),
    );

    const losses = model.rows.filter((entry) => entry.fact.kind === 'influence-lost');
    expect(losses.map((entry) => get(entry.lossReason))).toEqual(['failed-claim', 'action-effect']);
    expect(losses.map((entry) => get(entry.remaining).length)).toEqual([10, 9]);
    expect(get(model.end[actor].coins)).toBe(0);
    expect(get(model.end[target].influence)).toBe(0);
    expect(get(row(model, 'turn-ended').resolution)).toBe('applied');
  });

  it('reports unchallenged blocking separately from proof and resolves all six action families', async () => {
    const actions = ['income', 'tax', 'steal', 'assassinate', 'exchange', 'coup'] as const;

    for (const type of actions) {
      const { state, random } = await storyAct2(9);
      const actor = board2(state).activeSeat;
      const target = (actor + 1) % 10;
      board2(state).resources[actor].coins = 7;
      board2(state).resources[target].coins = 1;

      const declaration = choose(
        state,
        random,
        actor,
        type === 'steal' || type === 'assassinate' || type === 'coup' ? { type, target } : { type },
      );

      const evolutions = [declaration];
      let next = declaration.state;

      if (board2(next).phase === 'challenge') {
        const responses = collect(next, random);
        evolutions.push(...responses.evolutions);
        next = responses.state;
      }

      if (board2(next).phase === 'block') {
        const block = choose(
          next,
          random,
          target,
          type === 'steal' ? { type: 'pass' } : { type: 'block', capability: 'guard' },
        );

        evolutions.push(block);
        next = block.state;

        if (board2(next).phase === 'challenge') {
          const responses = collect(next, random);
          evolutions.push(...responses.evolutions);
          next = responses.state;
        }
      }

      if (board2(next).phase === 'loss' || board2(next).phase === 'exchange') {
        const seat = inspectSuccession(next).pendingSeats[0];
        const choice = observeSuccession(next, seat).decision!.actions[0].action;
        const resolved = choose(next, random, seat, choice);
        evolutions.push(resolved);
        next = resolved.state;
      }

      const model = buildSuccessionStory(storyWindow(state, evolutions));
      expect(row(model, 'declaration').fact).toMatchObject({ action: { type } });
      expect(get(row(model, 'turn-ended').resolution)).toBe(type === 'assassinate' ? 'blocked' : 'applied');
      expect(model.rows.some((entry) => entry.fact.kind === 'proof')).toBe(false);
      expect(get(model.end[actor].coins)).toBe(board2(next).resources[actor].coins);

      if (type === 'steal') {
        expect(get(model.end[actor].coins)).toBe(8);
        expect(get(model.end[target].coins)).toBe(0);
      }
    }
  });

  it('represents a real takeover as original-entrant forfeit, even when its house-controlled seat wins the cap', async () => {
    const { state, random } = await storyAct2(8);
    const actor = board2(state).activeSeat;
    board2(state).round = 12;
    board2(state).slot = 9;
    board2(state).firstSeat = (actor + 1) % 10;
    board2(state).resources[actor].coins = 8;

    const takeover = evolveSuccession(
      state,
      { type: 'advance', now: state.phase.deadline! + state.snapshot.timing.grace },
      random,
    );

    const finished = choose(takeover.state, random, actor, { type: 'income' });
    const model = buildSuccessionStory(storyWindow(state, [takeover, finished]));
    const winner = get(model.chapters.outcome);
    expect(winner.result.winnerSeat).toBe(actor);
    expect(winner.result.tieBreak?.decisive).toBe('coins');
    expect(get(winner.winner.entrant).agentId).toBe(state.seats[actor].entrant.agentId);
    expect(get(winner.winner.controller)).toMatchObject({ house: true, forfeited: true });
    expect(get(winner.credit)).toBe('forfeit-loss');
    expect(model.end).toHaveLength(10);
    expect(get(after(row(model, 'takeover'), actor).entrant).agentId).toBe(
      state.seats[actor].entrant.agentId,
    );
  });

  it('does not refund a disproved paid claim and keeps mid-loss checkpoint context honestly incomplete', async () => {
    let { state, random } = await storyAct2(5);

    // Advance real turns until the dealt actor lacks Assassin; do not edit secret cards.
    while (
      board2(state).resources[board2(state).activeSeat].hand.some((card) => card.capability === 'assassin')
    ) {
      state = choose(state, random, board2(state).activeSeat, { type: 'income' }).state;
      state = evolveSuccession(state, { type: 'advance', now: state.phase.deadline! }, random).state;
    }

    const board = board2(state);
    const actor = board.activeSeat;
    expect(board.resources[actor].hand.some((card) => card.capability === 'assassin')).toBe(false);
    board.resources[actor].coins = 3;
    const target = (actor + 1) % 10;
    const declared = choose(state, random, actor, { type: 'assassinate', target });
    const challenged = collect(declared.state, random, target);

    const loss = choose(challenged.state, random, actor, {
      type: 'lose-influence',
      cardId: board2(challenged.state).resources[actor].hand[0].id,
    });

    const model = buildSuccessionStory(storyWindow(state, [declared, ...challenged.evolutions, loss]));
    expect(row(model, 'challenge-resolved').fact).toMatchObject({ outcome: 'disproved' });
    expect(get(model.end[actor].coins)).toBe(0);
    expect(get(row(model, 'turn-ended').resolution)).toBe('cancelled');
    const tail = buildSuccessionStory(storyWindow(challenged.state, [loss], 'archive', 75));
    const tailLoss = row(tail, 'influence-lost');
    expect(get(tailLoss.actor)).toBe(actor);
    expect(get(after(tailLoss, actor).coins)).toBe(0);
    expect(tailLoss.lossReason.status).toBe('unavailable');
    expect(get(tailLoss.action).declaration.status).toBe('unavailable');
  });

  it('uses actual influence and priority cap evidence, and an interruption has no invented champion', async () => {
    for (const criterion of ['influence', 'priority'] as const) {
      const { state, random } = await storyAct2(12);
      const board = board2(state);
      const actor = board.activeSeat;
      board.round = 12;
      board.slot = 9;
      board.firstSeat = (actor + 1) % 10;

      for (const [seat, resource] of board.resources.entries()) {
        resource.coins = seat === actor ? 2 : 3;

        if (criterion === 'influence' && seat !== actor) resource.revealed.push(resource.hand.pop()!);
      }

      const finished = choose(state, random, actor, { type: 'income' });
      const model = buildSuccessionStory(storyWindow(state, [finished]));
      expect(get(model.chapters.outcome).result.tieBreak).toEqual(finished.state.result!.tieBreak);
      expect(get(model.chapters.outcome).result.tieBreak?.decisive).toBe(criterion);
    }

    const { state, random } = await storyAct2();

    const stopped = evolveSuccession(
      state,
      { type: 'interrupt', now: 7000, reason: 'Recorded platform interruption' },
      random,
    );

    const model = buildSuccessionStory(storyWindow(state, [stopped]));
    expect(get(model.chapters.interruption)).toBe('Recorded platform interruption');
    expect(model.chapters.outcome.status).toBe('unavailable');
  });

  it('keeps late losses and current summaries out of earlier rows, rejects end-frame baselines, and marks gaps honestly', async () => {
    const { state, random } = await storyAct2(10);
    const actor = board2(state).activeSeat;
    const target = (actor + 1) % 10;
    board2(state).resources[actor].coins = 7;
    const declared = choose(state, random, actor, { type: 'coup', target });

    const lost = choose(declared.state, random, target, {
      type: 'lose-influence',
      cardId: board2(declared.state).resources[target].hand[0].id,
    });

    const window = storyWindow(state, [declared, lost], 'archive', 100);
    const model = buildSuccessionStory(window);
    const original = structuredClone(row(model, 'declaration'));
    expect(get(after(original, target).influence)).toBe(2);
    expect(get(after(row(model, 'influence-lost'), target).influence)).toBe(1);
    expect(original.position.at).toBe(window.events[0].at);
    expect(original.position.order).toBe(101);
    expect(() =>
      buildSuccessionStory({
        ...window,
        baseline: replayFrameSuccession(lost.state, window.through, window.scope.visibilityEpoch),
      }),
    ).toThrow('exclusive window start');

    const current = observeSuccession(lost.state, null, {
      visibilityEpoch: window.scope.visibilityEpoch,
      streamHead: window.through,
    });

    const withCurrent = buildSuccessionStory({ ...window, current });
    expect(row(withCurrent, 'declaration')).toEqual(original);
    current.seats[target].influence = 0;
    window.events[0].text = 'Caller mutated';
    expect(row(withCurrent, 'declaration')).toEqual(original);
    const partial = buildSuccessionStory({ ...window, baseline: undefined, current });
    expect(after(row(partial, 'declaration'), actor).coins.status).toBe('unavailable');
    expect(row(partial, 'influence-lost').remaining.status).toBe('unavailable');
    expect(get(after(row(partial, 'influence-lost'), target).influence)).toBe(1);

    const gapped = buildSuccessionStory({
      ...window,
      events: window.events.filter((event) => event.type !== 'declaration'),
    });

    expect(gapped.issues.some((issue) => issue.kind === 'history-gap')).toBe(true);
    expect(row(gapped, 'influence-lost').action.status).toBe('unavailable');
    expect(row(gapped, 'influence-lost').remaining.status).toBe('unavailable');

    const legacy = buildSuccessionStory({
      ...window,
      events: [{ ...window.events[0], data: undefined }],
      through: 101,
    });

    expect(legacy.rows[0].fact).toMatchObject({ kind: 'unavailable', reason: 'incomplete-payload' });
    expect(legacy.rows[0].text).toBe('Caller mutated');
  });

  it('keeps opaque source keys stable across authorized epoch renumbering and refuses mixed scopes', async () => {
    const { state, random } = await storyAct2();
    const actor = board2(state).activeSeat;
    const declaration = choose(state, random, actor, { type: 'income' });
    const publicWindow = storyWindow(state, [declaration], 'public', 31);
    const archiveWindow = storyWindow(state, [declaration], 'archive', 100);
    const publicRow = row(buildSuccessionStory(publicWindow), 'declaration');
    const archiveRow = row(buildSuccessionStory(archiveWindow), 'declaration');
    expect(publicRow.key).toBe(archiveRow.key);
    expect(publicRow.source.cursor).not.toBe(archiveRow.source.cursor);
    expect(publicRow.source.visibilityEpoch).not.toBe(archiveRow.source.visibilityEpoch);
    expect(() => buildSuccessionStory({ ...archiveWindow, baseline: publicWindow.baseline })).toThrow(
      'scope',
    );
    expect(() =>
      buildSuccessionStory({ ...publicWindow, events: [...publicWindow.events, ...publicWindow.events] }),
    ).toThrow('unique and ordered');
    expect(() =>
      buildSuccessionStory({
        ...publicWindow,
        events: Array.from({ length: 257 }, () => publicWindow.events[0]),
      }),
    ).toThrow('256');
  });

  it.each([11, 29])(
    'matches actual event checkpoints through a complete two-act trajectory (seed %s)',
    async (seed) => {
      const { created, random } = await storyGame(seed);
      const choices = storyRandom(seed + 40);
      let state = created.state;
      let mutations = 0;
      let cursor = 0;
      const kinds = new Set<string>();

      while (state.status === 'active' && mutations < 3000) {
        const pending = inspectSuccession(state).pendingSeats;
        const seat = pending[choices.random(Math.max(1, pending.length))];

        const action = pending.length
          ? previewSuccessionAction(observeSuccession(state, seat), choices.random)
          : null;

        const command = action
          ? actionCommand(state, seat, action)
          : { type: 'advance' as const, now: state.phase.deadline! };

        const evolution = evolveSuccession(state, command, random);
        const window = storyWindow(state, [evolution], 'archive', cursor);
        const model = buildSuccessionStory(window);
        expect(model.issues).toEqual([]);

        for (const entry of model.rows) {
          kinds.add(entry.fact.kind);
          const checkpoint = evolution.replayFrames.find((frame) => frame.eventKey === entry.source.eventKey);

          if (!checkpoint || entry.fact.kind === 'audit') continue;

          for (const change of entry.affected) {
            const sourceSeat = checkpoint.state.seats[change.seat];
            expect(get(change.after.alive)).toBe(sourceSeat.alive);

            if (checkpoint.state.stage.act === 2) {
              const resource = checkpoint.state.stage.board.resources[change.seat];

              // Coin transfer is published as two facts; the first is not an update to the other seat.
              if (entry.fact.kind !== 'coins' || get(entry.actor) === change.seat)
                expect(get(change.after.coins)).toBe(resource.coins);
              expect(get(change.after.influence)).toBe(resource.hand.length);
            }
          }
        }

        state = evolution.state;
        cursor = window.through;
        mutations++;
      }

      expect(state.status).toBe('finished');
      expect(kinds.has('act-started')).toBe(true);
      expect(kinds.has('finished')).toBe(true);
      expect(kinds.has('unavailable')).toBe(false);
      const terminal = buildSuccessionStory(storyWindow(state, [], 'archive', cursor));
      expect(get(terminal.chapters.outcome).result).toEqual(state.result);
    },
    60000,
  );
});

describe('retained source capture: supplemental evidence only', () => {
  it('retains exact dialogue and all nine event-time elimination rosters through bounded independent loss windows', () => {
    const events = Schema.decodeUnknownSync(Schema.Array(AuthorizedEvent2Schema))(capture.events);
    const current = Schema.decodeUnknownSync(Observation2Schema)(capture.current);
    const quotes = events.filter((event) => event.type === 'chat');
    expect(quotes).toHaveLength(416);

    for (const event of quotes) {
      const model = buildSuccessionStory({
        scope: { matchId: current.matchId, visibilityEpoch: current.history.visibilityEpoch },
        after: event.id - 1,
        through: event.id,
        events: [event],
      });

      expect(row(model, 'speech').text).toBe(event.text);
      expect(
        storyText(event.text)
          .map((part) => part.text)
          .join(''),
      ).toBe(event.text);
    }

    // Independent test-only baseline: public loss counts since the recorded all-ten return.
    // No final alive/influence/hand is used as historical state, and no prototype adapter is imported.
    const remaining = new Set(Array.from({ length: 10 }, (_, seat) => seat));
    const counts = Array.from({ length: 10 }, () => 2);
    const losses: StoryRow[] = [];
    const lostCards: Capability[][] = Array.from({ length: 10 }, () => []);

    for (const event of events) {
      if (event.type !== 'influence-lost') continue;
      const source = { ...current.history, streamHead: event.id - 1 };
      const baseline: Observation2 = structuredClone(current);
      baseline.history = source;
      baseline.result = null;
      baseline.status = 'active';
      baseline.finishedAt = null;
      baseline.phase = { ...baseline.phase, kind: 'act-2:loss' };
      baseline.private = null;
      baseline.commitment.reveal = null;
      baseline.seats = baseline.seats.map((seat) => ({
        ...seat,
        alive: remaining.has(seat.number),
        influence: counts[seat.number],
        revealed: [...lostCards[seat.number]],
        coins: undefined,
      }));

      const model = buildSuccessionStory({
        scope: { matchId: current.matchId, visibilityEpoch: source.visibilityEpoch },
        baseline,
        after: event.id - 1,
        through: event.id,
        events: [event],
      });

      const loss = row(model, 'influence-lost');

      if (loss.fact.kind !== 'influence-lost' || event.seat === undefined)
        throw new Error('Expected canonical loss');
      counts[event.seat]--;
      lostCards[event.seat].push(loss.fact.capability);

      if (counts[event.seat] === 0) remaining.delete(event.seat);
      expect(get(loss.remaining).map((seat) => seat.seat)).toEqual([...remaining]);

      if (loss.fact.eliminated) losses.push(loss);
    }

    expect(losses).toHaveLength(9);
    expect(losses.map((loss) => get(loss.remaining).length)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const quillSeat = current.seats.find((seat) => seat.name === 'Quill')!.number;
    const quill = losses.find((loss) => get(loss.actor) === quillSeat)!;
    expect(get(quill.remaining).map((seat) => get(seat.entrant).name)).toEqual([
      'Velvet',
      'Patch',
      'Spark',
      'Katniss Everdeen',
    ]);
    expect(get(losses[8].remaining).map((seat) => get(seat.entrant).name)).toEqual(['Patch']);
    expect(get(losses[0].remaining)).toHaveLength(9);
  });

  it('provides all 36 explicit rule terms and lossless inflection annotations', () => {
    expect(Object.keys(storyRules)).toHaveLength(36);
    const text = 'Executors choose policies; the Coordinator executes.  Influence\nCOINS; special election.';
    const segments = storyText(text);
    expect(segments.map((part) => part.text).join('')).toBe(text);
    expect(segments.flatMap((part) => (part.rule ? [part.rule] : []))).toEqual([
      'executor',
      'policy',
      'coordinator',
      'execution',
      'influence',
      'coins',
      'special-election',
    ]);
    expect(
      Object.values(storyRules).every(([label, explanation]) => label.length && explanation.length > 20),
    ).toBe(true);
  });
});
