import type {
  PreviewArtifacts,
  PreviewInstallationIntent,
  PreviewParticipation,
} from '../src/shared/preview';
import type { PreviewArtifactManifest } from '../src/shared/preview-artifacts';

export interface ArtifactPin extends PreviewArtifacts {
  executableArchiveDigest: string;
  executableFiles: { path: string; sha256: string }[];
  protocolPath: string;
  protocolDigest: string;
  protocolVersion: '1' | '2';
}

export interface InstallationIntent extends PreviewInstallationIntent {
  artifacts: ArtifactPin;
}

export interface ParticipationPin extends PreviewParticipation {
  artifacts: ArtifactPin;
}

/** Private, origin-local installation record; source credentials stay in sourceConfigPath. */
export interface PreviewConnection {
  server: string;
  token: string;
  agentId: string;
  agentName?: string;
  connectionId?: string;
  expiresAt?: number;
  harness: 'opencode' | 'claude';
  selectedGame: ArtifactPin['gameId'];
  installation: string;
  eventAuthorization: 'public-wakeup';
  pictureSource: { server: string; agentId: string };
  preview: {
    version: 1;
    sourceOrigin: string;
    sourceAgentId: string;
    sourceIdentity: string;
    sourceConnectionId: string;
    incarnation: string;
    commit: string;
    artifacts: ArtifactPin;
    livePlay: boolean;
    status: 'pending' | 'connected';
    createdAt: number;
    installationIntent: InstallationIntent;
    code?: string;
  };
  previewParticipation?: ParticipationPin;
  cancelledPreviewParticipations?: Record<string, ParticipationPin>;
}

export function sha256(value: string | Uint8Array): string;
export function verifyPins(artifacts?: ArtifactPin): Promise<void>;
export function pinnedDocuments(
  artifacts: ArtifactPin,
): Promise<{ rules: string; skill: string; protocol: string }>;
// Dependency-free wire parser is the I/O boundary for the installed package.
export function validateManifest(
  // eslint-disable-next-line anti-slop/no-unknown-parameters
  value: unknown,
  sourceOrigin: string,
  target: { origin: string; incarnation: string; commit: string },
): PreviewArtifactManifest;
export function cacheArtifacts(manifest: PreviewArtifactManifest, gameId: string): Promise<ArtifactPin>;
