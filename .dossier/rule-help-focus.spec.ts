import { expect, test } from '@playwright/test';

for (const native of [false, true]) {
  test(`${native ? 'native' : 'Collapsible'} chapter activation during pinned help restores the surviving heading`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/.dossier/focus.html${native ? '?native' : ''}`);
    const heading = page.getByRole('button', { name: 'Rules chapter', exact: true, includeHidden: true });
    const trigger = page.getByRole('button', { name: 'Coins rules', exact: true });
    await trigger.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close rules', exact: true })).toBeFocused();
    // The real route activates its surviving chapter control: this is also a Popover outside press.
    await heading.evaluate((button) => button.click());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toHaveCount(0);
    await expect(heading).toBeFocused();
    await heading.press('Enter');
    await trigger.press('Enter');
    await expect(page.getByRole('button', { name: 'Close rules', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const mode of ['pinned', 'hover']) {
  test(`whole provider removal from ${mode} help respects the route owner's chosen external focus`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/.dossier/focus.html?provider-removal');
    const input = page.getByRole('textbox', { name: 'External note' });
    await input.fill('Retained note');
    const trigger = page.getByRole('button', { name: 'Coins rules', exact: true });

    if (mode === 'pinned') await trigger.press('Enter');
    else await trigger.hover();
    await expect(page.getByRole(mode === 'pinned' ? 'dialog' : 'tooltip')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('remove-rule-provider')));
    await expect(trigger).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await expect(page.getByRole('button', { name: 'Provider owner control' })).toBeVisible();
    await expect(input).toBeFocused();
    await page.keyboard.type(' still focused');
    await expect(input).toHaveValue('Retained note still focused');
    expect(errors).toEqual([]);
  });
}
