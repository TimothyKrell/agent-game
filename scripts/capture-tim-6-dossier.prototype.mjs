/** Owner-revision browser inspection. Separate evidence from the original A/B/C review. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory =
  resolve(
    process.env.TIM6_CAPTURE_DIR ?? new URL('../docs/design/TIM-6/owner-review/', import.meta.url).pathname,
  ) + '/';

const base = `${process.env.TIM6_ORIGIN ?? 'http://127.0.0.1:5177'}/matches/tim-6-replay-prototype?variant=C`;

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});

const checks = [];

const errors = [];

const requests = [];

const captures = [];

await mkdir(directory + 'screenshots', { recursive: true });

function check(name, passed, evidence = '') {
  checks.push({ name, passed, evidence });
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}screenshots/${name}.png` });
  captures.push(`${name}.png`);
}

async function locate(page, id) {
  await page
    .locator(`[data-source-id="${id}"]`)
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

async function contained(page) {
  return page.evaluate(() => document.documentElement.scrollWidth === innerWidth);
}

try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 1080 }],
    ['narrow', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
      isMobile: size === 'narrow',
      hasTouch: size === 'narrow',
      reducedMotion: 'reduce',
    });

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    await page.goto(base);
    await page.getByRole('heading', { name: 'Patch wins.', exact: true }).waitFor();
    await capture(page, `${size}-entry`);
    check(`${size}: document contained`, await contained(page));
    check(
      `${size}: reading-only controls`,
      (await page
        .locator('.dp-prototype')
        .locator(
          'input[type="range"], .rp-playback, .rp-round, .rp-view-state, .rp-consequence, .rp-explanation',
        )
        .count()) === 0,
    );
    check(
      `${size}: no editorial event labels or raw data panels`,
      !/Why this matters|CONSEQUENCE|Tax waits for proof|Recorded data|Disproof → resolution/.test(
        await page.locator('.dp-record').innerText(),
      ),
    );
    check(`${size}: archive hidden by default`, (await page.locator('.dp-private').count()) === 0);
    await page.locator('#dp-act-1 .rp-chapter-heading').click();

    const fidelity = await page.evaluate(async () => {
      const data = await import('/src/client/succession-dossier-data.prototype.ts');
      const expected = data.dossierRows.filter((row) => !row.private).map((row) => row.sourceId);

      const actual = [...document.querySelectorAll('[data-source-id]')].map((row) =>
        Number(row.getAttribute('data-source-id')),
      );

      const speech = data.record.events.filter((event) => event.type === 'chat');

      return {
        chronological: JSON.stringify(expected) === JSON.stringify(actual),
        speechExact: speech.every(
          (event) =>
            document.querySelector(`[data-source-id="${event.id}"] blockquote`)?.textContent === event.text,
        ),
        speechCount: speech.length,
        terminalBalances:
          JSON.stringify(data.reconstructedBalances) ===
          JSON.stringify(
            data.record.current.seats.map((seat) => ({ coins: seat.coins, influence: seat.influence })),
          ),
        publicCount: expected.length,
        totalArchive: data.record.events.length,
        rows: data.dossierRows.length,
        payment: data.dossierRows.find((row) => row.sourceId === 1858).deltas,
        proof: data.dossierRows.find((row) => row.sourceId === 1011).deltas,
        loss: data.dossierRows.find((row) => row.sourceId === 1064).deltas,
        sixActions: new Set(
          data.record.events
            .filter((event) => event.type === 'declaration')
            .map((event) => event.data.action.type),
        ).size,
      };
    });

    check(`${size}: entire public chronology in source order`, fidelity.chronological, fidelity.publicCount);
    check(`${size}: every recorded quote preserved exactly`, fidelity.speechExact, fidelity.speechCount);
    check(`${size}: all ten reconstructed balances match terminal source`, fidelity.terminalBalances);
    check(`${size}: all six actual action types`, fidelity.sixActions === 6);
    check(
      `${size}: declaration payment retained`,
      JSON.stringify(fidelity.payment[0].coins) === '[6,3]',
      fidelity.payment,
    );
    check(
      `${size}: proof replaces without influence loss`,
      JSON.stringify(fidelity.proof[0].influence) === '[2,2]',
      fidelity.proof,
    );
    check(
      `${size}: failed claim eliminates at historical cursor`,
      JSON.stringify(fidelity.loss[0].influence) === '[1,0]',
      fidelity.loss,
    );
    await locate(page, 56);
    await page.locator('[data-source-id="56"] summary').click();
    await capture(page, `${size}-ballots`);
    check(
      `${size}: ten published ballots`,
      (await page.locator('[data-source-id="56"] .dp-ballots > span').count()) === 10,
    );
    await page.locator('#dp-act-1 .rp-chapter-heading').click();
    await page.locator('[data-source-id="963"] summary').click();
    check(
      `${size}: ten fresh starts with correct bonuses`,
      (await page.locator('.dp-starting-seats > div').count()) === 10 &&
        (await page.locator('.dp-starting-seats').innerText()).includes('Katniss Everdeen'),
    );
    await capture(page, `${size}-return`);
    await page.locator('[data-source-id="963"] summary').click();
    await locate(page, 987);
    await capture(page, `${size}-speech`);
    await locate(page, 1011);
    await capture(page, `${size}-proof`);
    await locate(page, 1899);
    await capture(page, `${size}-loss`);
    await locate(page, 1727);
    await capture(page, `${size}-transfer`);
    const guard = page.locator('[data-source-id="1882"] .dp-term').filter({ hasText: 'Guard' });
    await guard.scrollIntoViewIfNeeded();

    if (size === 'desktop') {
      await guard.hover();
      await page.getByRole('tooltip').waitFor();
      await page.getByRole('tooltip').hover();
      check(
        'desktop: hover explanation remains readable under pointer',
        await page.getByRole('tooltip').isVisible(),
      );
      await capture(page, 'desktop-rule-hover');
      await page.keyboard.press('Escape');
      await page.getByRole('tooltip').waitFor({ state: 'hidden' });
      check('desktop: Escape dismisses hover', (await page.getByRole('tooltip').count()) === 0);
    }

    await guard.focus();
    const beforeScroll = await page.evaluate(() => scrollY);
    await guard.press('Enter');
    await page.getByRole('dialog', { name: 'Guard' }).waitFor();
    await capture(page, `${size}-guard-rules`);
    check(
      `${size}: popup fits viewport`,
      await page.getByRole('dialog').evaluate((element) => {
        const b = element.getBoundingClientRect();

        return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
      }),
    );
    await page.keyboard.press('Tab');
    check(
      `${size}: dialog keeps keyboard focus`,
      await page.getByRole('dialog').evaluate((element) => element.contains(document.activeElement)),
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog'));
    check(
      `${size}: Escape restores trigger and reading position`,
      (await guard.evaluate((element) => document.activeElement === element)) &&
        Math.abs((await page.evaluate(() => scrollY)) - beforeScroll) < 3,
    );

    for (const term of ['Coins', 'Influence']) {
      const trigger = page
        .locator('[data-source-id="1899"] .dp-delta')
        .getByRole('button', { name: `${term} rules`, exact: true });

      if (size === 'narrow') await trigger.tap();
      else await trigger.click();
      await page.getByRole('dialog', { name: term, exact: true }).waitFor();
      check(`${size}: ${term} explanation`, (await page.getByRole('dialog').innerText()).length > 100);
      await capture(page, `${size}-${term.toLowerCase()}-rules`);
      await page.getByRole('button', { name: 'Close rules', exact: true }).click();
    }

    await page.getByRole('checkbox', { name: /Show private archive/ }).check();
    await locate(page, 1022);
    await capture(page, `${size}-archive-exchange`);
    check(
      `${size}: cursor-specific private Exchange draw`,
      (await page.locator('[data-source-id="1022"]').innerText()).includes('Treasurer') &&
        (await page.locator('[data-source-id="1022"] .dp-card').count()) === 2,
    );
    check(`${size}: private cards remain contained`, await contained(page));
    await page.getByRole('checkbox', { name: /Show private archive/ }).uncheck();
    await page.getByRole('button', { name: 'Final move', exact: true }).click();
    check(
      `${size}: final move locates real Coup`,
      await page.locator('[data-source-id="2010"]').evaluate((element) => {
        const b = element.getBoundingClientRect();

        return b.top >= 0 && b.bottom <= innerHeight;
      }),
    );
    await capture(page, `${size}-final-move`);
    await page.getByRole('button', { name: 'Action & UI examples', exact: true }).click();
    await page.locator('.dp-example-index').waitFor();
    await capture(page, `${size}-example-index`);
    check(`${size}: shareable example dataset`, page.url().includes('sample=examples'));
    check(
      `${size}: examples use recorded actions and labeled alternatives`,
      (await page.locator('.dp-example').count()) === 20 &&
        (await page.locator('#dp-example-double-loss > header').innerText()).includes('Illustrative'),
    );
    await page.locator('#dp-example-double-loss').evaluate((element) => element.scrollIntoView());
    await capture(page, `${size}-double-loss`);
    await page.locator('#dp-example-cap').evaluate((element) => element.scrollIntoView());
    await capture(page, `${size}-round-cap`);
    check(
      `${size}: three round-cap criteria`,
      (await page.locator('#dp-example-cap .dp-scores').count()) === 3,
    );
    check(`${size}: gallery contained`, await contained(page));
    await page.reload();
    await page.locator('.dp-example-index').waitFor();
    check(`${size}: reload retains dataset`, page.url().includes('sample=examples'));
    await page.getByRole('button', { name: 'Previous variant' }).click();
    await page.locator('.rp-desk-layout').waitFor();
    await page.getByRole('button', { name: 'Previous variant' }).click();
    await page.locator('.rp-chronicle-layout').waitFor();
    check(
      `${size}: original A and B comparison still opens`,
      await page.locator('.rp-chronicle-layout').isVisible(),
    );
    await page.close();
  }

  check('No application exceptions', errors.length === 0, errors);
  check('No backend requests during preview', requests.length === 0, requests);
  const result = { checkedAt: new Date().toISOString(), checks, captures, errors, requests };
  await writeFile(directory + 'browser-inspection.json', JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        passed: checks.filter((entry) => entry.passed).length,
        failed: checks.filter((entry) => !entry.passed),
        captures: captures.length,
      },
      null,
      2,
    ),
  );

  if (checks.some((entry) => !entry.passed)) process.exitCode = 1;
} finally {
  await browser.close();
}
