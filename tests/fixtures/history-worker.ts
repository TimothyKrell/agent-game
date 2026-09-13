import { DurableObject } from 'cloudflare:workers';
import { MatchHistory, jsonBytes } from '../../src/server/history';
import type { HistoryAudience, HistoryEvent, HistoryQuery } from '../../src/server/history';

type FixtureCommand =
  | { type: 'append'; events: HistoryEvent[] }
  | { type: 'freeze'; seat: number }
  | { type: 'page'; audience: HistoryAudience; query: HistoryQuery }
  | { type: 'metadata'; audience: HistoryAudience }
  | { type: 'anchor'; audience: HistoryAudience; eventKey: string }
  | { type: 'populate'; count: number; escaping: boolean }
  | { type: 'current' };

export class HistoryFixture extends DurableObject<Record<string, never>> {
  private readonly history: MatchHistory;

  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    this.history = new MatchHistory(ctx.storage.sql);
    ctx.storage.transactionSync(() => this.history.initialize());
  }

  override async fetch(request: Request): Promise<Response> {
    // The fixture endpoint is compiled only by its isolated local test configuration.
    const command: FixtureCommand = await request.json();

    try {
      if (command.type === 'append') {
        const result = this.ctx.storage.transactionSync(() => this.history.append(command.events));

        return Response.json(result);
      }

      if (command.type === 'freeze') {
        this.ctx.storage.transactionSync(() => this.history.freezeOriginal(command.seat));

        return Response.json({ frozen: true });
      }

      if (command.type === 'metadata') return Response.json(this.history.metadata(command.audience));

      if (command.type === 'anchor')
        return Response.json({ cursor: this.history.anchor(command.audience, command.eventKey) });

      if (command.type === 'page')
        return Response.json(this.history.page('match_history-fixture', command.audience, command.query));

      if (command.type === 'current') {
        const before = Date.now();
        const value = this.history.metadata({ seat: null, house: false, terminal: false });

        return Response.json({ value, bytes: jsonBytes(value), elapsedMs: Date.now() - before });
      }

      const text = (command.escaping ? '\u0000' : '🜁').repeat(1000);
      const start = this.history.metadata({ seat: null, house: false, terminal: false }).streamHead;

      if (command.count > 64) throw new Error('Populate at most one bounded mutation per request');

      for (let offset = 0; offset < command.count; offset += 64) {
        const batch: HistoryEvent[] = Array.from(
          { length: Math.min(64, command.count - offset) },
          (_, index) => ({
            eventKey: crypto.randomUUID(),
            // Ten simultaneous speakers, each at the legal five-second cooldown.
            at: Math.floor((start + offset + index) / 10) * 5000,
            act: 2,
            round: Math.floor((start + offset + index) / 2600) + 1,
            type: 'chat',
            seat: (start + offset + index) % 10,
            text,
            visibility: 'public',
          }),
        );

        this.ctx.storage.transactionSync(() => this.history.append(batch));
      }

      return Response.json(this.history.metadata({ seat: null, house: false, terminal: false }));
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 },
      );
    }
  }
}

export default {
  fetch(request, env) {
    return env.HISTORY.getByName(new URL(request.url).pathname).fetch(request);
  },
} satisfies ExportedHandler<{ HISTORY: DurableObjectNamespace<HistoryFixture> }>;
