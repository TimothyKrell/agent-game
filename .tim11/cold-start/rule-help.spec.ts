import { expect, test } from '@playwright/test';

for (const activation of ['mouse', 'Enter', 'Space'] as const) {
  test(`patient ${activation} activation pins rather than closes a preview`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    await page.goto('/.tim11/foundations.html');
    const trigger = page.getByRole('button', { name: 'Executor rules', exact: true });
    await trigger.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    // Reproduce Base UI's 500ms patient-click branch, not a settling delay.
    await page.waitForTimeout(800);

    if (activation === 'mouse') await trigger.click();
    else await trigger.press(activation);
    await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close rules' })).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('removing the active trigger closes pinned help and returns focus to the surviving chapter control', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/.tim11/foundations.html');
  await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  // Model an owner-driven chapter update while the provider remains mounted.
  await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const chapter = page.getByRole('button', { name: 'Rules chapter', exact: true });
  await expect(chapter).toBeFocused();
  await chapter.press('Enter');
  await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('removing a hover trigger dismisses its preview without stealing focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/.tim11/foundations.html');
  const chapter = page.getByRole('button', { name: 'Rules chapter', exact: true });
  await chapter.focus();
  await page.getByRole('button', { name: 'Treasurer rules', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(chapter).toBeFocused();
  expect(errors).toEqual([]);
});

test('unmounting an unrelated trigger preserves the pinned reference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/.tim11/foundations.html');
  const trigger = page.getByRole('button', { name: 'Persistent coins rules', exact: true });
  await trigger.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
