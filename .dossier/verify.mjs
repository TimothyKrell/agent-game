import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = process.env.DOSSIER_ORIGIN ?? 'http://127.0.0.1:6291';

const directory = 'docs/evidence/TIM-19-22-components/after';

await mkdir(directory, { recursive: true });

const source = JSON.parse(await readFile('src/client/succession-replay-record.prototype.json', 'utf8'));

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});

const checks = [];

const errors = [];

const metadataRequests = [];

function check(name, value) {
  assert.ok(value, name);
  checks.push(name);
}

async function shot(page, locator, name) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: `${directory}/${name}.png` });
}

try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 1080 : 844 },
      reducedMotion: 'reduce',
      hasTouch: width !== 1440,
    });

    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/\/api\/agent-pictures|\/api\/agents\/[^/]+\/picture$/.test(request.url()))
        metadataRequests.push(request.url());
    });
    await page.goto(`${origin}/matches/tim-6-replay-prototype?variant=C&sample=components`);
    await page.getByText('20 scenario groups ready').waitFor();
    await page.evaluate(() => document.fonts.ready);
    check(`${width}: all 20 source groups`, (await page.locator('[data-example-group]').count()) === 20);

    const capturedRows = await page.locator('[data-example-group] [data-source-id]').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const sourceId = Number(row.getAttribute('data-source-id'));

        return row
          .closest('[data-example-group]')
          ?.querySelector('header > span')
          ?.textContent?.startsWith('Recorded source')
          ? [
              {
                sourceId,
                act: Number(row.getAttribute('data-source-act')),
                quote: row.querySelector('blockquote')?.textContent ?? null,
              },
            ]
          : [];
      }),
    );

    check(
      `${width}: captured source acts remain exact`,
      capturedRows.length > 0 &&
        capturedRows.every(
          (row) => source.events.find((event) => event.id === row.sourceId)?.act === row.act,
        ),
    );
    check(
      `${width}: every displayed captured quote is exact`,
      capturedRows.some((row) => row.quote !== null) &&
        capturedRows.every(
          (row) =>
            row.quote === null ||
            source.events.find((event) => event.id === row.sourceId)?.text === row.quote,
        ),
    );
    const paidText = await page.locator('#dossier-example-failed-assassin').textContent();
    check(
      `${width}: paid cancellation visibly retains cost`,
      paidText.includes('cancelled') && paidText.includes('3 coins paid · no refund'),
    );
    check(
      `${width}: no document overflow`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    check(
      `${width}: 36 intentional icons`,
      (await page.locator('#dossier-rule-index [data-rule-term] .dossier-rule-icon svg').count()) === 36,
    );
    check(
      `${width}: no playback controls`,
      (await page.locator('input[type=range], [role=tab], select').count()) === 0,
    );
    const award = page.locator('#dossier-example-return .dossier-award');
    const bonusNames = await award.locator('.dossier-identity > span').allTextContents();
    check(
      `${width}: actual named faction recipients`,
      JSON.stringify(bonusNames) === JSON.stringify(['Cipher', 'Axiom', 'Katniss Everdeen', 'Orbit']),
    );
    check(
      `${width}: actual 2-to-3 bonus`,
      (await award.locator('.dossier-resource[aria-description="2 to 3 Coins"]').count()) === 4,
    );
    check(
      `${width}: faction advantage not overall win`,
      (await award.textContent()).includes('The match continues'),
    );
    await shot(page, award, `${width}-act-one-bonus`);
    const returned = page.locator('#dossier-example-return .dossier-return');
    await returned.locator('summary').click();
    check(
      `${width}: all ten fresh pairs`,
      (await returned.locator('.dossier-ten-cards .influence-back').count()) === 20,
    );
    check(
      `${width}: ten named starting states`,
      (await returned.locator('.dossier-starting-seats > article').count()) === 10,
    );
    await shot(page, returned, `${width}-return`);
    const capturedSpeech = page.locator('[data-example-group=election] .dossier-speech').first();
    const sourceID = Number(await capturedSpeech.getAttribute('data-source-id'));
    check(
      `${width}: exact source speech text`,
      (await capturedSpeech.locator('blockquote').textContent()) ===
        source.events.find((event) => event.id === sourceID).text,
    );
    check(
      `${width}: speech has no divider`,
      await capturedSpeech.evaluate((element) => getComputedStyle(element).borderBottomStyle === 'none'),
    );
    const portrait = capturedSpeech.locator('.dossier-actor .dossier-portrait');
    const box = await portrait.boundingBox();
    check(
      `${width}: portrait approved size`,
      box.width === (width === 1440 ? 88 : 64) && box.height === box.width,
    );

    const geometry = await capturedSpeech.evaluate((element) => {
      const avatar = element.querySelector('.dossier-portrait').getBoundingClientRect();
      const bubble = element.querySelector('blockquote').getBoundingClientRect();
      const name = element.querySelector('.dossier-identity > span').getBoundingClientRect();

      return { left: avatar.right < bubble.left, below: name.top >= avatar.bottom };
    });

    check(`${width}: left portrait, name underneath`, geometry.left && geometry.below);
    await shot(page, capturedSpeech, `${width}-speech`);
    const publicCards = await page.locator('.dossier-card-known').count();
    check(`${width}: archive nested cards absent before toggle`, publicCards === 0);
    await page.getByRole('checkbox', { name: /Show private archive/ }).check();
    check(
      `${width}: archive cards appear only after toggle`,
      (await page.locator('.dossier-card-known').count()) > 0,
    );

    const draw = page
      .locator('#dossier-example-unchallenged [data-event-type=private-cards]')
      .filter({ hasText: 'Exchange draw' })
      .first();

    check(`${width}: entitled exchange draw`, (await draw.count()) === 1);
    await shot(page, draw, `${width}-private-exchange`);
    await page.getByRole('checkbox', { name: /Show private archive/ }).uncheck();
    check(`${width}: archive cards removed again`, (await page.locator('.dossier-card-known').count()) === 0);
    const executions = page.locator('#dossier-example-execution-return [data-event-type=execution]');
    check(
      `${width}: execution event-time counts`,
      JSON.stringify(await executions.locator('.dossier-remaining header strong').allTextContents()) ===
        JSON.stringify(['9', '8']),
    );
    check(
      `${width}: return includes executed seats`,
      (await page.locator('#dossier-example-execution-return .dossier-ten-cards .returned').count()) === 2,
    );
    await shot(page, executions.first(), `${width}-execution`);
    const doubleLoss = page.locator('#dossier-example-double-loss [data-event-type=influence-lost]');
    check(
      `${width}: double losses ordered`,
      JSON.stringify(await doubleLoss.locator('.dossier-remaining header strong').allTextContents()) ===
        JSON.stringify(['10', '9']),
    );
    await shot(page, doubleLoss.last(), `${width}-double-loss`);
    await doubleLoss.last().screenshot({ path: `${directory}/${width}-double-loss-record.png` });
    check(
      `${width}: cap supplies all criteria`,
      (await page.locator('#dossier-example-cap').textContent()).includes('precommitted priority'),
    );
    check(
      `${width}: house champion and original credit distinct`,
      (await page.locator('#dossier-example-takeover').textContent()).includes('House-controlled champion'),
    );
    await shot(page, page.locator('#dossier-example-takeover'), `${width}-takeover`);

    if (width === 1440) {
      for (const trigger of await page.locator('#dossier-rule-index [data-rule-term]').all()) {
        const name = await trigger.getAttribute('data-rule-term');
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        check(`rule ${name}: semantic dialog`, (await dialog.textContent()).includes(name));

        if (name === 'Executor') {
          check(
            'Executor is policy office; Coordinator execution',
            (await dialog.textContent()).includes('Execution is a Coordinator power'),
          );
          await page.screenshot({ path: `${directory}/executor-rule.png` });
        }

        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(
          (element) => document.activeElement === element,
          await trigger.elementHandle(),
        );
        checks.push(`rule ${name}: keyboard return focus`);
      }

      const trigger = page.locator('#dossier-rule-index [data-rule-term=Coins]');
      await trigger.hover();
      await page.getByRole('tooltip').waitFor();
      await page.screenshot({ path: `${directory}/hover-help.png` });
      // Exercise Base UI's patient-click threshold (TIM-11 correction), not only immediate clicks.
      await page.waitForTimeout(800);
      await trigger.click();
      await page.getByRole('dialog').waitFor();
      check('hover promotes to pinned dialog', (await page.getByRole('dialog').count()) === 1);
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => !!document.activeElement?.closest('[role=dialog]'));
      check(
        'pinned help contains focus',
        await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')),
      );
      check(
        'portal has scoped Montserrat tokens',
        await page
          .getByRole('dialog')
          .evaluate(
            (element) =>
              getComputedStyle(element).fontFamily.includes('Montserrat') &&
              getComputedStyle(element).getPropertyValue('--replay-help-background').trim() === '#142925',
          ),
      );
      await page.keyboard.press('Escape');
    } else {
      const trigger = page.locator('#dossier-rule-index [data-rule-term=Guard]');
      await trigger.tap();
      await page.getByRole('dialog').waitFor();
      check(`${width}: tap pins rule help`, (await page.getByRole('dialog').count()) === 1);
      await page.keyboard.press('Escape');
    }

    await page.goto(`${origin}/.dossier/browser.html`);
    await page.getByText('Canonical component fixture ready').waitFor();
    const chapters = page.locator('.dossier-chapter-trigger');
    check(
      `${width}: active Act I initially open`,
      (await chapters.nth(0).getAttribute('aria-expanded')) === 'true' &&
        (await chapters.nth(1).getAttribute('aria-expanded')) === 'false',
    );
    await chapters.nth(0).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'act2', exact: true }).click();
    check(
      `${width}: explicit chapter choice preserved at transition`,
      (await chapters.nth(0).getAttribute('aria-expanded')) === 'false' &&
        (await chapters.nth(1).getAttribute('aria-expanded')) === 'true',
    );
    await chapters.nth(1).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'finished', exact: true }).click();
    check(
      `${width}: explicit collapse preserved at finish`,
      (await chapters.nth(1).getAttribute('aria-expanded')) === 'false',
    );
    await page.getByRole('checkbox', { name: 'Long identities' }).check();
    check(
      `${width}: long winner identity no overflow`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await shot(page, page.locator('.dossier-outcome'), `${width}-long-outcome`);
    await page.getByRole('button', { name: 'interrupted', exact: true }).click();
    check(
      `${width}: interruption no invented winner`,
      (await page.locator('.dossier-outcome h1').textContent()) === 'Match interrupted',
    );
    await page.getByRole('checkbox', { name: 'Long identities' }).uncheck();
    await page.getByRole('button', { name: 'proof', exact: true }).click();
    const declare = page.locator('[data-event-type=declaration]');
    await declare.waitFor();
    await declare.locator('details').first().locator('summary').click();
    check(
      `${width}: public declaration hand stays hidden`,
      (await declare.locator('.dossier-card-known').count()) === 0 &&
        (await declare.locator('.dossier-card-hidden').count()) > 0,
    );
    await page.getByRole('checkbox', { name: /Show private archive/ }).check();
    check(
      `${width}: archive permits nested hand`,
      (await declare.locator('.dossier-card-known').count()) > 0,
    );
    await shot(page, declare, `${width}-nested-hand`);
    await page.getByRole('checkbox', { name: 'Long identities' }).check();
    check(
      `${width}: long event identities no overflow`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await shot(page, declare, `${width}-long-action`);
    await page.getByRole('checkbox', { name: 'Long identities' }).uncheck();
    const avatar = page.locator('.dossier-actor .dossier-portrait').first();
    await avatar.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    check(
      `${width}: portrait dialog accessible`,
      (await page.getByRole('dialog').getByRole('heading').count()) === 1,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction((element) => document.activeElement === element, await avatar.elementHandle());
    checks.push(`${width}: portrait restores focus`);
    const actionRule = declare.locator('.dossier-source-text [data-rule-term]').first();
    await actionRule.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => !!document.activeElement?.closest('[role=dialog]'));
    // Controlled reader eviction: no outside pointer press to dismiss help first.
    await page.evaluate(() => window.dispatchEvent(new Event('dossier-remove-rows')));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (element) => document.activeElement === element,
      await chapters.nth(1).elementHandle(),
    );
    check(
      `${width}: evicted active help restores chapter heading`,
      (await page.locator('.dossier-row').count()) === 0,
    );
    await page.keyboard.press('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('dossier-restore-rows')));
    await page.keyboard.press('Enter');
    await declare.waitFor();
    await declare.locator('.dossier-source-text [data-rule-term]').first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (element) => document.activeElement === element,
      await declare.locator('.dossier-source-text [data-rule-term]').first().elementHandle(),
    );
    checks.push(`${width}: reopened chapter help restores exact trigger`);
    check(
      `${width}: reduced motion no chapter animation`,
      await chapters.first().evaluate((element) => getComputedStyle(element).animationName === 'none'),
    );
    const delivery = page.getByRole('region', { name: 'Picture delivery cases' });
    await delivery.scrollIntoViewIfNeeded();
    await delivery.locator('[data-entrant-id=entrant-0] img').waitFor();
    await delivery.locator('[data-entrant-id=entrant-1] > svg').waitFor();
    check(
      `${width}: supplied stable-ID image decodes`,
      await delivery
        .locator('[data-entrant-id=entrant-0] img')
        .evaluate((image) => image.complete && image.naturalWidth === 8),
    );
    check(
      `${width}: broken image gracefully falls back`,
      (await delivery.locator('[data-entrant-id=entrant-1] > svg').count()) === 1,
    );
    check(
      `${width}: absent image gracefully falls back`,
      (await delivery.locator('[data-entrant-id=entrant-2] > svg').count()) === 1,
    );
    await delivery.locator('[data-entrant-id=entrant-0]').click();
    await page.getByRole('dialog').waitFor();
    check(`${width}: supplied image enlarges`, (await page.getByRole('dialog').locator('img').count()) === 1);
    await page.screenshot({ path: `${directory}/${width}-portrait-enlarged.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'unknown', exact: true }).click();
    const missing = page.locator('.dossier-departure');
    check(
      `${width}: missing baseline never fabricates remaining roster`,
      (await missing.textContent()).includes('Historical remaining-agent roster unavailable'),
    );
    check(
      `${width}: missing identity honest fallback`,
      (await missing.textContent()).includes('identity unavailable'),
    );
    await shot(page, missing, `${width}-unknown`);
    await context.close();
  }

  check('no application exceptions', errors.length === 0);
  check('no per-row metadata network lookups', metadataRequests.length === 0);
  await writeFile(
    `${directory}/browser-checks.json`,
    JSON.stringify({ checks, count: checks.length, errors }, null, 2),
  );
  console.log(`${checks.length} component browser checks passed`);
} finally {
  await browser.close();
}
