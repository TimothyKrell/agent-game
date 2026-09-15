/** Second owner annotation batch: historical milestones, actor layout and complete rule vocabulary. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../docs/design/TIM-6/annotation-review-2/', import.meta.url).pathname;

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});

const checks = [];

const captures = [];

const errors = [];

await mkdir(directory + 'screenshots', { recursive: true });

function check(name, passed, evidence = '') {
  checks.push({ name, passed, evidence });
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}screenshots/${name}.png` });
  captures.push(`${name}.png`);
}

async function center(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
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

    for (const id of [
      'dp-example-return',
      'dp-event-70072bde-05ae-4ee0-ade5-b0498646177b',
      'dp-example-execution-return',
      'dp-rule-index',
    ]) {
      await page.goto(`http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#${id}`);
      await page.waitForFunction((id) => {
        const bounds = document.getElementById(id)?.getBoundingClientRect();

        return bounds && bounds.top < innerHeight && bounds.bottom > 0;
      }, id);
      check(`${size}: direct review link lands on ${id}`, true);
    }

    await page.goto('http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=match');
    await page.getByRole('heading', { name: 'Patch wins.', exact: true }).waitFor();
    await page.locator('#dp-act-1 .rp-chapter-heading').click();

    const bonus = page.locator('[data-source-id="962"]');

    await center(bonus);
    await capture(page, `${size}-act-one-bonus`);
    check(
      `${size}: earned bonus names all four correct historical agents`,
      JSON.stringify(await bonus.locator('.dp-bonus-agents strong').allTextContents()) ===
        JSON.stringify(['Cipher', 'Axiom', 'Katniss Everdeen', 'Orbit']),
    );
    check(
      `${size}: all bonuses show two to three starting coins`,
      await bonus
        .locator('.dp-bonus-agents')
        .evaluate((element) =>
          [...element.querySelectorAll('[data-rule-term="Coins"]')].every(
            (button) => button.getAttribute('aria-description') === '2 to 3 Coins',
          ),
        ),
    );
    check(
      `${size}: Act I summary explicitly continues the match`,
      (await bonus.textContent()).includes('The match continues.'),
    );

    const executor = page
      .locator('#dp-event-ce21aee1-54dc-403d-beb3-1053f603a9d9 [data-rule-term="Executor"]')
      .first();

    await center(executor);
    await executor.click();
    await page.getByRole('dialog', { name: 'Executor', exact: true }).waitFor();
    check(
      `${size}: Executor inline role explanation`,
      (await page.getByRole('dialog').textContent()).includes('enacts one and discards the other'),
    );
    await capture(page, `${size}-executor-help`);
    await page.getByRole('button', { name: 'Close rules' }).click();

    const historicalRosters = await page.evaluate(async () => {
      const { record } = await import('/src/client/succession-dossier-data.prototype.ts');
      const alive = new Set(record.current.seats.map((seat) => seat.number));
      const results = [];

      for (const event of record.events) {
        if (event.type !== 'influence-lost' || !event.data.eliminated) continue;
        alive.delete(event.data.seat);

        const expected = record.current.seats
          .filter((seat) => alive.has(seat.number))
          .map((seat) => seat.name);

        const row = document.querySelector(`[data-source-id="${event.id}"]`);
        const actual = [...row.querySelectorAll('.dp-remaining li')].map((element) => element.textContent);
        results.push({
          id: event.id,
          expected,
          actual,
          matches: JSON.stringify(expected) === JSON.stringify(actual),
        });
      }

      return results;
    });

    check(
      `${size}: every elimination roster matches its historical event`,
      historicalRosters.length === 9 && historicalRosters.every((row) => row.matches),
      historicalRosters,
    );

    const quill = page.locator('[data-source-id="1927"]');

    await center(quill);
    await capture(page, `${size}-quill-eliminated`);
    check(
      `${size}: elimination has prominent heading and whole-row treatment`,
      (await quill.locator('h3').textContent()) === 'Quilleliminated' &&
        (await quill.evaluate((element) => getComputedStyle(element).backgroundImage !== 'none')),
    );
    check(
      `${size}: Quill exit leaves exactly four named agents`,
      JSON.stringify(await quill.locator('.dp-remaining li').allTextContents()) ===
        JSON.stringify(['Velvet', 'Patch', 'Spark', 'Katniss Everdeen']),
    );

    for (const [kind, row] of [
      ['speech', page.locator('[data-source-id="987"]')],
      ['action', page.locator('#dp-event-8197412b-b48e-4a13-a61e-0879781226e5')],
    ]) {
      await center(row);
      await capture(page, `${size}-large-${kind}-portrait`);
      check(
        `${size}: ${kind} portrait is larger, left-aligned, with name below`,
        await row.evaluate((element) => {
          const avatar = element.querySelector('.dp-actor .dp-avatar').getBoundingClientRect();
          const name = element.querySelector('.dp-actor .dp-agent-name > span').getBoundingClientRect();
          const copy = element.querySelector('.dp-story > blockquote, .dp-story > p').getBoundingClientRect();

          return (
            avatar.width >= 64 &&
            avatar.width === avatar.height &&
            avatar.right < copy.left &&
            name.top >= avatar.bottom
          );
        }),
      );
    }

    await page.getByRole('button', { name: 'Action & UI examples', exact: true }).click();
    await page.locator('#dp-rule-index').waitFor();
    await center(page.locator('#dp-rule-index'));
    await capture(page, `${size}-complete-rule-icons`);

    const icons = await page.locator('#dp-rule-index').evaluate((element) =>
      [...element.querySelectorAll('[data-rule-term]')].map((button) => ({
        term: button.getAttribute('data-rule-term'),
        svg: !!button.querySelector('svg'),
        placeholder: !!button.querySelector('.lucide-circle-help, .lucide-circle-question-mark'),
      })),
    );

    check(
      `${size}: all 36 rules have intentional icons`,
      icons.length === 36 && icons.every((icon) => icon.svg && !icon.placeholder),
      icons,
    );

    for (const term of [
      'Coordinator',
      'Veto',
      'Election tracker',
      'Investigation',
      'Special election',
      'Round cap',
    ]) {
      await page
        .locator('#dp-rule-index')
        .getByRole('button', { name: `${term} rules`, exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: term, exact: true });

      await dialog.waitFor();
      check(
        `${size}: ${term} help remains visible and contained`,
        await dialog.evaluate((element) => {
          const bounds = element.getBoundingClientRect();

          return (
            bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight
          );
        }),
      );
      await page.getByRole('button', { name: 'Close rules' }).click();
    }

    const execution = page.locator('#dp-event-ex-ordinary-execution');

    await center(execution);
    await capture(page, `${size}-act-one-execution`);
    check(
      `${size}: ordinary execution names victim and nine remaining`,
      (await execution.locator('h3').textContent()) === 'Vesperexecuted' &&
        (await execution.locator('.dp-remaining li').count()) === 9 &&
        !(await execution.locator('.dp-remaining li').allTextContents()).includes('Vesper'),
    );
    check(
      `${size}: execution does not reveal ordinary secret allegiance`,
      !/Cooperative|Rogue|Overlord/.test(await execution.textContent()),
    );
    check(
      `${size}: execution foregrounds the victim and names the acting agent`,
      (await execution.locator('.dp-actor').textContent()) === 'Vesper' &&
        (await execution.locator('.dp-departure-copy p').textContent()) === 'Velvet executes Vesper.',
    );
    const overlord = page.locator('#dp-event-ex-execution');

    await center(overlord);
    await capture(page, `${size}-overlord-executed`);
    check(
      `${size}: Overlord execution ends Act I with eight survivors`,
      (await overlord.textContent()).includes('Act I complete') &&
        (await overlord.locator('.dp-remaining li').count()) === 8,
    );
    await page.locator('#dp-example-execution-return .dp-return summary').click();
    check(
      `${size}: both executed agents return`,
      (await page.locator('#dp-example-execution-return .dp-starting-seats em').count()) === 2,
    );
    check(
      `${size}: new gallery content fits document`,
      await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
    );
    await page.close();
  }

  check('No application exceptions', errors.length === 0, errors);
  await writeFile(
    directory + 'moments-inspection.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), checks, captures, errors }, null, 2) + '\n',
  );
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
