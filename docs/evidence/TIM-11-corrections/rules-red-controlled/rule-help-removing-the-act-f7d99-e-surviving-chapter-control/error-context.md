# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rule-help.spec.ts >> removing the active trigger closes pinned help and returns focus to the surviving chapter control
- Location: .tim11/cold-start/rule-help.spec.ts:25:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('dialog')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByRole('dialog') with timeout 5000ms
  - waiting for getByRole('dialog')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e3]:
    - heading [level=1] [aria-hidden] [ref=e4]: Reading controls
    - generic [aria-hidden] [ref=e5]:
      - button [ref=e6] [cursor=pointer]: Default button
      - button [ref=e7] [cursor=pointer]: Save reading preference
      - button [disabled] [ref=e8]: Unavailable
      - button [ref=e9] [cursor=pointer]: Focus first control
      - status [ref=e10]: "0"
    - generic [aria-hidden] [ref=e11]:
      - heading [level=2] [ref=e12]:
        - button [expanded] [ref=e13] [cursor=pointer]: Act I · faction result
      - generic [ref=e14]:
        - paragraph [ref=e15]: The match continues. All ten agents return for Act II.
        - button [ref=e16] [cursor=pointer]: Read starting resources
    - paragraph [aria-hidden] [ref=e17]:
      - button [ref=e18] [cursor=pointer]: Executor rules
    - button [aria-hidden] [ref=e21] [cursor=pointer]: View long identity
    - button [aria-hidden] [ref=e22] [cursor=pointer]: Collapse chapter externally
    - button [aria-hidden] [ref=e24] [cursor=pointer]: Rules chapter
  - dialog [ref=e28]:
    - button "Close rules" [active] [ref=e29] [cursor=pointer]
    - heading "Treasurer" [level=2] [ref=e34]
    - strong [ref=e35]: Claim to gain three coins.
    - paragraph [ref=e36]: A claim may be challenged.
    - text: Rule reference
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
  15 |     await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
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
  32 |   await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  33 |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
> 34 |   await expect(page.getByRole('dialog')).toHaveCount(0);
     |                                          ^ Error: expect(locator).toHaveCount(expected) failed
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