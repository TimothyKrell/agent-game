import { GameError } from '../game/types';
import type { AuthorizedEvent2, HistoryMetadata2, HistoryPage2 } from '../shared/succession';

export type HistoryEvent = Omit<AuthorizedEvent2, 'id'> & {
  visibility: 'public' | 'archive' | number;
};

export interface HistoryAudience {
  seat: number | null;
  house: boolean;
  terminal: boolean;
}

export interface HistoryQuery {
  epoch?: string;
  after?: number;
  through?: number;
  limit?: number;
  maxBytes?: number;
}

type StreamRow = {
  name: string;
  head: number;
  epoch: string;
};

type CutoffRow = {
  seat: number;
  seat_head: number;
  public_head: number;
};

const encoder = new TextEncoder();

export function jsonBytes<T>(value: T): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

/** Fixed public/seat indexes over the MatchObject's append-only canonical event table. */
export class MatchHistory {
  constructor(private readonly sql: SqlStorage) {
    sql.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    sql.exec(
      'CREATE TABLE IF NOT EXISTS history_heads (name TEXT PRIMARY KEY, head INTEGER NOT NULL, epoch TEXT NOT NULL)',
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS history_streams (stream TEXT NOT NULL, seq INTEGER NOT NULL, event_id INTEGER NOT NULL, PRIMARY KEY (stream, seq))',
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS history_cutoffs (seat INTEGER PRIMARY KEY, seat_head INTEGER NOT NULL, public_head INTEGER NOT NULL)',
    );
    sql.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS events_event_key ON events(json_extract(data, '$.eventKey'))",
    );
    sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS history_stream_events ON history_streams(stream, event_id)');
  }

  initialize(id: () => string = () => crypto.randomUUID()): void {
    for (const name of ['archive', 'public', ...Array.from({ length: 10 }, (_, seat) => `seat:${seat}`)]) {
      if (!this.sql.exec('SELECT name FROM history_heads WHERE name = ?', name).toArray().length)
        this.sql.exec('INSERT INTO history_heads (name, head, epoch) VALUES (?, 0, ?)', name, id());
    }

    for (let seat = 0; seat < 10; seat++) {
      const name = `original:${seat}`;

      if (!this.sql.exec('SELECT name FROM history_heads WHERE name = ?', name).toArray().length)
        this.sql.exec('INSERT INTO history_heads (name, head, epoch) VALUES (?, 0, ?)', name, id());
    }
  }

  private stream(name: string): StreamRow {
    const row = this.sql
      .exec<StreamRow>('SELECT name, head, epoch FROM history_heads WHERE name = ?', name)
      .toArray()[0];

    if (!row) throw new Error('Missing durable history stream');

    return row;
  }

  private cutoff(seat: number): CutoffRow | null {
    return (
      this.sql
        .exec<CutoffRow>('SELECT seat, seat_head, public_head FROM history_cutoffs WHERE seat = ?', seat)
        .toArray()[0] ?? null
    );
  }

  /** Fence original private entitlement before appending a takeover's new private facts. */
  freezeOriginal(seat: number): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO history_cutoffs (seat, seat_head, public_head) VALUES (?, ?, ?)',
      seat,
      this.stream(`seat:${seat}`).head,
      this.stream('public').head,
    );
  }

  metadata(audience: HistoryAudience): HistoryMetadata2 {
    if (audience.terminal) {
      const stream = this.stream('archive');

      return { visibilityEpoch: stream.epoch, streamHead: stream.head };
    }

    if (audience.seat === null) {
      const stream = this.stream('public');

      return { visibilityEpoch: stream.epoch, streamHead: stream.head };
    }

    const seatStream = this.stream(`seat:${audience.seat}`);
    const cutoff = audience.house ? null : this.cutoff(audience.seat);

    return {
      visibilityEpoch: audience.house ? seatStream.epoch : this.stream(`original:${audience.seat}`).epoch,
      streamHead: cutoff
        ? cutoff.seat_head + this.stream('public').head - cutoff.public_head
        : seatStream.head,
    };
  }

  /** Caller commits board, append, receipt and outbox in the same synchronous transaction. */
  append(events: readonly HistoryEvent[]) {
    if (events.length > 64) throw new Error('Evolution exceeds the 64-fact append limit');
    let head = this.stream('archive').head;
    const first = head + 1;

    for (const event of events) {
      if (jsonBytes({ ...event, id: head + 1 }) > 8192) throw new Error('Canonical event exceeds 8 KiB');

      if (
        event.visibility !== 'public' &&
        event.visibility !== 'archive' &&
        (!Number.isInteger(event.visibility) || event.visibility < 0 || event.visibility > 9)
      )
        throw new Error('Invalid canonical event entitlement');

      head++;
      this.sql.exec('INSERT INTO events (id, data) VALUES (?, ?)', head, JSON.stringify(event));

      if (event.visibility === 'archive') continue;

      const streams =
        event.visibility === 'public'
          ? ['public', ...Array.from({ length: 10 }, (_, seat) => `seat:${seat}`)]
          : [`seat:${event.visibility}`];

      for (const stream of streams) {
        const sequence = this.stream(stream).head + 1;
        this.sql.exec(
          'INSERT INTO history_streams (stream, seq, event_id) VALUES (?, ?, ?)',
          stream,
          sequence,
          head,
        );
        this.sql.exec('UPDATE history_heads SET head = ? WHERE name = ?', sequence, stream);
      }
    }

    this.sql.exec('UPDATE history_heads SET head = ? WHERE name = ?', head, 'archive');

    return { first, through: head };
  }

  private range(
    stream: string,
    after: number,
    through: number,
    limit: number,
    offset = 0,
  ): AuthorizedEvent2[] {
    const rows = this.sql
      .exec<{ seq: number; data: string }>(
        'SELECT s.seq, e.data FROM history_streams s JOIN events e ON e.id = s.event_id WHERE s.stream = ? AND s.seq > ? AND s.seq <= ? ORDER BY s.seq LIMIT ?',
        stream,
        after,
        through,
        limit,
      )
      .toArray();

    return rows.map((row) => this.project(row.data, row.seq + offset));
  }

  private project(data: string, id: number): AuthorizedEvent2 {
    // Only application-owned, byte-bounded canonical rows reach this decoder.
    const event: HistoryEvent = JSON.parse(data);
    const { visibility: _visibility, ...authorized } = event;

    return { ...authorized, id };
  }

  private read(audience: HistoryAudience, after: number, through: number, limit: number): AuthorizedEvent2[] {
    if (audience.terminal)
      return this.sql
        .exec<{ id: number; data: string }>(
          'SELECT id, data FROM events WHERE id > ? AND id <= ? ORDER BY id LIMIT ?',
          after,
          through,
          limit,
        )
        .toArray()
        .map((row) => this.project(row.data, row.id));

    if (audience.seat === null) return this.range('public', after, through, limit);
    const cutoff = audience.house ? null : this.cutoff(audience.seat);

    if (!cutoff) return this.range(`seat:${audience.seat}`, after, through, limit);

    const prefix =
      after < cutoff.seat_head
        ? this.range(`seat:${audience.seat}`, after, Math.min(through, cutoff.seat_head), limit)
        : [];

    if (prefix.length === limit || through <= cutoff.seat_head) return prefix;
    const offset = cutoff.seat_head - cutoff.public_head;

    const tail = this.range(
      'public',
      Math.max(after, cutoff.seat_head) - offset,
      through - offset,
      limit - prefix.length,
      offset,
    );

    return [...prefix, ...tail];
  }

  page(matchId: string, audience: HistoryAudience, query: HistoryQuery): HistoryPage2 {
    const metadata = this.metadata(audience);
    const limit = query.limit ?? 32;
    const maxBytes = query.maxBytes ?? 16_384;

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64)
      throw new GameError('invalid-history-limit', 'History limit must be an integer from 1 to 64.', 400);

    if (!Number.isSafeInteger(maxBytes) || maxBytes < 12_288 || maxBytes > 32_768)
      throw new GameError('invalid-history-bytes', 'History maxBytes must be 12288–32768.', 400);

    const reset = query.epoch !== metadata.visibilityEpoch;
    const after = reset ? 0 : (query.after ?? 0);
    const through = reset ? metadata.streamHead : (query.through ?? metadata.streamHead);

    const page: HistoryPage2 = {
      protocolVersion: '2',
      gameId: 'succession',
      matchId,
      ...metadata,
      after,
      through,
      cursor: after,
      events: [],
      hasMore: after < through,
      reset,
    };

    if (reset) return page;

    if (
      !Number.isSafeInteger(after) ||
      !Number.isSafeInteger(through) ||
      after < 0 ||
      after > through ||
      through > metadata.streamHead
    )
      throw new GameError('invalid-history-range', 'Require 0 <= after <= through <= streamHead.', 400);

    for (const event of this.read(audience, after, through, limit)) {
      page.events.push(event);
      const previous = page.cursor;
      page.cursor = event.id;
      page.hasMore = page.cursor < through;

      if (jsonBytes(page) > maxBytes) {
        page.events.pop();
        page.cursor = previous;
        page.hasMore = page.cursor < through;
        break;
      }
    }

    if (after < through && !page.events.length) throw new Error('History page cannot make progress');

    return page;
  }

  recent(audience: HistoryAudience): AuthorizedEvent2[] {
    const metadata = this.metadata(audience);

    return this.read(audience, Math.max(0, metadata.streamHead - 64), metadata.streamHead, 64);
  }

  anchor(audience: HistoryAudience, eventKey: string): number | null {
    if (!eventKey || eventKey.length > 256)
      throw new GameError('invalid-history-anchor', 'A bounded event key is required.', 400);

    const event = this.sql
      .exec<{ id: number }>("SELECT id FROM events WHERE json_extract(data, '$.eventKey') = ?", eventKey)
      .toArray()[0];

    if (!event) return null;

    if (audience.terminal) return event.id;
    const stream = audience.seat === null ? 'public' : `seat:${audience.seat}`;

    const row = this.sql
      .exec<{ seq: number }>(
        'SELECT seq FROM history_streams WHERE stream = ? AND event_id = ?',
        stream,
        event.id,
      )
      .toArray()[0];

    if (!row) return null;
    const cutoff = audience.seat === null || audience.house ? null : this.cutoff(audience.seat);

    if (!cutoff || row.seq <= cutoff.seat_head) return row.seq;

    const publicRow = this.sql
      .exec<{ seq: number }>(
        "SELECT seq FROM history_streams WHERE stream = 'public' AND event_id = ? AND seq > ?",
        event.id,
        cutoff.public_head,
      )
      .toArray()[0];

    return publicRow ? cutoff.seat_head + publicRow.seq - cutoff.public_head : null;
  }
}
