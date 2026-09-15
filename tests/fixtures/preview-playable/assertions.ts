import { expect } from 'vitest';
import { Schema } from 'effect';
import type { PreviewBrokerReceipt } from '../../../src/shared/preview-broker';
import { PreviewBrokerStatusSchema } from '../../../src/shared/preview-broker';
import { query, source, target, post, waitFor, captures, providerCalls } from './harness';

export async function assertSourceAccounting(receipt: PreviewBrokerReceipt, callsBefore: number) {
  await waitFor(
    async () =>
      (
        await query(
          source,
          'SELECT count(*) AS n FROM usage WHERE match_id=? AND done=0',
          [receipt.allocationId],
          true,
        )
      )[0].n === 0,
  );

  const usage = await query(
    source,
    'SELECT * FROM usage WHERE match_id=? ORDER BY id',
    [receipt.allocationId],
    true,
  );

  const calls = await query(
    source,
    'SELECT * FROM preview_broker_calls WHERE allocation_id=? ORDER BY id',
    [receipt.allocationId],
    true,
  );

  const sent = providerCalls.slice(callsBefore);
  expect(usage.length).toBeGreaterThan(0);
  expect(calls).toHaveLength(sent.length);
  expect(new Set(calls.map((row) => row.id)).size).toBe(calls.length);
  expect(usage).toHaveLength(calls.length);
  expect(usage.map((row) => row.id)).toEqual(calls.map((row) => row.id));
  expect(sent.every((row) => row.finished && row.usage)).toBe(true);

  const actual = sent.reduce(
    (sum, row) =>
      sum +
      (row.input * receipt.pricing.inputUsdPerMillion + row.output * receipt.pricing.outputUsdPerMillion) /
        1000000,
    0,
  );

  expect(usage.reduce((sum, row) => sum + Number(row.actual), 0)).toBeCloseTo(actual, 10);
  expect(usage.every((row) => row.done === 1 && row.actual === 0.000072)).toBe(true);
  expect(await query(target, 'SELECT * FROM usage', [], true)).toEqual([]);

  const status = Schema.decodeUnknownSync(PreviewBrokerStatusSchema)(
    await (await post(target, '/fixture/source-status', {})).json(),
  );

  const total = await query(source, 'SELECT sum(coalesce(actual,reserved)) AS total FROM usage', [], true);
  expect(status.secretOverlord.accountedUsd).toBeCloseTo(Number(total[0].total), 10);
  expect(status.secretOverlord.maxConcurrent).toBe(3);
  expect(status.secretOverlord.dailyTargetUsd).toBe(5);
  captures.push({
    sourceLedger: receipt.allocationId,
    providerCalls: sent.length,
    billedRows: usage.length,
    accountedUsd: actual,
    signedSourceStatus: status,
  });

  return usage;
}

function matchReader(matchId: string, token: string) {
  return async (path: string, authenticated: boolean) => {
    const headers = new Headers({ 'X-Agent-Game-Protocols': '1,2' });

    if (authenticated) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${target}/api/matches/${matchId}${path}`, { headers });
    expect(response.ok, await response.clone().text()).toBe(true);

    return JSON.parse(await response.text());
  };
}

export async function assertLiveCheckpoint(matchId: string, token: string) {
  const get = matchReader(matchId, token);
  const boundaries = [];

  for (const authenticated of [false, true]) {
    const view = await get('', authenticated);
    expect(view.status).toBe('active');

    const parameters = new URLSearchParams({
      epoch: view.history.visibilityEpoch,
      through: String(view.history.streamHead),
    });

    const checkpoint = await get(`/checkpoint?${parameters}`, authenticated);
    expect(checkpoint.through).toBe(view.history.streamHead);
    expect(checkpoint.baseline.decision).toBeNull();
    expect(checkpoint.baseline.chat.open).toBe(false);
    expect(checkpoint.baseline.seats).toEqual(view.seats);
    expect(checkpoint.baseline.private).toEqual(view.private);
    expect(checkpoint.baseline.you).toEqual(view.you);
    const page = await get(`/history?${parameters}&after=0&limit=64&maxBytes=12288`, authenticated);
    expect(page.reset).toBe(false);
    expect(page.through).toBe(view.history.streamHead);
    boundaries.push({ authenticated, epoch: view.history.visibilityEpoch, through: view.history.streamHead });
  }

  expect(boundaries[0].epoch).not.toBe(boundaries[1].epoch);
  captures.push({ liveCheckpoint: matchId, boundaries, privateCheckpointAuthenticated: true });

  return boundaries;
}

export async function assertArchive(
  matchId: string,
  token: string,
  gameId: string,
  live: { authenticated: boolean; epoch: string }[] = [],
) {
  const get = matchReader(matchId, token);

  const publicView = await get('', false);
  const seatView = await get('', true);
  expect(publicView.status).toBe('finished');
  expect(seatView.status).toBe(publicView.status);
  expect(publicView.you).toBeNull();
  expect(seatView.you).not.toBeNull();

  if (gameId === 'secret-overlord') {
    expect(publicView.winner).toEqual(seatView.winner);
    captures.push({
      archive: matchId,
      protocol: '1',
      publicEvents: publicView.events.length,
      seatEvents: seatView.events.length,
      status: publicView.status,
    });

    return;
  }

  const boundaries = [];

  for (const boundary of live) {
    const reset = await get(`/checkpoint?epoch=${boundary.epoch}&through=0`, boundary.authenticated);
    expect(reset).toMatchObject({ reset: true, events: [] });
  }

  for (const authenticated of [false, true]) {
    const view = authenticated ? seatView : publicView;

    const parameters = new URLSearchParams({
      epoch: view.history.visibilityEpoch,
      through: String(view.history.streamHead),
    });

    let after = 0;
    let pages = 0;
    const eventKeys = new Set<string>();

    for (;;) {
      const page = await get(`/history?${parameters}&after=${after}&limit=64&maxBytes=12288`, authenticated);
      expect(page.reset).toBe(false);
      expect(page.through).toBe(view.history.streamHead);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(12288);
      expect(page.cursor).toBeGreaterThan(after);

      for (const event of page.events) {
        expect(eventKeys.has(event.eventKey)).toBe(false);
        eventKeys.add(event.eventKey);
      }

      pages++;
      after = page.cursor;

      if (!page.hasMore) break;
    }

    expect(after).toBe(view.history.streamHead);
    const rounds = await get(`/rounds?${parameters}`, authenticated);
    const checkpoint = await get(`/checkpoint?${parameters}`, authenticated);
    const replay = await get(`/replay?${parameters}`, authenticated);
    expect(rounds.rounds.length).toBeGreaterThan(0);
    expect(rounds.rounds.every((round: { eventKey: string }) => eventKeys.has(round.eventKey))).toBe(true);
    expect(checkpoint.through).toBe(view.history.streamHead);
    expect(checkpoint.baseline).toEqual(replay);
    expect(replay.status).toBe('finished');
    expect(replay.result).toEqual(view.result);
    boundaries.push({
      authenticated,
      epoch: view.history.visibilityEpoch,
      through: after,
      pages,
      events: eventKeys.size,
      rounds: rounds.rounds.length,
      finalResult: replay.result,
    });
  }

  captures.push({ archive: matchId, protocol: '2', boundaries });
}
