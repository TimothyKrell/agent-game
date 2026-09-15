import { Schema } from 'effect';
import type { PreviewDatabase, PreviewStatement } from '../src/server/preview-config.ts';
import { requireCondition } from './preview-artifact.ts';
import { boundedResponse } from './preview-github.ts';

export const databaseIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const Parameter = Schema.Union([Schema.String, Schema.Number.check(Schema.isFinite()), Schema.Null]);

const Metadata = Schema.Struct({
  duration: Schema.Number,
  size_after: Schema.Number,
  rows_read: Schema.Number,
  rows_written: Schema.Number,
  last_row_id: Schema.Number,
  changed_db: Schema.Boolean,
  changes: Schema.Number,
});

const Envelope = Schema.Struct({
  success: Schema.Literal(true),
  errors: Schema.Array(Schema.Unknown),
  result: Schema.Array(
    Schema.Struct({
      success: Schema.Literal(true),
      results: Schema.Array(
        Schema.Record(Schema.String, Schema.Union([Parameter, Schema.Array(Schema.Number)])),
      ),
      meta: Metadata,
    }),
  ),
});

/** Deployer-only D1 transport. One batch is one request and one D1 transaction. */
export function previewD1(
  accountId: string,
  databaseId: string,
  token: string,
  fetcher: typeof fetch = fetch,
): PreviewDatabase {
  requireCondition(
    /^[a-f0-9]{32}$/.test(accountId) && databaseIdPattern.test(databaseId) && token.length > 0,
    'Invalid trusted D1 resource or credential',
  );
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const statements = new WeakMap<PreviewStatement, { sql: string; params: (string | number | null)[] }>();

  async function batch<T>(items: PreviewStatement[]): Promise<D1Result<T>[]> {
    requireCondition(items.length > 0 && items.length <= 16, 'Invalid D1 batch size');

    const queries = items.map((item) => {
      const query = statements.get(item);
      requireCondition(query !== undefined, 'D1 statement belongs to another database');

      return query;
    });

    const body = JSON.stringify({ batch: queries });
    requireCondition(Buffer.byteLength(body) <= 128 * 1024, 'D1 request exceeds byte limit');
    // No automatic retry: lost acknowledgements are resolved by the lifecycle's
    // guarded idempotent operation and authoritative readback, not blind replay.
    let response: Response;

    try {
      response = await fetcher(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      });
    } catch {
      throw new Error('D1 acknowledgement unavailable; lifecycle recovery required');
    }

    requireCondition(response.ok, `D1 request failed (${response.status}); lifecycle recovery required`);
    let decoded: typeof Envelope.Type;

    try {
      const bytes = await boundedResponse(response, 1024 * 1024);
      decoded = Schema.decodeUnknownSync(Envelope)(JSON.parse(bytes.toString('utf8')), {
        onExcessProperty: 'preserve',
      });
    } catch {
      // Cloudflare error text can quote SQL parameters, including ciphertext.
      throw new Error('Malformed D1 result; lifecycle recovery required');
    }

    requireCondition(
      decoded.errors.length === 0 && decoded.result.length === items.length,
      'Incomplete or failed D1 batch; lifecycle recovery required',
    );

    // SAFETY: the transport validated the D1 envelope, metadata and SQL value
    // domain. T is the caller's row contract, exactly as in native D1's API.
    return decoded.result as D1Result<T>[];
  }

  function statement(sql: string, params: (string | number | null)[]): PreviewStatement {
    requireCondition(
      sql.length > 0 && Buffer.byteLength(sql) <= 32 * 1024 && params.length <= 64,
      'Invalid bounded D1 statement',
    );
    Schema.decodeUnknownSync(Schema.Array(Parameter))(params);

    const item: PreviewStatement = {
      bind: (...values) => statement(sql, values),
      run: async <T>() => (await batch<T>([item]))[0],
      first: async <T>() => (await batch<T>([item]))[0].results[0] ?? null,
    };

    statements.set(item, { sql, params });

    return item;
  }

  return { prepare: (sql) => statement(sql, []), batch };
}
