import { describe, expect, it } from 'vitest';
import type { HistoryPage2, Observation2 } from '../src/shared/succession';
import { SuccessionCurrent, SuccessionHistory } from '../src/client/succession-stream';

function observation(): Observation2 {
  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: 'table',
    rulesVersion: 'succession-1',
    mode: 'preview',
    createdAt: 1,
    finishedAt: null,
    status: 'active',
    act: 2,
    round: 1,
    phase: { id: 'phase', kind: 'act-2:challenge', deadline: 100, graceUntil: null },
    seats: Array.from({ length: 10 }, (_, number) => ({
      number,
      agentId: `agent-${number}`,
      ownerId: null,
      name: `Agent ${number}`,
      house: false,
      originalHouse: false,
      alive: true,
      forfeited: false,
      rating: 1000,
      generation: 0,
      coins: 2,
      influence: 2,
      revealed: [],
    })),
    board: {
      act: 2,
      firstSeat: 0,
      activeSeat: 0,
      tableRound: 1,
      slot: 0,
      roundCap: 12,
      courtCount: 5,
      pending: null,
    },
    act1Result: null,
    chat: { open: true, maxCharacters: 1000, cooldownMs: 5000, nextSpeakAt: null },
    you: null,
    private: null,
    decision: null,
    result: null,
    interruptionReason: null,
    commitment: { digest: 'digest', reveal: null },
    history: { visibilityEpoch: 'live', streamHead: 2 },
  };
}

function page(after: number, through: number, cursor: number, epoch = 'live', head = through): HistoryPage2 {
  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: 'table',
    visibilityEpoch: epoch,
    streamHead: head,
    after,
    through,
    cursor,
    hasMore: cursor < through,
    reset: false,
    events: Array.from({ length: cursor - after }, (_, index) => ({
      id: after + index + 1,
      eventKey: `key-${epoch}-${after + index + 1}`,
      at: 1,
      act: 2,
      round: 1,
      type: 'chat',
      text: 'hello',
    })),
  };
}

describe('Succession mixed-transport client lifecycle', () => {
  it('rejects delayed current, receipt snapshots, and pages after archive acceptance', () => {
    const current = new SuccessionCurrent();
    const reader = new SuccessionHistory();
    const live = observation();
    expect(current.accept(live)).toBe(true);
    reader.observe(live.history);
    const oldRequest = reader.request()!;
    const oldCurrentTicket = current.ticket();

    const terminal: Observation2 = {
      ...live,
      status: 'finished',
      finishedAt: 200,
      history: { visibilityEpoch: 'archive', streamHead: 5 },
    };

    expect(current.accept(terminal)).toBe(true);
    reader.observe(terminal.history);
    expect(reader.accept(page(0, 5, 3, 'archive'), reader.request()!)).toBe(true);
    expect(current.accept(live, oldCurrentTicket)).toBe(false);
    expect(current.accept(live)).toBe(false);
    expect(reader.accept(page(0, 2, 2), oldRequest)).toBe(false);
    expect(current.value?.status).toBe('finished');
    expect(reader.epoch).toBe('archive');
    expect(reader.cursor).toBe(3);
  });

  it('preserves takeover entitlement against an older snapshot even at a newer stream head', () => {
    const current = new SuccessionCurrent();
    const live = observation();

    const takeover: Observation2 = {
      ...live,
      seats: live.seats.map((seat) =>
        seat.number === 0 ? { ...seat, generation: 1, forfeited: true, house: true } : seat,
      ),
    };

    expect(current.accept(takeover)).toBe(true);
    expect(current.accept({ ...live, history: { ...live.history, streamHead: 10 } })).toBe(false);
    expect(current.value?.seats[0].forfeited).toBe(true);
  });

  it('freezes through, advances only delivered cursor, and ignores retry duplication', () => {
    const reader = new SuccessionHistory();
    reader.observe({ visibilityEpoch: 'live', streamHead: 5 });
    const first = reader.request()!;
    reader.observe({ visibilityEpoch: 'live', streamHead: 9 });
    expect(reader.cursor).toBe(0);
    expect(reader.accept(page(0, 5, 2, 'live', 9), first)).toBe(true);
    expect(reader.accept(page(0, 5, 2, 'live', 9), first)).toBe(false);
    expect(reader.request()).toEqual({ epoch: 'live', after: 2, through: 5 });
    expect(reader.accept(page(2, 5, 5, 'live', 9), reader.request()!)).toBe(true);
    expect(reader.request()).toEqual({ epoch: 'live', after: 5, through: 9 });
  });

  it('keeps independent replay cursor and bounds cached history', () => {
    const reader = new SuccessionHistory();
    const replay = new SuccessionHistory();

    for (const store of [reader, replay]) store.observe({ visibilityEpoch: 'archive', streamHead: 320 });

    for (let after = 0; after < 320; after += 32)
      expect(reader.accept(page(after, 320, after + 32, 'archive'), reader.request()!)).toBe(true);
    expect(reader.events).toHaveLength(256);
    expect(reader.cursor).toBe(320);
    expect(replay.cursor).toBe(0);
    expect(replay.events).toHaveLength(0);
  });
});
