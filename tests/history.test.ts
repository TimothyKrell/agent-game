import { mkdtemp, rm } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { HistoryMetadata2, HistoryPage2 } from '../src/shared/succession';
import type { HistoryAudience, HistoryEvent, HistoryQuery } from '../src/server/history';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

let directory: string;

const publicAudience: HistoryAudience = { seat: null, house: false, terminal: false };

beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/succession-history-');
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
}, 600_000);

afterAll(async () => {
  await worker?.stop();

  if (directory) await rm(directory, { recursive: true, force: true });
});

async function command<T>(name: string, body: T) {
  return worker.fetch(`/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  for (let offset = 0; offset < 31_200; offset += 64) {
    const populated = await command('large', {
      type: 'populate',
      count: Math.min(64, 31_200 - offset),
      escaping: false,
    });

    expect(populated.status).toBe(200);
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
}, 600_000);
