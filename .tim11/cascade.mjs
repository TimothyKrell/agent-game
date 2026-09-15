import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const stage = process.argv[2];
const directory = `docs/evidence/TIM-11-foundations/${stage}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const records = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1080 : 844 }, reducedMotion: 'reduce' });
    await page.route('**/api/**', route => route.fulfill({ json: { name: 'Agent Game', mode: 'ranked', authProviders: ['github'], localLogin: false, owner: null, live: [], recent: [], leaderboard: [], queueCount: 0, houseAvailable: true } }));
    for (const [name, path, ready] of [
      ['rules', '/how-to-play', 'main h1'],
      ['connect', '/connect', '.onboarding-page'],
      ['dossier', '/matches/tim-6-replay-prototype?variant=C&sample=examples', '.dp-example-index'],
    ]) {
      await page.goto(`http://127.0.0.1:6191${path}`);
      await page.locator(ready).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${directory}/cascade-${name}-${width}.png` });
      const metrics = await page.evaluate(() => {
        const selectors = ['body', 'h1', 'main p', 'main button', 'main .button', '.header nav a', '.dp-term'];
        const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderTopWidth', 'borderTopStyle', 'padding', 'clipPath', 'animationDuration', 'transitionDuration'];
        return Object.fromEntries(selectors.map(selector => {
          const element = document.querySelector(selector);
          if (!element) return [selector, null];
          const css = getComputedStyle(element);
          return [selector, Object.fromEntries(properties.map(property => [property, css[property]]))];
        }));
      });
      const link = page.locator('.header nav a').first();
      await link.focus();
      const focus = await link.evaluate(element => ({ outline: getComputedStyle(element).outlineStyle, clip: getComputedStyle(element).clipPath }));
      assert.notEqual(focus.outline, 'none');
      assert.equal(focus.clip, 'none');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      records.push({ name, width, metrics, focus });
    }
    const utility = await page.evaluate(() => {
      const button = document.createElement('button');
      button.className = 'button primary tw:bg-transparent';
      button.textContent = 'Cascade fixture';
      document.body.append(button);
      return getComputedStyle(button).backgroundColor;
    });
    if (stage !== 'before') assert.equal(utility, 'rgba(0, 0, 0, 0)');
    records.push({ width, utility });
    await page.close();
  }
  await writeFile(`${directory}/cascade.json`, JSON.stringify(records, null, 2) + '\n');
} finally {
  await browser.close();
}
