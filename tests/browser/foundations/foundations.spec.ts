import { expect, test } from '@playwright/test';

for (const width of [1440, 390, 320]) {
  test(`native controls, chapter and modal at ${width}`, async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      hasTouch: width < 400,
      isMobile: width < 400,
      reducedMotion: 'reduce',
    });

    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:6191/dev/foundations/foundations.html');
    const first = page.getByRole('button', { name: 'Default button' });

    await first.click();
    await expect(page.getByLabel('Saved preferences')).toHaveText('0');
    await page.getByRole('button', { name: 'Save reading preference' }).click();
    await expect(page.getByLabel('Saved preferences')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    await page.getByRole('button', { name: 'Focus first control' }).click();
    await expect(first).toBeFocused();
    await first.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(
      await first.evaluate((element) => ({
        clip: getComputedStyle(element).clipPath,
        outline: getComputedStyle(element).outlineStyle,
      })),
    ).toEqual({ clip: 'none', outline: 'solid' });

    const chapter = page.getByRole('button', { name: 'Act I · faction result' });
    await chapter.focus();
    await chapter.press('Enter');
    await expect(page.getByText('The match continues.')).toBeHidden();
    await expect(chapter).toHaveAttribute('aria-expanded', 'false');
    await expect(chapter).toBeFocused();
    await chapter.press('Space');
    await expect(page.getByText('The match continues.')).toBeVisible();
    await chapter.press('Tab');
    await expect(page.getByRole('button', { name: 'Read starting resources' })).toBeFocused();

    const trigger = page.getByRole('button', { name: 'View long identity' });

    if (width < 400) await trigger.tap();
    else await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'A'.repeat(80), exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close identity' })).toBeFocused();

    const portal = await dialog.evaluate((element) => ({
      font: getComputedStyle(element).fontFamily,
      surface: getComputedStyle(element).getPropertyValue('--replay-surface').trim(),
      muted: getComputedStyle(element).getPropertyValue('--muted').trim(),
    }));

    expect(portal.font).toContain('Montserrat');
    expect(portal.surface).toBe('#0d2023');
    expect(portal.muted).toBe('#aac4c1');

    for (let index = 0; index < 6; index++) {
      await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
      await expect
        .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
    }

    await page.screenshot({ path: test.info().outputPath(`dialog-${width}.png`) });
    await page.getByRole('button', { name: 'View portrait detail' }).click();
    await expect(page.getByRole('dialog', { name: 'Portrait detail', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'View portrait detail' })).toBeFocused();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
}

test('rule preview pins, dismisses and restores focus; narrow zoom remains scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 844 });
  await page.goto('/dev/foundations/foundations.html');
  const trigger = page.getByRole('button', { name: 'Executor rules' });
  await trigger.hover();
  const preview = page.getByRole('tooltip');
  await expect(preview).toBeVisible();
  await preview.hover();
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await trigger.hover();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Executor', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close rules' })).toBeFocused();
  await page.mouse.move(0, 0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.mouse.move(0, 0);
  await trigger.hover();
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  // 640×844 physical pixels at 200% layout zoom: 320×422 CSS pixels.
  // CSS `zoom` is not browser zoom: it scales floating coordinates a second time.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 422,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();

      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('rule-200-percent-zoom.png') });
  await dialog.hover();
  await page.mouse.wheel(0, 2000);
  await expect(dialog.getByText('Rule reference')).toBeInViewport();
  await page.getByRole('button', { name: 'Close rules' }).click();
  await expect(trigger).toBeFocused();
});

test('important motion policy reaches portals and hidden-document help dismisses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/foundations/foundations.html');
  const trigger = page.getByRole('button', { name: 'Executor rules' });
  await trigger.press('Enter');
  const popup = page.getByRole('dialog', { name: 'Executor', exact: true });
  await expect(popup).toBeVisible();
  expect(
    await popup.locator('button').evaluate((element) => ({
      transition: getComputedStyle(element).transitionDuration,
      animation: getComputedStyle(element).animationName,
    })),
  ).toEqual({ transition: '0s', animation: 'none' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
});
