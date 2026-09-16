import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodingFinale } from '../src/client/coding-finale';
import { codingFinaleFixture } from '../src/client/coding-finale-fixtures';
import { codingFinaleView, formatFinaleClock, remainingMilliseconds } from '../src/client/coding-finale-view';
import type { Observation3 } from '../src/shared/coding-finale';

function renderFixture(name: string) {
  return renderToStaticMarkup(
    createElement(CodingFinale, { view: codingFinaleFixture(name, 1_800_000_000_000) }),
  );
}

function observation(): Observation3 {
  const seats = Array.from({ length: 10 }, (_, number) => ({
    number,
    agentId: `agent-${number}`,
    ownerId: null,
    name: `Agent ${number}`,
    house: false,
    originalHouse: false,
    alive: number !== 8,
    forfeited: false,
    rating: 1000,
    generation: 0,
    qualification:
      number === 8 ? ('executed' as const) : number < 3 ? ('finalist' as const) : ('losing-faction' as const),
  }));

  return {
    gameId: 'coding-finale',
    protocolVersion: '3',
    rulesVersion: 'coding-finale-1',
    matchId: 'match_adapter',
    mode: 'preview',
    createdAt: 1_799_999_000_000,
    finishedAt: null,
    serverNow: 1_800_000_000_000,
    status: 'active',
    act: 2,
    round: 4,
    phase: {
      id: 'phase-race',
      kind: 'racing',
      startedAt: 1_800_000_000_000,
      deadline: 1_800_000_300_000,
      graceUntil: 1_800_000_330_000,
    },
    seats,
    actOne: null,
    finale: {
      id: 'finale-adapter',
      rulesVersion: 'coding-finale-1',
      challengeId: 'challenge-private',
      status: 'racing',
      startedAt: 1_800_000_000_000,
      deadline: 1_800_000_300_000,
      result: null,
      interruptionReason: null,
      commitment: 'digest',
      priorityReveal: null,
      finalists: [
        { seat: 0, forfeited: false, completedTier: 2, attempts: 4 },
        { seat: 1, forfeited: false, completedTier: 1, attempts: 3 },
        { seat: 2, forfeited: false, completedTier: 0, attempts: 1 },
      ],
      submissions: [
        { sequence: 8, seat: 0, tier: 2, receivedAt: 20, status: 'judged', verdict: 'passed' },
        { sequence: 7, seat: 1, tier: 2, receivedAt: 10, status: 'pending', verdict: null },
      ],
      you: null,
      provisionalResult: { winnerSeat: 0, submission: 8 },
    },
    act1Result: { team: 'cooperative', reason: 'Five safeguards enacted.' },
    result: null,
    interruptionReason: null,
    you: null,
    chat: { open: true, maxCharacters: 500, cooldownMs: 5000, nextSpeakAt: null },
    decision: null,
    commitment: { digest: 'digest', reveal: null },
    history: { visibilityEpoch: 'public', streamHead: 18 },
  };
}

describe('Coding Finale presentation', () => {
  it('keeps private Tier 2 challenge and source controls out of spectator markup', () => {
    const html = renderFixture('spectator-tier2-locked');

    expect(html).toContain('Spectators read only');
    expect(html).toContain('Challenge specifications, programs, and submission controls are private');
    expect(html).not.toContain('Restore the route under power constraints');
    expect(html).not.toContain('Your private challenge');
    expect(html).not.toContain('View source archive');
    expect(html).not.toContain('<textarea');
  });

  it('reveals only the finalist’s newly unlocked tier and preserves the shared attempt count', () => {
    const html = renderFixture('own-tier1-pass');

    expect(html).toContain('Signal paths · Tier 2');
    expect(html).toContain('Tier 2 of 2');
    expect(html).toContain('3 / 10');
    expect(html).toContain('Submit Tier 2');
    expect(html).not.toContain('source archive');
  });

  it('explains that an earlier pending receipt prevents a provisional pass becoming final', () => {
    const html = renderFixture('pending-earlier-tier2');

    expect(html).toContain('Ada Vector has a provisional Tier 2 pass.');
    expect(html).toContain('An earlier Tier 2 receipt is still pending. The champion is not final.');
    expect(html.indexOf('#9')).toBeLessThan(html.indexOf('#7'));
    expect(html).toContain('Not judge finish order');
  });

  it.each([
    ['finished-tier-two', 'Earliest server-received passing Tier 2 submission'],
    ['finished-tier-one', 'Tier 1 fallback · earliest server-received pass'],
    ['finished-priority', 'Committed finalist priority fallback'],
  ])('renders the authority’s %s terminal reason', (fixture, reason) => {
    expect(renderFixture(fixture)).toContain(reason);
  });

  it('keeps takeover control and original entrant credit distinct', () => {
    const active = renderFixture('takeover');
    const fallback = renderFixture('finished-priority');

    expect(active).toContain('House takeover · generation 2');
    expect(fallback).toContain('Original entrant: Morrow-7 · forfeit retained · no entrant win credit');
  });

  it('calibrates from server time without treating zero as a result', () => {
    expect(remainingMilliseconds('2027-01-15T08:00:00.000Z', '2027-01-15T08:05:00.000Z', 1250)).toBe(298_750);
    expect(formatFinaleClock(298_750)).toBe('4:59');
    expect(formatFinaleClock(0)).toBe('0:00');
    expect(renderFixture('timeout-judging')).toContain('Accepted pre-deadline work is still being judged.');
    expect(renderFixture('timeout-judging')).not.toContain('wins.');
  });

  it('adapts only authoritative public progress and strips an injected challenge for spectators', () => {
    const view = codingFinaleView(observation(), {
      challenge: { tier: 2, title: 'MUST NOT LEAK', summary: 'private', example: 'private' },
    });

    expect(view.viewer).toEqual({ kind: 'spectator' });
    expect(view.challenge).toBeUndefined();
    expect(view.finalists.map((finalist) => [finalist.seat, finalist.tierOne, finalist.tierTwo])).toEqual([
      [0, 'passed', 'passed'],
      [1, 'passed', 'open'],
      [2, 'open', 'locked'],
    ]);
    expect(view.receipts.map((receipt) => receipt.sequence)).toEqual([8, 7]);
    expect(view.pendingEarlierTierTwo).toBe(true);
  });
});
