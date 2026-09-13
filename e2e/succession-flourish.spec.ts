import { expect, test } from '@playwright/test';

test('shared divider flourishes join the rule baseline at full and compact fractional scale', async ({
  page,
}) => {
  for (const width of [1600, 390, 320]) {
    await page.setViewportSize({ width, height: 1120 });
    await page.goto('/how-to-play');
    await page.evaluate(() => document.fonts.ready);

    for (const zoom of [1, 1.25]) {
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
      }, zoom);

      const joins = await page.locator('.decorated .deco-flourish').evaluateAll((svgs) =>
        svgs.map((svg) => {
          if (!(svg instanceof SVGSVGElement)) throw new Error('Missing flourish SVG');
          const path = svg.querySelector('path');
          const matrix = svg.getScreenCTM();
          const parent = svg.parentElement;

          if (!path || !matrix || !parent) throw new Error('Missing shared flourish geometry');
          const start = path.getPointAtLength(0).matrixTransform(matrix);
          const box = parent.getBoundingClientRect();
          const scale = Number(getComputedStyle(document.documentElement).zoom);
          const border = Number.parseFloat(getComputedStyle(parent).borderBottomWidth) * scale;
          const ink = path.getBBox();
          const right = new DOMPoint(ink.x + ink.width, 0).matrixTransform(matrix).x;

          return { gap: Math.abs(start.y - (box.bottom - border / 2)), right, bound: box.right };
        }),
      );

      expect(joins.length).toBeGreaterThan(0);

      for (const join of joins) {
        expect(join.gap, `join gap at ${width}px and ${zoom} scale`).toBeLessThanOrEqual(0.3);
        expect(join.right).toBeLessThan(join.bound);
      }

      await page.screenshot({
        path: `/tmp/opencode/succession-ui/flourish-${width}-${zoom}.png`,
        fullPage: true,
      });
    }
  }
});
