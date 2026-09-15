# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rule-help-focus.spec.ts >> activating the actual chapter control during pinned help returns focus to its surviving heading
- Location: .dossier/rule-help-focus.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('button', { name: 'Rules chapter', exact: true, includeHidden: true })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('button', { name: 'Rules chapter', exact: true, includeHidden: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Rules chapter', exact: true, includeHidden: true })
    14 × locator resolved to <button tabindex="0" type="button" aria-disabled="false" aria-expanded="false">Rules chapter</button>
       - unexpected value "inactive"

```

```yaml
- button "Rules chapter"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('activating the actual chapter control during pinned help returns focus to its surviving heading', async ({ page }) => {
  4  |   page.on('console', message => { if (message.text().startsWith('[DEBUG-rule-focus]')) console.log(message.text()); });
  5  |   await page.goto(`/.dossier/focus.html${process.env.FOCUS_NATIVE ? '?native' : ''}`);
  6  |   const heading = page.getByRole('button', { name: 'Rules chapter', exact: true, includeHidden: true });
  7  |   await page.getByRole('button', { name: 'Coins rules', exact: true }).press('Enter');
  8  |   await expect(page.getByRole('dialog', { name: 'Coins', exact: true })).toBeVisible();
  9  |   await expect(page.getByRole('button', { name: 'Close rules', exact: true })).toBeFocused();
  10 |   await heading.evaluate(button => button.click());
  11 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  12 |   await expect(page.getByRole('button', { name: 'Coins rules', exact: true })).toHaveCount(0);
> 13 |   await expect(heading).toBeFocused();
     |                         ^ Error: expect(locator).toBeFocused() failed
  14 | });
  15 | 
```