import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Schema } from 'effect';
import { expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import { startSuccessionProvider } from './succession-provider-server';
import { ActionRequest2Schema, HistoryPage2Schema, Observation2Schema } from '../src/shared/succession';
import type { Observation2 } from '../src/shared/succession';
import { SUCCESSION_HOUSE_SYSTEM, inferenceCost } from '../src/server/house-model';

const JobSchema = Schema.Struct({
  gameId: Schema.Literal('succession'),
  rulesVersion: Schema.Literal('succession-1'),
  decisionId: Schema.optional(Schema.String),
  id: Schema.String,
  matchId: Schema.String,
  seat: Schema.Number,
  generation: Schema.Number,
  phaseId: Schema.String,
  kind: Schema.Literals(['action', 'chat']),
  dueAt: Schema.Number,
  deadline: Schema.Number,
  model: Schema.Struct({
    provider: Schema.Literal('openai'),
    model: Schema.Literal('gpt-4.1-mini'),
    policyVersion: Schema.Literal('succession-1'),
  }),
});

const SavedSchema = Schema.Struct({
  request: Schema.NullOr(ActionRequest2Schema),
  notes: Schema.String,
  usageId: Schema.NullOr(Schema.String),
  cost: Schema.NullOr(Schema.Number),
});

const HouseSchema = Schema.Struct({
  jobs: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      data: Schema.String,
      status: Schema.String,
      due_at: Schema.Number,
      deadline: Schema.Number,
      attempts: Schema.Number,
      response: Schema.NullOr(Schema.String),
      outcome: Schema.NullOr(Schema.String),
      completed_at: Schema.NullOr(Schema.Number),
    }),
  ),
  notes: Schema.Array(Schema.Struct({ generation: Schema.Number, text: Schema.String })),
});

const MatchSchema = Schema.Struct({
  game: Schema.NullOr(Schema.String),
  outbox: Schema.Array(Schema.Struct({ id: Schema.String, data: Schema.String, delivered: Schema.Number })),
  receipts: Schema.Array(Schema.Struct({ id: Schema.String, fingerprint: Schema.String })),
  receiptCount: Schema.Number,
  faults: Schema.Array(
    Schema.Struct({ kind: Schema.String, job_id: Schema.NullOr(Schema.String), remaining: Schema.Number }),
  ),
});

const UsageSchema = Schema.Struct({
  allocations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      state: Schema.String,
      game_id: Schema.String,
      reservation: Schema.Number,
      snapshot: Schema.String,
    }),
  ),
  usage: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      match_id: Schema.String,
      created_at: Schema.Number,
      reserved: Schema.Number,
      actual: Schema.NullOr(Schema.Number),
      done: Schema.Number,
    }),
  ),
  summary: Schema.Struct({
    calls: Schema.Number,
    unknownUsageCalls: Schema.Number,
    measuredUsd: Schema.Number,
    accountedUsd: Schema.Number,
    peakRollingRpm: Schema.Number,
  }),
});

const StartedSchema = Schema.Struct({
  ok: Schema.Literal(true),
  value: Schema.Struct({ matchId: Schema.String }),
});

const headers = { 'X-Agent-Game-Protocols': '1,2' };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fixture(options: Parameters<typeof startSuccessionProvider>[0] = {}, timeScale = '0.4') {
  // A broad first pass now reaches every seat in Act I. Speak once per act so the
  // Act II history assertion does not rely on scheduler-starved seats speaking late.
  const provider = await startSuccessionProvider({ ...options, chatPerAct: true });
  const directory = await mkdtemp('/tmp/opencode/succession-provider-');
  let worker: Awaited<ReturnType<typeof unstable_dev>> | undefined;

  try {
    await promisify(execFile)('npx', [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'agent-game',
      '--config',
      'wrangler.succession-provider.jsonc',
      '--local',
      '--persist-to',
      directory,
    ]);
    worker = await unstable_dev('fixtures/succession-provider-worker.ts', {
      config: 'wrangler.succession-provider.jsonc',
      local: true,
      persist: true,
      persistTo: directory,
      port: 0,
      inspectorPort: 0,
      logLevel: 'error',
      vars: {
        OPENAI_BASE_URL: provider.url,
        OPENAI_API_KEY: 'fixture-only-never-a-real-key',
        TIME_SCALE: timeScale,
      },
      experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
    });

    return {
      provider,
      worker,
      async close() {
        await worker?.stop();
        await provider.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await worker?.stop();
    await provider.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function current(f: Fixture, matchId: string): Promise<Observation2> {
  const response = await f.worker.fetch(`/api/matches/${matchId}`, { headers });
  expect(response.status, await response.clone().text()).toBe(200);
  const text = await response.text();
  expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(14336);

  return Schema.decodeUnknownSync(Observation2Schema)(JSON.parse(text));
}

async function houses(f: Fixture, matchId: string) {
  return Promise.all(
    Array.from({ length: 10 }, async (_, seat) => {
      const jobs: (typeof HouseSchema.Type)['jobs'][number][] = [];
      let after = '';

      while (true) {
        const page = Schema.decodeUnknownSync(HouseSchema)(
          await (
            await f.worker.fetch(
              `/__fixture/house?matchId=${matchId}&seat=${seat}&after=${encodeURIComponent(after)}`,
            )
          ).json(),
        );

        expect(page.jobs.length).toBeLessThanOrEqual(64);
        jobs.push(...page.jobs);

        if (page.jobs.length < 64) return { seat, jobs, notes: page.notes };
        after = page.jobs.at(-1)!.id;
      }
    }),
  );
}

async function usage(f: Fixture, matchId: string) {
  const entries: (typeof UsageSchema.Type)['usage'][number][] = [];
  let after = '';

  while (true) {
    const page = Schema.decodeUnknownSync(UsageSchema)(
      await (
        await f.worker.fetch(`/__fixture/usage?matchId=${matchId}&after=${encodeURIComponent(after)}`)
      ).json(),
    );

    entries.push(...page.usage);

    if (page.usage.length < 64) return { ...page, usage: entries };
    after = page.usage.at(-1)!.id;
  }
}

async function start(f: Fixture): Promise<string> {
  const response = await f.worker.fetch('/__fixture/start', { method: 'POST' });
  const text = await response.text();
  expect(response.status, text).toBe(200);

  return Schema.decodeUnknownSync(StartedSchema)(JSON.parse(text)).value.matchId;
}

async function finish(
  f: Fixture,
  matchId: string,
  budget = 420_000,
  onAct2?: (view: Observation2) => Promise<void>,
) {
  const end = Date.now() + budget;
  const acts = new Set<number>();
  let view = await current(f, matchId);

  while (view.status === 'active' && Date.now() < end) {
    if (view.act === 2 && !acts.has(2) && onAct2) await onAct2(view);
    acts.add(view.act);
    await delay(250);
    view = await current(f, matchId);
  }

  acts.add(view.act);

  return { view, acts };
}

it('completes both acts through real HouseSeat OpenAI transport, accounting, retry, sealed choices, and bounded entitled history', async () => {
  const f = await fixture({ failFirstAction: true });

  try {
    const matchId = await start(f);
    await f.worker.fetch(`/__fixture/delivery-fault?matchId=${matchId}`, { method: 'POST' });
    const first = await current(f, matchId);
    expect(first).toMatchObject({
      act: 1,
      status: 'active',
      private: null,
      decision: null,
      mode: 'evaluation',
    });

    // Wrong-generation chat would be legal in this discussion for the current controller.
    const stale = {
      gameId: 'succession',
      rulesVersion: 'succession-1',
      id: `fixture-stale-${matchId}:chat`,
      matchId,
      seat: 0,
      generation: 999,
      phaseId: first.phase.id,
      kind: 'chat',
      dueAt: Date.now(),
      deadline: Date.now() + 15_000,
      model: { provider: 'openai', model: 'gpt-4.1-mini', policyVersion: 'succession-1' },
    };

    await f.worker.fetch('/__fixture/enqueue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stale),
    });

    const processedBy = Date.now() + 3000;
    let stalePending = true;

    while (stalePending && Date.now() < processedBy) {
      const checked = Schema.decodeUnknownSync(HouseSchema)(
        await (await f.worker.fetch(`/__fixture/house?matchId=${matchId}&seat=0`)).json(),
      );

      stalePending = !checked.jobs.some(
        (entry) => entry.id === stale.id && entry.status === 'done' && entry.attempts === 0,
      );

      if (stalePending) await delay(50);
    }

    expect(stalePending).toBe(false);
    expect((await current(f, matchId)).phase.id).toBe(first.phase.id);

    const lateId = `fixture-late-act1-${matchId}:chat`;

    const { view, acts } = await finish(f, matchId, 420_000, async () => {
      const late = { ...stale, id: lateId, generation: 0, dueAt: Date.now(), deadline: Date.now() + 15_000 };
      await f.worker.fetch('/__fixture/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(late),
      });
    });

    expect(
      view.status,
      JSON.stringify({
        reason: view.interruptionReason,
        errors: f.provider.errors,
        recent: f.provider.requests
          .slice(-3)
          .map((entry) => ({ phase: entry.prompt.phase, status: entry.status })),
      }),
    ).toBe('finished');
    expect(acts).toEqual(new Set([1, 2]));
    expect(view.result?.kind).toBe('individual');
    expect(view.seats.every((seat) => !seat.forfeited)).toBe(true);
    expect(f.provider.errors).toEqual([]);

    const submitted = new Set(
      f.provider.requests.flatMap((request) => (request.selectedAction ? [request.selectedAction.type] : [])),
    );

    for (const action of [
      'income',
      'tax',
      'exchange',
      'steal',
      'assassinate',
      'coup',
      'challenge',
      'lose-influence',
      'return-influence',
    ] as const)
      expect(submitted.has(action), `Missing production-provider action ${action}`).toBe(true);

    for (const request of f.provider.requests) {
      expect(request.route).toBe('/v1/responses');
      expect(request.method).toBe('POST');
      expect(request.system).toBe(SUCCESSION_HOUSE_SYSTEM);
      expect(request.body).toMatchObject({
        model: 'gpt-4.1-mini',
        store: false,
        max_output_tokens: 512,
        text: { format: { type: 'json_schema', name: 'house_decision', strict: true } },
      });
      expect(request.promptBytes).toBeLessThanOrEqual(19000);
      expect(request.prompt.facts.length).toBeLessThanOrEqual(45);
      expect(request.prompt.chat.length).toBeLessThanOrEqual(25);
      expect(request.prompt.facts.some((fact) => fact.type === 'audit')).toBe(false);
      expect(request.prompt.you?.generation).toBe(0);

      if (request.prompt.notes)
        expect(request.prompt.notes).toContain(`provider-note-seat${request.prompt.you?.seat}-generation0`);

      for (const fact of request.prompt.facts)
        if (
          [
            'capability-deal',
            'hand-updated',
            'exchange-draw',
            'draw',
            'discard',
            'received-policies',
            'executor-discard',
            'investigation-result',
            'reaction',
          ].includes(fact.type)
        )
          expect(fact.seat).toBe(request.prompt.you?.seat);

      if (request.prompt.task === 'action')
        expect(
          request.prompt.choices.find((choice) => choice.index === request.selectedIndex)?.action,
        ).toEqual(request.selectedAction);
    }

    expect(
      f.provider.requests.some(
        (request) =>
          request.prompt.act === 2 &&
          request.prompt.chat.some((entry) => entry.text.startsWith('provider-chat-seat')),
      ),
    ).toBe(true);

    const rows = await houses(f, matchId);

    const jobs = rows.flatMap((seat) =>
      seat.jobs.map((row) => ({
        ...row,
        job: Schema.decodeUnknownSync(JobSchema)(JSON.parse(row.data)),
        saved: row.response ? Schema.decodeUnknownSync(SavedSchema)(JSON.parse(row.response)) : null,
      })),
    );

    const accounting = await usage(f, matchId);
    expect(accounting.allocations).toHaveLength(1);
    expect(accounting.allocations[0]).toMatchObject({ game_id: 'succession' });
    expect(JSON.parse(accounting.allocations[0].snapshot)).toMatchObject({
      gameId: 'succession',
      mode: 'evaluation',
      rulesVersion: 'succession-1',
      houseModel: { provider: 'openai', model: 'gpt-4.1-mini', policyVersion: 'succession-1' },
    });
    expect(accounting.summary.accountedUsd).toBeLessThan(accounting.allocations[0].reservation);
    const released = accounting.usage.filter((entry) => entry.actual === 0);

    for (const reservation of released) {
      const skipped = jobs.find((entry) => reservation.id === `${entry.id}:attempt:1`);
      expect(skipped).toMatchObject({
        status: 'done',
        attempts: 0,
        response: null,
        outcome: 'insufficient-time',
      });
      expect(skipped!.job.kind).toBe('chat');
      expect(skipped!.deadline - skipped!.completed_at!).toBeLessThan(1150);
    }

    expect(accounting.summary.calls).toBe(f.provider.requests.length + released.length);
    expect(accounting.summary.peakRollingRpm).toBeLessThanOrEqual(250);
    expect(accounting.summary.unknownUsageCalls).toBe(1);
    expect(accounting.usage.every((entry) => entry.done === 1 && entry.reserved > 0)).toBe(true);
    expect(accounting.summary.measuredUsd).toBeCloseTo(
      (f.provider.requests.length - 1) * inferenceCost('gpt-4.1-mini', 100, 20),
      8,
    );
    expect(
      jobs.some((entry) => entry.attempts === 2 && entry.status === 'done' && entry.job.kind === 'action'),
    ).toBe(true);
    const staleRow = jobs.find((entry) => entry.id === stale.id);
    expect(staleRow).toMatchObject({ status: 'done', attempts: 0, response: null });
    expect(accounting.usage.some((entry) => entry.id.startsWith(stale.id))).toBe(false);
    expect(jobs.find((entry) => entry.id === lateId)).toMatchObject({
      status: 'done',
      attempts: 0,
      response: null,
    });
    expect(accounting.usage.some((entry) => entry.id.startsWith(lateId))).toBe(false);
    expect(rows.flatMap((row) => row.notes).some((note) => note.generation === 999)).toBe(false);

    for (const entry of jobs)
      if (entry.saved?.request && entry.job.kind === 'action') {
        expect(entry.saved.request).toMatchObject({
          gameId: 'succession',
          actionId: entry.job.id,
          phaseId: entry.job.phaseId,
          decisionId: entry.job.decisionId,
        });
        const provider = f.provider.requests.find((request) => request.notes === entry.saved?.notes);
        expect(provider?.selectedAction).toEqual(entry.saved.request.action);
        expect(entry.saved.cost).toBeCloseTo(inferenceCost('gpt-4.1-mini', 100, 20), 8);
        expect(accounting.usage.find((record) => record.id === entry.saved?.usageId)).toMatchObject({
          done: 1,
          actual: entry.saved.cost,
        });
      }

    const inspected = Schema.decodeUnknownSync(MatchSchema)(
      await (await f.worker.fetch(`/__fixture/match?matchId=${matchId}`)).json(),
    );

    const deliveryJob = inspected.faults.find((fault) => fault.kind === 'delivery')?.job_id;
    expect(deliveryJob).toBeTruthy();
    const delivered = jobs.find((row) => row.id === deliveryJob);
    expect(delivered).toMatchObject({ attempts: 1, status: 'done' });
    expect(f.provider.requests.filter((request) => request.notes === delivered?.saved?.notes)).toHaveLength(
      1,
    );

    const receipt = Schema.decodeUnknownSync(MatchSchema)(
      await (
        await f.worker.fetch(
          `/__fixture/match?matchId=${matchId}&receipt=${encodeURIComponent(`house:${deliveryJob}`)}`,
        )
      ).json(),
    );

    expect(receipt.receipts).toHaveLength(1);
    expect(delivered?.job).toBeDefined();
    await f.worker.fetch('/__fixture/enqueue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(delivered!.job),
    });
    await delay(300);
    expect(f.provider.requests.filter((request) => request.notes === delivered?.saved?.notes)).toHaveLength(
      1,
    );

    let cursor = 0;
    let pages = 0;
    const eventTypes = new Set<string>();

    while (cursor < view.history.streamHead) {
      const response = await f.worker.fetch(
        `/api/matches/${matchId}/history?epoch=${encodeURIComponent(view.history.visibilityEpoch)}&after=${cursor}&through=${view.history.streamHead}&limit=64&maxBytes=12288`,
        { headers },
      );

      expect(response.status, await response.clone().text()).toBe(200);
      const text = await response.text();
      expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(12288);
      const page = Schema.decodeUnknownSync(HistoryPage2Schema)(JSON.parse(text));
      expect(page.reset).toBe(false);
      expect(page.after).toBe(cursor);
      expect(page.events[0].id).toBe(cursor + 1);

      for (const event of page.events) eventTypes.add(event.type);
      expect(page.cursor).toBeGreaterThan(cursor);
      cursor = page.cursor;
      pages++;
    }

    expect(eventTypes.has('act-started')).toBe(true);
    expect(eventTypes.has('audit')).toBe(true);
    expect(eventTypes.has('finished')).toBe(true);
    expect(pages).toBeGreaterThan(1);
    console.log(
      'SUCCESSION_PROVIDER_EVIDENCE',
      JSON.stringify({
        matchId,
        acts: [...acts],
        winner: view.result?.winnerSeat,
        calls: f.provider.requests.length,
        actions: [...submitted],
        pages,
        events: cursor,
        measuredSyntheticUsd: accounting.summary.measuredUsd,
        unknownSyntheticCalls: accounting.summary.unknownUsageCalls,
        peakRollingRpm: accounting.summary.peakRollingRpm,
      }),
    );
  } finally {
    await f.close();
  }
});

it.each(['invalid', 'timeout'] as const)(
  'interrupts honestly after real production-provider %s failures without fabricated decisions',
  async (mode) => {
    const f = await fixture({ mode }, '0.12');

    try {
      const matchId = await start(f);
      const { view } = await finish(f, matchId, 35_000);
      expect(
        view.status,
        JSON.stringify({ reason: view.interruptionReason, errors: f.provider.errors }),
      ).toBe('interrupted');
      expect(view.result).toBeNull();
      expect(view.seats.every((seat) => !seat.forfeited)).toBe(true);
      const accounting = await usage(f, matchId);
      const jobs = (await houses(f, matchId)).flatMap((entry) => entry.jobs);
      const failures = jobs.filter((entry) => entry.attempts > 0 && entry.response === null);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.every((entry) => entry.attempts < 3)).toBe(true);

      if (mode === 'invalid') {
        expect(failures.some((entry) => entry.attempts === 2)).toBe(true);
        const invalid = f.provider.requests.filter((entry) => entry.prompt.task === 'action');
        expect(invalid).toHaveLength(2);
        expect(
          invalid.every(
            (entry) => entry.status === 200 && entry.selectedIndex >= entry.prompt.choices.length,
          ),
        ).toBe(true);
      }

      if (mode === 'timeout')
        expect(f.provider.requests.some((entry) => entry.prompt.task === 'action' && entry.aborted)).toBe(
          true,
        );
      expect(accounting.summary.unknownUsageCalls).toBeGreaterThan(0);
      expect(f.provider.errors).toEqual([]);
    } finally {
      await f.close();
    }
  },
);
