import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

declare global {
  interface Window {
    dossierReaderBounds: { maxRows: number; duplicate: boolean; outOfOrder: boolean };
  }
}

export async function observeDossierBounds(page: Page) {
  await page.addInitScript(() => {
    const measurements = { maxRows: 0, duplicate: false, outOfOrder: false };
    window.dossierReaderBounds = measurements;

    const observer = new MutationObserver(() => {
      for (const reader of document.querySelectorAll('[data-story-window]')) {
        const cursors = [...reader.querySelectorAll('[data-story-cursor]')].map((row) =>
          Number(row.getAttribute('data-story-cursor')),
        );

        measurements.maxRows = Math.max(measurements.maxRows, cursors.length);
        measurements.duplicate ||= new Set(cursors).size !== cursors.length;
        measurements.outOfOrder ||= cursors.some((cursor, index) => index > 0 && cursor < cursors[index - 1]);
      }
    });

    observer.observe(document, { childList: true, subtree: true });
  });
}

export async function expectObservedDossierBounds(page: Page) {
  const measurements = await page.evaluate(() => window.dossierReaderBounds);
  expect(measurements.maxRows).toBeLessThanOrEqual(128);
  expect(measurements.duplicate).toBe(false);
  expect(measurements.outOfOrder).toBe(false);

  return measurements;
}

export const chapter = (page: Page, act: 1 | 2) =>
  page.getByRole('region', { name: act === 1 ? 'Act I' : 'Act II', exact: true });

export const record = (page: Page, act: 1 | 2) =>
  page.getByRole('region', { name: act === 1 ? 'Act I record' : 'Act II record', exact: true });

export async function openChapter(page: Page, act: 1 | 2) {
  const trigger = chapter(page, act).locator('.dossier-chapter-trigger');

  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(record(page, act)).toBeVisible();
  await expect(record(page, act)).toHaveAttribute('aria-busy', 'false');

  return record(page, act);
}

/** Scroll the actual document reader, retaining the finite-window and chronological contract. */
export async function readToSource(page: Page, act: 1 | 2, cursor: number) {
  const reader = await openChapter(page, act);
  const source = reader.locator(`[data-source-id="${cursor}"]`);

  for (let turn = 0; turn < 160; turn++) {
    if (await source.count()) {
      await source.scrollIntoViewIfNeeded();
      await expect(source).toBeInViewport();

      return source;
    }

    const after = Number(await reader.getAttribute('data-story-after'));
    const delivered = Number(await reader.getAttribute('data-story-delivered'));
    await expectBoundedRecord(reader);
    const earlier = cursor <= after;
    const edge = reader.locator('[data-story-key]').filter({ visible: true });
    const target = earlier ? edge.first() : edge.last();

    if (!(await target.count())) throw new Error(`No rendered boundary at ${after}–${delivered}`);
    await target.evaluate((node, previous) => {
      node.scrollIntoView({ block: previous ? 'start' : 'end', behavior: 'instant' });
    }, earlier);
    // Let the document's queued scroll event finish before expressing the next wheel direction.
    // Otherwise a downward programmatic positioning scroll can overwrite an earlier-reading intent.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await reader.dispatchEvent('wheel', { deltaY: earlier ? -500 : 500 });

    try {
      await expect
        .poll(
          async () =>
            `${await reader.getAttribute('data-story-after')}:${await reader.getAttribute('data-story-delivered')}`,
        )
        .not.toBe(`${after}:${delivered}`);
    } catch (error) {
      const geometry = await reader.evaluate((root) => ({
        root: root.getBoundingClientRect().toJSON(),
        first: root.firstElementChild?.getBoundingClientRect().toJSON(),
        scrollY,
        focused: document.activeElement?.outerHTML,
        rows: [...root.querySelectorAll('[data-story-key]')].map((row) => ({
          cursor: row.getAttribute('data-story-cursor'),
          key: row.getAttribute('data-story-key'),
          box: row.getBoundingClientRect().toJSON(),
        })),
      }));

      await test.info().attach('reading-boundary.json', {
        body: JSON.stringify({ act, cursor, after, delivered, earlier, geometry }, null, 2),
        contentType: 'application/json',
      });
      throw error;
    }

    await expect(reader).toHaveAttribute('aria-busy', 'false');
  }

  throw new Error(`Source ${cursor} was not reachable by reading Act ${act}`);
}

export async function expectBoundedRecord(reader: Locator) {
  const cursors = await reader
    .locator('[data-story-cursor]')
    .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-story-cursor'))));

  expect(cursors.length).toBeLessThanOrEqual(128);
  expect(new Set(cursors).size).toBe(cursors.length);
  expect(cursors).toEqual([...cursors].sort((a, b) => a - b));
}

export async function expectReadingControls(page: Page) {
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.getByLabel('Browse by round')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^(Play from start|Pause|Discussion|Actions|Everything)$/ }),
  ).toHaveCount(0);
  await expect(chapter(page, 1).locator('.dossier-chapter-trigger')).toBeVisible();
  await expect(chapter(page, 2).locator('.dossier-chapter-trigger')).toBeVisible();
}
