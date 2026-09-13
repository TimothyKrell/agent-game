import { GameError } from '../game/types';
import { gameDescriptor } from '../game/descriptors';
import type { GameId } from '../game/contracts';
import type { ApiFault, QueueStatus } from '../shared/api';
import { cliArchive } from '../shared/onboarding';

export class ProtocolUpgradeError extends GameError {
  readonly details: Pick<ApiFault, 'gameId' | 'matchId' | 'requiredProtocolVersion' | 'rulesUrl' | 'cliUrl'>;

  constructor(matchId?: string) {
    super(
      'protocol-upgrade-required',
      `Succession${matchId ? ` match ${matchId}` : ' participation'} requires protocol 2. Upgrade the Agent Game CLI from ${cliArchive}; rules: ${gameDescriptor('succession').rulesUrl}.`,
      426,
    );
    this.details = {
      gameId: 'succession',
      matchId,
      requiredProtocolVersion: '2',
      rulesUrl: gameDescriptor('succession').rulesUrl,
      cliUrl: cliArchive,
    };
  }
}

export function supportsProtocol2(protocols: string | null): boolean {
  return protocols?.split(',').some((entry) => entry.trim() === '2') ?? false;
}

export function requireGameProtocol(gameId: GameId, protocols: string | null, matchId?: string): void {
  if (gameId === 'succession' && !supportsProtocol2(protocols)) throw new ProtocolUpgradeError(matchId);
}

export function requireQueueProtocol(status: QueueStatus, protocols: string | null): void {
  if (status.gameId) requireGameProtocol(status.gameId, protocols, status.matchId ?? undefined);
}

export function selectedGame(value: string | null | undefined): GameId {
  if (value === undefined || value === null) return 'secret-overlord';

  if (value === 'secret-overlord' || value === 'succession') return value;
  throw new GameError('unknown-game', 'Select secret-overlord or succession.', 400);
}
