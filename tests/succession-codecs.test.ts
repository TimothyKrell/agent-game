import { Schema, Struct } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  Action2Schema,
  ActionRequest2Schema,
  AuthorizedEvent2Schema,
  HistoryPage2Schema,
  Observation2Schema,
  ReplayFrame2Schema,
  type Action2,
  type AuthorizedEvent2,
  type HistoryPage2,
  type Observation2,
  type ReplayFrame2,
} from '../src/shared/succession';

const bytes = (
  value: Observation2 | AuthorizedEvent2 | { type: string; observation: Observation2; actionId: string },
) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const id = 'a'.repeat(100);

function observation(): Observation2 {
  const actions: Action2[] = [{ type: 'income' }, { type: 'tax' }, { type: 'exchange' }];

  for (let target = 1; target < 10; target++)
    actions.push({ type: 'steal', target }, { type: 'assassinate', target }, { type: 'coup', target });

  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: id,
    rulesVersion: 'succession-1',
    mode: 'ranked',
    createdAt: 1700000000000,
    finishedAt: null,
    status: 'active',
    act: 2,
    round: 12,
    phase: { id, kind: 'act-2:action', deadline: 1700000030000, graceUntil: 1700000060000 },
    seats: Array.from({ length: 10 }, (_, number) => ({
      number,
      agentId: `${id}${number}`,
      ownerId: `${id}${number}`,
      name: '𐐀'.repeat(40),
      house: false,
      originalHouse: false,
      alive: true,
      forfeited: false,
      rating: 1000,
      generation: 1,
      role: 'cooperative',
      coins: 9,
      influence: 2,
      revealed: [],
    })),
    board: {
      act: 2,
      firstSeat: 0,
      activeSeat: 0,
      tableRound: 12,
      slot: 0,
      roundCap: 12,
      courtCount: 5,
      pending: null,
    },
    act1Result: {
      team: 'cooperative',
      reason: 'Five Safeguards enacted.',
      roles: Array.from({ length: 10 }, () => 'cooperative'),
      returnedSeats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      bonuses: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      finalTracks: {
        safeguards: 5,
        overrides: 0,
        electionTracker: 0,
        drawCount: 5,
        discardCount: 7,
        vetoUnlocked: false,
      },
    },
    chat: { open: true, maxCharacters: 1000, cooldownMs: 5000, nextSpeakAt: null },
    you: { seat: 0, agentId: id, alive: true, forfeited: false, generation: 1 },
    private: {
      act: 2,
      hand: [
        { id, capability: 'guard' },
        { id: `${id}2`, capability: 'envoy' },
      ],
      exchangePool: [],
      reaction: null,
    },
    decision: {
      id,
      deadline: 1700000030000,
      graceUntil: 1700000060000,
      actions: actions.map((action) => ({ action, label: '𐐀'.repeat(20) })),
    },
    result: null,
    interruptionReason: null,
    commitment: { digest: 'a'.repeat(64), reveal: null },
    history: { visibilityEpoch: id, streamHead: 50000 },
  };
}

function event(id: number): AuthorizedEvent2 {
  return {
    id,
    eventKey: `opaque-${id}`,
    act: 2,
    at: 1700000000000,
    round: 1,
    type: 'proof',
    seat: 0,
    text: 'Proved Guard.',
    data: {
      capability: 'guard',
      replacement: { hand: [{ id: 'opaque', capability: 'thief' }] },
      reactions: { '1': 'challenge', '2': 'pass' },
    },
  };
}

function page(): HistoryPage2 {
  return {
    protocolVersion: '2',
    gameId: 'succession',
    matchId: id,
    visibilityEpoch: id,
    streamHead: 10,
    after: 2,
    through: 8,
    cursor: 4,
    events: [event(3), event(4)],
    hasMore: true,
    reset: false,
  };
}

describe('Succession protocol 2 codecs', () => {
  it('round-trips a maximum-profile, complete 30-action observation within 14 KiB', () => {
    const value = observation();
    expect(value.decision?.actions).toHaveLength(30);
    expect(
      value.decision?.actions.every(({ label }) => new TextEncoder().encode(label).byteLength <= 80),
    ).toBe(true);
    expect(bytes(value)).toBeLessThanOrEqual(14336);
    expect(Schema.decodeUnknownSync(Observation2Schema)(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(Schema.encodeSync(Observation2Schema)(value)).toEqual(value);
    expect(bytes({ type: 'observation', observation: value, actionId: id })).toBeLessThanOrEqual(16384);
  });

  it('validates private exchange and bounded terminal evidence', () => {
    const value = observation();
    value.phase.kind = 'act-2:exchange';
    value.private = {
      act: 2,
      hand: [],
      exchangePool: Array.from({ length: 4 }, (_, index) => ({ id: `${id}${index}`, capability: 'envoy' })),
      reaction: 'pass',
    };
    value.decision = null;
    expect(Schema.is(Observation2Schema)(value)).toBe(true);
    value.status = 'finished';
    value.phase.kind = 'finished';
    value.finishedAt = 1700000090000;
    value.commitment.reveal = { saltBase64url: 'a'.repeat(43), priority: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
    value.result = {
      kind: 'individual',
      winnerSeat: 0,
      reason: 'round-cap',
      act1: { team: 'cooperative', reason: 'Five Safeguards enacted.' },
      tieBreak: {
        decisive: 'priority',
        scores: value.seats.map(({ number }) => ({ seat: number, influence: 2, coins: 9, priority: number })),
      },
    };
    expect(Schema.is(Observation2Schema)(value)).toBe(true);
    expect(bytes(value)).toBeLessThanOrEqual(14336);
  });

  it('accepts Act 1 policy state and its cursor-specific policy archive', () => {
    const value = observation();
    value.act = 1;
    value.act1Result = null;
    value.phase.kind = 'coordinator-discard';
    value.board = {
      act: 1,
      coordinator: 0,
      executor: 1,
      power: null,
      tracks: {
        safeguards: 2,
        overrides: 3,
        electionTracker: 0,
        drawCount: 5,
        discardCount: 9,
        vetoUnlocked: false,
      },
      lastGovernment: { coordinator: 9, executor: 8 },
    };
    value.private = {
      act: 1,
      role: 'rogue',
      knownRogues: [2, 3],
      knownOverlord: 4,
      hand: [{ id, policy: 'override' }],
    };
    value.decision = {
      id,
      deadline: 1700000030000,
      graceUntil: 1700000060000,
      actions: [{ action: { type: 'discard', cardId: id }, label: 'Discard Override' }],
    };
    expect(Schema.is(Observation2Schema)(value)).toBe(true);

    const frame: ReplayFrame2 = {
      ...Struct.omit(value, ['decision', 'history']),
      through: 10,
      visibilityEpoch: id,
      archive: { act: 1, deck: [{ id, policy: 'safeguard' }], discards: [], hand: [] },
    };

    expect(Schema.decodeUnknownSync(ReplayFrame2Schema)(frame)).toEqual(frame);
  });

  it('rejects cross-game, enum, seat, stage, and label violations', () => {
    const valid = observation();

    for (const invalid of [
      { ...valid, gameId: 'secret-overlord' },
      { ...valid, rulesVersion: 'secret-overlord-1' },
      { ...valid, protocolVersion: '1' },
      { ...valid, mode: 'succession' },
      { ...valid, act: 1 },
      { ...valid, phase: { ...valid.phase, kind: 'voting' } },
      { ...valid, private: { act: 2, hand: [{ id, capability: 'duke' }], exchangePool: [], reaction: null } },
      { ...valid, seats: valid.seats.map((seat) => ({ ...seat, number: 10 })) },
      { ...valid, seats: valid.seats.map((seat) => ({ ...seat, name: 'a'.repeat(2000) })) },
      {
        ...valid,
        decision: {
          ...valid.decision,
          actions: Array.from({ length: 33 }, () => ({ action: { type: 'income' }, label: 'Income' })),
        },
      },
      {
        ...valid,
        decision: {
          ...valid.decision,
          actions: [{ action: { type: 'vote', approve: true }, label: 'Vote' }],
        },
      },
      {
        ...valid,
        decision: { ...valid.decision, actions: [{ action: { type: 'income' }, label: '𐐀'.repeat(21) }] },
      },
    ])
      expect(() => Schema.decodeUnknownSync(Observation2Schema)(invalid)).toThrow();
  });

  it('accepts both acts and rejects malformed actions and envelopes', () => {
    for (const action of [
      { type: 'vote', approve: true },
      { type: 'coup', target: 9 },
      { type: 'return-influence', cardIds: ['a', 'b'] },
    ]) {
      expect(
        Schema.decodeUnknownSync(ActionRequest2Schema)({
          gameId: 'succession',
          actionId: id,
          phaseId: id,
          action,
        }).action,
      ).toEqual(action);
    }

    for (const action of [
      { type: 'coup', target: -1 },
      { type: 'nominate', target: 10 },
      { type: 'steal', target: 0.5 },
      { type: 'block', capability: 'treasurer' },
      { type: 'return-influence', cardIds: ['a', 'a'] },
      { type: 'return-influence', cardIds: ['a', 'b', 'c'] },
      { type: 'foreign-aid' },
    ])
      expect(Schema.is(Action2Schema)(action)).toBe(false);
    expect(Schema.is(ActionRequest2Schema)({ actionId: id, phaseId: id, action: { type: 'income' } })).toBe(
      false,
    );
  });

  it('retains deep replay data and every valid worst-escaped 1000-character chat', () => {
    expect(Schema.decodeUnknownSync(AuthorizedEvent2Schema)(event(1))).toEqual(event(1));

    for (const text of ['\u0000'.repeat(1000), '😀'.repeat(1000), '"'.repeat(1000)]) {
      const chat = { ...event(1), type: 'chat', text };
      expect(bytes(chat)).toBeLessThanOrEqual(8192);
      expect(Schema.is(AuthorizedEvent2Schema)(chat)).toBe(true);
    }

    expect(Schema.is(AuthorizedEvent2Schema)({ ...event(1), data: { nested: { invalid: undefined } } })).toBe(
      false,
    );
    expect(Schema.is(AuthorizedEvent2Schema)({ ...event(1), seat: 10 })).toBe(false);
  });

  it('validates contiguous bounded history, fixed walks, and metadata-only resets', () => {
    expect(Schema.decodeUnknownSync(HistoryPage2Schema)(page())).toEqual(page());
    const complete = { ...page(), through: 4, hasMore: false };
    expect(Schema.is(HistoryPage2Schema)(complete)).toBe(true);
    const reset = { ...page(), after: 0, cursor: 0, through: 10, events: [], reset: true };
    expect(Schema.is(HistoryPage2Schema)(reset)).toBe(true);

    for (const invalid of [
      { ...page(), cursor: 8 },
      { ...page(), events: [event(3), event(5)] },
      { ...page(), through: 11 },
      { ...page(), after: -1 },
      { ...page(), hasMore: false },
      { ...page(), events: [], cursor: 2 },
      { ...reset, events: [event(1)] },
      { ...page(), streamHead: Number.MAX_SAFE_INTEGER + 1 },
      {
        ...page(),
        after: 0,
        through: 64,
        streamHead: 64,
        cursor: 64,
        hasMore: false,
        events: Array.from({ length: 64 }, (_, index) => ({ ...event(index + 1), text: 'a'.repeat(1000) })),
      },
      {
        ...page(),
        after: 0,
        through: 65,
        streamHead: 65,
        cursor: 65,
        hasMore: false,
        events: Array.from({ length: 65 }, (_, index) => event(index + 1)),
      },
    ])
      expect(Schema.is(HistoryPage2Schema)(invalid)).toBe(false);
  });

  it('exports cursor-specific replay frames without decision/history properties', () => {
    const frame: ReplayFrame2 = {
      ...Struct.omit(observation(), ['decision', 'history']),
      through: 100,
      visibilityEpoch: id,
      archive: {
        act: 2,
        hands: [{ seat: 0, hand: [{ id, capability: 'guard' }] }],
        court: [{ id, capability: 'thief' }],
      },
    };

    const decoded = Schema.decodeUnknownSync(ReplayFrame2Schema)(frame);
    expect(decoded).toEqual(frame);
    expect(decoded).not.toHaveProperty('decision');
    expect(decoded).not.toHaveProperty('history');
    expect(
      Schema.is(ReplayFrame2Schema)({ ...frame, archive: { act: 1, deck: [], discards: [], hand: [] } }),
    ).toBe(false);
  });
});
