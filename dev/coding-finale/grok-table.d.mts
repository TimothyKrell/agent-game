import type { Schema } from 'effect';

export function opencode(path: string, body?: Schema.Json): Promise<Schema.Json>;
export function requireReady(sessionId: string, api?: typeof opencode): Promise<void>;
export function admitReadyTable<Bot extends { name: string }, Result>(
  bots: Bot[],
  hooks: { ready: (bot: Bot) => Promise<void>; join: (bot: Bot) => Promise<Result> },
): Promise<Result[]>;
