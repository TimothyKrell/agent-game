import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { startSuccessionProvider } from './succession-provider-server';
import type { DialogueTrace } from './fixtures/dialogue-baseline-worker';
import { dialogueReport } from './fixtures/dialogue-baseline-report';
import type { HistoryPage2, Observation2 } from '../src/shared/succession';
import { SuccessionHistory } from '../src/client/succession-stream';

it('measures eligible speakers and fresh follow-up opportunities through the real house path', async () => {
  const requestedUsage = process.env.TIM26_USAGE;
  const usage = requestedUsage === 'ceiling' || requestedUsage === 'estimated' ? requestedUsage : 'fixture';

  const provider = await startSuccessionProvider({
    dialogue: process.env.TIM7_SILENT ? 'silent' : 'reply',
    controlled: process.env.TIM26_LATENCY !== undefined,
    usage,
  });

  const worker = await unstable_dev('tests/fixtures/dialogue-baseline-worker.ts', {
    config: 'tests/dialogue-baseline.wrangler.jsonc',
    local: true,
    persist: false,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    vars: { OPENAI_BASE_URL: provider.url, OPENAI_API_KEY: 'fixture-only-never-a-real-key' },
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });

  let socket: WebSocket | undefined;

  try {
    expect(
      (
        await worker.fetch(
          `/init?seed=${process.env.TIM26_SEED ?? 7}&houses=${process.env.TIM26_HOUSES ?? 10}`,
        )
      ).ok,
    ).toBe(true);
    socket = new WebSocket(`ws://${worker.address}:${worker.port}/events?protocol=2`);
    const frames: Observation2[] = [];
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const packet: { observation: Observation2 } = JSON.parse(event.data);
      frames.push(packet.observation);
    });
    await expect.poll(() => frames.length).toBeGreaterThan(0);

    const response = await worker.fetch(
      `/run?phases=${process.env.TIM7_PHASES ?? 1}&lag=${process.env.TIM7_LAG ?? 0}${process.env.TIM26_LATENCY === undefined ? '' : `&latency=${process.env.TIM26_LATENCY}`}`,
    );

    const text = await response.text();
    const directory = resolve('.tim7', process.env.TIM7_NAME ?? 'latest');
    await mkdir(directory, { recursive: true });

    if (!response.ok)
      await writeFile(
        resolve(directory, 'failure.json'),
        JSON.stringify({ text, provider: provider.requests }, null, 2),
      );
    expect(response.ok, text).toBe(true);
    const trace: DialogueTrace = JSON.parse(text);
    await writeFile(
      resolve(directory, 'trace.json'),
      JSON.stringify({ trace, provider: provider.requests }, null, 2),
    );
    expect(provider.errors).toEqual([]);
    expect(trace.reads.length, 'Each context read reaches inference or a recorded admission denial').toBe(
      provider.requests.length + trace.inference.reservations.filter((entry) => !entry.allowed).length,
    );

    for (const request of provider.requests) {
      expect(request.activation?.seat).toBe(request.prompt.you?.seat);
      expect(
        trace.reads.some(
          (read) => read.seat === request.activation?.seat && read.at === request.activation.at,
        ),
      ).toBe(true);
    }

    await expect.poll(() => frames.at(-1)?.history.streamHead).toBe(trace.observation.history.streamHead);
    const history = new SuccessionHistory();
    history.observe(trace.observation.history);
    const delivered: HistoryPage2['events'] = [];
    const pages: { after: number; cursor: number; through: number; bytes: number }[] = [];

    while (history.cursor < history.head) {
      const walk = history.request()!;

      const pageResponse = await worker.fetch(
        `/history?${new URLSearchParams({ epoch: walk.epoch, after: String(walk.after), through: String(walk.through) })}`,
      );

      const body = await pageResponse.text();
      const page: HistoryPage2 = JSON.parse(body);
      expect(history.accept(page, walk), body).toBe(true);
      delivered.push(...page.events);
      pages.push({
        after: page.after,
        cursor: page.cursor,
        through: page.through,
        bytes: Buffer.byteLength(body),
      });
    }

    expect(delivered.map((event) => event.eventKey)).toEqual(trace.events.map((event) => event.eventKey));

    for (const entry of trace.submissions.filter((entry) => entry.ok && entry.type === 'chat')) {
      expect(
        delivered.some(
          (event) =>
            event.type === 'chat' &&
            event.seat === entry.job.seat &&
            event.at === entry.at &&
            event.text === entry.text,
        ),
      ).toBe(true);
    }

    const report = dialogueReport(trace, provider.requests);

    const budgetExhaustion = usage === 'ceiling' || process.env.TIM26_EXPECT_INTERRUPTED === '1';

    if (!budgetExhaustion) {
      expect(trace.observation.status).not.toBe('interrupted');
      expect(
        report.coverage.flatMap((phase) => phase.missing),
        'Healthy fixtures cover every eligible seat',
      ).toEqual([]);
      expect(
        trace.phases.length >= Number(process.env.TIM7_PHASES ?? 1) ||
          trace.observation.status === 'finished',
      ).toBe(true);
    } else {
      expect(trace.observation.status, 'The charged fixture must expose the unchanged funding ceiling').toBe(
        'interrupted',
      );
      expect(trace.inference.summary.accountedUsd).toBeLessThanOrEqual(1.5);
      expect(trace.inference.reservations.some((entry) => !entry.allowed)).toBe(true);
    }

    if (process.env.TIM7_SILENT) {
      expect(report.acceptedChat).toBe(0);
      expect(report.silent).toBe(report.coverage.reduce((sum, phase) => sum + phase.eligible.length, 0));
    }

    if (
      process.env.TIM26_LATENCY === '1000' &&
      !Number(process.env.TIM7_LAG) &&
      Number(process.env.TIM26_HOUSES ?? 10) === 10 &&
      !budgetExhaustion &&
      !process.env.TIM7_SILENT
    )
      expect(
        report.coverage.flatMap((phase) => phase.missingFollowup),
        'One-second generation retains every meaningful follow-up',
      ).toEqual([]);

    for (const phase of trace.phases) {
      for (const seat of phase.eligible) {
        const slots = trace.houseJobs
          .map((row) => JSON.parse(row.data))
          .filter((job) => job.phaseId === phase.phaseId && job.seat === seat && job.kind === 'chat');

        expect(
          slots.length,
          'At most two optional activations, including silence and skips',
        ).toBeLessThanOrEqual(2);
      }
    }

    for (const reservation of trace.inference.reservations.filter(
      (entry) => entry.allowed && !entry.mandatory,
    ))
      expect(
        reservation.deadline - reservation.at,
        'Admitted chat has one second of usable generation time',
      ).toBeGreaterThanOrEqual(1150);

    if (Number(process.env.TIM26_LATENCY) > 0) {
      expect(trace.inference.peakConcurrent, 'Provider requests genuinely overlap').toBeGreaterThan(1);

      for (const sample of report.samples
        .flatMap((phase) => phase.activations)
        .filter((entry) => entry.virtualResponseMs !== null))
        expect(sample.virtualResponseMs).toBe(Number(process.env.TIM26_LATENCY));
    }

    expect(
      report.context.recentMissingLatest,
      'Latest accepted chat absent from entitled recent context',
    ).toBe(0);
    expect(
      report.context.promptMissingRecentLatest,
      'Latest recent chat absent from the provider request',
    ).toBe(0);
    expect(report.context.maxPromptBytes).toBeLessThanOrEqual(19_000);

    const delivery = {
      socketFrames: frames.length,
      socketHead: frames.at(-1)!.history.streamHead,
      deliveredHead: history.cursor,
      deliveredChats: delivered.filter((event) => event.type === 'chat').length,
      firstPageCursor: pages[0]?.cursor ?? 0,
      pages: pages.length,
      maxPageBytes: Math.max(0, ...pages.map((page) => page.bytes)),
    };

    console.log(
      '[TIM-7]',
      JSON.stringify({ ...report, coverage: undefined, samples: undefined, reads: undefined, delivery }),
    );
    await writeFile(
      resolve(directory, 'trace.json'),
      JSON.stringify({ trace, provider: provider.requests, frames, pages }, null, 2),
    );
    await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ ...report, delivery }, null, 2));

    // Admission/time skips are an explicit result, never a disguised successful activation.
    const missing = report.coverage.flatMap((phase) => [
      ...phase.missing.map((seat) => ({ phase, seat, ordinal: 0 })),
      ...(!process.env.TIM7_SILENT ? phase.missingFollowup.map((seat) => ({ phase, seat, ordinal: 1 })) : []),
    ]);

    const justified = missing.filter(({ phase, seat, ordinal }) => {
      const row = trace.houseJobs.find(
        (row) => row.id === `succession:${phase.phaseId}:${seat}:0:chat:${ordinal}`,
      );

      if (row?.outcome === 'admission-denied')
        return trace.inference.reservations.some(
          (entry) => entry.id.startsWith(`${row.id}:attempt:`) && !entry.allowed,
        );

      if (row?.outcome === 'insufficient-time') {
        const job: { dueAt: number; deadline: number } = JSON.parse(row.data);

        return Math.max(row.completedAt!, row.due_at, job.dueAt) + 1150 > job.deadline;
      }

      return false;
    });

    // Deliberately red-capable acceptance signal. Diagnostic mode still emits all evidence.
    if (!process.env.TIM7_REPORT_ONLY)
      expect
        .soft(
          missing.filter((entry) => entry.ordinal === 0 && !justified.includes(entry)),
          'Eligible seats received no speaking activation',
        )
        .toEqual([]);

    if (!process.env.TIM7_REPORT_ONLY && !process.env.TIM7_SILENT)
      expect
        .soft(
          missing.filter((entry) => entry.ordinal === 1 && !justified.includes(entry)),
          'A peer replied while there was time, but the speaker got no follow-up',
        )
        .toEqual([]);
  } finally {
    const connection = socket;

    if (connection?.readyState === WebSocket.OPEN)
      await new Promise<void>((resolve) => {
        connection.addEventListener('close', () => resolve(), { once: true });
        connection.close();
      });
    else connection?.close();
    await worker.stop();
    await provider.close();
  }
}, 120_000);
