import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DossierRow } from '../src/client/dossier-row';
import { DossierSeatCards } from '../src/client/dossier-cards';
import { DossierPictureProvider, dossierValue } from '../src/client/dossier-identity';
import { RuleHelpProvider } from '../src/client/ui/rule-help';
import { buildSuccessionStory } from '../src/client/succession-story';
import type { StoryModel, StoryRow } from '../src/client/succession-story';
import { dossierFactText } from '../src/client/dossier-facts';
import { readStoryFact } from '../src/client/succession-story-events';
import { capturedEvents, capturedStory, dossierRecordedExamples } from './fixtures/dossier-recorded';
import { dossierEngineExamples, dossierProof } from './fixtures/dossier-engine';

function renderRow(row: StoryRow, model: StoryModel, archive: boolean) {
  const entrants = new Map(model.end.map((seat) => [seat.seat, seat.entrant]));

  return renderToStaticMarkup(
    createElement(DossierPictureProvider, {
      pictures: new Map(),
      children: createElement(RuleHelpProvider, {
        children: createElement(DossierRow, {
          row,
          entrants,
          archive,
          returns: dossierValue(model.chapters.returns),
        }),
      }),
    }),
  );
}

describe('shared Dossier presentation on canonical model fixtures', () => {
  it('renders all twenty retained groups, including exact engine-generated outcomes and connected paid cancellation', async () => {
    const engine = await dossierEngineExamples();
    expect(engine.length + dossierRecordedExamples.length).toBe(20);

    for (const example of engine) {
      for (const model of example.models) {
        expect(model.issues).toEqual([]);
        expect(model.rows.length).toBeLessThanOrEqual(256);

        for (const row of model.rows) expect(() => renderRow(row, model, true)).not.toThrow();
      }
    }

    const paid = engine.find((example) => example.id === 'failed-assassin')!.models[0];
    const declaration = paid.rows.find((row) => row.fact.kind === 'declaration')!;
    const resolved = paid.rows.find((row) => row.fact.kind === 'challenge-resolved')!;
    const ending = paid.rows.find((row) => row.fact.kind === 'turn-ended')!;
    expect(dossierValue(declaration.actor)).not.toBe(dossierValue(resolved.actor));
    expect(renderRow(ending, paid, false)).toContain('cancelled');
    expect(renderRow(ending, paid, false)).toContain('3 coins paid · no refund');
    expect(renderRow(resolved, paid, false)).toContain(`data-action-key="${declaration.source.eventKey}"`);
  });

  it('applies archive disclosure independently to nested public-row hands and roles', async () => {
    const proof = await dossierProof();
    const declaration = proof.rows.find((row) => row.fact.kind === 'declaration')!;
    const actor = dossierValue(declaration.actor)!;
    const seat = structuredClone(declaration.affected.find((change) => change.seat === actor)!.after);
    seat.role = {
      status: 'known',
      value: { role: 'overlord', visibility: 'archive' },
      sources: [declaration.source],
    };
    const hand = dossierValue(seat.hand)!;
    expect(hand.visibility).toBe('archive');

    const cards = (archive: boolean) =>
      renderToStaticMarkup(
        createElement(RuleHelpProvider, { children: createElement(DossierSeatCards, { seat, archive }) }),
      );

    const hidden = cards(false);
    expect(hidden).not.toContain('data-rule-term="Overlord"');
    expect(hidden).not.toContain('dossier-card-known');
    expect(hidden).toContain('Secret capability');
    expect(cards(true)).toContain('data-rule-term="Overlord"');
    expect(cards(true)).toContain('dossier-card-known');
    expect(renderRow(declaration, proof, false)).not.toContain('dossier-card-known');
    const proved = proof.rows.find((row) => row.fact.kind === 'proof')!;
    expect(renderRow(proved, proof, false)).toContain('Proved · replaced, not lost');
    expect(renderRow(proved, proof, false)).not.toContain('dossier-card-lost');
  });

  it('retains all 416 source quotes and all nine source-time loss rosters without final-life substitution', () => {
    const expectedCounts = [9, 8, 7, 6, 5, 4, 3, 2, 1];

    const losses = capturedEvents.filter((event) => {
      const fact = readStoryFact(event);

      return fact.kind === 'influence-lost' && fact.eliminated;
    });

    expect(losses).toHaveLength(9);

    for (const [index, event] of losses.entries()) {
      const model = capturedStory(event.id, event.id);
      const row = model.rows[0];
      expect(dossierValue(row.remaining)).toHaveLength(expectedCounts[index]);
      const html = renderRow(row, model, false);
      expect(html).toContain('dossier-departure');
      expect(html).toContain(`<strong>${expectedCounts[index]}</strong>`);
      expect(html).toContain('At this point in the record');
    }

    const quotes = capturedEvents.filter((event) => event.type === 'chat');
    expect(quotes).toHaveLength(416);

    for (const event of quotes) {
      const model = buildSuccessionStory({
        scope: { matchId: 'quote-verification', visibilityEpoch: 'archive' },
        after: event.id - 1,
        through: event.id,
        events: [event],
      });

      expect(model.rows[0].text).toBe(event.text);
      expect(dossierFactText(model.rows[0], new Map())).toBe(event.text);
    }
  });

  it('keeps event-time executions, separate double losses, cap criteria and controller credit', async () => {
    const examples = await dossierEngineExamples();
    const execution = examples.find((example) => example.id === 'execution-return')!.models;
    const first = execution[0].rows.find((row) => row.fact.kind === 'execution')!;
    const second = execution[1].rows.find((row) => row.fact.kind === 'execution')!;
    expect(dossierValue(first.remaining)).toHaveLength(9);
    expect(dossierValue(second.remaining)).toHaveLength(8);
    const returned = dossierValue(execution[1].chapters.returns)!;
    expect(returned).toHaveLength(10);
    expect(returned.filter((seat) => seat.returnedAfterExecution)).toHaveLength(2);
    expect(returned.every((seat) => seat.influence === 2)).toBe(true);
    const start = execution[1].rows.find((row) => row.fact.kind === 'act-started')!;
    expect(renderRow(start, execution[1], false)).toContain('All 10 starting states');
    const missingReturns = structuredClone(execution[1]);
    missingReturns.chapters.returns = { status: 'unavailable', reason: 'not-recorded' };
    expect(renderRow(start, missingReturns, false)).toContain('Recorded starting states unavailable.');
    expect(renderRow(start, missingReturns, false)).not.toContain('dossier-starting-totals');

    const double = examples.find((example) => example.id === 'double-loss')!.models[0];
    const losses = double.rows.filter((row) => row.fact.kind === 'influence-lost');
    expect(losses.map((row) => dossierValue(row.remaining)?.length)).toEqual([10, 9]);
    expect(losses.map((row) => dossierValue(row.lossReason))).toEqual(['failed-claim', 'action-effect']);
    expect(
      examples
        .find((example) => example.id === 'cap')!
        .models.map((model) => dossierValue(model.chapters.outcome)?.result.tieBreak?.decisive),
    ).toEqual(['influence', 'coins', 'priority']);
    const takeover = examples.find((example) => example.id === 'takeover')!.models;
    expect(dossierValue(takeover[0].chapters.outcome)?.credit).toMatchObject({ value: 'forfeit-loss' });
    expect(takeover[1].chapters.outcome.status).toBe('unavailable');
  });
});
