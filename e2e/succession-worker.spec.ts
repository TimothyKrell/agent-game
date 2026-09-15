import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import { HistoryPage2Schema, Observation2Schema } from '../src/shared/succession';
import {
  expectBoundedRecord,
  expectReadingControls,
  openChapter,
  observeDossierBounds,
  expectObservedDossierBounds,
} from './fixtures/dossier-browser';

if (process.env.SUCCESSION_WORKER_URL) test.use({ baseURL: process.env.SUCCESSION_WORKER_URL });

test('real Worker exhibition plays both acts and opens the bounded archive in the browser', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await observeDossierBounds(page);
  const errors: string[] = [];
  const historyReads: { url: string; bytes: number; events: number }[] = [];
  const cancelledHistory: { url: string; reason: string }[] = [];
  const captureErrors: string[] = [];
  const reads: Promise<void>[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/history')) return;
    cancelledHistory.push({ url: request.url(), reason: request.failure()?.errorText ?? 'Unknown failure' });
  });
  // A bounded reader can cancel a response after headers arrive. Measure complete native requests;
  // attempting Network.getResponseBody on those abandoned responses is a CDP instrumentation error.
  page.on('requestfinished', (request) => {
    if (!new URL(request.url()).pathname.endsWith('/history')) return;
    reads.push(
      (async () => {
        const response = await request.response();

        if (!response?.ok()) throw new Error(`History response failed: ${request.url()}`);
        const bytes = await response.body();
        const data = Schema.decodeUnknownSync(HistoryPage2Schema)(JSON.parse(bytes.toString()));
        historyReads.push({ url: response.url(), bytes: bytes.length, events: data.events.length });
      })().catch((error: Error) => {
        captureErrors.push(error.message);
      }),
    );
  });
  await page.goto('/?gameId=succession');
  await expect(page.getByRole('combobox', { name: 'Matches', exact: true })).toHaveValue('succession');
  await page.getByRole('button', { name: 'Start local exhibition', exact: true }).click();
  await expect(page).toHaveURL(/\/matches\//);
  await expect(page.locator('.dossier-outcome')).toContainText('SUCCESSION · ACT I');
  const matchId = new URL(page.url()).pathname.split('/')[2];

  const response = await page.request.get(`/api/matches/${matchId}`, {
    headers: { 'X-Agent-Game-Protocols': '1,2' },
  });

  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  expect(bytes.byteLength).toBeLessThanOrEqual(14_336);
  const raw: unknown = JSON.parse(bytes.toString());
  const current = Schema.decodeUnknownSync(Observation2Schema)(raw);
  expect(current.gameId).toBe('succession');
  expect(current.mode).toBe('preview');
  expect(current.protocolVersion).toBe('2');
  expect(raw).not.toHaveProperty('events');
  expect(raw).not.toHaveProperty('cursor');
  await testInfo.attach('worker-act1-current.json', { body: bytes, contentType: 'application/json' });
  await expect(page.locator('.dossier-outcome')).toContainText('SUCCESSION · ACT II', { timeout: 120_000 });
  await page.getByText('Current table · public resources and seats', { exact: true }).click();
  await expect(page.locator('.returned-marker')).toHaveCount(10);
  await expect(page.locator('.seat')).toHaveCount(10);
  await expect(page.locator('.legal-actions')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Show private archive/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('real-worker-act2.png'), fullPage: true });
  await expect(page.locator('.dossier-outcome')).toContainText('SUCCESSION · COMPLETED', {
    timeout: 180_000,
  });

  const terminalResponse = await page.request.get(`/api/matches/${matchId}`, {
    headers: { 'X-Agent-Game-Protocols': '1,2' },
  });

  const terminal = Schema.decodeUnknownSync(Observation2Schema)(await terminalResponse.json());
  expect(terminal.status).toBe('finished');
  expect(terminal.result?.kind).toBe('individual');
  expect(terminal.history.streamHead).toBeGreaterThan(128);
  await testInfo.attach('worker-terminal-current.json', {
    body: JSON.stringify(terminal, null, 2),
    contentType: 'application/json',
  });
  const outcome = await page.locator('.dossier-outcome').innerText();
  await expectReadingControls(page);
  const actOne = await openChapter(page, 1);
  await expect(actOne.locator('.dossier-row').first()).toBeVisible();
  await expectBoundedRecord(actOne);
  await expect(page.getByRole('checkbox', { name: /Show private archive/ })).not.toBeChecked();
  await expect(page.locator('.dossier-private')).toHaveCount(0);
  await page.getByRole('checkbox', { name: /Show private archive/ }).check();
  await expect(actOne.locator('.dossier-private').first()).toBeVisible();
  expect(await page.locator('.dossier-outcome').innerText()).toBe(outcome);
  await page.screenshot({ path: testInfo.outputPath('real-worker-archive.png'), fullPage: true });
  await Promise.all(reads);
  expect(historyReads.length).toBeGreaterThan(0);
  expect(historyReads.every((read) => read.events <= 32 && read.bytes <= 16_384)).toBe(true);
  expect(captureErrors).toEqual([]);
  expect(cancelledHistory.every((read) => read.reason === 'net::ERR_ABORTED')).toBe(true);
  expect(errors).toEqual([]);
  const bounds = await expectObservedDossierBounds(page);
  await testInfo.attach('worker-reader-bounds.json', {
    body: JSON.stringify(bounds, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('worker-history-requests.json', {
    body: JSON.stringify({ completed: historyReads, cancelled: cancelledHistory }, null, 2),
    contentType: 'application/json',
  });
});
