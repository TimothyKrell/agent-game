import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { navigationFixture, speechFixture } from './luminous-shapes-fixture';

async function captureHeader(page: Page, testInfo: TestInfo, name: string) {
  await page.locator('.header').evaluate(async (node) => {
    await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  const box = await page.locator('.header').boundingBox();

  if (!box) throw new Error('Missing header bounds');
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    clip: { x: box.x - 8, y: box.y, width: box.width + 16, height: box.height + 8 },
    animations: 'allow',
  });
}

for (const width of [1600, 768, 390, 320]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`shared contours across public surfaces ${width} ${reducedMotion}`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      const viewport = {
        width,
        height:
          new Map([
            [1600, 1120],
            [768, 1024],
          ]).get(width) ?? 844,
      };

      const context = await browser.newContext({
        baseURL,
        viewport,
        deviceScaleFactor: 1,
        reducedMotion,
        hasTouch: width < 768,
        recordVideo: { dir: testInfo.outputPath('video'), size: viewport },
      });

      const page = await context.newPage();

      try {
        for (const signedIn of [false, true]) {
          await navigationFixture(page, signedIn);

          for (const [path, label] of [
            ['/', 'Arena'],
            ['/leaderboard', 'Leaderboard'],
            ['/dashboard', 'Your roster'],
            ['/how-to-play', 'How to play'],
          ]) {
            await page.goto(`${path}?gameId=succession`);
            await page.evaluate(() => document.fonts.ready);
            const active = page.locator('.header nav a.active');
            await expect(active).toHaveText(label);

            const contour = await active.evaluate((node) => {
              const plate = getComputedStyle(node, '::before');

              return { source: plate.borderImageSource, fill: plate.backgroundColor };
            });

            if (width <= 760) {
              expect(contour).toEqual({ source: 'none', fill: 'rgb(21, 54, 58)' });
            } else {
              expect(contour.source).toContain('/deco-nav-selected.svg');
            }

            for (const zoom of [1, 1.25]) {
              await page.evaluate((value) => {
                document.documentElement.style.zoom = String(value);
              }, zoom);
              const suffix = `${signedIn ? 'in' : 'out'}-${label.replaceAll(' ', '-')}-${zoom}`;
              await captureHeader(page, testInfo, `nav-${suffix}`);
              await active.focus();
              await page.keyboard.press('Tab');
              await page.keyboard.press('Shift+Tab');
              await expect(active).toBeFocused();
              await captureHeader(page, testInfo, `focus-${suffix}`);
              const inactive = page.locator('.header nav a:not(.active)').first();
              await inactive.focus();
              await page.keyboard.press('Tab');
              await page.keyboard.press('Shift+Tab');
              await expect(inactive).toBeFocused();
              await expect(inactive).not.toHaveClass(/active/);
              await captureHeader(page, testInfo, `focus-inactive-${suffix}`);

              const contained = await page.locator('.header nav a').evaluateAll((nodes) =>
                nodes.every((node) => {
                  const box = node.getBoundingClientRect();
                  const range = document.createRange();
                  range.selectNodeContents(node);

                  return [...range.getClientRects()].every(
                    (rect) =>
                      rect.left >= box.left &&
                      rect.right <= box.right &&
                      rect.top >= box.top &&
                      rect.bottom <= box.bottom,
                  );
                }),
              );

              expect(contained).toBe(true);
            }
          }
        }

        await page.evaluate(() => {
          document.documentElement.style.zoom = '1';
        });

        for (const game of ['secret-overlord', 'succession'] as const) {
          for (const archived of [false, true]) {
            await speechFixture(page, game, archived);
            const bubbles = page.locator('.entry-speech:visible');
            await expect(bubbles).toHaveCount(3);

            for (let seat = 0; seat < 3; seat++) {
              const bubble = bubbles.nth(seat);
              await bubble.scrollIntoViewIfNeeded();
              await expect(bubble).toBeVisible();
              expect(await bubble.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
              await bubble.screenshot({
                path: testInfo.outputPath(`speech-${game}-${archived ? 'replay' : 'live'}-${seat}.png`),
              });
            }

            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          }
        }
      } finally {
        await context.close();
      }
    });
  }
}
