import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { startSuccessionProvider } from './succession-provider-server';
import type { DialogueTrace } from './fixtures/dialogue-baseline-worker';
import { dialogueReport } from './fixtures/dialogue-baseline-report';
import type { HistoryPage2, Observation2 } from '../src/shared/succession';
import { SuccessionHistory } from '../src/client/succession-stream';
import type { HouseJob } from '../src/server/house-contract';

it('measures eligible speakers and fresh follow-up opportunities through the real house path', async () => {
  const requestedUsage = process.env.TIM26_USAGE;
  const usage = requestedUsage === 'ceiling' || requestedUsage === 'estimated' ? requestedUsage : 'fixture';

  const provider = await startSuccessionProvider({
    dialogue: process.env.TIM7_SILENT ? 'silent' : process.env.TIM26_SILENT_FIRST ? 'silent-first' : 'reply',
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
      `/run?phases=${process.env.TIM7_PHASES ?? 1}&lag=${process.env.TIM7_LAG ?? 0}&peerAt=${process.env.TIM26_PEER_AT ?? 4000}${process.env.TIM26_LATENCY === undefined ? '' : `&latency=${process.env.TIM26_LATENCY}`}${process.env.TIM26_RECOVERY ? '&recovery=1' : ''}${process.env.TIM26_REQUIRED_PRESSURE ? '&requiredPressure=1' : ''}`,
    );

    const text = await response.text();
    const directory = resolve('test-results/dialogue', process.env.TIM7_NAME ?? 'latest');
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

    if (process.env.TIM26_REQUIRED_PRESSURE) {
      expect(trace.coldRestarts).toBe(1);
      const denial = trace.inference.reservations.find((row) => row.mandatory && !row.allowed)!;
      expect(denial).toMatchObject({ reason: 'match-budget', retryable: true });
      const funded = trace.inference.reservations.find((row) => row.id === denial.id && row.allowed)!;
      expect(funded.at - denial.at).toBe(1000);
      expect(trace.houseJobs.find((row) => `${row.id}:attempt:1` === denial.id)).toMatchObject({
        attempts: 1,
        outcome: 'accepted',
      });
      expect(trace.inference.usage.filter((row) => row.id === denial.id)).toHaveLength(1);
      expect(
        trace.submissions.filter((row) => `${row.job.id}:attempt:1` === denial.id && row.ok),
      ).toHaveLength(1);
      expect(trace.inference.usage.find((row) => row.id === 'fixture-held-required')).toMatchObject({
        done: 1,
        actual: 0,
      });
      expect(trace.inference.summary.calls).toBe(provider.requests.length + 1);
    }

    if (process.env.TIM26_SILENT_FIRST) {
      const phase = trace.phases[0];

      for (const seat of phase.eligible) {
        const calls = provider.requests.filter(
          (entry) => entry.prompt.task === 'chat' && entry.prompt.you?.seat === seat,
        );

        expect(
          calls,
          'A silent first activation receives one fresh peer-triggered second activation',
        ).toHaveLength(2);
        expect(calls[0].message).toBeNull();
        const peerAt = phase.start + Number(process.env.TIM26_PEER_AT ?? 4000);
        const firstCompletion = calls[0].activation!.at + Number(process.env.TIM26_LATENCY);

        if (process.env.TIM26_PEER_AT === '1000') expect(firstCompletion).toBeGreaterThan(peerAt);
        else expect(firstCompletion).toBeLessThan(peerAt);
        expect(calls[1].activation!.at).toBeGreaterThanOrEqual(Math.max(peerAt, firstCompletion + 5000));
        expect(calls[1].prompt.chat.some((entry) => entry.text.startsWith('External seat'))).toBe(true);
        expect(
          trace.submissions.filter((entry) => entry.job.seat === seat && entry.type === 'chat' && entry.ok),
        ).toHaveLength(process.env.TIM7_SILENT ? 0 : 1);
      }

      expect(report.coverage[0].followupWanted).toHaveLength(phase.eligible.length);
      expect(report.coverage[0].missingFollowup).toEqual([]);
    }

    if (process.env.TIM26_RECOVERY) {
      expect(trace.coldRestarts).toBe(1);
      const repeated = trace.silenceCompletions.find((entry) => entry.repeated)!;
      expect(repeated).toBeDefined();
      expect(repeated.stored).toBe(
        trace.silenceCompletions.find((entry) => entry.job === repeated.job)!.stored,
      );
      const job = trace.houseJobs.find((entry) => entry.id === repeated.job)!;
      expect(job).toMatchObject({ attempts: 1, status: 'done', outcome: 'silent' });
      expect(
        trace.inference.reservations.filter(
          (entry) => entry.allowed && entry.id.startsWith(`${job.id}:attempt:`),
        ),
      ).toHaveLength(1);
    }

    const budgetExhaustion = usage === 'ceiling' || process.env.TIM26_EXPECT_INTERRUPTED === '1';
    const budgetGate = process.env.TIM26_BUDGET_GATE === '1';

    if (budgetGate) {
      expect(trace.observation.status, 'Budget protection completes the real full path').toBe('finished');
      expect(trace.inference.summary.accountedUsd).toBeLessThanOrEqual(1.5);
      const actions = provider.requests.filter((entry) => entry.prompt.task === 'action');

      if (Number(process.env.TIM26_SEED ?? 7) === 7) {
        expect(trace.phases).toHaveLength(178);
        expect(actions).toHaveLength(392);
      }

      const unserved = trace.houseJobs.filter((row) => {
        const job: HouseJob = JSON.parse(row.data);

        return job.kind === 'action' && row.status === 'done' && row.response === null;
      });

      expect(unserved, 'No required job is lost to optional inference or timeout').toEqual([]);
      const funded = report.inference.funding;
      expect(
        funded.filter((row) => row.kind !== 'required').reduce((n, row) => n + row.accountedUsd, 0),
      ).toBeLessThanOrEqual(0.75);
      expect(funded.find((row) => row.kind === 'followup')!.accountedUsd).toBeLessThanOrEqual(0.1875);

      const followups = Array.from(
        { length: 10 },
        (_, seat) => report.coverage.filter((phase) => phase.followupActivated.includes(seat)).length,
      );

      expect(Math.min(...followups), 'Every seat shares the funded follow-ups').toBeGreaterThan(0);
      expect(
        Math.max(...followups) - Math.min(...followups),
        'Rotating order distributes the constrained follow-up allocation',
      ).toBeLessThanOrEqual(2);
      expect(report.coverage.reduce((n, phase) => n + phase.activated.length, 0)).toBeGreaterThan(
        (report.coverage.reduce((n, phase) => n + phase.eligible.length, 0) * 2) / 3,
      );
    }

    if (!budgetExhaustion && !budgetGate) {
      expect(trace.observation.status).not.toBe('interrupted');
      expect(
        report.coverage.flatMap((phase) => phase.missing),
        'Healthy fixtures cover every eligible seat',
      ).toEqual([]);
      expect(
        trace.phases.length >= Number(process.env.TIM7_PHASES ?? 1) ||
          trace.observation.status === 'finished',
      ).toBe(true);
    } else if (!budgetGate) {
      expect(trace.observation.status, 'The charged fixture must expose the unchanged funding ceiling').toBe(
        'interrupted',
      );
      expect(trace.inference.summary.accountedUsd).toBeLessThanOrEqual(1.5);
      expect(trace.inference.reservations.some((entry) => !entry.allowed)).toBe(true);
    }

    if (process.env.TIM7_SILENT) {
      expect(report.acceptedChat).toBe(0);
      expect(report.silent).toBe(
        report.coverage.reduce(
          (sum, phase) => sum + phase.eligible.length + phase.followupActivated.length,
          0,
        ),
      );
    }

    if (
      process.env.TIM26_LATENCY === '1000' &&
      !Number(process.env.TIM7_LAG) &&
      Number(process.env.TIM26_HOUSES ?? 10) === 10 &&
      !budgetExhaustion &&
      !budgetGate &&
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
      const replayed = trace.silenceCompletions.find((entry) => entry.repeated);

      const replayedJob: HouseJob | null = replayed
        ? JSON.parse(trace.houseJobs.find((entry) => entry.id === replayed.job)!.data)
        : null;

      for (const sample of report.samples
        .flatMap((phase) => phase.activations.map((sample) => ({ ...sample, phaseId: phase.phaseId })))
        .filter((entry) => entry.virtualResponseMs !== null))
        expect(sample.virtualResponseMs).toBe(
          Number(process.env.TIM26_LATENCY) +
            (replayedJob &&
            sample.ordinal === 1 &&
            sample.seat === replayedJob.seat &&
            sample.phaseId === replayedJob.phaseId
              ? 250
              : 0),
        );
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
      ...phase.missingFollowup.map((seat) => ({ phase, seat, ordinal: 1 })),
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

    if (!process.env.TIM7_REPORT_ONLY)
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
