import { DurableObject } from 'cloudflare:workers';
import { MatchHistory, jsonBytes } from '../../src/server/history';
import type { HistoryAudience, HistoryEvent, HistoryQuery } from '../../src/server/history';
import type { HistoryMetadata2 } from '../../src/shared/succession';

type FixtureCommand =
  | { type: 'append'; events: HistoryEvent[] }
  | { type: 'freeze'; seat: number }
  | { type: 'page'; audience: HistoryAudience; query: HistoryQuery }
  | { type: 'metadata'; audience: HistoryAudience }
  | { type: 'anchor'; audience: HistoryAudience; eventKey: string }
  | { type: 'populate'; count: number; escaping: boolean; expectedOffset?: number }
  | { type: 'current' };

export class HistoryFixture extends DurableObject<Record<string, never>> {
  private readonly history: MatchHistory;

  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    this.history = new MatchHistory(ctx.storage.sql);
    ctx.storage.transactionSync(() => this.history.initialize());
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS fixture_population_receipts (offset INTEGER PRIMARY KEY, provenance TEXT NOT NULL, result TEXT NOT NULL)',
    );
  }

  private populate(
    command: Extract<FixtureCommand, { type: 'populate' }>,
    failReceipt: boolean,
  ): HistoryMetadata2 {
    const { count, escaping, expectedOffset } = command;

    if (!Number.isInteger(count) || count < 1 || count > 64)
      throw new Error('Populate at most one bounded mutation per request');

    if (escaping !== true && escaping !== false) throw new Error('Invalid population encoding');

    if (expectedOffset !== undefined && (!Number.isSafeInteger(expectedOffset) || expectedOffset < 0))
      throw new Error('Invalid population offset');
    const audience = { seat: null, house: false, terminal: false };
    const provenance = JSON.stringify(['history-population-v1', count, escaping]);

    // MatchHistory.append is synchronous and does not open a transaction. The head check,
    // complete append and immutable receipt share this single fixture-owned transaction.
    return this.ctx.storage.transactionSync(() => {
      if (expectedOffset !== undefined) {
        const receipt = this.ctx.storage.sql
          .exec<{ provenance: string; result: string }>(
            'SELECT provenance, result FROM fixture_population_receipts WHERE offset=?',
            expectedOffset,
          )
          .toArray()[0];

        if (receipt) {
          if (receipt.provenance !== provenance) throw new Error('Conflicting population batch');

          return JSON.parse(receipt.result);
        }
      }

      const start = this.history.metadata(audience).streamHead;

      if (expectedOffset !== undefined && start !== expectedOffset)
        throw new Error(`Population offset ${expectedOffset} does not match stream head ${start}`);
      const text = (escaping ? '\u0000' : '🜁').repeat(1000);

      const batch: HistoryEvent[] = Array.from({ length: count }, (_, index) => ({
        eventKey: crypto.randomUUID(),
        // Ten simultaneous speakers, each at the legal five-second cooldown.
        at: Math.floor((start + index) / 10) * 5000,
        act: 2,
        round: Math.floor((start + index) / 2600) + 1,
        type: 'chat',
        seat: (start + index) % 10,
        text,
        visibility: 'public',
      }));

      this.history.append(batch);
      const result = this.history.metadata(audience);

      // Exercise a real SQLite failure after the append, before committing its receipt.
      if (failReceipt) this.ctx.storage.sql.exec('INSERT INTO fixture_missing_receipt_table VALUES (1)');

      if (expectedOffset !== undefined)
        this.ctx.storage.sql.exec(
          'INSERT INTO fixture_population_receipts VALUES (?, ?, ?)',
          expectedOffset,
          provenance,
          JSON.stringify(result),
        );

      return result;
    });
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

      return Response.json(this.populate(command, request.headers.get('x-fixture-receipt-failure') === '1'));
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 },
      );
    }
  }
}

interface PopulationFault {
  name: string;
  expectedOffset: number;
  stage: 'before' | 'after' | 'unrelated' | 'receipt';
  remaining: number;
}

const faults = new Map<string, PopulationFault>();

export default {
  async fetch(request, env) {
    const name = new URL(request.url).pathname;

    if (name === '/__population-fault') {
      const fault: PopulationFault = await request.json();
      faults.set(`/${fault.name}:${fault.expectedOffset}`, fault);

      return Response.json({ armed: true });
    }

    let fault: PopulationFault | undefined;

    if (faults.size) {
      const command: FixtureCommand = await request.clone().json();

      if (command.type === 'populate' && command.expectedOffset !== undefined) {
        const key = `${name}:${command.expectedOffset}`;
        fault = faults.get(key);

        if (fault && --fault.remaining === 0) faults.delete(key);
      }
    }

    if (fault?.stage === 'unrelated') throw new Error('History fixture non-transport failure');

    if (fault?.stage === 'before') throw new Error('Network connection lost.');

    if (fault?.stage === 'receipt') {
      const headers = new Headers(request.headers);
      headers.set('x-fixture-receipt-failure', '1');

      return env.HISTORY.getByName(name).fetch(new Request(request, { headers }));
    }

    const response = await env.HISTORY.getByName(name).fetch(request);

    if (fault?.stage === 'after' && response.ok) {
      // The DO output gate has confirmed the transaction. Lose its real acknowledgement.
      await response.arrayBuffer();
      throw new Error('Network connection lost.');
    }

    return response;
  },
} satisfies ExportedHandler<{ HISTORY: DurableObjectNamespace<HistoryFixture> }>;
