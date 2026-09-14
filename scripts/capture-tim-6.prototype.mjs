/** TIM-6 throwaway browser inspection/capture, deliberately outside the test suite. Run Vite first. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../docs/design/TIM-6/screenshots/', import.meta.url).pathname;

const base = 'http://127.0.0.1:5177/matches/tim-6-replay-prototype';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});

const checks = [];

const requests = [];

const pageErrors = [];

const files = [];

await mkdir(directory, { recursive: true });

function record(name, passed, evidence = '') {
  checks.push({ name, passed, evidence });
}

async function capture(page, filename, locator) {
  await page.evaluate(() => document.fonts.ready);

  if (locator)
    await locator.screenshot({
      path: directory + filename,
      style: '.prototype-switcher { visibility: hidden !important; }',
    });
  else await page.screenshot({ path: directory + filename });
  files.push(filename);
}

async function chooseMoment(page, variant, index) {
  if (variant === 'B') await page.locator(`.rp-transcript [data-moment="${index}"] button`).click();
  else await page.getByRole('button', { name: `Select moment ${index + 1}`, exact: true }).click();
  const selector = variant === 'B' ? '.rp-focus-panel' : `[data-moment="${index}"]`;
  await page
    .locator(selector)
    .first()
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 1080 }],
    ['narrow', { width: 390, height: 844 }],
  ]) {
    for (const variant of ['A', 'B', 'C']) {
      const page = await browser.newPage({
        viewport,
        deviceScaleFactor: 1,
        isMobile: size === 'narrow',
        hasTouch: size === 'narrow',
        reducedMotion: 'reduce',
      });

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/'))
          requests.push({ method: request.method(), url: request.url() });
      });
      await page.goto(`${base}?variant=${variant}`);
      await page.locator('.rp-outcome').waitFor();
      await capture(page, `${variant}-${size}.png`);

      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));

      record(
        `${variant} ${size}: no document overflow`,
        dimensions.viewport === dimensions.document,
        dimensions,
      );
      record(
        `${variant} ${size}: original app context`,
        (await page.locator('.header').isVisible()) &&
          (await page.getByRole('heading', { name: 'Northstar wins.' }).isVisible()),
      );
      await chooseMoment(page, variant, 10);
      await capture(page, `${variant}-${size}-disproof.png`);
      record(
        `${variant} ${size}: selected disproof and resource delta`,
        (await page.locator('.rp-view-state').innerText()).includes('Moment 11 of 19') &&
          (await page.locator('.rp-delta').allTextContents()).some((text) => text.includes('2 → 1')),
      );

      const expandedDimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));

      record(
        `${variant} ${size}: record containment`,
        expandedDimensions.viewport === expandedDimensions.document,
      );

      if (variant === 'A') {
        await page.locator('#rp-act-1 .rp-chapter-heading').click();
        await capture(page, `${variant}-${size}-act-I.png`, page.locator('#rp-act-1'));
        record(
          `${size}: Act I discussion and vote reachable`,
          (await page.locator('#rp-act-1 .rp-event').count()) === 5 &&
            (await page.locator('#rp-act-1').innerText()).includes('7 approve'),
        );
        await page.locator('#rp-act-1 .rp-chapter-heading').click();
        record(
          `${size}: collapse holds position`,
          (await page.locator('.rp-view-state').innerText()).includes('Moment 11 of 19'),
        );
        await page.locator('.rp-return-roster > summary').click();
        record(
          `${size}: all ten starting states`,
          (await page.locator('.rp-roster-grid > div').count()) === 10 &&
            (await page.locator('.rp-roster-grid em').count()) === 2,
        );
        await capture(page, `${variant}-${size}-all-ten.png`, page.locator('[data-moment="5"]'));
        await page.locator('.rp-return-roster > summary').click();
        await page.getByLabel('Reveal archive hands', { exact: false }).check();
        const declaration = page.locator('[data-moment="6"]');
        await declaration.locator('.rp-archive > summary').click();
        record(
          `${size}: illustrative hand owns and qualifies its cards`,
          (await declaration.locator('.rp-archive').innerText()).includes('Velvet · archive hand') &&
            (await declaration.locator('.rp-archive').innerText()).includes('secret during play'),
        );
        await capture(page, `${variant}-${size}-archive-hand.png`, declaration);
        const ruleButton = declaration.getByRole('button', { name: 'Treasurer rules', exact: true });
        await ruleButton.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('dialog').waitFor();
        record(
          `${size}: Enter opens contextual capability rule`,
          (await page.getByRole('dialog').innerText()).includes('Tax · Take 3 coins'),
        );
        await capture(page, `${variant}-${size}-rules.png`);
        await page.keyboard.press('Escape');
        record(
          `${size}: Escape restores rule trigger focus`,
          await ruleButton.evaluate((button) => button === document.activeElement),
        );
        record(
          `${size}: disclosure does not seek`,
          (await page.locator('.rp-view-state').innerText()).includes('Moment 11 of 19'),
        );
      }

      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      requests.push({ method: request.method(), url: request.url() });
  });
  await page.goto(`${base}?variant=A`);
  await page.locator('.rp-outcome').waitFor();
  await page.getByRole('button', { name: 'Previous variant' }).click();
  record('Switcher wraps A → C', new URL(page.url()).searchParams.get('variant') === 'C');
  await page.reload();
  await page.locator('.rp-dossier-layout').waitFor();
  record('Variant URL survives reload', await page.locator('.rp-dossier-layout').isVisible());
  await page.keyboard.press('ArrowRight');
  record('Right arrow wraps C → A', new URL(page.url()).searchParams.get('variant') === 'A');
  await chooseMoment(page, 'A', 10);
  await page.getByRole('button', { name: 'Next variant' }).click();
  record(
    'Variant switch holds historical cursor',
    (await page.locator('.rp-view-state').innerText()).includes('Moment 11 of 19'),
  );
  await page.getByRole('button', { name: 'Previous variant' }).click();
  const slider = page.getByRole('slider', { name: 'Act 2 position' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  record(
    'Slider arrow changes moment, not variant',
    new URL(page.url()).searchParams.get('variant') === 'A' && (await slider.inputValue()) === '11',
  );
  await page.getByLabel('Act 2 round', { exact: true }).selectOption('3');
  record(
    'Round seek selects and locates first round moment',
    (await page.locator('.rp-view-state').innerText()).includes('Moment 16 of 19'),
  );
  await capture(page, 'A-desktop-elimination.png');
  await chooseMoment(page, 'A', 12);
  await capture(page, 'A-desktop-proof.png');
  await chooseMoment(page, 'A', 17);
  await page.getByRole('button', { name: 'Play Act 2', exact: true }).click();
  await page.waitForTimeout(2700);
  record(
    'Timed playback advances then stops at act end',
    (await page.locator('.rp-view-state').innerText()).includes('Moment 19 of 19') &&
      (await page.locator('.rp-view-state').innerText()).includes('Paused'),
  );
  await capture(page, 'A-desktop-victory.png');
  await chooseMoment(page, 'A', 6);
  await page.getByRole('button', { name: 'Play Act 2', exact: true }).click();
  await page.getByRole('button', { name: 'Pause Act 2', exact: true }).click();
  await page.waitForTimeout(2700);
  record(
    'Pause holds historical position',
    (await page.locator('.rp-view-state').innerText()).includes('Moment 7 of 19'),
  );
  await page.getByRole('button', { name: 'Play Act 2', exact: true }).click();
  await slider.fill('10');
  record(
    'Scrubbing pauses playback',
    (await page.locator('.rp-view-state').innerText()).includes('Moment 11 of 19') &&
      (await page.locator('.rp-view-state').innerText()).includes('Paused'),
  );
  await page.locator('.rp-lab > summary').click();
  await page.getByLabel('Prototype scenario', { exact: true }).selectOption('live');
  record(
    'Live preview withholds future resolutions and archive hands',
    (await page.locator('.rp-archive').count()) === 0 &&
      (await page.locator('[data-moment="9"]').count()) === 0 &&
      (await page.locator('.rp-live-follow').innerText()).includes('Challenges sealed'),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, 'A-desktop-live-edge.png');
  await chooseMoment(page, 'A', 6);
  record(
    'Reading older history detaches following',
    (await page.locator('.rp-live-follow').innerText()).includes('Reading earlier'),
  );
  await page.getByRole('button', { name: 'Go to live edge', exact: true }).click();
  record(
    'Live-edge navigation resumes follow',
    (await page.locator('.rp-live-follow').innerText()).includes('Following the illustrative live edge') &&
      (await page.locator('.rp-view-state').innerText()).includes('Moment 9 of 9'),
  );
  record(
    'No raw-data boxes or content-type tabs',
    (await page.getByText('Recorded data', { exact: true }).count()) === 0 &&
      (await page.getByRole('tab').count()) === 0,
  );
  record('No backend API traffic', requests.length === 0, requests);
  record('No browser application exceptions', pageErrors.length === 0, pageErrors);
  await page.close();
} finally {
  await browser.close();

  const report = {
    capturedAt: new Date().toISOString(),
    base,
    browser: 'System Chromium, headless, scale 1, reduced motion',
    note: 'Throwaway inspection, not a new test suite. Fixtures are authored excerpts; no production or backend invoked.',
    files,
    checks,
  };

  await writeFile(directory + '../browser-inspection.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        screenshots: files.length,
        passed: checks.filter((check) => check.passed).length,
        failed: checks.filter((check) => !check.passed),
        requests,
        pageErrors,
      },
      null,
      2,
    ),
  );
}

if (checks.some((check) => !check.passed)) process.exitCode = 1;
