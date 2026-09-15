# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rule-help.spec.ts >> patient keyboard activation pins rather than closes a preview
- Location: .tim11/cold-start/rule-help.spec.ts:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: 'Executor', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog', { name: 'Executor', exact: true }) with timeout 5000ms
  - waiting for getByRole('dialog', { name: 'Executor', exact: true })

```

```yaml
- main:
  - heading "Reading controls" [level=1]
  - button "Default button"
  - button "Save reading preference"
  - button "Unavailable" [disabled]
  - button "Focus first control"
  - status "Saved preferences": "0"
  - heading "Act I · faction result" [level=2]:
    - button "Act I · faction result" [expanded]
  - paragraph: The match continues. All ten agents return for Act II.
  - button "Read starting resources"
  - paragraph:
    - button "Executor rules"
  - button "View long identity"
  - button "Collapse chapter externally"
  - button "Rules chapter" [expanded]
  - button "Treasurer rules"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  |
  3  | for (const activation of ['mouse', 'keyboard'] as const) {
  4  |   test(`patient ${activation} activation pins rather than closes a preview`, async ({ page }) => {
  5  |     const errors: string[] = [];
  6  |     page.on('pageerror', error => errors.push(error.stack ?? error.message));
  7  |     await page.goto('/.tim11/foundations.html');
  8  |     const trigger = page.getByRole('button', { name: 'Executor rules', exact: true });
  9  |     await trigger.hover();
  10 |     await expect(page.getByRole('tooltip')).toBeVisible();
  11 |     // Reproduce Base UI's 500ms patient-click branch, not a settling delay.
  12 |     await page.waitForTimeout(800);
  13 |     if (activation === 'mouse') await trigger.click();
  14 |     else await trigger.press('Enter');
> 15 |     await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
     |                                                                               ^ Error: expect(locator).toBeVisible() failed
  16 |     await expect(page.getByRole('button', { name: 'Close rules' })).toBeFocused();
  17 |     await page.mouse.move(0, 0);
  18 |     await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
  19 |     await page.keyboard.press('Escape');
  20 |     await expect(trigger).toBeFocused();
  21 |     expect(errors).toEqual([]);
  22 |   });
  23 | }
  24 |
  25 | test('removing the active trigger closes pinned help and returns focus to the surviving chapter control', async ({ page }) => {
  26 |   const errors: string[] = [];
  27 |   page.on('pageerror', error => errors.push(error.stack ?? error.message));
  28 |   await page.goto('/.tim11/foundations.html');
  29 |   await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  30 |   await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  31 |   // Model an owner-driven chapter update while the provider remains mounted.
  32 |   await page.getByRole('button', { name: 'Collapse chapter externally', includeHidden: true }).evaluate(button => button.click());
  33 |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  34 |   await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toHaveCount(0);
  35 |   const chapter = page.getByRole('button', { name: 'Rules chapter', exact: true });
  36 |   await expect(chapter).toBeFocused();
  37 |   await chapter.press('Enter');
  38 |   await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  39 |   await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  40 |   await page.keyboard.press('Escape');
  41 |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toBeFocused();
  42 |   expect(errors).toEqual([]);
  43 | });
  44 |
```