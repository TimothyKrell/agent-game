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
import { dossierEnding } from '../src/client/dossier-ending';
import { DossierEventPanel } from '../src/client/dossier-event-panels';
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

function renderEventPanel(row: StoryRow, model: StoryModel) {
  const entrants = new Map(model.end.map((seat) => [seat.seat, seat.entrant]));

  return renderToStaticMarkup(
    createElement(DossierPictureProvider, {
      pictures: new Map(),
      children: createElement(RuleHelpProvider, {
        children: createElement(DossierEventPanel, { row, entrants }),
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
      expect(html).not.toContain('At this point in the record');
      expect(html).not.toContain('Cards at this moment');
    }

    const nonEliminating = capturedEvents.find((event) => {
      const fact = readStoryFact(event);

      return fact.kind === 'influence-lost' && !fact.eliminated;
    })!;

    const nonEliminatingModel = capturedStory(nonEliminating.id, nonEliminating.id);
    const nonEliminatingRow = nonEliminatingModel.rows[0];
    expect(dossierValue(nonEliminatingRow.remaining)).toHaveLength(10);
    expect(renderRow(nonEliminatingRow, nonEliminatingModel, false)).not.toContain('dossier-remaining');

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

  it('renders Act transitions from actual state and combines public proof/loss evidence in display order', async () => {
    const examples = await dossierEngineExamples();
    const execution = examples.find((example) => example.id === 'execution-return')!.models[1];
    const ended = execution.rows.find((row) => row.fact.kind === 'act-ended')!;
    const started = execution.rows.find((row) => row.fact.kind === 'act-started')!;
    const award = renderRow(ended, execution, false);
    const opening = renderRow(started, execution, false);
    const returns = dossierValue(execution.chapters.returns)!;

    expect(award).toContain('dossier-award');
    expect(award).toContain(
      'All ten agents return for Act II, including executed agents. The match continues.',
    );
    expect(
      returns
        .filter((seat) => seat.bonus === 1)
        .every((seat) =>
          award.includes(
            seat.entrant.status === 'unavailable' ? `Seat ${seat.seat + 1}` : seat.entrant.value.name,
          ),
        ),
    ).toBe(true);
    expect(opening).not.toContain('ACT II · OPENING STATE');
    expect(opening).not.toContain('Each agent receives two fresh secret capability cards.');
    expect(opening).toContain('dossier-evidence');
    expect(opening).toContain('All 10 starting states');

    const capturedOpening = capturedStory(963, 963);
    const capturedStart = capturedOpening.rows.find((row) => row.fact.kind === 'act-started')!;
    const capturedReturns = dossierValue(capturedOpening.chapters.returns)!;
    expect(capturedReturns.filter((seat) => seat.coins === 3)).toHaveLength(4);
    expect(capturedReturns.filter((seat) => seat.coins === 2)).toHaveLength(6);
    const capturedOpeningHtml = renderRow(capturedStart, capturedOpening, false);
    expect(capturedOpeningHtml).toContain('4 agents × <b>3</b>');
    expect(capturedOpeningHtml).toContain('6 agents × <b>2</b>');

    const proof = await dossierProof();
    const proved = proof.rows.find((row) => row.fact.kind === 'proof')!;
    const proofPanel = renderEventPanel(proved, proof);

    expect(proofPanel).toContain('dossier-event-panel');
    expect(proofPanel.indexOf('dossier-event-changes')).toBeLessThan(
      proofPanel.indexOf('dossier-event-card-detail'),
    );
    expect(proofPanel).toContain('Proved · replaced, not lost');
    expect(proofPanel).not.toContain('dossier-card-known');
    const proofRow = renderRow(proved, proof, false);

    expect(proofRow).toContain('dossier-event-panel');
    expect(proofRow.match(/dossier-event-card-detail/g)).toHaveLength(1);
    expect(proofRow).not.toContain('dossier-card-revealed');
    expect(proofRow).not.toContain('dossier-delta');

    const double = examples.find((example) => example.id === 'double-loss')!.models[0];
    const eliminated = double.rows.find((row) => row.fact.kind === 'influence-lost' && row.fact.eliminated)!;
    const lossPanel = renderEventPanel(eliminated, double);

    expect(lossPanel).toContain('dossier-event-panel-eliminated');
    expect(lossPanel.indexOf('dossier-event-changes')).toBeLessThan(
      lossPanel.indexOf('dossier-event-card-detail'),
    );
    expect(lossPanel).toContain('Eliminated · coins frozen');
    expect(lossPanel).toContain('Lost · publicly revealed');
    const lossRow = renderRow(eliminated, double, false);

    expect(lossRow).toContain('dossier-event-panel-eliminated');
    expect(lossRow.match(/dossier-event-card-detail/g)).toHaveLength(1);
    expect(lossRow).not.toContain('dossier-card-lost');
    expect(lossRow).not.toContain('dossier-delta');
  });

  it('renders compact ordered election, policy, tracker and response evidence without duplicated prose', () => {
    const electionModel = capturedStory(26, 79);
    const election = electionModel.rows.find((row) => row.fact.kind === 'election')!;
    const electionHtml = renderRow(election, electionModel, false);
    expect(electionHtml).toContain('<b>7</b> approve');
    expect(electionHtml).toContain('<b>3</b> reject');
    expect(electionHtml.match(/dossier-vote-bar/g)).toHaveLength(1);
    expect(electionHtml.match(/class="approved"/g)).toHaveLength(14);
    expect(electionHtml.match(/class="rejected"/g)).toHaveLength(6);

    const policy = electionModel.rows.find((row) => row.fact.kind === 'policy')!;
    const policyHtml = renderRow(policy, electionModel, false);
    expect(policyHtml).toContain('dossier-policy-tracks');
    expect(policyHtml).toContain('0 / 5');
    expect(policyHtml).toContain('1 / 6');
    expect(policyHtml.match(/dossier-track-slots/g)).toHaveLength(2);

    const chaosModel = capturedStory(170, 215);
    const tracker = chaosModel.rows.find((row) => row.fact.kind === 'tracker')!;
    expect(renderRow(tracker, chaosModel, false)).toContain('dossier-tracker-compact');

    const challengeModel = capturedStory(987, 1031);
    const challenge = challengeModel.rows.find((row) => row.fact.kind === 'challenge-resolved')!;
    const challengeHtml = renderRow(challenge, challengeModel, false);
    const evidence = challengeHtml.slice(challengeHtml.indexOf('<aside'));
    expect(evidence).toContain('Published responses · 9');
    expect(evidence).not.toContain('block claim');
    expect(evidence).not.toContain('Action at source');
  });

  it('uses the terminal canonical action source, with an honest terminal-record fallback', async () => {
    const examples = await dossierEngineExamples();
    const model = examples.find((example) => example.id === 'cap')!.models[0];
    const terminal = model.rows.find((row) => row.fact.kind === 'finished')!;
    const ending = dossierEnding(model.rows)!;
    const action = dossierValue(model.rows.findLast((row) => row.fact.kind === 'turn-ended')!.action)!;
    expect(ending.label).toBe('Final move');
    expect(ending.source).toEqual(dossierValue(action.declaration));
    expect(model.rows.find((row) => row.source.eventKey === ending.source.eventKey)?.fact.kind).toBe(
      'declaration',
    );

    // Other declarations in the window cannot substitute for missing causal evidence.
    const partial = structuredClone(model.rows);

    for (const row of partial) {
      if (row.fact.kind === 'finished' || row.fact.kind === 'turn-ended')
        row.action = { status: 'unavailable', reason: 'not-recorded' };
    }

    expect(dossierEnding(partial)).toMatchObject({ label: 'Terminal record', source: terminal.source });
    const gapped = model.rows.filter((row) => row.fact.kind !== 'phase');
    expect(dossierEnding(gapped)).toMatchObject({ label: 'Terminal record', source: terminal.source });
    expect(dossierEnding(model.rows.filter((row) => row !== terminal))).toBeNull();
  });
});
