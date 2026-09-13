import { Schema } from 'effect';

/** Local-only instrumentation: native SQLite cursors remain the source of row counters. */
export interface BoundsReport {
  queries: {
    sql: string;
    rowsRead: number;
    rowsWritten: number;
    materializedRows: number;
    materializedBytes: number;
  }[];
  cloneCalls: number;
  maxCloneBytes: number;
  maxCloneEvents: number;
  maxStateWriteBytes: number;
}

const nativeClone = globalThis.structuredClone;

const encoder = new TextEncoder();

let active: BoundsMeter | null = null;

globalThis.structuredClone = function measuredClone<T>(value: T, options?: StructuredSerializeOptions): T {
  if (active) {
    const text = JSON.stringify(value, (key, entry) => {
      if (key === 'events' && Array.isArray(entry))
        active!.maxCloneEvents = Math.max(active!.maxCloneEvents, entry.length);

      return entry;
    });

    active.cloneCalls++;
    active.maxCloneBytes = Math.max(active.maxCloneBytes, encoder.encode(text).byteLength);
  }

  return nativeClone(value, options);
};

export class BoundsMeter {
  enabled = true;
  cloneCalls = 0;
  maxCloneBytes = 0;
  maxCloneEvents = 0;
  maxStateWriteBytes = 0;
  private queries: {
    sql: string;
    cursor: { readonly rowsRead: number; readonly rowsWritten: number };
    materializedRows: number;
    materializedBytes: number;
  }[] = [];

  reset(enabled = true) {
    this.enabled = enabled;
    this.queries = [];
    this.cloneCalls = 0;
    this.maxCloneBytes = 0;
    this.maxCloneEvents = 0;
    this.maxStateWriteBytes = 0;
    active = enabled ? this : null;
  }

  report(): BoundsReport {
    return {
      queries: this.queries.map(({ sql, cursor, materializedRows, materializedBytes }) => ({
        sql,
        rowsRead: cursor.rowsRead,
        rowsWritten: cursor.rowsWritten,
        materializedRows,
        materializedBytes,
      })),
      cloneCalls: this.cloneCalls,
      maxCloneBytes: this.maxCloneBytes,
      maxCloneEvents: this.maxCloneEvents,
      maxStateWriteBytes: this.maxStateWriteBytes,
    };
  }

  wrap(ctx: DurableObjectState): DurableObjectState {
    const nativeExec = ctx.storage.sql.exec.bind(ctx.storage.sql);
    Object.defineProperty(ctx.storage.sql, 'exec', {
      value: (query: string, ...bindings: SqlStorageValue[]) => {
        const cursor = nativeExec(query, ...bindings);

        if (this.enabled) {
          const entry = { sql: query, cursor, materializedRows: 0, materializedBytes: 0 };
          this.queries.push(entry);
          const nativeArray = cursor.toArray.bind(cursor);
          const nativeOne = cursor.one.bind(cursor);
          Object.defineProperty(cursor, 'toArray', {
            value() {
              const rows = nativeArray();
              entry.materializedRows += rows.length;
              entry.materializedBytes += encoder.encode(JSON.stringify(rows)).byteLength;

              return rows;
            },
          });
          Object.defineProperty(cursor, 'one', {
            value() {
              const row = nativeOne();
              entry.materializedRows++;
              entry.materializedBytes += encoder.encode(JSON.stringify(row)).byteLength;

              return row;
            },
          });

          if (/^(INSERT|UPDATE).*\b(game|replay_frames)\b/i.test(query))
            for (const binding of bindings)
              if (Schema.is(Schema.String)(binding))
                this.maxStateWriteBytes = Math.max(
                  this.maxStateWriteBytes,
                  encoder.encode(binding).byteLength,
                );
        }

        return cursor;
      },
      configurable: true,
    });

    return ctx;
  }
}
