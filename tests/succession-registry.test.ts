import { describe, expect, it } from 'vitest';
import { createMatch } from '../src/game/engine';
import {
  createGame,
  decodeGameState,
  gameDescriptor,
  gameRegistry,
  inspectGame,
  observeGame,
  settleGame,
  summaryGame,
} from '../src/game/registry';
import type { MatchSnapshot } from '../src/game/contracts';
import type { Entrant } from '../src/game/types';

const entrants: Entrant[] = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `agent-${seat}`,
  ownerId: `owner-${seat}`,
  name: `Seat ${seat}`,
  house: false,
  rating: 1000,
}));

function snapshot(gameId: 'succession' | 'secret-overlord'): MatchSnapshot {
  const descriptor = gameDescriptor(gameId);

  return {
    ...descriptor,
    mode: 'preview',
    houseModel: {
      provider: 'captured-provider',
      model: 'captured-model',
      policyVersion: descriptor.housePolicyVersion,
    },
  };
}

describe('closed game registry', () => {
  it('normalizes legacy without regenerating cards, phases, events, or historical model identity', () => {
    const original = createMatch('legacy', entrants, 100);
    original.houseModel = { provider: 'actual', model: 'old-model', policyVersion: 'house-3' };
    const restored = decodeGameState(JSON.parse(JSON.stringify(original)));
    expect(restored.gameId).toBe('secret-overlord');

    if (restored.gameId !== 'secret-overlord') throw new Error('Wrong adapter');
    expect(restored.events).toEqual(original.events);
    expect(restored.deck).toEqual(original.deck);
    expect(restored.phase).toEqual(original.phase);
    expect(restored.snapshot.houseModel).toEqual(original.houseModel);
    expect(restored.snapshot.housePolicyVersion).toBe('house-3');
    expect(decodeGameState(restored).snapshot).toEqual(restored.snapshot);
  });

  it('captures caller snapshots for both adapters and exposes correlated observations and summaries', async () => {
    for (const gameId of ['secret-overlord', 'succession'] as const) {
      const captured = snapshot(gameId);
      const created = await createGame(`registry-${gameId}`, entrants, 100, captured);
      const state = decodeGameState(JSON.parse(JSON.stringify(created.state)));
      captured.houseModel.model = 'changed-after-allocation';
      expect(state.snapshot.houseModel.model).toBe('captured-model');
      expect(inspectGame(state).status).toBe('active');
      expect(settleGame(state)).toBeNull();
      expect(summaryGame(state).gameId).toBe(gameId);
      expect(observeGame(state).protocolVersion).toBe(gameId === 'succession' ? '2' : '1');
    }
  });

  it('rejects cross-game rules and preserves the original rating method and model root', () => {
    const captured = snapshot('secret-overlord');
    const state = gameRegistry['secret-overlord'].create('root-model', entrants, 0, captured);
    expect(state.houseModel).toEqual(captured.houseModel);
    expect(() => decodeGameState({ ...state, gameId: 'other' })).toThrow();
    expect(() => decodeGameState({ ...state, rulesVersion: 'succession-1' })).toThrow();
    expect(() =>
      decodeGameState({ ...state, snapshot: { ...state.snapshot, ratingVersion: 'winner-softmax-1' } }),
    ).toThrow();
    expect(() =>
      gameRegistry['secret-overlord'].create('bad', entrants, 0, snapshot('succession')),
    ).toThrow();
  });
});
