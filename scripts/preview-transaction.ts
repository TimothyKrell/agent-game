import type { PreviewDatabase, PreviewStatement } from '../src/server/preview-config.ts';
import { requireCondition } from './preview-artifact.ts';

/** Compose accepted helpers without pretending a queued write has succeeded.
 * Every slot contributes exactly one run/batch; each receives its actual D1
 * result only after all guards and writes commit in ONE atomic request.
 * Slot order, not async crypto completion order, determines SQL order.
 */
export async function previewTransaction(
  database: PreviewDatabase,
  guards: PreviewStatement[],
  operations: ((database: PreviewDatabase) => Promise<void>)[],
): Promise<void> {
  requireCondition(operations.length > 0 && operations.length <= 3, 'Invalid preview transaction');

  const slots = operations.map(() => {
    let resolve!: (results: D1Result[]) => void;
    let reject!: (error: Error) => void;

    const promise = new Promise<D1Result[]>((yes, no) => {
      resolve = yes;
      reject = no;
    });

    return { promise, resolve, reject };
  });

  const queued: PreviewStatement[][] = operations.map(() => []);
  let started = false;

  const execute = async (index: number, statements: PreviewStatement[]) => {
    requireCondition(
      queued[index].length === 0 && statements.length > 0,
      'Preview helper issued more than one database operation',
    );
    queued[index] = statements;

    if (!started && queued.every((items) => items.length > 0)) {
      started = true;

      try {
        const results = await database.batch([...guards, ...queued.flat()]);
        let offset = guards.length;

        for (let i = 0; i < slots.length; i++) {
          slots[i].resolve(results.slice(offset, offset + queued[i].length));
          offset += queued[i].length;
        }
      } catch (error) {
        for (const slot of slots)
          slot.reject(error instanceof Error ? error : new Error('Preview transaction failed'));
      }
    }

    return slots[index].promise;
  };

  const jobs = operations.map(async (operation, index) => {
    const statements = new WeakMap<PreviewStatement, PreviewStatement>();

    const wrap = (statement: PreviewStatement): PreviewStatement => {
      const wrapped: PreviewStatement = {
        bind: (...values) => wrap(statement.bind(...values)),
        first: () => {
          throw new Error('Preview helper must use an atomic write operation');
        },
        run: async <T>() => {
          // SAFETY: T is the accepted helper's native D1 result contract.
          return (await execute(index, [statement]))[0] as D1Result<T>;
        },
      };

      statements.set(wrapped, statement);

      return wrapped;
    };

    try {
      await operation({
        prepare: (sql) => wrap(database.prepare(sql)),
        batch: async <T>(items: PreviewStatement[]) => {
          const native = items.map((item) => {
            const found = statements.get(item);
            requireCondition(found !== undefined, 'Cross-transaction preview statement');

            return found;
          });

          // SAFETY: T is the accepted helper's native D1 result contract.
          return (await execute(index, native)) as D1Result<T>[];
        },
      });
      requireCondition(queued[index].length > 0, 'Preview helper did not submit its operation');
    } catch (error) {
      for (const slot of slots)
        slot.reject(error instanceof Error ? error : new Error('Preview transaction failed'));
      throw error;
    }
  });

  // Register rejection handlers for all slots, including an operation which
  // rejects during validation before issuing a database call.
  await Promise.all([...jobs, ...slots.map((slot) => slot.promise)]);
}

export interface SourceRevision {
  incarnation: string;
  commit_id: string;
  public_key: string;
  closed_at: number | null;
}

export interface TargetRevision {
  incarnation: string;
  commit_id: string;
}

export function sourceRevision(db: PreviewDatabase, origin: string) {
  return db
    .prepare('SELECT incarnation,commit_id,public_key,closed_at FROM preview_arenas WHERE origin=?')
    .bind(origin)
    .first<SourceRevision>();
}

export function targetRevision(db: PreviewDatabase) {
  return db.prepare('SELECT incarnation,commit_id FROM preview_runtime WHERE id=1').first<TargetRevision>();
}

// JSON's invalid-input error aborts the entire D1 transaction. These fixed,
// parameterized read guards never write control-plane SQL outside the accepted
// helpers. Exact preimages fence late writes; exact desired images allow retry.
export function sourceGuard(
  db: PreviewDatabase,
  origin: string,
  before: SourceRevision | null,
  desired: SourceRevision,
) {
  return db
    .prepare(
      `SELECT CASE WHEN
    (?=1 AND NOT EXISTS(SELECT 1 FROM preview_arenas WHERE origin=?)) OR
    EXISTS(SELECT 1 FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND public_key=? AND closed_at IS ?) OR
    EXISTS(SELECT 1 FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND public_key=? AND closed_at IS ?)
    THEN 1 ELSE json('preview-generation-conflict') END AS accepted`,
    )
    .bind(
      before === null ? 1 : 0,
      origin,
      origin,
      before?.incarnation ?? '',
      before?.commit_id ?? '',
      before?.public_key ?? '',
      before?.closed_at ?? null,
      origin,
      desired.incarnation,
      desired.commit_id,
      desired.public_key,
      desired.closed_at,
    );
}

export function targetGuard(db: PreviewDatabase, before: TargetRevision | null, desired: TargetRevision) {
  return db
    .prepare(
      `SELECT CASE WHEN
    (?=1 AND NOT EXISTS(SELECT 1 FROM preview_runtime WHERE id=1)) OR
    EXISTS(SELECT 1 FROM preview_runtime WHERE id=1 AND incarnation=? AND commit_id=?) OR
    EXISTS(SELECT 1 FROM preview_runtime WHERE id=1 AND incarnation=? AND commit_id=?)
    THEN 1 ELSE json('preview-generation-conflict') END AS accepted`,
    )
    .bind(
      before === null ? 1 : 0,
      before?.incarnation ?? '',
      before?.commit_id ?? '',
      desired.incarnation,
      desired.commit_id,
    );
}
