import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { HistoryMetadata2, HistoryPage2 } from '../src/shared/succession';
import type { HistoryAudience, HistoryEvent, HistoryQuery } from '../src/server/history';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

let directory: string;

let evidence: string;

let failed = false;

interface PopulationAttempt {
  name: string;
  expectedOffset: number;
  count: number;
  escaping: boolean;
  attempt: number;
  status: number | null;
  body: string;
  retry: boolean;
}

const populationAttempts: PopulationAttempt[] = [];

const publicAudience: HistoryAudience = { seat: null, house: false, terminal: false };

async function start() {
  worker = await unstable_dev('tests/fixtures/history-worker.ts', {
    config: 'tests/history.wrangler.jsonc',
    local: true,
    persist: true,
    persistTo: directory,
    port: 0,
    inspectorPort: 0,
    logLevel: 'error',
    experimental: { forceLocal: true, disableExperimentalWarning: true, watch: false },
  });
  await appendFile(
    resolve(evidence, 'launches.jsonl'),
    JSON.stringify({ at: Date.now(), directory, port: worker.port }) + '\n',
  );
}

beforeAll(async () => {
  const root = resolve(process.env.HISTORY_FIXTURE_EVIDENCE_DIR ?? '.agent-game/ci-evidence/history');
  await mkdir(root, { recursive: true });
  evidence = await mkdtemp(resolve(root, 'run-'));
  directory = await mkdtemp(resolve(evidence, 'runtime-'));
  await writeFile(resolve(evidence, 'runtime.json'), JSON.stringify({ directory, pid: process.pid }));
  await start();
}, 600_000);

it('accepts reply references only to actual public chats with the recorded speaker', async () => {
  const base = { at: 1, act: 1 as const, round: 1, seat: 2, type: 'chat', text: 'Why did you discard it?' };
  await command('replies', {
    type: 'append',
    events: [
      { ...base, eventKey: 'match_reply:1', visibility: 'public' },
      { ...base, eventKey: 'match_reply:2', visibility: 2 },
      { ...base, eventKey: 'match_reply:3', visibility: 'public', type: 'nomination' },
    ],
  });
  expect((await command('replies', { type: 'reply', eventKey: 'match_reply:1', seat: 2 })).status).toBe(200);

  for (const reply of [
    { eventKey: 'match_reply:1', seat: 3 },
    { eventKey: 'match_reply:2', seat: 2 },
    { eventKey: 'match_reply:3', seat: 2 },
    { eventKey: 'different-match:1', seat: 2 },
  ])
    expect((await command('replies', { type: 'reply', ...reply })).status).toBe(400);
});

it('replays a concurrent population batch from its exact receipt and rejects conflicting provenance', async () => {
  const batch = { type: 'populate', expectedOffset: 0, count: 4, escaping: false };
  const responses = await Promise.all([command('receipts', batch), command('receipts', batch)]);
  const receipts = await Promise.all(responses.map((response) => response.json()));
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect(receipts[0]).toMatchObject({ streamHead: 4 });
  expect((await command('receipts', { ...batch, expectedOffset: 4 })).status).toBe(200);
  await worker.stop();
  await start();
  expect(await (await command('receipts', batch)).json()).toEqual(receipts[0]);

  for (const conflict of [
    { ...batch, count: 3 },
    { ...batch, escaping: true },
    { ...batch, expectedOffset: 1 },
    { ...batch, expectedOffset: 9 },
    { ...batch, expectedOffset: 8, count: 65 },
  ])
    expect((await command('receipts', conflict)).status).toBe(400);

  expect(
    await (await command('receipts', { type: 'metadata', audience: publicAudience })).json(),
  ).toMatchObject({ streamHead: 8 });
});

afterEach(async ({ task }) => {
  if (task.result?.state !== 'fail' || failed) return;
  failed = true;
  await writeFile(
    resolve(evidence, 'failure.json'),
    JSON.stringify({ test: task.name, errors: task.result.errors, directory }, null, 2),
  );
});

afterAll(async () => {
  await worker?.stop();

  if (directory && !failed) await rm(directory, { recursive: true, force: true });
});

async function command<T>(name: string, body: T) {
  return worker.fetch(`/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function connectionLost(body: string) {
  if (/^Error: Network connection lost\.(?:\r?\n|$)/.test(body.trim())) return true;

  try {
    // Wrangler's native error middleware also serializes Worker errors as JSON.
    const error: { name?: unknown; message?: unknown } | null = JSON.parse(body);

    return error?.name === 'Error' && error.message === 'Network connection lost.';
  } catch {
    return false;
  }
}

async function populate(name: string, expectedOffset: number, count: number, escaping = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Awaited<ReturnType<typeof command>> | undefined;
    let failure: Error | undefined;
    let body = '';
    let transient = false;

    try {
      response = await command(name, { type: 'populate', expectedOffset, count, escaping });
      body = await response.clone().text();
      transient = response.status === 500 && connectionLost(body);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      failure = error;
      body = error.stack ?? error.message;
      const cause = error.cause;
      transient =
        (response === undefined || response.status === 200 || response.status === 500) &&
        (error.message === 'Network connection lost.' ||
          (cause instanceof Error &&
            'code' in cause &&
            ['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE'].includes(String(cause.code))));
    }

    const record = {
      name,
      expectedOffset,
      count,
      escaping,
      attempt,
      status: response?.status ?? null,
      body,
      retry: transient && attempt < 3,
    };

    populationAttempts.push(record);
    // Persist the actual failed response and offset before any replay of this exact batch.
    await appendFile(
      resolve(evidence, 'population.jsonl'),
      JSON.stringify({ at: Date.now(), ...record }) + '\n',
    );

    if (!record.retry) {
      if (failure) throw failure;

      if (response) return response;
    }

    await pause(attempt * 100);
  }

  throw new Error('Population retry loop exhausted without a response');
}

async function fault(
  name: string,
  expectedOffset: number,
  stage: 'before' | 'after' | 'unrelated' | 'receipt',
  remaining = 1,
) {
  expect((await command('__population-fault', { name, expectedOffset, stage, remaining })).status).toBe(200);
}

async function page(
  name: string,
  audience: HistoryAudience,
  query: HistoryQuery = {},
): Promise<HistoryPage2> {
  const response = await command(name, { type: 'page', audience, query });
  expect(response.status).toBe(200);

  return JSON.parse(await response.text());
}

function fact(text: string, visibility: HistoryEvent['visibility']): HistoryEvent {
  return { eventKey: crypto.randomUUID(), at: 100, act: 1, round: 1, type: 'fact', text, visibility };
}

it('restores future private history without exposing facts created during temporary coverage', async () => {
  const original = { seat: 3, house: false, terminal: false };
  await command('recoverable-entitlements', { type: 'enable-recovery' });
  await command('recoverable-entitlements', {
    type: 'append',
    events: [fact('public before', 'public'), fact('private before', 3)],
  });
  await command('recoverable-entitlements', { type: 'freeze', seat: 3 });
  await command('recoverable-entitlements', {
    type: 'append',
    events: [fact('coverage public', 'public'), fact('house private', 3)],
  });
  await command('recoverable-entitlements', { type: 'restore', seat: 3 });
  await command('recoverable-entitlements', {
    type: 'append',
    events: [fact('reclaimed public', 'public'), fact('private after', 3)],
  });
  const reset = await page('recoverable-entitlements', original);
  const read = await page('recoverable-entitlements', original, { epoch: reset.visibilityEpoch });

  expect(read.events.map((event) => event.text)).toEqual([
    'public before',
    'private before',
    'coverage public',
    'reclaimed public',
    'private after',
  ]);
  expect(read.events.map((event) => event.text)).not.toContain('house private');
  expect(
    await (
      await command('recoverable-entitlements', {
        type: 'checkpoint',
        audience: original,
        cursor: 3,
      })
    ).json(),
  ).toMatchObject({ privateEntitled: false });
  expect(
    await (
      await command('recoverable-entitlements', {
        type: 'checkpoint',
        audience: original,
        cursor: 4,
      })
    ).json(),
  ).toMatchObject({ privateEntitled: true });
});

it('retains a replaced original private prefix and only the future public tail, then resets to the complete archive', async () => {
  const original = { seat: 3, house: false, terminal: false };
  const house = { ...original, house: true };
  await command('entitlements', {
    type: 'append',
    events: [
      fact('public before', 'public'),
      fact('private before', 3),
      fact('other hand', 2),
      fact('shuffle', 'archive'),
    ],
  });
  const initial = await page('entitlements', original);
  expect(initial).toMatchObject({ reset: true, cursor: 0, streamHead: 2, events: [] });
  await command('entitlements', { type: 'freeze', seat: 3 });
  await command('entitlements', {
    type: 'append',
    events: [fact('takeover', 'public'), fact('new hand', 3), fact('public after', 'public')],
  });
  const read = await page('entitlements', original, { epoch: initial.visibilityEpoch });
  expect(read.reset).toBe(false);
  expect(read.events.map((event) => event.text)).toEqual([
    'public before',
    'private before',
    'takeover',
    'public after',
  ]);
  expect(read.events.map((event) => event.id)).toEqual([1, 2, 3, 4]);
  const houseReset = await page('entitlements', house);
  const houseRead = await page('entitlements', house, { epoch: houseReset.visibilityEpoch });
  expect(houseRead.events.map((event) => event.text)).toContain('new hand');
  expect(houseRead.events.map((event) => event.text)).not.toContain('other hand');
  const archive = { ...publicAudience, terminal: true };

  const reset = await page('entitlements', archive, {
    epoch: initial.visibilityEpoch,
    after: 9999,
    through: 9999,
  });

  expect(reset).toMatchObject({ reset: true, events: [], cursor: 0, streamHead: 7 });
  const complete = await page('entitlements', archive, { epoch: reset.visibilityEpoch });
  expect(complete.events.map((event) => event.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(complete.events.map((event) => event.text)).toEqual([
    'public before',
    'private before',
    'other hand',
    'shuffle',
    'takeover',
    'new hand',
    'public after',
  ]);
  expect(complete.events[0].eventKey).toBe(read.events[0].eventKey);
  const retainedKey = read.events[2].eventKey;
  const hiddenKey = complete.events[5].eventKey;

  for (const [audience, eventKey, cursor] of [
    [original, retainedKey, 3],
    [archive, retainedKey, 5],
    [original, hiddenKey, null],
    [publicAudience, hiddenKey, null],
    [house, hiddenKey, 4],
  ] as const) {
    expect(await (await command('entitlements', { type: 'anchor', audience, eventKey })).json()).toEqual({
      cursor,
    });
  }

  const empty = await page('entitlements', archive, { epoch: reset.visibilityEpoch, after: 7, through: 7 });
  expect(empty).toMatchObject({ reset: false, cursor: 7, events: [], hasMore: false });
});

it('never exposes invisible submissions through heads and preserves a frozen page walk as head grows', async () => {
  await command('walk', { type: 'append', events: [fact('one', 'public'), fact('two', 'public')] });
  const initial = await page('walk', publicAudience);
  const first = await page('walk', publicAudience, { epoch: initial.visibilityEpoch, limit: 1, through: 2 });
  expect(first).toMatchObject({ cursor: 1, through: 2, streamHead: 2, hasMore: true });
  await command('walk', { type: 'append', events: [fact('sealed', 4), fact('audit', 'archive')] });
  const unchanged = await page('walk', publicAudience);
  expect(unchanged).toEqual(initial);
  await command('walk', { type: 'append', events: [fact('three', 'public')] });

  const last = await page('walk', publicAudience, {
    epoch: initial.visibilityEpoch,
    after: first.cursor,
    through: first.through,
  });

  expect(last).toMatchObject({ cursor: 2, through: 2, streamHead: 3, hasMore: false });
  const next = await page('walk', publicAudience, { epoch: initial.visibilityEpoch, after: last.cursor });
  expect(next.events.map((event) => event.text)).toEqual(['three']);
  expect(next.cursor).toBe(3);

  for (const query of [
    { limit: 0 },
    { limit: 65 },
    { maxBytes: 12287 },
    { maxBytes: 32769 },
    { after: -1 },
    { after: 4 },
    { after: 2, through: 1 },
  ]) {
    const response = await command('walk', {
      type: 'page',
      audience: publicAudience,
      query: { epoch: initial.visibilityEpoch, ...query },
    });

    expect(response.status).toBe(400);
  }
});

it('keeps worst escaped legal messages whole within server byte limits and rolls back invalid event batches', async () => {
  await command('escaping', { type: 'populate', count: 5, escaping: true });
  const initial = await page('escaping', publicAudience);

  const read = await page('escaping', publicAudience, {
    epoch: initial.visibilityEpoch,
    maxBytes: 12288,
    limit: 64,
  });

  expect(read.events).toHaveLength(1);
  expect([...read.events[0].text]).toHaveLength(1000);
  expect(Buffer.byteLength(JSON.stringify(read))).toBeLessThanOrEqual(12288);
  expect(read.cursor).toBe(1);

  const bad = await command('escaping', {
    type: 'append',
    events: [fact('valid first', 'public'), fact('x'.repeat(9000), 'public')],
  });

  expect(bad.status).toBe(400);

  const metadata: HistoryMetadata2 = JSON.parse(
    await (await command('escaping', { type: 'metadata', audience: publicAudience })).text(),
  );

  expect(metadata.streamHead).toBe(5);
});

it('retains and traverses 31,200 maximum-length four-byte messages with bounded current metadata and pages', async () => {
  await fault('large', 64, 'before');
  await fault('large', 128, 'after');

  for (let offset = 0; offset < 31_200; offset += 64) {
    const populated = await populate('large', offset, Math.min(64, 31_200 - offset));

    expect(populated.status).toBe(200);
    await populated.arrayBuffer();
  }

  const metadata: HistoryMetadata2 = JSON.parse(
    await (await command('large', { type: 'metadata', audience: publicAudience })).text(),
  );

  expect(metadata.streamHead).toBe(31_200);
  let after = 0;
  let characters = 0;

  while (after < metadata.streamHead) {
    const read = await page('large', publicAudience, {
      epoch: metadata.visibilityEpoch,
      after,
      through: metadata.streamHead,
      limit: 64,
      maxBytes: 32768,
    });

    expect(read.events.length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(JSON.stringify(read))).toBeLessThanOrEqual(32768);

    for (const event of read.events) {
      expect(event.id).toBe(++after);
      characters += [...event.text].length;
    }

    expect(read.cursor).toBe(after);
  }

  expect(characters).toBe(31_200_000);

  const current: { bytes: number; value: HistoryMetadata2 } = JSON.parse(
    await (await command('large', { type: 'current' })).text(),
  );

  expect(current.bytes).toBeLessThan(1024);
  expect(current.value).toEqual(metadata);

  const reset = await page(
    'large',
    { ...publicAudience, terminal: true },
    { epoch: metadata.visibilityEpoch },
  );

  expect(reset).toMatchObject({ reset: true, events: [], cursor: 0, streamHead: 31_200 });
  expect(Buffer.byteLength(JSON.stringify(reset))).toBeLessThan(1024);
  const failures = populationAttempts.filter((row) => row.name === 'large' && row.retry);
  expect(failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ expectedOffset: 64, status: 500 }),
      expect.objectContaining({ expectedOffset: 128, status: 500 }),
    ]),
  );
}, 600_000);

it.each(['before', 'after'] as const)(
  'recovers native %s-commit acknowledgement loss with one exact batch',
  async (stage) => {
    await fault(stage, 0, stage, 3);
    const lost = await populate(stage, 0, 64);
    expect(lost.status).toBe(500);
    expect(await lost.text()).toContain('Network connection lost.');
    const beforeRetry = await (await command(stage, { type: 'metadata', audience: publicAudience })).json();
    expect(beforeRetry).toMatchObject({ streamHead: stage === 'before' ? 0 : 64 });
    // Readback is evidence only; the retry still relies exclusively on the atomic receipt.
    await worker.stop();
    await start();
    const response = await populate(stage, 0, 64);
    expect(response.status).toBe(200);
    const metadata: HistoryMetadata2 = JSON.parse(await response.text());
    expect(metadata.streamHead).toBe(64);
    const attempts = populationAttempts.filter((row) => row.name === stage);
    expect(attempts.map((row) => row.status)).toEqual([500, 500, 500, 200]);
    expect(attempts[0].body).toContain('Network connection lost.');

    if (stage === 'after') expect(metadata).toEqual(beforeRetry);
    expect(await (await command(stage, { type: 'metadata', audience: publicAudience })).json()).toEqual(
      metadata,
    );
    expect(
      await (
        await command(stage, { type: 'populate', expectedOffset: 0, count: 64, escaping: false })
      ).json(),
    ).toEqual(metadata);
  },
);

it('does not retry conflicting batches or unrelated native failures and stops after three transport attempts', async () => {
  expect((await populate('conflict', 0, 4)).status).toBe(200);
  expect((await populate('conflict', 0, 3)).status).toBe(400);
  expect(populationAttempts.filter((row) => row.name === 'conflict' && row.count === 3)).toHaveLength(1);
  await fault('unrelated', 0, 'unrelated');
  const unrelated = await populate('unrelated', 0, 4);
  expect(unrelated.status).toBe(500);
  expect(await unrelated.text()).toContain('History fixture non-transport failure');
  expect(populationAttempts.filter((row) => row.name === 'unrelated')).toHaveLength(1);
  await fault('exhausted', 0, 'before', 3);
  const exhausted = await populate('exhausted', 0, 4);
  expect(exhausted.status).toBe(500);
  expect(await exhausted.text()).toContain('Network connection lost.');
  expect(populationAttempts.flatMap((row) => (row.name === 'exhausted' ? [row.retry] : []))).toEqual([
    true,
    true,
    false,
  ]);
  expect(
    await (await command('exhausted', { type: 'metadata', audience: publicAudience })).json(),
  ).toMatchObject({ streamHead: 0 });
});

it('rolls back the append with a failed SQLite receipt write and does not retry the SQL error', async () => {
  await fault('atomic', 0, 'receipt');
  const response = await populate('atomic', 0, 4);
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('no such table: fixture_missing_receipt_table');
  expect(populationAttempts.filter((row) => row.name === 'atomic')).toHaveLength(1);
  expect(
    await (await command('atomic', { type: 'metadata', audience: publicAudience })).json(),
  ).toMatchObject({ streamHead: 0 });
  const recovered = await populate('atomic', 0, 4);
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({ streamHead: 4 });
});
