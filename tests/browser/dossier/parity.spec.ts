import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const componentGuide = '/matches/tim-6-replay-prototype?variant=C&sample=components';

async function openGuide(page: Page) {
  await page.goto(componentGuide);
  await expect(page.getByRole('status')).toContainText('20 scenario groups ready');
}

async function inlineCenterDelta(page: Page) {
  return page.locator('[data-source-id="987"] blockquote').evaluate((blockquote) => {
    const term = blockquote.querySelector<HTMLElement>('.dossier-term');

    if (!term) throw new Error('Expected an inline rule term');

    const termRect = term.getBoundingClientRect();
    const walker = document.createTreeWalker(blockquote, NodeFilter.SHOW_TEXT);
    const proseRects: DOMRect[] = [];

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || term.contains(node)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      proseRects.push(...range.getClientRects());
    }

    const proseRect = proseRects
      .filter((rect) => rect.bottom > termRect.top && rect.top < termRect.bottom)
      .sort(
        (left, right) =>
          Math.abs((left.top + left.bottom - termRect.top - termRect.bottom) / 2) -
          Math.abs((right.top + right.bottom - termRect.top - termRect.bottom) / 2),
      )[0];

    if (!proseRect) throw new Error('Expected prose on the term line');

    return {
      delta: Math.abs((proseRect.top + proseRect.bottom - termRect.top - termRect.bottom) / 2),
      verticalAlign: getComputedStyle(term).verticalAlign,
    };
  });
}

test('desktop dossier keeps the approved compact reading geometry', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openGuide(page);
  const guide = page.locator('.page.replay-ui.dossier');
  await guide.evaluate((element) => element.classList.add('dossier-page'));

  const row = page.locator('[data-source-id="987"]');
  const phase = page.locator('[data-source-id="974"]');
  const quote = row.locator('blockquote');
  const portrait = row.locator('.dossier-portrait');

  expect((await guide.boundingBox())?.width).toBe(1504);
  await expect(row).toHaveCSS('grid-template-columns', /84px .*px .*px/);
  await expect(row).toHaveCSS('column-gap', '24px');
  await expect(quote).toHaveCSS('font-size', '16px');
  await expect(quote).toHaveCSS('line-height', '31.2px');
  await expect(quote).toHaveJSProperty('clientWidth', 786);
  await expect(portrait).toHaveCSS('width', '88px');
  await expect(phase).toHaveCSS('font-size', '16px');
  expect((await phase.boundingBox())?.height).toBeLessThanOrEqual(46);

  const inline = await inlineCenterDelta(page);
  expect(inline.verticalAlign).toBe('middle');
  expect(inline.delta).toBeLessThanOrEqual(1);

  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('dossier-desktop.png') });
});

test('narrow dossier preserves density without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 720, height: 1000 });
  await openGuide(page);

  const row = page.locator('[data-source-id="987"]');
  const phase = page.locator('[data-source-id="974"]');
  const quote = row.locator('blockquote');
  const portrait = row.locator('.dossier-portrait');

  const narrowGrid = await row.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' '),
    width: element.getBoundingClientRect().width,
  }));

  expect(narrowGrid.columns).toHaveLength(1);
  expect(Number.parseFloat(narrowGrid.columns[0])).toBeCloseTo(narrowGrid.width, 0);
  await expect(quote).toHaveCSS('font-size', '15px');
  await expect(portrait).toHaveCSS('width', '64px');
  expect((await phase.boundingBox())?.height).toBeLessThanOrEqual(47);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720);

  const systemSpacing = await phase.evaluate((element) => {
    const coordinate = element.querySelector<HTMLElement>('.dossier-coordinate');
    const story = element.querySelector<HTMLElement>('.dossier-story');

    if (!coordinate || !story) throw new Error('Expected system coordinate and story');

    const coordinateRect = coordinate.getBoundingClientRect();
    const storyRect = story.getBoundingClientRect();

    return storyRect.left - (coordinateRect.left + coordinate.scrollWidth);
  });

  expect(systemSpacing).toBeGreaterThanOrEqual(8);

  const inline = await inlineCenterDelta(page);
  expect(inline.verticalAlign).toBe('middle');
  expect(inline.delta).toBeLessThanOrEqual(1);

  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('dossier-narrow.png') });
});
