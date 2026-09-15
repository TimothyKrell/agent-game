import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { captureHistoryResponses } from '../../../e2e/fixtures/history-response-capture';

declare global {
  interface Window {
    abortHistory: () => void;
  }
}

function gate() {
  let release = () => {};

  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

test('native capture drains a request admitted while an earlier body is still being consumed', async ({
  page,
}, testInfo) => {
  const first = gate();
  const second = gate();
  const secondHeaders = gate();
  const consumingFirst = gate();
  const consumed: string[] = [];
  let reloadedBeforeSecond = false;

  const server = createServer((request, response) => {
    if (request.url?.startsWith('/history')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"events":[');

      if (request.url.includes('second')) {
        secondHeaders.release();
        void second.promise.then(() => response.end('2]}'));
      } else response.end('1]}');
    } else response.end('<!doctype html><title>Native response capture</title>');
  });

  await new Promise<void>((resolve) => server.listen(6461, '127.0.0.1', resolve));

  const capture = captureHistoryResponses(page, async (response) => {
    if (response.url().includes('first')) {
      consumingFirst.release();
      await first.promise;
    }

    consumed.push((await response.body()).toString());
  });

  try {
    await page.goto('/');
    await page.evaluate(() => {
      void fetch('/history?first');
    });
    await consumingFirst.promise;

    const navigation = capture.navigate(async () => {
      reloadedBeforeSecond = consumed.length !== 2;
      await page.reload();
    });

    await page.evaluate(() => {
      void fetch('/history?second');
    });
    await secondHeaders.promise;
    first.release();
    // A real HTTP request is outstanding after the old promise-array snapshot was taken.
    second.release();
    await navigation;
    await capture.drain();
    await testInfo.attach('native-capture.json', {
      body: JSON.stringify({
        consumed,
        reloadedBeforeSecond,
        errors: capture.errors,
        cancelled: capture.cancelled,
      }),
      contentType: 'application/json',
    });
    expect(reloadedBeforeSecond).toBe(false);
    expect(consumed).toEqual(['{"events":[1]}', '{"events":[2]}']);
    expect(capture.errors).toEqual([]);
  } finally {
    first.release();
    second.release();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('native abort remains separate and a failed completed body consumer remains an error', async ({
  page,
}, testInfo) => {
  const heldHeaders = gate();
  const losingBody = gate();
  const releaseBody = gate();

  const server = createServer((request, response) => {
    if (request.url === '/history?abort') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"events":[');
      heldHeaders.release();
    } else if (request.url === '/history?lost') {
      response.setHeader('Content-Type', 'application/json');
      response.end('invalid JSON');
    } else response.end('<!doctype html><title>Native capture classifications</title>');
  });

  await new Promise<void>((resolve) => server.listen(6461, '127.0.0.1', resolve));

  const capture = captureHistoryResponses(page, async (response) => {
    if (response.url().endsWith('?lost')) {
      losingBody.release();
      await releaseBody.promise;
    }

    JSON.parse((await response.body()).toString());
  });

  try {
    await page.goto('/');
    await page.evaluate(() => {
      const controller = new AbortController();
      window.abortHistory = () => controller.abort();
      void fetch('/history?abort', { signal: controller.signal }).catch(() => {});
    });
    await heldHeaders.promise;
    await page.evaluate(() => window.abortHistory());
    await capture.drain();
    expect(capture.errors).toEqual([]);
    expect(capture.cancelled.map((request) => request.reason)).toEqual(['net::ERR_ABORTED']);

    const finished = page.waitForEvent('requestfinished', (request) => request.url().endsWith('?lost'));
    await page.evaluate(() => {
      void fetch('/history?lost');
    });
    await losingBody.promise;
    await finished;
    // A completed transport is not an aborted request, even when its body consumer fails later.
    await page.reload();
    releaseBody.release();
    await capture.drain();
    await testInfo.attach('native-classification.json', {
      body: JSON.stringify({
        requests: capture.lifecycle,
        errors: capture.errors,
        cancelled: capture.cancelled,
      }),
      contentType: 'application/json',
    });
    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0]).toMatch(/JSON|Network.getResponseBody/);
    expect(capture.lifecycle.map((request) => request.outcome)).toEqual(['cancelled', 'error']);
  } finally {
    releaseBody.release();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
