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
  const provider = await startSuccessionProvider({ dialogue: process.env.TIM7_SILENT ? 'silent' : 'reply' });

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
    expect((await worker.fetch('/init')).ok).toBe(true);
    socket = new WebSocket(`ws://${worker.address}:${worker.port}/events?protocol=2`);
    const frames: Observation2[] = [];
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const packet: { observation: Observation2 } = JSON.parse(event.data);
      frames.push(packet.observation);
    });
    await expect.poll(() => frames.length).toBeGreaterThan(0);

    const response = await worker.fetch(
      `/run?phases=${process.env.TIM7_PHASES ?? 1}&lag=${process.env.TIM7_LAG ?? 0}`,
    );

    const text = await response.text();
    expect(response.ok, text).toBe(true);
    const trace: DialogueTrace = JSON.parse(text);
    expect(provider.errors).toEqual([]);
    expect(trace.reads.length, 'Every sequential activation must reach the HTTP provider').toBe(
      provider.requests.length,
    );

    for (const [index, read] of trace.reads.entries()) {
      expect(provider.requests[index].prompt.you?.seat).toBe(read.seat);
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
    const directory = resolve('.tim7', process.env.TIM7_NAME ?? 'latest');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'trace.json'),
      JSON.stringify({ trace, provider: provider.requests, frames, pages }, null, 2),
    );
    await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ ...report, delivery }, null, 2));

    // Deliberately red-capable acceptance signal. Diagnostic mode still emits all evidence.
    if (!process.env.TIM7_REPORT_ONLY)
      expect
        .soft(
          report.coverage.flatMap((phase) => phase.missing),
          'Eligible seats received no speaking activation',
        )
        .toEqual([]);

    if (!process.env.TIM7_REPORT_ONLY && !process.env.TIM7_SILENT)
      expect
        .soft(
          report.coverage.flatMap((phase) => phase.missingFollowup),
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
