/** Browser inspection for the first owner Agentation batch. Keeps previous review evidence intact. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory =
  resolve(
    process.env.TIM6_CAPTURE_DIR ??
      new URL('../docs/design/TIM-6/annotation-review/', import.meta.url).pathname,
  ) + '/';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});

const checks = [];

const errors = [];

const captures = [];

const origin = process.env.TIM6_ORIGIN ?? 'http://localhost:5177';

await mkdir(directory + 'screenshots', { recursive: true });

function check(name, passed) {
  checks.push({ name, passed });
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}screenshots/${name}.png` });
  captures.push(name + '.png');
}

try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 1080 }],
    ['narrow', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({
      viewport,
      isMobile: size === 'narrow',
      hasTouch: size === 'narrow',
      reducedMotion: 'reduce',
    });

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/matches/tim-6-replay-prototype?variant=C&sample=match`);
    await page.getByRole('heading', { name: 'Patch wins.', exact: true }).waitFor();
    check(
      `${size}: values integrated in winner rule controls`,
      await page
        .locator('.dp-winner-facts')
        .evaluate(
          (element) =>
            element.querySelector('[data-rule-term="Influence"] b')?.textContent === '2' &&
            element.querySelector('[data-rule-term="Coins"] b')?.textContent === '3',
        ),
    );

    const portrait = page.getByRole('button', { name: 'View Patch profile picture', exact: true }).first();
    await portrait.focus();
    const initialScroll = await page.evaluate(() => scrollY);

    if (size === 'narrow') await portrait.tap();
    else await portrait.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Patch', exact: true });
    await dialog.waitFor();
    await capture(page, `${size}-portrait`);
    check(
      `${size}: enlarged portrait loads and fits`,
      await dialog.evaluate((element) => {
        const image = element.querySelector('img');
        const box = element.getBoundingClientRect();

        return (
          image.complete &&
          image.naturalWidth > 0 &&
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth &&
          box.bottom <= innerHeight
        );
      }),
    );
    await page.keyboard.press('Shift+Tab');
    check(
      `${size}: portrait keyboard focus contained`,
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    );
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    check(
      `${size}: portrait closes with reading position and focus intact`,
      (await portrait.evaluate((element) => document.activeElement === element)) &&
        Math.abs((await page.evaluate(() => scrollY)) - initialScroll) < 3,
    );

    const exchange = page.locator('#dp-event-1fa78d0b-5a5d-41de-9cc5-2788497b77d6');
    await exchange.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    check(
      `${size}: Exchange states chooser, count and privacy`,
      (await exchange.textContent()).includes(
        'Katniss Everdeen is choosing 2 cards to return for Exchange. Cards stay private during play.',
      ),
    );
    const exchangeRule = exchange.getByRole('button', { name: 'Exchange rules' });
    await exchangeRule.click();
    await page.getByRole('dialog', { name: 'Exchange', exact: true }).waitFor();
    await capture(page, `${size}-exchange-explained`);
    await page.getByRole('button', { name: 'Close rules', exact: true }).click();
    check(
      `${size}: Exchange public phase exposes no private cards`,
      (await exchange.locator('.dp-card, .dp-private').count()) === 0,
    );

    const discussion = page.locator('#dp-event-07e8fde4-8fac-4bd1-9302-4b5fe4c234ba');
    await discussion.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    check(
      `${size}: discussion identifies turn ownership without an actor heading`,
      (await discussion.textContent()).includes('Orbit’s turn · Discussion open.') &&
        (await discussion.locator('.dp-actor').count()) === 0,
    );
    await capture(page, `${size}-discussion-label`);

    const speaker = page.locator('[data-source-id="987"] .dp-actor .dp-avatar');

    const sameAgent = page
      .locator('.dp-delta')
      .filter({ has: page.locator('strong', { hasText: 'Orbit' }) })
      .first()
      .locator('.dp-avatar');

    check(
      `${size}: same picture follows speaker into state panel`,
      (await speaker.locator('img').getAttribute('src')) ===
        (await sameAgent.locator('img').getAttribute('src')),
    );
    const speech = page.locator('[data-source-id="987"]');
    await speech.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    check(
      `${size}: consecutive discussion rows are close and divider-free`,
      await speech.evaluate((element) => {
        const next = element.nextElementSibling;

        return (
          next.classList.contains('dp-chat') &&
          getComputedStyle(element).borderBottomWidth === '0px' &&
          Number.parseFloat(getComputedStyle(next).paddingTop) <= 4
        );
      }),
    );
    check(
      `${size}: inline portraits stay square`,
      await speaker.evaluate((element) => {
        const box = element.getBoundingClientRect();

        return box.width === box.height && box.width >= 24;
      }),
    );

    for (const term of ['Thief', 'Challenge']) {
      const rule = page.locator(`[data-rule-term="${term}"]`).first();
      await rule.click();
      await page.getByRole('dialog', { name: term, exact: true }).waitFor();
      await capture(page, `${size}-${term.toLowerCase()}-icon`);
      await page.getByRole('button', { name: 'Close rules', exact: true }).click();
    }

    await page.getByRole('button', { name: 'Action & UI examples', exact: true }).click();
    await page.locator('#dp-example-execution-return .dp-return summary').click();

    const fallback = page
      .locator('#dp-event-ex-return')
      .getByRole('button', { name: 'View Vesper profile picture', exact: true });

    await fallback.click();
    await page.getByRole('dialog', { name: 'Vesper', exact: true }).waitFor();
    check(
      `${size}: missing-picture fallback has explicit explanation`,
      (await page.getByRole('dialog').innerText()).includes('No profile picture yet'),
    );
    await capture(page, `${size}-portrait-fallback`);
    await page.getByRole('button', { name: 'Close profile picture' }).click();
    check(
      `${size}: close button restores fallback trigger`,
      await fallback.evaluate((element) => document.activeElement === element),
    );
    check(
      `${size}: revised examples contained`,
      await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
    );
    await page.close();
  }

  check('No application exceptions in new interactions', errors.length === 0);
  const result = { checkedAt: new Date().toISOString(), checks, errors, captures };
  await writeFile(directory + 'annotation-inspection.json', JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        passed: checks.filter((check) => check.passed).length,
        failed: checks.filter((check) => !check.passed),
        captures: captures.length,
      },
      null,
      2,
    ),
  );

  if (checks.some((check) => !check.passed)) process.exitCode = 1;
} finally {
  await browser.close();
}
