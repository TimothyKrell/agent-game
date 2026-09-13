import { expect, test } from '@playwright/test';
import { navigationFixture } from './luminous-shapes-fixture';

for (const width of [320, 390]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keyboard focus paints above the selected neighbor ${width} ${reducedMotion}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion });
      await navigationFixture(page, false);
      await page.goto('/leaderboard?gameId=succession');
      const active = page.locator('.header nav a.active');
      const inactive = page.locator('.header nav a').first();
      await expect(active).toHaveText('Leaderboard');
      await active.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(active).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('active-focus.png') });
      await page.keyboard.press('Shift+Tab');
      await expect(inactive).toBeFocused();
      await expect(inactive).toHaveText('Arena');
      await expect(inactive).not.toHaveClass(/active/);
      const box = await inactive.boundingBox();

      if (!box) throw new Error('Missing focused navigation bounds');
      await expect(page).toHaveScreenshot(`neighbor-facing-ring-${width}.png`, {
        clip: { x: box.x + box.width + 3, y: box.y + 12, width: 4, height: 24 },
        maxDiffPixels: 0,
      });
      await page.screenshot({ path: testInfo.outputPath('inactive-focus.png') });
      await page.goto('/?gameId=succession');
      await expect(active).toHaveText('Arena');
      await active.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(active).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('earlier-active-focus.png') });
      await page.keyboard.press('Tab');
      const later = page.locator('.header nav a').nth(1);
      await expect(later).toBeFocused();
      await expect(later).not.toHaveClass(/active/);
      const laterBox = await later.boundingBox();

      if (!laterBox) throw new Error('Missing later focused navigation bounds');
      await expect(page).toHaveScreenshot(`earlier-neighbor-ring-${width}.png`, {
        clip: { x: laterBox.x - 6, y: laterBox.y + 12, width: 4, height: 24 },
        maxDiffPixels: 0,
      });
      await page.screenshot({ path: testInfo.outputPath('later-inactive-focus.png') });
    });
  }
}
