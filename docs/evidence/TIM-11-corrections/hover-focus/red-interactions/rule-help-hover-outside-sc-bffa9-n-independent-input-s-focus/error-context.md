# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rule-help.spec.ts >> hover outside scroll preserves an independent input's focus
- Location: .tim11/cold-start/rule-help.spec.ts:78:3

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('textbox', { name: 'Reading note' })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('textbox', { name: 'Reading note' }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: 'Reading note' })
    14 × locator resolved to <input id="reading-note"/>
       - unexpected value "inactive"

```

```yaml
- textbox "Reading note": Keep reading here
```

# Test source

```ts
  4   |   test(`patient ${activation} activation pins rather than closes a preview`, async ({ page }) => {
  5   |     const errors: string[] = [];
  6   |     page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  7   |     await page.goto('/.tim11/foundations.html');
  8   |     const trigger = page.getByRole('button', { name: 'Executor rules', exact: true });
  9   |     await trigger.hover();
  10  |     await expect(page.getByRole('tooltip')).toBeVisible();
  11  |     // Reproduce Base UI's 500ms patient-click branch, not a settling delay.
  12  |     await page.waitForTimeout(800);
  13  |
  14  |     if (activation === 'mouse') await trigger.click();
  15  |     else await trigger.press(activation);
  16  |     await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
  17  |     await expect(page.getByRole('button', { name: 'Close rules' })).toBeFocused();
  18  |     await page.mouse.move(0, 0);
  19  |     await expect(page.getByRole('dialog', { name: 'Executor', exact: true })).toBeVisible();
  20  |     await page.keyboard.press('Escape');
  21  |     await expect(trigger).toBeFocused();
  22  |     expect(errors).toEqual([]);
  23  |   });
  24  | }
  25  |
  26  | test('removing the active trigger closes pinned help and returns focus to the surviving chapter control', async ({
  27  |   page,
  28  | }) => {
  29  |   const errors: string[] = [];
  30  |   page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  31  |   await page.goto('/.tim11/foundations.html');
  32  |   await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  33  |   await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  34  |   // Model an owner-driven chapter update while the provider remains mounted.
  35  |   await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  36  |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  37  |   await expect(page.getByRole('dialog')).toHaveCount(0);
  38  |   const chapter = page.getByRole('button', { name: 'Rules chapter', exact: true });
  39  |   await expect(chapter).toBeFocused();
  40  |   await chapter.press('Enter');
  41  |   await page.getByRole('button', { name: 'Treasurer rules', exact: true }).press('Enter');
  42  |   await expect(page.getByRole('dialog', { name: 'Treasurer', exact: true })).toBeVisible();
  43  |   await page.keyboard.press('Escape');
  44  |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toBeFocused();
  45  |   expect(errors).toEqual([]);
  46  | });
  47  |
  48  | test('removing a hover trigger dismisses its preview without stealing focus', async ({ page }) => {
  49  |   const errors: string[] = [];
  50  |   page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  51  |   await page.goto('/.tim11/foundations.html');
  52  |   const chapter = page.getByRole('button', { name: 'Rules chapter', exact: true });
  53  |   await chapter.focus();
  54  |   await page.getByRole('button', { name: 'Treasurer rules', exact: true }).hover();
  55  |   await expect(page.getByRole('tooltip')).toBeVisible();
  56  |   await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  57  |   await expect(page.getByRole('tooltip')).toHaveCount(0);
  58  |   await expect(chapter).toBeFocused();
  59  |   expect(errors).toEqual([]);
  60  | });
  61  |
  62  | test('unmounting an unrelated trigger preserves the pinned reference', async ({ page }) => {
  63  |   const errors: string[] = [];
  64  |   page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  65  |   await page.goto('/.tim11/foundations.html');
  66  |   const trigger = page.getByRole('button', { name: 'Persistent coins rules', exact: true });
  67  |   await trigger.press('Enter');
  68  |   await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
  69  |   await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  70  |   await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  71  |   await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
  72  |   await page.keyboard.press('Escape');
  73  |   await expect(trigger).toBeFocused();
  74  |   expect(errors).toEqual([]);
  75  | });
  76  |
  77  | for (const dismissal of ['outside scroll', 'active trigger unmount'] as const) {
  78  |   test(`hover ${dismissal} preserves an independent input's focus`, async ({ page }) => {
  79  |     const errors: string[] = [];
  80  |     page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  81  |     await page.goto('/.tim11/foundations.html');
  82  |     const input = page.getByRole('textbox', { name: 'Reading note' });
  83  |     await input.fill('Keep reading here');
  84  |     await expect(input).toBeFocused();
  85  |     await page.getByRole('button', { name: 'Treasurer rules', exact: true }).hover();
  86  |     await expect(page.getByRole('tooltip')).toBeVisible();
  87  |     await expect(input).toBeFocused();
  88  |
  89  |     if (dismissal === 'outside scroll') {
  90  |       const scrollArea = page.getByRole('region', { name: 'Independent scroll area' });
  91  |       await scrollArea.evaluate((element) => { element.scrollTop = 60; });
  92  |       await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(60);
  93  |     } else {
  94  |       await page.evaluate(() => window.dispatchEvent(new Event('tim11-collapse')));
  95  |       await expect(page.getByRole('button', { name: 'Treasurer rules', exact: true })).toHaveCount(0);
  96  |     }
  97  |
  98  |     await expect(page.getByRole('tooltip')).toHaveCount(0);
  99  |     // Observe after the focus manager's queued close work, not just popup removal.
  100 |     const activeElement = await page.evaluate(() => new Promise<string | undefined>((resolve) => {
  101 |       requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.activeElement?.outerHTML)));
  102 |     }));
  103 |     await test.info().attach('final-focus', { body: JSON.stringify({ dismissal, activeElement }), contentType: 'application/json' });
> 104 |     await expect(input).toBeFocused();
      |                         ^ Error: expect(locator).toBeFocused() failed
  105 |     await page.keyboard.type(' still focused');
  106 |     await expect(input).toHaveValue('Keep reading here still focused');
  107 |     expect(errors).toEqual([]);
  108 |   });
  109 | }
  110 |
```