import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { settleDocumentScroll } from './drift-trace.mjs';

// Isolate native keyboard motion from React, data retrieval and reader restoration.
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

const samples = [];

try {
  for (const frames of [0, 1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
    await page.setContent(
      '<style>body{margin:0}article{height:127.59375px}</style>' +
        '<article>Recorded text</article>'.repeat(240),
    );
    await page.evaluate(() => window.scrollTo({ top: 13051, behavior: 'instant' }));
    await page.keyboard.press('PageUp');

    const trace = await page.evaluate(async (frames) => {
      for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame);
      const row = document.querySelectorAll('article')[110];
      row.scrollIntoView({ block: 'end', behavior: 'instant' });
      const values = [{ time: performance.now(), y: scrollY, top: row.getBoundingClientRect().top }];

      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        values.push({ time: performance.now(), y: scrollY, top: row.getBoundingClientRect().top });
      }

      return values;
    }, frames);

    samples.push({ frames, trace, drift: trace.at(-1).top - trace[0].top });
    await page.evaluate(() => window.scrollTo({ top: 13051, behavior: 'instant' }));
    await page.keyboard.press('PageUp');
    const motion = await settleDocumentScroll(page);

    const settled = await page.evaluate(async () => {
      const row = document.querySelectorAll('article')[110];
      row.scrollIntoView({ block: 'end', behavior: 'instant' });
      const before = row.getBoundingClientRect().top;

      for (let i = 0; i < 24; i++) await new Promise(requestAnimationFrame);

      return { before, after: row.getBoundingClientRect().top };
    });

    samples.at(-1).settled = { ...settled, motion, drift: settled.after - settled.before };
    assert.equal(settled.after, settled.before);
    await page.close();
  }

  await writeFile(
    'docs/evidence/TIM-23-dossier-owned-navigation/native-scroll.json',
    JSON.stringify(samples, null, 2),
  );
  console.log(samples.map(({ frames, drift, settled }) => ({ frames, drift, settledDrift: settled.drift })));
} finally {
  await browser.close();
}
