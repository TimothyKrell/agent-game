import { mkdir, open, readFile, rm, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { writeJsonDurably } from './durable-json.mjs';

/** Exclusive installation lock. Ambiguous ownership fails closed. */
export async function lockLedger(path) {
  const lock = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const acquire = async () => {
    const ownerPath = `${lock}.${randomUUID()}.owner`;
    const file = await open(ownerPath, 'wx', 0o600);

    try {
      await file.writeFile(JSON.stringify({ pid: process.pid }));
      await file.sync();
    } finally {
      await file.close();
    }

    try {
      await link(ownerPath, lock);
    } finally {
      await rm(ownerPath);
    }
  };

  const busy = () =>
    Object.assign(new Error('This installation already has an active supervisor or lock recovery.'), {
      code: 'ELOCKED',
    });

  try {
    await acquire();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recovery = `${lock}.recovery`;

    try {
      await mkdir(recovery, { mode: 0o700 });
    } catch (guard) {
      if (guard.code === 'EEXIST') throw busy();
      throw guard;
    }

    try {
      let owner;

      try {
        owner = JSON.parse(await readFile(lock, 'utf8'));
      } catch (readError) {
        if (readError.code !== 'ENOENT') throw readError;
      }

      if (owner) {
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
          throw new Error('Ambiguous lock owner; refusing to unlock.');

        try {
          process.kill(owner.pid, 0);
          throw busy();
        } catch (probe) {
          if (probe.code === 'EPERM') throw busy();

          if (probe.code !== 'ESRCH') throw probe;
        }

        await rm(lock);
      }

      try {
        await acquire();
      } catch (raced) {
        if (raced.code === 'EEXIST') throw busy();
        throw raced;
      }
    } finally {
      await rm(recovery, { recursive: true });
    }
  }

  return () => rm(lock);
}

export async function loadLedger(path) {
  try {
    const ledger = JSON.parse(await readFile(path, 'utf8'));

    if (ledger.version !== 1) throw new Error('Unsupported supervisor ledger.');

    const counters = [
      ledger.revision,
      ledger.elapsedMs,
      ledger.queueElapsedMs,
      ledger.errors,
      ledger.premature,
      ledger.invocations,
      ledger.lastNow,
      ledger.accounting?.known,
      ledger.accounting?.watermark,
    ];

    const limits = Object.values(ledger.allowances ?? {});

    if (
      counters.some((value) => !Number.isFinite(value) || value < 0) ||
      limits.length !== 3 ||
      limits.some((value) => !Number.isFinite(value) || value <= 0)
    )
      throw new Error('Invalid supervisor ledger accounting or clocks.');

    if (!['enforced', 'provider-managed'].includes(ledger.accounting.mode))
      throw new Error('Invalid supervisor accounting mode.');

    if (
      ledger.accounting.mode === 'enforced' &&
      (!Number.isFinite(ledger.accounting.limit) ||
        ledger.accounting.limit <= 0 ||
        (ledger.child && (!Number.isFinite(ledger.child.outstanding) || ledger.child.outstanding < 0)))
    )
      throw new Error('Invalid supervisor reservation.');

    return ledger;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveLedger(path, ledger) {
  ledger.revision++;
  await writeJsonDurably(path, ledger);
}

export function remainingBudget(ledger) {
  if (ledger.accounting.mode === 'enforced' && ledger.accounting.unknown && !ledger.child) return 0;

  return ledger.accounting.mode === 'enforced'
    ? Math.max(0, ledger.accounting.limit - ledger.accounting.known - (ledger.child?.outstanding ?? 0))
    : null;
}

/** Reports are totals, never deltas; session totals use a durable watermark. */
export function accountUsage(ledger, report) {
  if (
    !ledger.child ||
    !['invocation', 'session'].includes(report.scope) ||
    !Number.isFinite(report.total) ||
    report.total < 0
  )
    throw new Error('Invalid child usage report.');
  const child = ledger.child;
  const previous = report.scope === 'session' ? ledger.accounting.watermark : child.reported;

  if ((child.scope && child.scope !== report.scope) || report.total < previous)
    throw new Error('Usage report changed scope or decreased; reservation remains unresolved.');

  child.scope = report.scope;
  const delta = Math.max(0, report.total - previous);

  if (report.scope === 'session') ledger.accounting.watermark = Math.max(previous, report.total);
  child.reported = Math.max(child.reported, report.total);
  child.consumed += delta;
  ledger.accounting.known += delta;
  ledger.accounting.observed = true;

  if (child.outstanding !== null) child.outstanding = Math.max(0, child.outstanding - delta);

  if (child.grant !== null && child.consumed > child.grant) ledger.accounting.exceeded = true;

  if (report.final) {
    child.settled = true;
    child.outstanding = 0;
  }
}
