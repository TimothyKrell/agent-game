import { expect, type Page } from '@playwright/test';

export async function expectTimelineFiltersBounded(page: Page) {
  const filters = page.getByLabel('Filter table feed');
  await expect(filters.getByRole('button')).toHaveCount(3);

  const violations = await filters.evaluate((element) => {
    const target = element.getBoundingClientRect();

    return [...element.querySelectorAll('button')].flatMap((button) => {
      const box = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const text = range.getBoundingClientRect();

      return box.left < target.left - 1 ||
        box.right > target.right + 1 ||
        text.left < box.left - 1 ||
        text.right > box.right + 1
        ? [button.textContent]
        : [];
    });
  });

  expect(violations, 'Each timeline filter and its complete label fits its target').toEqual([]);
}
