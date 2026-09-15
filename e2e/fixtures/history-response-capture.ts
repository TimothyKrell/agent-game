import type { Page, Request, Response } from '@playwright/test';

/** Own native history-body capture through test-directed navigation. */
export function captureHistoryResponses(page: Page, consume: (response: Response) => Promise<void>) {
  const errors: string[] = [];
  const cancelled: { url: string; reason: string }[] = [];
  const pending = new Map<Request, { task: Promise<void>; finish: (failure: string | null) => void }>();

  const lifecycle: {
    url: string;
    generation: number;
    outcome: 'pending' | 'captured' | 'cancelled' | 'error';
  }[] = [];

  const boundaries: { generation: number; admitted: number; pending: number }[] = [];
  let generation = 0;

  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/history')) return;
    const record: (typeof lifecycle)[number] = { url: request.url(), generation, outcome: 'pending' };
    lifecycle.push(record);
    let finish: (failure: string | null) => void = () => {};

    const finished = new Promise<string | null>((resolve) => {
      finish = resolve;
    });

    // Register before headers arrive, and begin body capture as soon as the response exists.
    // Keep failures handled immediately, but classify them only after the native terminal event.
    const body = (async () => {
      const response = await request.response();

      if (!response?.ok()) throw new Error(`History response failed: ${request.url()}`);
      await consume(response);
    })().then(
      () => null,
      (error: Error) => error,
    );

    const task = (async () => {
      const [error, failure] = await Promise.all([body, finished]);

      if (failure) {
        cancelled.push({ url: request.url(), reason: failure });
        record.outcome = 'cancelled';

        if (failure !== 'net::ERR_ABORTED')
          errors.push(`History request failed: ${request.url()}: ${failure}`);
      } else if (error) {
        record.outcome = 'error';
        errors.push(error.message);
      } else record.outcome = 'captured';
      pending.delete(request);
    })();

    pending.set(request, { task, finish });
  });
  page.on('requestfailed', (request) => {
    pending.get(request)?.finish(request.failure()?.errorText ?? 'Unknown failure');
  });
  page.on('requestfinished', (request) => {
    pending.get(request)?.finish(null);
  });

  async function drain() {
    // Await later admissions too: Promise.all over one mutable array is only a snapshot.
    while (pending.size) await Promise.all([...pending.values()].map((record) => record.task));
  }

  return {
    errors,
    cancelled,
    lifecycle,
    boundaries,
    drain,
    async navigate<T>(action: () => Promise<T>): Promise<T> {
      await drain();
      boundaries.push({ generation, admitted: lifecycle.length, pending: pending.size });
      generation++;

      // Invoke navigation in the same turn as the final drain; callers must not insert page work here.
      return action();
    },
  };
}
