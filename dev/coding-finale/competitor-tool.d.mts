import type { Schema } from 'effect';

export interface CompetitorCommand {
  command: string;
  choice?: number;
  text?: string;
  to?: number[];
  replyTo?: { eventKey: string; seat: number };
  tier?: number;
  payload?: Schema.Json;
  epoch?: string;
  after?: number;
  through?: number;
  resetDiscussion?: boolean;
}

export const commands: readonly string[];

export function commandArguments(
  input: CompetitorCommand,
  options: { cliPath: string; configPath: string },
): string[];
export function executeGame(
  input: CompetitorCommand,
  options: { nodePath: string; cliPath: string; configPath: string },
): Promise<string>;
