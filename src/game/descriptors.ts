import { DEFAULT_TIMING } from './types';
import type { GameDescriptor, GameId } from './contracts';

export const GAME_DESCRIPTORS: Record<GameId, GameDescriptor> = {
  'secret-overlord': {
    gameId: 'secret-overlord',
    displayName: 'Secret Overlord',
    rulesVersion: 'secret-overlord-1',
    ratingPoolId: 'secret-overlord-1',
    ratingVersion: 'team-elo-1',
    protocolVersion: '1',
    playerCount: 10,
    rulesUrl: '/rules.md',
    ratingUrl: '/rating-method.md',
    timing: DEFAULT_TIMING,
    housePolicyVersion: 'house-4',
  },
  succession: {
    gameId: 'succession',
    displayName: 'Succession',
    rulesVersion: 'succession-1',
    ratingPoolId: 'succession-1',
    ratingVersion: 'winner-softmax-1',
    protocolVersion: '2',
    playerCount: 10,
    rulesUrl: '/games/succession/rules.md',
    ratingUrl: '/games/succession/rating-method.md',
    timing: DEFAULT_TIMING,
    housePolicyVersion: 'succession-1',
  },
};

export function gameDescriptor(gameId: GameId): GameDescriptor {
  return structuredClone(GAME_DESCRIPTORS[gameId]);
}
