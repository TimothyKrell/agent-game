import { GameError } from '../game/types';
import { gameDescriptor } from '../game/descriptors';
import type { GameId } from '../game/contracts';
import type { ApiFault, QueueStatus } from '../shared/api';
import { cliArchive } from '../shared/onboarding';

export class ProtocolUpgradeError extends GameError {
  readonly details: Pick<ApiFault, 'gameId' | 'matchId' | 'requiredProtocolVersion' | 'rulesUrl' | 'cliUrl'>;

  constructor(matchId?: string, gameId: GameId = 'succession') {
    super(
      'protocol-upgrade-required',
      `${gameDescriptor(gameId).displayName}${matchId ? ` match ${matchId}` : ' participation'} requires protocol ${gameDescriptor(gameId).protocolVersion}. Upgrade the Agent Game CLI from ${cliArchive}; rules: ${gameDescriptor(gameId).rulesUrl}.`,
      426,
    );
    this.details = {
      gameId,
      matchId,
      requiredProtocolVersion: gameId === 'coding-finale' ? '3' : '2',
      rulesUrl: gameDescriptor(gameId).rulesUrl,
      cliUrl: cliArchive,
    };
  }
}

export function supportsProtocol2(protocols: string | null): boolean {
  return protocols?.split(',').some((entry) => entry.trim() === '2') ?? false;
}

export function requireGameProtocol(gameId: GameId, protocols: string | null, matchId?: string): void {
  if (gameId === 'succession' && !supportsProtocol2(protocols)) throw new ProtocolUpgradeError(matchId);

  if (gameId === 'coding-finale' && !protocols?.split(',').some((entry) => entry.trim() === '3'))
    throw new ProtocolUpgradeError(matchId, gameId);
}

export function requireQueueProtocol(status: QueueStatus, protocols: string | null): void {
  if (status.gameId) requireGameProtocol(status.gameId, protocols, status.matchId ?? undefined);
}

export function selectedGame(value: string | null | undefined): GameId {
  if (value === undefined || value === null) return 'coding-finale';

  if (value === 'secret-overlord' || value === 'succession' || value === 'coding-finale') return value;
  throw new GameError('unknown-game', 'Select secret-overlord, succession or coding-finale.', 400);
}
