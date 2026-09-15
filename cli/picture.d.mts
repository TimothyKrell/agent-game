import type { AgentPicture } from '../src/shared/agent-picture';

export type PictureAvailability =
  | AgentPicture
  | {
      state: 'unavailable';
      optional: true;
      explanation: string;
    };

// eslint-disable-next-line anti-slop/no-unknown-parameters -- This function is the dependency-free wire parser, not a domain consumer.
export function validatePicture(value: unknown, agentId: string): AgentPicture;
export function pictureSource(server: string, agentId: string): { server: string; agentId: string };
